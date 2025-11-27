import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSystemPrompt } from "@/lib/system-prompt";

type IncomingMessage = { role: "user" | "assistant" | "system"; content: string };

// Types for tool-calling compatibility with OpenRouter (OpenAI-style)
type ToolFunctionCall = { name: string; arguments: string };
type ToolCall = { id: string; type: "function"; function: ToolFunctionCall };
type AssistantMessageWithToolCalls = { role: "assistant"; content: string | null; tool_calls: ToolCall[] };
type AssistantMessageWithFunctionCall = { role: "assistant"; content: string | null; function_call: ToolFunctionCall };
type ToolMessage = { role: "tool"; content: string; tool_call_id: string; name?: string };
type OpenAIMessage = IncomingMessage | AssistantMessageWithToolCalls | AssistantMessageWithFunctionCall | ToolMessage;
type ChoiceMessage = Partial<AssistantMessageWithToolCalls & AssistantMessageWithFunctionCall> & { content?: unknown };
type ToolResult = { ok: boolean; error?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMessageContent(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part !== "object" || part === null) return "";
        const maybeText = (part as { text?: unknown }).text;
        if (typeof maybeText === "string") return maybeText;
        const maybeContent = (part as { content?: unknown }).content;
        if (typeof maybeContent === "string") return maybeContent;
        return "";
      })
      .join("");
  }
  if (typeof raw === "object" && raw !== null) {
    const maybeText = (raw as { text?: unknown }).text;
    if (typeof maybeText === "string") return maybeText;
    const maybeContent = (raw as { content?: unknown }).content;
    if (typeof maybeContent === "string") return maybeContent;
  }
  return "";
}

function parseResponseContent(rawContent: string): { speech: string; display: string } {
  const speechMatch = rawContent.match(/<speech>([\s\S]*?)<\/speech>/i);
  const displayMatch = rawContent.match(/<display>([\s\S]*?)<\/display>/i);
  
  const speech = speechMatch ? speechMatch[1].trim() : "";
  const display = displayMatch ? displayMatch[1].trim() : "";
  
  // Fallback: if no tags found, use raw content for both
  if (!speech && !display) {
    return { speech: rawContent, display: rawContent };
  }
  
  // If only one is present, use it for both
  if (!speech && display) {
    return { speech: display.substring(0, 500), display };
  }
  if (speech && !display) {
    return { speech, display: speech };
  }
  
  return { speech, display };
}

const MODEL_SLUGS: Record<string, string> = {
  "minimax/minimax-m2:free": "minimax/minimax-m2:free",
  "x-ai/grok-4-fast": "x-ai/grok-4-fast",
  "x-ai/grok-code-fast-1": "x-ai/grok-code-fast-1",
  "gemini-2.5-flash-lite": "google/gemini-2.5-flash-lite",
  "gemini-3-pro": "google/gemini-3-pro",
  "anthropic/claude-opus-4.5": "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5": "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5": "anthropic/claude-haiku-4.5",
  "moonshot/kimi-k2-thinking": "moonshot/kimi-k2-thinking",
  "qwen/qwen3-235b-a22b-2507": "qwen/qwen3-235b-a22b-2507",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "deepseek/deepseek-v3.1-terminus": "deepseek/deepseek-v3.1-terminus",
  "z-ai/glm-4.6": "z-ai/glm-4.6",
};

const IMAGE_MODEL_SLUGS: Record<string, string> = {
  "google/gemini-3-pro-image-preview": "google/gemini-3-pro-image-preview",
  "google/gemini-2.5-flash-image": "google/gemini-2.5-flash-image",
  "openai/gpt-5-image": "openai/gpt-5-image",
  "black-forest-labs/flux.2-pro": "black-forest-labs/flux.2-pro",
};

type MemoryAction = {
  action: "keep" | "delete" | "merge" | "update";
  id?: string;
  mergeIds?: string[];
  newTitle?: string;
  newContent?: string;
};

async function consolidateMemories(
  userId: string,
  memories: Array<{ id: string; title: string | null; content: string }>,
  apiKey: string
): Promise<void> {
  if (memories.length < 2) return; // Nothing to consolidate

  const memoryList = memories
    .map((m, i) => `${i + 1}. [ID: ${m.id}] ${m.title ? `"${m.title}"` : "(no title)"}: ${m.content}`)
    .join("\n");

  const consolidationPrompt = `You are a memory management assistant. Review the following user memories and identify duplicates, redundancies, or memories that should be merged.

CURRENT MEMORIES:
${memoryList}

Analyze these memories and respond with a JSON array of actions. Each action should be one of:
- {"action": "keep", "id": "memory_id"} - Keep this memory as is
- {"action": "delete", "id": "memory_id"} - Delete duplicate or redundant memory
- {"action": "merge", "mergeIds": ["id1", "id2"], "newTitle": "...", "newContent": "..."} - Merge multiple memories into one
- {"action": "update", "id": "memory_id", "newTitle": "...", "newContent": "..."} - Update a memory for clarity

Rules:
1. Preserve unique information
2. Merge similar/duplicate memories
3. Keep memory count under 10 if possible
4. Be conservative - only consolidate clear duplicates
5. Respond ONLY with valid JSON array, no explanation

Example response:
[
  {"action": "keep", "id": "abc123"},
  {"action": "delete", "id": "def456"},
  {"action": "merge", "mergeIds": ["ghi789", "jkl012"], "newTitle": "Python Preferences", "newContent": "Prefers Python 3.10+, uses type hints, prefers async/await"}
]`;

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "MentorAI",
      },
      body: JSON.stringify({
        model: "anthropic/claude-opus-4.5", 
        messages: [{ role: "user", content: consolidationPrompt }],
        temperature: 0.1,
      }),
    });

    if (!resp.ok) return; // Fail silently, don't break chat flow

    const data = await resp.json();
    const content = extractMessageContent(data?.choices?.[0]?.message?.content);
    
    // Extract JSON from response (might be wrapped in markdown)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const actions = JSON.parse(jsonMatch[0]) as MemoryAction[];
    
    // Execute actions
    const memoriesToDelete: string[] = [];
    const memoriesToCreate: Array<{ title: string | null; content: string }> = [];
    const memoriesToUpdate: Array<{ id: string; title: string | null; content: string }> = [];

    for (const action of actions) {
      if (action.action === "delete" && action.id) {
        memoriesToDelete.push(action.id);
      } else if (action.action === "merge" && action.mergeIds && action.newContent) {
        // Delete the merged memories and create a new one
        memoriesToDelete.push(...action.mergeIds);
        memoriesToCreate.push({
          title: action.newTitle || null,
          content: action.newContent,
        });
      } else if (action.action === "update" && action.id && action.newContent) {
        memoriesToUpdate.push({
          id: action.id,
          title: action.newTitle || null,
          content: action.newContent,
        });
      }
    }

    // Execute database operations
    if (memoriesToDelete.length > 0) {
      console.log(`[Memory Consolidation] Deleting ${memoriesToDelete.length} memories`);
      await prisma.memory.deleteMany({
        where: { id: { in: memoriesToDelete }, userId },
      });
    }

    if (memoriesToUpdate.length > 0) {
      console.log(`[Memory Consolidation] Updating ${memoriesToUpdate.length} memories`);
      for (const update of memoriesToUpdate) {
        await prisma.memory.update({
          where: { id: update.id },
          data: { title: update.title, content: update.content },
        });
      }
    }

    if (memoriesToCreate.length > 0) {
      console.log(`[Memory Consolidation] Creating ${memoriesToCreate.length} memories`);
      for (const create of memoriesToCreate) {
        await prisma.memory.create({
          data: { userId, title: create.title, content: create.content },
        });
      }
    }

    console.log(`[Memory Consolidation] Completed successfully - ${memoriesToDelete.length} deleted, ${memoriesToUpdate.length} updated, ${memoriesToCreate.length} created`);
  } catch (err) {
    console.error("[Memory Consolidation] Failed:", err);
    // Fail silently - don't break the chat flow
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { modelId, imageModelId, messages, conversationId } = (await req.json()) as {
      modelId?: string;
      imageModelId?: string;
      messages?: IncomingMessage[];
      conversationId?: string;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "Server missing OPENROUTER_API_KEY" },
        { status: 500 }
      );
    }

    if (!modelId || !messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const model = MODEL_SLUGS[modelId] ?? modelId;

    // Fetch user memories
    const memories = await prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, content: true },
    });

    // Generate system prompt with user memories
    const systemPrompt = getSystemPrompt({
      userId,
      conversationId,
      memories,
    });

    // Resolve image model slug
    const imageModel = imageModelId ? (IMAGE_MODEL_SLUGS[imageModelId] ?? imageModelId) : "google/gemini-2.5-flash-image";

    // Define tools for the model to call
    const tools = [
      {
        type: "function",
        function: {
          name: "save_memory",
          description:
            "Store a durable user memory (preference, profile fact, recurring constraint). Keep it concise.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Optional short title" },
              content: { type: "string", description: "The memory content" },
            },
            required: ["content"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "rename_conversation",
          description:
            "Rename the current conversation to a short, descriptive title (<= 60 chars).",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short new title" },
            },
            required: ["title"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "generate_image",
          description:
            "Generate an image based on a text prompt. Use this when the user asks you to create, draw, generate, or make an image, picture, illustration, artwork, or visual content.",
          parameters: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "A detailed description of the image to generate. Be specific about style, composition, colors, and subjects.",
              },
            },
            required: ["prompt"],
          },
        },
      },
    ];

    // Build conversation messages, replacing any system message with our enhanced one
    const convoMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(messages) ? messages.filter(m => m.role !== "system") : [])
    ];
    let finalContent = "";
    let finalSpeechContent = "";
    let finalDisplayContent = "";

    // Tool loop (bounded)
    for (let i = 0; i < 3; i++) {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
          "X-Title": "MentorAI",
        },
        body: JSON.stringify({
          model,
          messages: convoMessages,
          tools,
          tool_choice: "auto",
          temperature: 0.2,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return NextResponse.json({ error: text }, { status: 502 });
      }

      const data = await resp.json();
      const msg = (data?.choices?.[0]?.message ?? {}) as ChoiceMessage;
      const toolCalls: ToolCall[] =
        (msg?.tool_calls as ToolCall[] | undefined) ??
        (msg?.function_call
          ? [{ id: "call_0", type: "function", function: msg.function_call as ToolFunctionCall }]
          : []);

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        // Append the assistant message that initiated the tool calls so the provider
        // can associate subsequent tool outputs with these call ids.
        if (msg?.tool_calls) {
          const extractedContent = extractMessageContent(msg?.content);
          convoMessages.push({
            role: "assistant",
            content: extractedContent || null,
            tool_calls: msg.tool_calls,
          });
        } else if (msg?.function_call) {
          convoMessages.push({
            role: "assistant",
            content: null,
            function_call: msg.function_call,
          });
        }

        for (const tc of toolCalls) {
          const name = tc?.function?.name as string | undefined;
          let args: unknown = {};
          try {
            args = JSON.parse(tc?.function?.arguments ?? "{}");
          } catch {
            args = {};
          }

          const obj = isRecord(args) ? args : {};
          let result: ToolResult = { ok: false, error: "Unknown tool" };
          try {
            if (name === "save_memory") {
              const title = typeof obj.title === "string" ? obj.title.trim() : "";
              const content = typeof obj.content === "string" ? obj.content.trim() : "";
              if (!content) {
                result = { ok: false, error: "content required" };
              } else {
                await prisma.memory.create({
                  data: { userId, title: title || null, content },
                });
                result = { ok: true };
              }
            } else if (name === "rename_conversation") {
              const title = typeof obj.title === "string" ? obj.title.trim() : "";
              if (!title) {
                result = { ok: false, error: "title required" };
              } else if (!conversationId) {
                result = { ok: false, error: "conversationId missing" };
              } else {
                const conv = await prisma.conversation.findFirst({
                  where: { id: conversationId, userId },
                  select: { id: true },
                });
                if (!conv) {
                  result = { ok: false, error: "conversation not found" };
                } else {
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { title },
                  });
                  result = { ok: true };
                }
              }
            } else if (name === "generate_image") {
              const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
              if (!prompt) {
                result = { ok: false, error: "prompt required" };
              } else {
                console.log(`[generate_image] Starting image generation with model: ${imageModel}`);
                console.log(`[generate_image] Prompt: ${prompt.substring(0, 100)}...`);
                
                // Call OpenRouter image generation API with modalities parameter
                // The modalities parameter tells OpenRouter we want image output
                const imageResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
                    "X-Title": "MentorAI",
                  },
                  body: JSON.stringify({
                    model: imageModel,
                    messages: [
                      {
                        role: "user",
                        content: `Generate an image: ${prompt}`,
                      },
                    ],
                    // Critical: This tells OpenRouter to return image output
                    modalities: ["image", "text"],
                    stream: false,
                  }),
                });

                console.log(`[generate_image] Response status: ${imageResp.status}`);

                if (!imageResp.ok) {
                  const errorText = await imageResp.text();
                  console.error(`[generate_image] API error: ${errorText}`);
                  result = { ok: false, error: `Image generation failed: ${errorText}` };
                } else {
                  const imageData = await imageResp.json();
                  
                  // Log the full response for debugging
                  console.log(`[generate_image] ========== FULL API RESPONSE ==========`);
                  console.log(JSON.stringify(imageData, null, 2));
                  console.log(`[generate_image] ========================================`);
                  
                  let imageUrl = "";
                  
                  // Method 1: OpenRouter documented format - message.images[].image_url.url
                  const messageImages = imageData?.choices?.[0]?.message?.images;
                  if (Array.isArray(messageImages) && messageImages.length > 0) {
                    console.log(`[generate_image] Found images array with ${messageImages.length} items`);
                    const firstImage = messageImages[0];
                    console.log(`[generate_image] First image structure:`, JSON.stringify(firstImage, null, 2));
                    
                    if (typeof firstImage === "string") {
                      imageUrl = firstImage;
                      console.log(`[generate_image] Method 1a: Direct string URL`);
                    } else if (firstImage?.image_url?.url) {
                      imageUrl = firstImage.image_url.url;
                      console.log(`[generate_image] Method 1b: image_url.url format`);
                    } else if (firstImage?.url) {
                      imageUrl = firstImage.url;
                      console.log(`[generate_image] Method 1c: Direct url property`);
                    } else if (typeof firstImage?.b64_json === "string") {
                      imageUrl = `data:image/png;base64,${firstImage.b64_json}`;
                      console.log(`[generate_image] Method 1d: b64_json format`);
                    }
                  }
                  
                  // Method 2: Top-level data array (DALL-E style)
                  if (!imageUrl && Array.isArray(imageData?.data) && imageData.data.length > 0) {
                    console.log(`[generate_image] Found top-level data array with ${imageData.data.length} items`);
                    const firstData = imageData.data[0];
                    console.log(`[generate_image] First data item:`, JSON.stringify(firstData, null, 2));
                    
                    if (firstData?.url) {
                      imageUrl = firstData.url;
                      console.log(`[generate_image] Method 2a: data[].url`);
                    } else if (typeof firstData?.b64_json === "string") {
                      imageUrl = `data:image/png;base64,${firstData.b64_json}`;
                      console.log(`[generate_image] Method 2b: data[].b64_json`);
                    }
                  }
                  
                  // Method 3: Google/Gemini native format with inline_data
                  if (!imageUrl) {
                    const candidates = imageData?.candidates;
                    if (Array.isArray(candidates) && candidates.length > 0) {
                      console.log(`[generate_image] Found candidates array (Gemini native format)`);
                      const parts = candidates[0]?.content?.parts;
                      if (Array.isArray(parts)) {
                        for (const part of parts) {
                          if (part?.inline_data?.data) {
                            const mimeType = part.inline_data.mime_type || "image/png";
                            imageUrl = `data:${mimeType};base64,${part.inline_data.data}`;
                            console.log(`[generate_image] Method 3a: Gemini inline_data format`);
                            break;
                          }
                        }
                      }
                    }
                  }
                  
                  // Method 4: Check message content
                  if (!imageUrl) {
                    const imageContent = imageData?.choices?.[0]?.message?.content;
                    console.log(`[generate_image] Checking message.content - type: ${typeof imageContent}`);
                    
                    if (typeof imageContent === "string") {
                      console.log(`[generate_image] Content (first 1000 chars): ${imageContent.substring(0, 1000)}`);
                      
                      // Check if it's a data URL
                      if (imageContent.startsWith("data:image")) {
                        imageUrl = imageContent.trim();
                        console.log(`[generate_image] Method 4a: Direct data URL in content`);
                      } 
                      // Check if it's a direct HTTP URL
                      else if (imageContent.startsWith("http")) {
                        imageUrl = imageContent.trim().split(/\s/)[0]; // Take first URL-like string
                        console.log(`[generate_image] Method 4b: Direct HTTP URL`);
                      }
                      // Try to extract from markdown
                      else {
                        const markdownMatch = imageContent.match(/!\[.*?\]\(((?:https?:\/\/|data:image)[^\s)]+)\)/);
                        if (markdownMatch) {
                          imageUrl = markdownMatch[1];
                          console.log(`[generate_image] Method 4c: Extracted from markdown`);
                        } else {
                          // Try to find any image URL
                          const urlMatch = imageContent.match(/(https?:\/\/[^\s"'<>]+)/i);
                          if (urlMatch) {
                            imageUrl = urlMatch[1];
                            console.log(`[generate_image] Method 4d: Found URL in text`);
                          }
                        }
                      }
                    } else if (Array.isArray(imageContent)) {
                      console.log(`[generate_image] Content is array with ${imageContent.length} parts`);
                      for (let i = 0; i < imageContent.length; i++) {
                        const part = imageContent[i];
                        console.log(`[generate_image] Part ${i}:`, JSON.stringify(part, null, 2));
                        
                        // Various multimodal content formats
                        if (part?.type === "image_url" && part?.image_url?.url) {
                          imageUrl = part.image_url.url;
                          console.log(`[generate_image] Method 4e: content[].image_url.url`);
                          break;
                        } else if (part?.type === "image" && part?.url) {
                          imageUrl = part.url;
                          console.log(`[generate_image] Method 4f: content[].url`);
                          break;
                        } else if (part?.type === "image" && part?.source?.data) {
                          const mediaType = part?.source?.media_type || "image/png";
                          imageUrl = `data:${mediaType};base64,${part.source.data}`;
                          console.log(`[generate_image] Method 4g: content[].source.data (Anthropic format)`);
                          break;
                        } else if (typeof part?.image_url === "string") {
                          imageUrl = part.image_url;
                          console.log(`[generate_image] Method 4h: content[].image_url as string`);
                          break;
                        } else if (part?.inline_data?.data) {
                          // Gemini multimodal content format within choices
                          const mimeType = part.inline_data.mime_type || "image/png";
                          imageUrl = `data:${mimeType};base64,${part.inline_data.data}`;
                          console.log(`[generate_image] Method 4i: content[].inline_data (Gemini format)`);
                          break;
                        }
                      }
                    }
                  }

                  if (imageUrl) {
                    const urlPreview = imageUrl.length > 100 ? `${imageUrl.substring(0, 100)}...` : imageUrl;
                    console.log(`[generate_image] SUCCESS! Image URL: ${urlPreview}`);
                    result = { ok: true, imageUrl } as ToolResult & { imageUrl: string };
                  } else {
                    console.error(`[generate_image] FAILED: No image URL found in response`);
                    console.error(`[generate_image] Response keys: ${Object.keys(imageData || {}).join(", ")}`);
                    if (imageData?.choices?.[0]) {
                      console.error(`[generate_image] Choice keys: ${Object.keys(imageData.choices[0]).join(", ")}`);
                      if (imageData.choices[0].message) {
                        console.error(`[generate_image] Message keys: ${Object.keys(imageData.choices[0].message).join(", ")}`);
                      }
                    }
                    // Check for Gemini native format
                    if (imageData?.candidates?.[0]) {
                      console.error(`[generate_image] Candidate keys: ${Object.keys(imageData.candidates[0]).join(", ")}`);
                      if (imageData.candidates[0].content) {
                        console.error(`[generate_image] Candidate content keys: ${Object.keys(imageData.candidates[0].content).join(", ")}`);
                        if (Array.isArray(imageData.candidates[0].content.parts)) {
                          console.error(`[generate_image] Parts count: ${imageData.candidates[0].content.parts.length}`);
                          imageData.candidates[0].content.parts.forEach((p: Record<string, unknown>, idx: number) => {
                            console.error(`[generate_image] Part ${idx} keys: ${Object.keys(p).join(", ")}`);
                          });
                        }
                      }
                    }
                    result = { ok: false, error: "No image URL in response. Check server logs for full API response." };
                  }
                }
              }
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : "tool error";
            result = { ok: false, error: message };
          }

          // Provide tool result back to the model
          convoMessages.push({
            role: "tool",
            tool_call_id: tc?.id,
            name: name ?? "unknown",
            content: JSON.stringify(result),
          });
        }
        // Continue loop so model can consume tool results
        continue;
      }

      // Extract content handling various formats (string, array, object)
      finalContent = extractMessageContent(msg?.content);
      const parsed = parseResponseContent(finalContent);
      finalSpeechContent = parsed.speech;
      finalDisplayContent = parsed.display;
      break;
    }

    // Persist assistant message if any
    if (conversationId && (finalDisplayContent || finalContent)) {
      const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
      if (conv) {
        await prisma.message.create({
          data: { 
            conversationId, 
            role: "assistant", 
            content: finalDisplayContent || finalContent,
            speechContent: finalSpeechContent || null
          },
        });
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

        // Check if we should consolidate memories
        const messageCount = await prisma.message.count({
          where: { conversationId },
        });

        // Run memory consolidation after 5, 15, 25 messages, etc. (every 10 after initial 5)
        const shouldConsolidate = messageCount === 5 || (messageCount > 5 && (messageCount - 5) % 10 === 0);
        
        if (shouldConsolidate && memories.length >= 2) {
          console.log(`[Memory Consolidation] Triggering for user ${userId} - ${messageCount} messages, ${memories.length} memories`);
          // Run consolidation asynchronously (don't await - don't block response)
          consolidateMemories(userId, memories, process.env.OPENROUTER_API_KEY!).catch((err) => {
            console.error("Background memory consolidation error:", err);
          });
        }
      }
    }

    return NextResponse.json({ 
      content: finalDisplayContent || finalContent,
      speechContent: finalSpeechContent || finalDisplayContent || finalContent
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


