# kitalawan 🥊

Your corner-man for arguments at home. Describe the fight, record it live, or drop in chat screenshots and voice recordings. Kitalawan reviews the evidence and gives you:

- **A verdict**: who actually has the stronger case, scored 0–100. It's honest, so sometimes the answer is "she's right".
- **What the fight is really about**, and both positions (hers in its strongest form)
- **Your strongest points**, each tied to the evidence (screenshots, transcript lines)
- **What she'll say next, and how to answer it**
- **What to concede** and **what not to say**
- **A game plan**: an opening line, a short script, and a way to end it so you both come out ahead

English and Bahasa Indonesia are supported.

## Inputs

| Input | How it's handled |
|---|---|
| Text description | Sent to Claude as-is |
| Images (PNG/JPG/WebP/GIF) | Drag-drop, click, or paste. Sent to Claude's vision input |
| Live recording | Browser mic. The Web Speech API transcribes live (Chrome/Edge/Safari) into an editable box. The audio is also attached if server transcription is on |
| Audio files | Transcribed server-side through any Whisper-compatible endpoint (`TRANSCRIBE_API_KEY`), then sent as text. Claude doesn't accept audio directly |

## Run it

```bash
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
node --env-file=.env --import tsx src/server.ts
# or: export ANTHROPIC_API_KEY=...; npm run dev
```

Open http://localhost:3000. The mic only works on `localhost` or over HTTPS.

## Stack

- `src/server.ts`: Express server, uploads (multer, in memory; nothing is stored)
- `src/analyze.ts`: one Claude call with structured output (zod schema) and refusal fallback
- `src/transcribe.ts`: Whisper-compatible audio transcription
- `public/`: plain HTML/CSS/JS frontend, no build step

## A note on recording

Recording someone without their consent is illegal in many places. The app reminds users of this. Tell her you're recording.
