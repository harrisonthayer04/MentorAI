export async function synthesizeToUrl(
  text: string,
  opts?: { voiceId?: string; modelId?: string }
) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...opts }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`TTS failed: ${res.status} ${err}`);
  }

  //audio+voice
  const blob = await res.blob(); 
  return URL.createObjectURL(blob); //uses audio api key
}
