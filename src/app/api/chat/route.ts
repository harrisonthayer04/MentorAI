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

const MODEL_SLUGS: Record<string, string> = {
  "gemini-2.5-flash-lite":"google/gemini-2.5-flash-lite",
  "gemini-2.5-pro":"google/gemini-2.5-pro",
  "z-ai/glm-4.6":"z-ai/glm-4.6"
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

    // Tool loop (bounded) - handle tool calls non-streaming first
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
          stream: false,
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
        // Append the assistant message that initiated the tool calls
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

      // No tool calls, break and stream the response
      break;
    }

    // Now stream the final response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
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
              temperature: 0.2,
              stream: true,
            }),
          });

          if (!resp.ok) {
            const text = await resp.text();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: text })}\n\n`));
            controller.close();
            return;
          }

          const reader = resp.body?.getReader();
          if (!reader) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "No stream" })}\n\n`));
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let fullContent = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === "data: [DONE]") continue;
              if (trimmed.startsWith("data: ")) {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const delta = json?.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`));
                  }
                } catch {
                  // Skip malformed chunks
                }
              }
            }
          }

          // Persist the complete message
          if (conversationId && fullContent) {
            const conv = await prisma.conversation.findFirst({
              where: { id: conversationId, userId },
              select: { id: true },
            });
            if (conv) {
              await prisma.message.create({
                data: { conversationId, role: "assistant", content: fullContent },
              });
              await prisma.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
              });
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


