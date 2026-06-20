// Orchestrator for Skeptr.
//
//   1. transcribeImage() — OCR a screenshot (e.g. a WhatsApp recruiter chat) into
//      text, locally via tesseract.js (no API key, no vision model needed).
//   2. extractJobEntities() — gate (job-related?) + parse a pasted offer / message into
//      structured hints (company, recruiter, search query) that drive Wire evidence.
//   3. runOrchestrator() — ONE structured-output call over the evidence bundle
//      that returns a cited job-scam verdict.
//
// LLM reasoning (2 + 3) is DeepSeek (OpenAI-compatible chat API). OCR (1) is local
// because DeepSeek's API has no vision input.

import { Jimp } from "jimp";
import { createWorker } from "tesseract.js";
import type { EvidenceBundle, JobHints, Verdict } from "./types";

// deepseek-chat: fast, cheap, strong at structured JSON. Override with LLM_MODEL.
const MODEL = process.env.LLM_MODEL ?? "deepseek-chat";
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const LLM_TIMEOUT_MS = 22000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type ChatMessage = { role: "system" | "user"; content: string };

// POST to DeepSeek's chat/completions with a timeout and one retry-with-backoff
// on 429/503. `json` requests a strict JSON object response. Returns the content.
async function postLLM(
  messages: ChatMessage[],
  maxTokens: number,
  json: boolean,
  timeoutMs = LLM_TIMEOUT_MS,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const body = {
    model: MODEL,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if ((res.status === 429 || res.status === 503) && attempt < maxAttempts) {
        await sleep(1500 * attempt);
        continue;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`DeepSeek ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("DeepSeek returned no content");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("DeepSeek rate limited (429/503) after retries");
}

// ── Core verdict prompt — job-scam-specific reasoning, same JSON schema ───────
const SYSTEM_PROMPT = `You are Skeptr, an evidence-based analyst that helps job seekers tell real job
offers apart from scams. You will receive a bundle of raw evidence about a job posting,
offer, or recruiter message — each piece tagged with its source.

Your job: produce a verdict grounded ONLY in the evidence provided. Do not invent facts.
If evidence is thin or missing for something, say so explicitly rather than guessing.

Reason through these job-scam angles before answering (do not output this reasoning
separately, just let it inform your final JSON):
- Is the company real and verifiable? Established web presence, real careers page, domain
  history — or no verifiable existence / a very recently registered domain?
- Does the role actually exist? Is it listed on the company's official careers page, or
  does the offer appear only in an unsolicited message?
- Recruiter legitimacy: are they on a real company domain, or using a free/personal email
  or off-platform messaging (WhatsApp/Telegram) and pressuring you?
- Classic scam red flags (weight these heavily): asks for upfront payment, fees, "training
  kits" or equipment deposits; asks for banking details / ID / personal data too early;
  pay wildly inconsistent with the work (unrealistic money for trivial tasks); generic
  copy-pasted language; urgency/pressure tactics; grammar or branding inconsistencies vs.
  the real company; the same offer text posted verbatim elsewhere or flagged as a scam.
- Positive signals: verifiable company, role listed on the official careers page, recruiter
  on the company domain, established domain history, real reviews, a normal hiring process.

Return ONLY valid JSON matching this schema, nothing else, no markdown fences:

{
  "trust_score": <integer 0-100>,
  "confidence": "low" | "medium" | "high",
  "risk_level": "Safe" | "Caution" | "High Risk" | "Dangerous",
  "summary": "<1-2 sentence plain-language verdict for the job seeker>",
  "red_flags": [
    { "claim": "<short red flag>", "source": "<source name/url it came from>" }
  ],
  "positive_signals": [
    { "claim": "<short positive signal>", "source": "<source name/url it came from>" }
  ],
  "sentiment_summary": "<1-2 sentences on what reviews/forums/scam reports say, or 'insufficient data' if none found>",
  "recommendation": "<actionable 1-sentence recommendation answering: should I engage with this offer, or walk away?>"
}

EVERY entry in red_flags and positive_signals MUST include the source it came from.
If you cannot attribute a claim to a specific piece of evidence provided, omit it.`;

// ── Extraction prompt — pasted offer/message -> structured hints ──────────────
const EXTRACT_PROMPT = `You are the input gate for Skeptr, a tool that vets JOB OFFERS, JOB POSTINGS, and
RECRUITER MESSAGES for scams. You receive either pasted text or a URL.

First decide whether the input is plausibly job-related: a job posting, a job offer, a recruiter
or hiring message, or a company / employer / careers page someone might be vetting for a job.
Be PERMISSIVE — if it could reasonably be any of those, set is_job_related to true. Set it to false
ONLY when the input is clearly unrelated to jobs/hiring (e.g. a news article, a product listing, a
random blog, a meme, a person's name with no job context, an unrelated company page).

Then extract fields to drive a scam investigation.

Return ONLY valid JSON, no markdown fences:
{
  "is_job_related": <true or false>,
  "company": "<company name, or null>",
  "role": "<job title, or null>",
  "recruiter_name": "<person who sent it, or null>",
  "recruiter_contact": "<email / phone / messaging handle if present, or null>",
  "company_domain": "<best-guess real company domain like acme.com, or null>",
  "search_query": "<a web search query to verify the company and surface any scam reports, e.g. \\"Acme Corp remote data entry job scam legit reviews\\">"
}
If a field is unknown, use null. search_query must never be null — build the best query you can.`;

function llmJSON(systemPrompt: string, userText: string, maxTokens: number): Promise<string> {
  return postLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    maxTokens,
    true,
  );
}

function stripToJson(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  return cleaned;
}

export async function extractJobEntities(input: string): Promise<JobHints> {
  const text = await llmJSON(EXTRACT_PROMPT, input, 512);
  const parsed = JSON.parse(stripToJson(text)) as Partial<JobHints>;
  return {
    // Default to true so a parse hiccup never wrongly blocks a real job check.
    is_job_related: parsed.is_job_related !== false,
    company: parsed.company ?? null,
    role: parsed.role ?? null,
    recruiter_name: parsed.recruiter_name ?? null,
    recruiter_contact: parsed.recruiter_contact ?? null,
    company_domain: parsed.company_domain ?? null,
    search_query: parsed.search_query?.trim() || `${parsed.company ?? input} job scam legit reviews`,
  };
}

// Preprocess a screenshot to help tesseract: grayscale, auto-invert dark-mode
// images (light text on dark bg → dark text on light bg), boost contrast, and
// upscale small images. This dramatically improves OCR on WhatsApp/Telegram chats.
async function preprocessForOcr(buffer: Buffer): Promise<Buffer> {
  try {
    const img = await Jimp.read(buffer);
    const d = img.bitmap.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    const avgBrightness = sum / (d.length / 4);

    img.greyscale();
    if (avgBrightness < 110) img.invert(); // dark mode → make text dark on light
    img.contrast(0.3);
    if (img.bitmap.width < 1000) img.scale(2); // small image → upscale for OCR
    return await img.getBuffer("image/png");
  } catch {
    return buffer; // if preprocessing fails, OCR the original
  }
}

// OCR a screenshot into text locally via tesseract.js (no API / vision model
// needed). Accepts a data URL ("data:image/png;base64,...."). Returns the text.
export async function transcribeImage(dataUrl: string): Promise<string> {
  const m = /^data:(.+?);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("invalid image data URL");
  const prepared = await preprocessForOcr(Buffer.from(m[2], "base64"));

  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(prepared);
    return (data.text ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await worker.terminate();
  }
}

function buildUserMessage(input: string, hints: JobHints, bundle: EvidenceBundle): string {
  const evidence = bundle.map((e, i) => ({
    index: i + 1,
    source: e.source,
    source_type: e.source_type,
    content: e.content,
  }));
  return [
    `Offer / posting / recruiter message under investigation:`,
    input.slice(0, 4000),
    ``,
    `Extracted context: ${JSON.stringify({
      company: hints.company,
      role: hints.role,
      recruiter_name: hints.recruiter_name,
      recruiter_contact: hints.recruiter_contact,
      company_domain: hints.company_domain,
    })}`,
    ``,
    `Evidence bundle (each item is { source, source_type, content }):`,
    JSON.stringify(evidence, null, 2),
  ].join("\n");
}

function parseVerdict(text: string): Verdict {
  const parsed = JSON.parse(stripToJson(text)) as Verdict;
  parsed.trust_score = Math.max(0, Math.min(100, Math.round(parsed.trust_score)));
  parsed.red_flags = (parsed.red_flags ?? []).filter((f) => f && f.source);
  parsed.positive_signals = (parsed.positive_signals ?? []).filter((f) => f && f.source);
  return parsed;
}

export async function runOrchestrator(
  input: string,
  hints: JobHints,
  bundle: EvidenceBundle,
): Promise<Verdict> {
  const text = await llmJSON(SYSTEM_PROMPT, buildUserMessage(input, hints, bundle), 2048);
  return parseVerdict(text);
}
