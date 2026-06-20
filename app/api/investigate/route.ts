// POST /api/investigate — Skeptr.
//
// One input: a job-posting URL OR pasted offer / recruiter message text.
// Flow: a cheap LLM gate derives hints + checks the input is job-related (BEFORE
// any paid Anakin call) -> gather Wire evidence -> one LLM verdict. Off-topic
// input gets a friendly redirect; on any failure/timeout we serve the cached
// fallback silently — the live demo must never surface a raw error or hang.

import { NextResponse } from "next/server";
import { gatherEvidence } from "@/lib/wire";
import { extractJobEntities, runOrchestrator, transcribeImage } from "@/lib/orchestrator";
import {
  getCachedResult,
  getCachedByKey,
  imageCacheKey,
  rememberResult,
  normalizeKey,
  genericFallback,
} from "@/lib/fallback-cache";
import type { InvestigateRequest, JobHints, VerdictResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cap the uploaded screenshot size (base64 data URL length). ~8MB of base64.
const MAX_IMAGE_CHARS = 8_000_000;

// Realistic ceiling: Anakin's async scraper alone takes ~7-10s, plus the verdict
// LLM call. We keep the fallback-on-failure guarantee but size the ceiling so
// live runs complete. The progress animation covers the wait.
const TOTAL_BUDGET_MS = Number(process.env.PIPELINE_BUDGET_MS ?? 35000);

const OFF_TOPIC_MESSAGE =
  "Skeptr checks job offers, postings, and recruiter messages. That doesn't look like one — " +
  "paste a job posting (URL or text), an offer, or a message from a recruiter, and I'll vet it for scams.";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("pipeline timeout")), ms)),
  ]);
}

function isUrl(input: string): boolean {
  return /^https?:\/\/\S+$/i.test(input.trim());
}

function hostnameOf(input: string): string | null {
  try {
    return new URL(input.trim()).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Permissive hints used if the LLM gate itself fails — never wrongly block a real check.
function permissiveHints(input: string): JobHints {
  const host = isUrl(input) ? hostnameOf(input) : null;
  const company = host ? host.split(".").slice(0, -1).join(" ") || host : null;
  return {
    is_job_related: true,
    company,
    role: null,
    recruiter_name: null,
    recruiter_contact: null,
    company_domain: host,
    search_query: company
      ? `${company} jobs careers scam OR legit reviews complaints`
      : `${input.slice(0, 80)} job offer scam OR legit reviews`,
  };
}

// Cheap DeepSeek gate (before any paid Anakin call): classify relevance + extract
// hints for both pasted text and URLs. For URLs, back-fill the domain from the host.
async function deriveHints(input: string): Promise<JobHints> {
  const hints = await extractJobEntities(input);
  if (isUrl(input)) {
    const host = hostnameOf(input);
    if (host) {
      hints.company_domain = hints.company_domain ?? host;
      hints.company = hints.company ?? (host.split(".").slice(0, -1).join(" ") || host);
    }
  }
  return hints;
}

async function runLivePipeline(input: string, hints: JobHints): Promise<VerdictResponse> {
  const bundle = await gatherEvidence(input, hints);
  if (bundle.length === 0) throw new Error("no evidence gathered");
  const verdict = await runOrchestrator(input, hints, bundle);
  return { verdict, served_from: "live", evidence_count: bundle.length };
}

export async function POST(request: Request) {
  let body: InvestigateRequest;
  try {
    body = (await request.json()) as InvestigateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let input = (body?.input ?? "").trim();
  const image = body?.image;

  // 0a. Image already cached (by content hash)? Serve it without OCR or any
  //     API spend — this is what lets a tested screenshot replay at demo time.
  const imgKey = image ? imageCacheKey(image) : null;
  if (imgKey) {
    const cachedImg = getCachedByKey(imgKey);
    if (cachedImg) return NextResponse.json(cachedImg);
  }

  // 0b. If a screenshot was uploaded, OCR it into text first (the pipeline is
  //     text-based downstream). Falls back to any typed text on failure.
  let imageError = false;
  if (image) {
    if (image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: "Image too large (max ~6MB)." }, { status: 413 });
    }
    try {
      const transcript = await transcribeImage(image);
      if (transcript) input = input ? `${input}\n\n${transcript}` : transcript;
    } catch (err) {
      imageError = true;
      console.error("[investigate] image transcription failed:", err);
    }
  }

  if (!input) {
    // The OCR call itself failed (e.g. rate-limited) → tell them to retry.
    if (image && imageError) {
      return NextResponse.json(
        {
          error:
            "Couldn't read that screenshot right now — the service may be busy. Try again in a moment, or paste the message text.",
        },
        { status: 503 },
      );
    }
    // The image was readable but had no usable text → friendly notice.
    if (image) {
      return NextResponse.json({
        off_topic: true,
        message:
          "I couldn't find any text in that screenshot. Try a clearer image, or paste the message text instead.",
      });
    }
    return NextResponse.json(
      {
        error:
          "Provide { input } (a job posting URL or pasted offer/message) or { image } (a screenshot).",
      },
      { status: 400 },
    );
  }

  // 1. Known demo text input → serve pre-baked result immediately and reliably.
  if (!image) {
    const cached = getCachedResult(input);
    if (cached) return NextResponse.json(cached);
  }

  // 2. Scope guard (cheap, no Anakin spend). On gate failure, stay permissive.
  let hints: JobHints;
  try {
    hints = await deriveHints(input);
  } catch (err) {
    console.error("[investigate] gate failed, proceeding permissively:", err);
    hints = permissiveHints(input);
  }
  if (!hints.is_job_related) {
    return NextResponse.json({ off_topic: true, message: OFF_TOPIC_MESSAGE });
  }

  // 3. Live pipeline under the time budget; any failure falls through to cache.
  try {
    const live = await withTimeout(runLivePipeline(input, hints), TOTAL_BUDGET_MS);
    // Remember successful live runs so they replay from cache (test once → demo
    // for free). Images key by content hash; text by its normalized form.
    rememberResult(imgKey ?? normalizeKey(input), live);
    return NextResponse.json(live);
  } catch (err) {
    console.error("[investigate] live pipeline failed, serving fallback:", err);
    return NextResponse.json(genericFallback(input));
  }
}
