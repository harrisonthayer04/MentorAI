import { NextResponse } from "next/server";

type IncomingMessage = { role: "user" | "assistant" | "system"; content: string };

const MODEL_SLUGS: Record<string, string> = {
  "gpt-5-chat": "openai/gpt-5-chat", // map to a supported model slug; adjust when gpt-5 is available
  "gpt-5-mini": "openai/gpt-5-mini",
  "gpt-5-nano": "openai/gpt-5-nano",
};

export async function POST(req: Request) {
  try {
    const { modelId, messages } = (await req.json()) as {
      modelId?: string;
      messages?: IncomingMessage[];
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
        messages,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text }, { status: 502 });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


