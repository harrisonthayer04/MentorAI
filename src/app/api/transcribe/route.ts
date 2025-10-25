export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  const reqId = randomUUID();

  try {
    const form = await req.formData();

    // Accept either "audio" or "file" from the client
    const uploaded = (form.get("audio") || form.get("file")) as Blob | null;
    if (!(uploaded instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing audio file", requestId: reqId },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.ELEVENLABS_API_KEY ||
      process.env.ELEVEN_LABS_API_KEY ||
      process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing ELEVENLABS_API_KEY", requestId: reqId },
        { status: 500 }
      );
    }

    // Build multipart body for ElevenLabs STT
    const contentType = (uploaded as any).type || "audio/webm";
    const filename = "audio.webm";
    const body = new FormData();
    body.append("file", new Blob([await uploaded.arrayBuffer()], { type: contentType }), filename);
    body.append("model_id", "scribe_v1"); // STT model

    // IMPORTANT: do NOT set Content-Type manually; fetch sets the boundary
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Accept": "application/json",
        "User-Agent": "MentorAI/1.0",
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      let errorText = "";
      try {
        const j = await resp.json();
        errorText = typeof j === "string" ? j : JSON.stringify(j);
      } catch {
        try { errorText = await resp.text(); } catch { errorText = "(no details)"; }
      }

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

    const data = await resp.json();
    const text = data?.text ?? "";

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
    return NextResponse.json(
      { error: message, requestId: reqId },
      { status: 500, headers: { "x-request-id": reqId } }
    );
  }
}
