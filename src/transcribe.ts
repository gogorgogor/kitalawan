// Claude does not accept audio input, so recordings are converted to text first.
// Any Whisper-compatible `/audio/transcriptions` endpoint works (OpenAI, Groq,
// a self-hosted whisper.cpp / faster-whisper server, ...).

const API_URL = process.env.TRANSCRIBE_API_URL ?? "https://api.openai.com/v1/audio/transcriptions";
const API_KEY = process.env.TRANSCRIBE_API_KEY;
const MODEL = process.env.TRANSCRIBE_MODEL ?? "whisper-1";

export function transcriptionEnabled(): boolean {
  return Boolean(API_KEY);
}

export async function transcribeAudio(buf: Buffer, filename: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: mimeType }), filename);
  form.append("model", MODEL);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Transcription failed for "${filename}" (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}
