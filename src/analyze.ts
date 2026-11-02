import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

export interface EvidenceImage {
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string; // base64
}

export interface AnalyzeInput {
  context: string;
  partnerLabel: "wife" | "girlfriend";
  language: "en" | "id";
  images: EvidenceImage[];
  transcripts: { name: string; text: string }[];
}

export const Analysis = z.object({
  verdict: z.object({
    winner: z.enum(["you", "her", "draw", "unclear"]),
    yourScore: z.number().describe("0-100: how strong the user's position is on the merits"),
    headline: z.string().describe("One punchy line summarising the verdict"),
    reasoning: z.string(),
  }),
  whatTheFightIsReallyAbout: z.string().describe("The underlying issue beneath the surface argument"),
  yourPosition: z.string(),
  herPosition: z.string().describe("Her position, stated fairly and in its strongest form"),
  yourStrongestPoints: z.array(z.object({ point: z.string(), evidence: z.string() })),
  herLikelyComebacks: z.array(z.object({ comeback: z.string(), rebuttal: z.string() })),
  whereYouAreWrong: z.array(z.string()).describe("Points the user should concede; empty if none"),
  landmines: z.array(z.string()).describe("Things the user must NOT say"),
  openingLine: z.string().describe("What to say first when he goes back in"),
  script: z.array(z.string()).describe("3-6 short lines he can actually say, in order"),
  closingMove: z.string().describe("How to end it so both come out ahead"),
});
export type Analysis = z.infer<typeof Analysis>;

const SYSTEM = `You are Kitalawan, a sharp, witty debate coach for husbands and boyfriends who are in an argument with their partner.

The user gives you their side of an argument, plus any evidence: chat screenshots, photos, and transcripts of recorded conversations. Your job is to help him come out of this argument ahead.

How you coach:
- Judge the merits honestly. "Winning" means getting the outcome he actually wants and keeping the relationship strong. If he is wrong, tell him plainly and score him accordingly; a coach who flatters him into a losing fight is useless. Fill whereYouAreWrong whenever there's something to concede, because conceding a small point is often what wins the bigger one.
- Use the evidence. Quote or reference specific messages and lines from screenshots and transcripts. Point out timestamps, contradictions, and what was actually said versus what's being claimed.
- State her position fairly and in its strongest form; he can't rebut what he doesn't understand.
- Give him lines he can really say out loud: calm, specific, non-condescending. No manipulation, gaslighting, guilt-tripping, or mocking her. Those lose arguments and relationships.
- Be funny where it helps, like a good friend at the bar, but keep the advice substantive.
- Transcripts may be machine-generated and speakers may not be labelled; infer who is speaking from context and say so if unsure.
- If the material suggests something more serious than a disagreement (abuse, threats, fear for safety), drop the coaching tone, say so directly, and point toward real help instead.`;

export async function analyzeArgument(input: AnalyzeInput): Promise<Analysis> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];

  input.images.forEach((img, i) => {
    content.push({ type: "text", text: `Evidence image ${i + 1}: ${img.name}` });
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  });

  input.transcripts.forEach((t) => {
    content.push({ type: "text", text: `<transcript source="${t.name}">\n${t.text}\n</transcript>` });
  });

  const langLine =
    input.language === "id"
      ? "Write every field of your answer in casual Bahasa Indonesia."
      : "Write every field of your answer in English.";

  content.push({
    type: "text",
    text: `My partner is my ${input.partnerLabel}.\n\nMy side of the story:\n${input.context || "(no written description - go off the evidence above)"}\n\n${langLine}`,
  });

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Analysis) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to analyse this one. Try rephrasing or removing sensitive material.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("The analysis came back incomplete. Please try again.");
  }
  return response.parsed_output;
}
