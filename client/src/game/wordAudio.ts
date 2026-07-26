/** Word audio via the existing ElevenLabs → S3-cached TTS endpoint. Cached per word. */
const cache = new Map<string, string>();
let current: HTMLAudioElement | null = null;

export async function playWord(word: string, lang: "russian" | "spanish"): Promise<void> {
  try {
    let url = cache.get(`${lang}:${word}`);
    if (!url) {
      const r = await fetch("/api/tts/text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: word, language: lang }),
      });
      url = (await r.json()).audioUrl;
      if (url) cache.set(`${lang}:${word}`, url);
    }
    if (!url) return;
    if (current) { current.pause(); current = null; }
    current = new Audio(url);
    await current.play().catch(() => {});
  } catch { /* ignore */ }
}
