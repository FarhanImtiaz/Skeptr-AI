// Demo safety net (BUILD_PLAN.md §7).
//
// If the input matches a pre-baked key, OR the live pipeline errors/times out,
// serve a cached known-good result silently. The live demo must never show a
// raw error or an infinite spinner.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import fallbackData from "@/data/fallback-results.json";
import type { VerdictResponse } from "./types";

const FALLBACK_PATH = path.join(process.cwd(), "data", "fallback-results.json");
const COMMENT = (fallbackData as Record<string, unknown>)._comment;

// Mutable in-memory cache, seeded from disk. Runtime additions (successful live
// runs) land here so they're served on subsequent requests this session, and
// are also persisted to disk so they survive a restart. This is what lets you
// test an input/image once live and then demo it from cache (no API usage).
const cache: Record<string, VerdictResponse> = {};
for (const [k, v] of Object.entries(fallbackData as Record<string, unknown>)) {
  if (k !== "_comment" && v && typeof v === "object" && "verdict" in (v as object)) {
    cache[k] = v as VerdictResponse;
  }
}

// Normalize a text input into a cache key: lowercase, trim, strip protocol and
// trailing slash. Keep in sync with the keys in data/fallback-results.json.
export function normalizeKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

// Stable key for an uploaded image: a hash of its bytes, so the same screenshot
// always maps to the same cache entry regardless of OCR variation.
export function imageCacheKey(dataUrl: string): string {
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  return "img:" + createHash("sha256").update(base64).digest("hex").slice(0, 24);
}

export function getCachedByKey(key: string): VerdictResponse | null {
  const hit = cache[key];
  return hit && hit.verdict ? { ...hit, served_from: "fallback" } : null;
}

// Exact pre-baked result for a known text demo input, if present.
export function getCachedResult(input: string): VerdictResponse | null {
  return getCachedByKey(normalizeKey(input));
}

// Persist a successful LIVE result so it replays from cache next time.
export function rememberResult(key: string, res: VerdictResponse): void {
  cache[key] = { ...res, served_from: "fallback" };
  try {
    writeFileSync(FALLBACK_PATH, JSON.stringify({ _comment: COMMENT, ...cache }, null, 2) + "\n");
  } catch (err) {
    console.error("[cache] failed to persist:", err);
  }
}

// Last-resort generic result so an unknown input never crashes the demo.
// Conservative "Caution" verdict, clearly labelled as low confidence.
export function genericFallback(input: string): VerdictResponse {
  return {
    served_from: "fallback",
    evidence_count: 0,
    verdict: {
      trust_score: 50,
      confidence: "low",
      risk_level: "Caution",
      summary: `We couldn't gather enough live evidence about this offer to give a confident verdict.`,
      red_flags: [],
      positive_signals: [],
      sentiment_summary: "insufficient data",
      recommendation:
        "Verify the company and recruiter independently — and never pay fees or share banking details — before responding.",
    },
  };
}
