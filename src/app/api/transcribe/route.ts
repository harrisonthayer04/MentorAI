export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

function extractTextFromResponse(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "text" in payload &&
    typeof (payload as { text?: unknown }).text === "string"
  ) {
    return (payload as { text: string }).text;
  }
  return "";
}

function serializeError(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload instanceof Error) return payload.message;
  if (typeof payload === "object" && payload !== null) {
    try {
      return JSON.stringify(payload);
    } catch {
      return "[object could not be stringified]";
    }
  }
  return String(payload);
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const apiKey =
      process.env.ELEVENLABS_API_KEY ||
      process.env.ELEVEN_LABS_API_KEY ||
      process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
    }

    try {
      console.info(
        `[api/transcribe] req=${reqId} start name=${file.name} type=${file.type} size=${file.size}`
      );
    } catch {}

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const upstreamForm = new FormData();
    const fileName = file.name || "audio.webm";
    const blob = new Blob([buffer], { type: file.type || "audio/webm" });
    upstreamForm.append("file", blob, fileName);
    upstreamForm.append(
      "model_id",
      process.env.ELEVENLABS_STT_MODEL_ID || process.env.NEXT_PUBLIC_ELEVENLABS_STT_MODEL_ID || "eleven_multilingual_v2"
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
        "User-Agent": "MentorAI/1.0",
      },
      body: upstreamForm,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      let errorText: string;
      try {
        const payload: unknown = await resp.json();
        errorText = serializeError(payload);
      } catch {
        try {
          errorText = await resp.text();
        } catch {
          errorText = "(no details)";
        }
      }
      try {
        console.error(
          `[api/transcribe] req=${reqId} upstream_error status=${resp.status} details=${errorText}`
        );
      } catch {}

      const upstreamReqId =
        resp.headers.get("x-request-id") ||
        resp.headers.get("x-amzn-requestid") ||
        "";
      return NextResponse.json(
        {
          error: `ElevenLabs ${resp.status}: ${errorText}`,
          requestId: reqId,
          upstreamRequestId: upstreamReqId,
        },
        {
          status: resp.status,
          headers: {
            "x-request-id": reqId,
            "x-upstream-request-id": upstreamReqId,
          },
        }
      );
    }

    const payload: unknown = await resp.json();
    const text = extractTextFromResponse(payload);

    try {
      console.info(
        `[api/transcribe] req=${reqId} success textLen=${text.length}`
      );
    } catch {}

    return NextResponse.json(
      { text, requestId: reqId },
      {
        status: 200,
        headers: {
          "x-request-id": reqId,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      console.error(`[api/transcribe] fatal_error req=${reqId} msg=${message}`);
    } catch {}
    return NextResponse.json(
      { error: message, requestId: reqId },
      {
        status: 500,
        headers: { "x-request-id": reqId },
      }
    );
  }
}
