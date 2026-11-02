import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { analyzeArgument, type EvidenceImage } from "./analyze.js";
import { transcribeAudio, transcriptionEnabled } from "./transcribe.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3000);

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_FILES = 12;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: MAX_FILES },
});

app.use(express.static(path.join(here, "..", "public")));

app.get("/api/config", (_req, res) => {
  res.json({ transcription: transcriptionEnabled() });
});

app.post("/api/analyze", upload.array("files", MAX_FILES), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const body = req.body as Record<string, string | undefined>;

  const images: EvidenceImage[] = [];
  const transcripts: { name: string; text: string }[] = [];
  const warnings: string[] = [];

  try {
    for (const f of files) {
      if (IMAGE_TYPES.has(f.mimetype)) {
        images.push({
          name: f.originalname,
          mediaType: f.mimetype as EvidenceImage["mediaType"],
          data: f.buffer.toString("base64"),
        });
      } else if (f.mimetype.startsWith("audio/") || f.mimetype.startsWith("video/")) {
        if (!transcriptionEnabled()) {
          warnings.push(
            `"${f.originalname}" was skipped: audio transcription is not configured on the server (set TRANSCRIBE_API_KEY).`,
          );
          continue;
        }
        const text = await transcribeAudio(f.buffer, f.originalname, f.mimetype);
        transcripts.push({ name: f.originalname, text });
      } else {
        warnings.push(`"${f.originalname}" was skipped: unsupported file type (${f.mimetype}).`);
      }
    }

    const liveTranscript = body.liveTranscript?.trim();
    if (liveTranscript) transcripts.push({ name: "Live recording (browser transcript)", text: liveTranscript });

    const context = body.context?.trim() ?? "";
    if (!context && images.length === 0 && transcripts.length === 0) {
      res.status(400).json({ error: "Give me something to work with: describe the argument, record it, or drop in screenshots/recordings." });
      return;
    }

    const result = await analyzeArgument({
      context,
      partnerLabel: body.partnerLabel === "girlfriend" ? "girlfriend" : "wife",
      language: body.language === "id" ? "id" : "en",
      images,
      transcripts,
    });

    res.json({ ...result, transcripts, warnings });
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: "Server is missing a valid ANTHROPIC_API_KEY." });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Too many arguments at once. Try again in a moment." });
    } else if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: `AI service error (${err.status}). Try again.` });
    } else if (err instanceof Error && err.message.includes("Could not resolve authentication method")) {
      res.status(500).json({ error: "AI is not set up yet: the server has no ANTHROPIC_API_KEY. Add it and restart the app." });
    } else {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: `Upload problem: ${err.message}` });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, () => {
  console.log(`kitalawan running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log("Warning: ANTHROPIC_API_KEY not set - the app will load, but analyses will fail until it is added.");
  }
  if (!transcriptionEnabled()) {
    console.log("Note: TRANSCRIBE_API_KEY not set - uploaded audio files will be skipped (live browser transcription still works).");
  }
});
