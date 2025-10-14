export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

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

    const apiKey =
      process.env.ELEVENLABS_API_KEY ||
      process.env.ELEVEN_LABS_API_KEY ||
      process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
    }

    const defaultVoice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; 
    const voice = voiceId || defaultVoice;
    const model = (modelId || process.env.ELEVENLABS_MODEL_ID || "").trim() || undefined;

    const reqId = randomUUID();
    try {
      console.info(
        `[api/tts] req=${reqId} start textLength=${(text || "").length} voice=${voice} model=${model}`
      );
    } catch {}

    const normalized = (text || "").slice(0, 4000);
    const payload: Record<string, unknown> = {
      text: normalized,
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
      output_format: "mp3_44100_128",
    };
    if (model) payload.model_id = model;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "User-Agent": "MentorAI/1.0",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
      try {
        console.error(
          `[api/tts] req=${reqId} upstream_error status=${resp.status} details=${errorText}`
        );
      } catch {}
      const upstreamReqId = resp.headers.get("x-request-id") || resp.headers.get("x-amzn-requestid") || "";
      return NextResponse.json(
        { error: `ElevenLabs ${resp.status}: ${errorText}`, requestId: reqId, upstreamRequestId: upstreamReqId },
        { status: 502, headers: { "x-request-id": reqId, "x-upstream-request-id": upstreamReqId } }
      );
    }

    const audioBuffer = await resp.arrayBuffer();
    try {
      console.info(
        `[api/tts] req=${reqId} success bytes=${audioBuffer.byteLength}`
      );
    } catch {}
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "x-request-id": reqId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      console.error(`[api/tts] fatal_error msg=${message}`);
    } catch {}
    return NextResponse.json({ error: message }, { status: 500 });
  }
}