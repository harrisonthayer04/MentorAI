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
    try {
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      throw new Error(`TTS failed (${res.status})`);
    } catch {
      throw new Error(`TTS failed (${res.status})`);
    }
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}