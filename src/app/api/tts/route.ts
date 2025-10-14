export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, voiceId, modelId } = (await req.json()) as {
      text?: string;
      voiceId?: string;
      modelId?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
    }

    const defaultVoice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; 
    const voice = voiceId || defaultVoice;
    const model = modelId || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.4, similarity_boost: 0.8 },
        optimize_streaming_latency: 3,
        output_format: "mp3_44100_128",
      }),
      cache: "no-store",
    });

    if (!resp.ok) {
      let errorText: string;
      try {
        const j = await resp.json();
        errorText = typeof j === "string" ? j : JSON.stringify(j);
      } catch {
        try {
          errorText = await resp.text();
        } catch {
          errorText = "(no details)";
        }
      }
      return NextResponse.json({ error: `ElevenLabs ${resp.status}: ${errorText}` }, { status: 502 });
    }

    // Stream the audio directly to the client
    const reader = resp.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "No stream available" }, { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err: unknown) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}