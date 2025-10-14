export async function synthesizeToUrl(
  text: string,
  opts?: { voiceId?: string; modelId?: string }
): Promise<string> {
  if (!text || !text.trim()) {
    throw new Error("Missing text");
  }

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voiceId: opts?.voiceId,
      modelId: opts?.modelId,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const reqId = res.headers.get("x-request-id") || undefined;
    const upstreamId = res.headers.get("x-upstream-request-id") || undefined;
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    let message = `TTS failed (${res.status})`;
    try {
      const data = bodyText ? JSON.parse(bodyText) : undefined;
      const err = (data && typeof data.error === "string" ? data.error : "").trim();
      if (err) message = err;
    } catch {
      if (bodyText && bodyText.trim()) message = `${message}: ${bodyText.trim()}`;
    }
    const suffix = [reqId ? `req=${reqId}` : "", upstreamId ? `up=${upstreamId}` : ""].filter(Boolean).join(" ");
    throw new Error(suffix ? `${message} (${suffix})` : message);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}