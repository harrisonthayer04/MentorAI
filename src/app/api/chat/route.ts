import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type IncomingMessage = { role: "user" | "assistant" | "system"; content: string };

// Types for tool-calling compatibility with OpenRouter (OpenAI-style)
type ToolFunctionCall = { name: string; arguments: string };
type ToolCall = { id: string; type: "function"; function: ToolFunctionCall };
type AssistantMessageWithToolCalls = { role: "assistant"; content: string | null; tool_calls: ToolCall[] };
type AssistantMessageWithFunctionCall = { role: "assistant"; content: string | null; function_call: ToolFunctionCall };
type ToolMessage = { role: "tool"; content: string; tool_call_id: string; name?: string };
type OpenAIMessage = IncomingMessage | AssistantMessageWithToolCalls | AssistantMessageWithFunctionCall | ToolMessage;
type ChoiceMessage = Partial<AssistantMessageWithToolCalls & AssistantMessageWithFunctionCall> & { content?: string | null };
type ToolResult = { ok: boolean; error?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "anthropic/claude-haiku-4.5": "anthropic/claude-haiku-4.5",
  "qwen/qwen3-235b-a22b-2507": "qwen/qwen3-235b-a22b-2507",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "deepseek/deepseek-v3.1-terminus": "deepseek/deepseek-v3.1-terminus",
  "z-ai/glm-4.6": "z-ai/glm-4.6",
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { modelId, messages, conversationId } = (await req.json()) as {
      modelId?: string;
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
    ];

    const convoMessages: OpenAIMessage[] = Array.isArray(messages) ? [...messages] : [];
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
          convoMessages.push({
            role: "assistant",
            content: msg?.content ?? null,
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

      finalContent = msg?.content ?? "";
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


