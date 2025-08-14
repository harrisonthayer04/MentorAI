import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, voiceId, modelId } = (await req.json()) as {
      text?: string;
      voiceId?: string;
      modelId?: string;
    };

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
    }

    const defaultVoice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel (public demo)
    const voice = voiceId || defaultVoice;
    const model = modelId || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
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
        optimize_streaming_latency: 0,
        output_format: "mp3_44100_128",
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return NextResponse.json({ error: errorText }, { status: 502 });
    }

    const audioBuffer = await resp.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


