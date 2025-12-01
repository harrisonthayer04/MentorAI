import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSystemPrompt } from "@/lib/system-prompt";

// Increase timeout for image processing
export const maxDuration = 60;

// Image content part for vision models
type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
type TextContentPart = { type: "text"; text: string };
type ContentPart = TextContentPart | ImageContentPart;

// Message can have string content or array of content parts (for images)
type IncomingMessage = {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
};

// Types for tool-calling compatibility with OpenRouter (OpenAI-style)
type ToolFunctionCall = { name: string; arguments: string };
// ToolCall may include additional fields from providers (e.g., index, thought_signature for Gemini)
type ToolCall = { 
  id: string; 
  type: "function"; 
  function: ToolFunctionCall;
  index?: number;
  [key: string]: unknown; // Allow additional provider-specific fields
};
// Reasoning details for Gemini models (must be preserved in tool call loops)
type ReasoningDetail = { 
  format?: string; 
  index?: number; 
  type?: string; 
  text?: string; 
  id?: string;
  data?: string;
};
type AssistantMessageWithToolCalls = { 
  role: "assistant"; 
  content: string | null; 
  tool_calls: ToolCall[];
  reasoning?: string;
  reasoning_details?: ReasoningDetail[];
};
type AssistantMessageWithFunctionCall = { role: "assistant"; content: string | null; function_call: ToolFunctionCall };
type ToolMessage = { role: "tool"; content: string; tool_call_id: string; name?: string };
type MultimodalMessage = { role: "user" | "system"; content: string | ContentPart[] };
type OpenAIMessage = IncomingMessage | AssistantMessageWithToolCalls | AssistantMessageWithFunctionCall | ToolMessage | MultimodalMessage;
type ChoiceMessage = Partial<AssistantMessageWithToolCalls & AssistantMessageWithFunctionCall> & { 
  content?: unknown;
  reasoning?: string;
  reasoning_details?: ReasoningDetail[];
};
type ToolResult = { ok: boolean; error?: string };
type DebugLogEntry = { timestamp: string; scope: string; detail: string };

const MAX_DEBUG_DETAIL_LENGTH = 4000;

function formatDebugDetail(value: unknown): string {
  if (typeof value === "string") {
    return value.length > MAX_DEBUG_DETAIL_LENGTH
      ? `${value.slice(0, MAX_DEBUG_DETAIL_LENGTH)}…[truncated]`
      : value;
  }
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (typeof serialized === "string") {
      return serialized.length > MAX_DEBUG_DETAIL_LENGTH
        ? `${serialized.slice(0, MAX_DEBUG_DETAIL_LENGTH)}…[truncated]`
        : serialized;
    }
  } catch {
    // fall through to generic stringification
  }
  const fallback = String(value);
  return fallback.length > MAX_DEBUG_DETAIL_LENGTH
    ? `${fallback.slice(0, MAX_DEBUG_DETAIL_LENGTH)}…[truncated]`
    : fallback;
}

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

function isVisionCapableModel(modelSlug: string): boolean {
  // Check both the original ID and the resolved slug
  return VISION_CAPABLE_MODELS.has(modelSlug) || 
    Array.from(VISION_CAPABLE_MODELS).some(m => modelSlug.includes(m.split('/').pop() || ''));
}

// Extract text-only content from a message for storage (strip image data to save space)
function extractTextContentForStorage(content: string | ContentPart[]): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((part): part is TextContentPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

// Format message content for the API (convert to multimodal format if needed)
function formatMessageContent(
  content: string | ContentPart[],
  supportsVision: boolean
): string | ContentPart[] {
  // If content is already an array, use it directly for vision models
  if (Array.isArray(content)) {
    if (supportsVision) {
      return content;
    }
    // For non-vision models, extract text only
    return extractTextContentForStorage(content);
  }
  return content;
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
  "gemini-3-pro-preview": "google/gemini-3-pro-preview",
  "anthropic/claude-opus-4.5": "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5": "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5": "anthropic/claude-haiku-4.5",
  "moonshot/kimi-k2-thinking": "moonshot/kimi-k2-thinking",
  "qwen/qwen3-235b-a22b-2507": "qwen/qwen3-235b-a22b-2507",
  "openai/gpt-5.1": "openai/gpt-5.1",
  "openai/gpt-5-mini": "openai/gpt-5-mini",
  "groq/gpt-oss-20b": "groq/gpt-oss-20b",
  "sambanova/gpt-oss-120b": "sambanova/gpt-oss-120b",
  "deepseek/deepseek-r1-0528": "deepseek/deepseek-r1-0528",
  "deepseek/deepseek-v3.2": "deepseek/deepseek-v3.2",
  "prime-intellect/intellect-3": "prime-intellect/intellect-3",
  "z-ai/glm-4.6": "z-ai/glm-4.6",
};

const IMAGE_MODEL_SLUGS: Record<string, string> = {
  "google/gemini-3-pro-image-preview": "google/gemini-3-pro-image-preview",
  "google/gemini-2.5-flash-image": "google/gemini-2.5-flash-image",
  "openai/gpt-5-image": "openai/gpt-5-image",
  "black-forest-labs/flux.2-pro": "black-forest-labs/flux.2-pro",
};

// Models that support vision (image input) - matches models in MODEL_SLUGS
const VISION_CAPABLE_MODELS: Set<string> = new Set([
  // Anthropic Claude models (all Claude 3+ support vision)
  "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  // Google Gemini models
  "google/gemini-2.5-flash-lite",
  "google/gemini-3-pro-preview",
  // X.AI Grok models
  "x-ai/grok-4-fast",
  // OpenAI models
  "openai/gpt-5.1",
  "openai/gpt-5-mini",
  // Groq models
  "groq/gpt-oss-20b",
  // SambaNova models
  "sambanova/gpt-oss-120b",
]);
const DIFFUSION_MODELS: Set<string> = new Set([
  // Empty - OpenRouter routes all image models through chat/completions with modalities
]);

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
  let debugEnabled = false;
  const debugLog: DebugLogEntry[] = [];
  const pushDebug = (scope: string, detail: unknown) => {
    if (!debugEnabled) return;
    debugLog.push({
      timestamp: new Date().toISOString(),
      scope,
      detail: formatDebugDetail(detail),
    });
  };
  const respond = (body: Record<string, unknown>, status = 200) => {
    return NextResponse.json(debugEnabled ? { ...body, debugLog } : body, { status });
  };

  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return respond({ error: "Unauthorized" }, 401);

    const { modelId, imageModelId, messages, conversationId, debug } = (await req.json()) as {
      modelId?: string;
      imageModelId?: string;
      messages?: IncomingMessage[];
      conversationId?: string;
      debug?: boolean;
    };
    debugEnabled = Boolean(debug);
    pushDebug("request_init", {
      conversationId: conversationId ?? "unknown",
      modelId,
      imageModelId,
    });
    pushDebug("messages_payload", messages ?? []);

    if (!process.env.OPENROUTER_API_KEY) {
      pushDebug("configuration_error", "Server missing OPENROUTER_API_KEY");
      return respond({ error: "Server missing OPENROUTER_API_KEY" }, 500);
    }

    if (!modelId || !messages || !Array.isArray(messages)) {
      pushDebug("validation_error", "Invalid payload");
      return respond({ error: "Invalid payload" }, 400);
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
    pushDebug("memories_loaded", { count: memories.length });
    pushDebug("system_prompt", systemPrompt);

    // Resolve image model slug
    const imageModel = imageModelId ? (IMAGE_MODEL_SLUGS[imageModelId] ?? imageModelId) : "google/gemini-2.5-flash-image";
    pushDebug("models_resolved", { chatModel: model, imageModel });

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

    // Check if the current model supports vision
    const supportsVision = isVisionCapableModel(model);
    pushDebug("vision_support", { model, supportsVision });

    // Build conversation messages, replacing any system message with our enhanced one
    // Format messages appropriately based on vision support
    const convoMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(messages) 
        ? messages
            .filter(m => m.role !== "system")
            .map(m => ({
              ...m,
              content: formatMessageContent(m.content, supportsVision),
            }))
        : [])
    ];
    let finalContent = "";
    let finalSpeechContent = "";
    let finalDisplayContent = "";
    
    // Store generated images with placeholder IDs to avoid sending huge base64 data back to the LLM
    const generatedImages = new Map<string, string>();
    let imageCounter = 0;

    // Tool loop (bounded)
    for (let i = 0; i < 3; i++) {
      pushDebug("llm_iteration_start", {
        iteration: i + 1,
        convoMessagesCount: convoMessages.length,
      });
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
      pushDebug("llm_http_status", { iteration: i + 1, status: resp.status });

      if (!resp.ok) {
        const text = await resp.text();
        pushDebug("llm_error", { iteration: i + 1, status: resp.status, body: text });
        return respond({ error: text }, 502);
      }

      const data = await resp.json();
      const msg = (data?.choices?.[0]?.message ?? {}) as ChoiceMessage;
      pushDebug("llm_message", msg);
      const toolCalls: ToolCall[] =
        (msg?.tool_calls as ToolCall[] | undefined) ??
        (msg?.function_call
          ? [{ id: "call_0", type: "function", function: msg.function_call as ToolFunctionCall }]
          : []);

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        pushDebug(
          "tool_calls_detected",
          toolCalls.map((tc) => ({ id: tc?.id, name: tc?.function?.name }))
        );
        // Append the assistant message that initiated the tool calls so the provider
        // can associate subsequent tool outputs with these call ids.
        // IMPORTANT: Preserve reasoning/reasoning_details for Gemini models
        if (msg?.tool_calls) {
          const extractedContent = extractMessageContent(msg?.content);
          const assistantMsg: AssistantMessageWithToolCalls = {
            role: "assistant",
            content: extractedContent || null,
            tool_calls: msg.tool_calls,
          };
          // Preserve reasoning details for Gemini models (required for tool call loops)
          if (msg?.reasoning) {
            assistantMsg.reasoning = msg.reasoning;
          }
          if (msg?.reasoning_details && Array.isArray(msg.reasoning_details)) {
            assistantMsg.reasoning_details = msg.reasoning_details;
          }
          convoMessages.push(assistantMsg);
        } else if (msg?.function_call) {
          convoMessages.push({
            role: "assistant",
            content: null,
            function_call: msg.function_call,
          });
        }

        for (const tc of toolCalls) {
          const name = tc?.function?.name as string | undefined;
          pushDebug("tool_call", {
            id: tc?.id,
            name,
            rawArguments: tc?.function?.arguments ?? "{}",
          });
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
                
                const isDiffusionModel = DIFFUSION_MODELS.has(imageModel);
                console.log(`[generate_image] Model type: ${isDiffusionModel ? "diffusion" : "multimodal-chat"}`);
                pushDebug("generate_image_request", {
                  prompt,
                  imageModel,
                  mode: isDiffusionModel ? "diffusion" : "multimodal",
                });
                
                let imageUrl = "";
                
                if (isDiffusionModel) {
                  // Pure diffusion models use the /images/generations endpoint
                  console.log(`[generate_image] Using /images/generations endpoint for diffusion model`);
                  
                  const imageResp = await fetch("https://openrouter.ai/api/v1/images/generations", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
                      "X-Title": "MentorAI",
                    },
                    body: JSON.stringify({
                      model: imageModel,
                      prompt: prompt,
                      n: 1,
                      size: "1024x1024",
                    }),
                  });

                  console.log(`[generate_image] Response status: ${imageResp.status}`);
                  pushDebug("generate_image_status", { status: imageResp.status, model: imageModel });

                  if (!imageResp.ok) {
                    const errorText = await imageResp.text();
                    console.error(`[generate_image] API error: ${errorText}`);
                    pushDebug("generate_image_error", errorText);
                    result = { ok: false, error: `Image generation failed: ${errorText}` };
                  } else {
                    const imageData = await imageResp.json();
                    
                    console.log(`[generate_image] ========== FULL API RESPONSE ==========`);
                    console.log(JSON.stringify(imageData, null, 2));
                    console.log(`[generate_image] ========================================`);
                    
                    // Standard images/generations response format: { data: [{ url: "..." }] }
                    if (Array.isArray(imageData?.data) && imageData.data.length > 0) {
                      const firstData = imageData.data[0];
                      if (firstData?.url) {
                        imageUrl = firstData.url;
                        console.log(`[generate_image] Found URL in data[0].url`);
                      } else if (typeof firstData?.b64_json === "string") {
                        imageUrl = `data:image/png;base64,${firstData.b64_json}`;
                        console.log(`[generate_image] Found b64_json in data[0]`);
                      }
                    }
                    
                    if (imageUrl) {
                      const urlPreview = imageUrl.length > 100 ? `${imageUrl.substring(0, 100)}...` : imageUrl;
                      console.log(`[generate_image] SUCCESS! Image URL: ${urlPreview}`);
                      pushDebug("generate_image_success", urlPreview);
                      
                      // Store the actual image and use a placeholder to avoid token explosion
                      imageCounter++;
                      const placeholderId = `__IMAGE_PLACEHOLDER_${imageCounter}__`;
                      generatedImages.set(placeholderId, imageUrl);
                      
                      // Tell the LLM the image was generated with a placeholder reference
                      result = { ok: true, imageUrl: placeholderId, note: "Image generated successfully. Use this placeholder in your markdown: ![description](" + placeholderId + ")" } as ToolResult & { imageUrl: string; note: string };
                    } else {
                      console.error(`[generate_image] FAILED: No image URL found in diffusion response`);
                      pushDebug("generate_image_error", "No image URL in diffusion response");
                      result = { ok: false, error: "No image URL in response. Check server logs." };
                    }
                  }
                } else {
                  // Multimodal chat models use /chat/completions with modalities
                  console.log(`[generate_image] Using /chat/completions with modalities for multimodal model`);
                  
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
                      modalities: ["image", "text"],
                      stream: false,
                    }),
                  });

                  console.log(`[generate_image] Response status: ${imageResp.status}`);
                  pushDebug("generate_image_status", { status: imageResp.status, model: imageModel });

                  if (!imageResp.ok) {
                    const errorText = await imageResp.text();
                    console.error(`[generate_image] API error: ${errorText}`);
                    pushDebug("generate_image_error", errorText);
                    result = { ok: false, error: `Image generation failed: ${errorText}` };
                  } else {
                    const imageData = await imageResp.json();
                    
                    console.log(`[generate_image] ========== FULL API RESPONSE ==========`);
                    console.log(JSON.stringify(imageData, null, 2));
                    console.log(`[generate_image] ========================================`);
                    
                    // Method 1: OpenRouter documented format - message.images[].image_url.url
                    const messageImages = imageData?.choices?.[0]?.message?.images;
                    if (Array.isArray(messageImages) && messageImages.length > 0) {
                      console.log(`[generate_image] Found images array with ${messageImages.length} items`);
                      const firstImage = messageImages[0];
                      
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
                      console.log(`[generate_image] Found top-level data array`);
                      const firstData = imageData.data[0];
                      
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
                              console.log(`[generate_image] Method 3: Gemini inline_data format`);
                              break;
                            }
                          }
                        }
                      }
                    }
                    
                    // Method 4: Check message content for various formats
                    if (!imageUrl) {
                      const imageContent = imageData?.choices?.[0]?.message?.content;
                      
                      if (typeof imageContent === "string") {
                        if (imageContent.startsWith("data:image")) {
                          imageUrl = imageContent.trim();
                          console.log(`[generate_image] Method 4a: Direct data URL in content`);
                        } else if (imageContent.startsWith("http")) {
                          imageUrl = imageContent.trim().split(/\s/)[0];
                          console.log(`[generate_image] Method 4b: Direct HTTP URL`);
                        } else {
                          const markdownMatch = imageContent.match(/!\[.*?\]\(((?:https?:\/\/|data:image)[^\s)]+)\)/);
                          if (markdownMatch) {
                            imageUrl = markdownMatch[1];
                            console.log(`[generate_image] Method 4c: Extracted from markdown`);
                          } else {
                            const urlMatch = imageContent.match(/(https?:\/\/[^\s"'<>]+)/i);
                            if (urlMatch) {
                              imageUrl = urlMatch[1];
                              console.log(`[generate_image] Method 4d: Found URL in text`);
                            }
                          }
                        }
                      } else if (Array.isArray(imageContent)) {
                        for (const part of imageContent) {
                          if (part?.type === "image_url" && part?.image_url?.url) {
                            imageUrl = part.image_url.url;
                            console.log(`[generate_image] Method 4e: content[].image_url.url`);
                            break;
                          } else if (part?.type === "image" && part?.url) {
                            imageUrl = part.url;
                            console.log(`[generate_image] Method 4f: content[].url`);
                            break;
                          } else if (part?.inline_data?.data) {
                            const mimeType = part.inline_data.mime_type || "image/png";
                            imageUrl = `data:${mimeType};base64,${part.inline_data.data}`;
                            console.log(`[generate_image] Method 4g: content[].inline_data`);
                            break;
                          }
                        }
                      }
                    }

                    if (imageUrl) {
                      const urlPreview = imageUrl.length > 100 ? `${imageUrl.substring(0, 100)}...` : imageUrl;
                      console.log(`[generate_image] SUCCESS! Image URL: ${urlPreview}`);
                      pushDebug("generate_image_success", urlPreview);
                      
                      // Store the actual image and use a placeholder to avoid token explosion
                      imageCounter++;
                      const placeholderId = `__IMAGE_PLACEHOLDER_${imageCounter}__`;
                      generatedImages.set(placeholderId, imageUrl);
                      
                      // Tell the LLM the image was generated with a placeholder reference
                      result = { ok: true, imageUrl: placeholderId, note: "Image generated successfully. Use this placeholder in your markdown: ![description](" + placeholderId + ")" } as ToolResult & { imageUrl: string; note: string };
                    } else {
                      console.error(`[generate_image] FAILED: No image URL found in multimodal response`);
                      console.error(`[generate_image] Response keys: ${Object.keys(imageData || {}).join(", ")}`);
                      pushDebug("generate_image_error", "No image URL found in multimodal response");
                      result = { ok: false, error: "No image URL in response. Check server logs." };
                    }
                  }
                }
              }
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : "tool error";
            result = { ok: false, error: message };
          }

          pushDebug(result.ok ? "tool_result" : "tool_error", {
            id: tc?.id,
            name,
            result,
          });

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
      
      // Substitute image placeholders with actual image URLs
      if (generatedImages.size > 0) {
        for (const [placeholder, actualUrl] of generatedImages) {
          finalContent = finalContent.replaceAll(placeholder, actualUrl);
          finalSpeechContent = finalSpeechContent.replaceAll(placeholder, actualUrl);
          finalDisplayContent = finalDisplayContent.replaceAll(placeholder, actualUrl);
        }
        pushDebug("image_placeholders_substituted", { count: generatedImages.size });
      }
      
      pushDebug("assistant_response", {
        speech: finalSpeechContent,
        display: finalDisplayContent,
        raw: finalContent.length > 500 ? finalContent.substring(0, 500) + "...[truncated]" : finalContent,
      });
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
        pushDebug("assistant_persisted", { conversationId, persisted: true });
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

        // Check if we should consolidate memories
        const messageCount = await prisma.message.count({
          where: { conversationId },
        });

        // Run memory consolidation after 5, 15, 25 messages, etc. (every 10 after initial 5)
        const shouldConsolidate = messageCount === 5 || (messageCount > 5 && (messageCount - 5) % 10 === 0);
        
        if (shouldConsolidate && memories.length >= 2) {
          console.log(`[Memory Consolidation] Triggering for user ${userId} - ${messageCount} messages, ${memories.length} memories`);
          pushDebug("memory_consolidation_trigger", { conversationId, messageCount });
          // Run consolidation asynchronously (don't await - don't block response)
          consolidateMemories(userId, memories, process.env.OPENROUTER_API_KEY!).catch((err) => {
            console.error("Background memory consolidation error:", err);
          });
        }
      } else {
        pushDebug("assistant_persisted", { conversationId, persisted: false });
      }
    }

    pushDebug("response_ready", {
      contentPreview: (finalDisplayContent || finalContent || "").slice(0, 200),
    });
    return respond({
      content: finalDisplayContent || finalContent,
      speechContent: finalSpeechContent || finalDisplayContent || finalContent,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    pushDebug("error", message);
    return respond({ error: message }, 500);
  }
}


