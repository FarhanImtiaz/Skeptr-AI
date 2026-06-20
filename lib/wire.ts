// Wire / Anakin Universal Scraper wrapper for Skeptr.
//
// Real API reference (anakin.io):
//   Base:   https://api.anakin.io
//   Auth:   header  X-API-Key: <key>
//   Search: POST /v1/search        { prompt, limit }  -> 200 { id, results:[{url,title,snippet,date}] }  (sync)
//   Scrape: POST /v1/url-scraper    { url, useBrowser, country }  -> 202 { jobId, status }
//           GET  /v1/url-scraper/{jobId}  -> poll until status "completed" -> { markdown, html, generatedJson }
//   Wire actions (pre-built per-site extractors):
//           POST /v1/wire/task      { action_id, params }  -> { status, job_id, poll_url }
//             ^ wrapper key MUST be `params` (not `parameters`) or the executor fails NoneType.
//           GET  /v1/wire/jobs/{job_id}  -> poll until completed -> { data:{ status, data:{...}, meta } }
//             (failed jobs cost 0 credits; actions can take ~25-30s)
//
// All Anakin-specific mapping lives ONLY in this file. Each function returns
// EvidenceItem[] with source attribution preserved.

import type { EvidenceBundle, EvidenceItem, JobHints, SourceType } from "./types";

const WIRE_BASE_URL = process.env.WIRE_BASE_URL ?? "https://api.anakin.io";
const WIRE_API_KEY = process.env.WIRE_API_KEY ?? "";

const SEARCH_TIMEOUT_MS = 8000;
const SCRAPE_TOTAL_MS = 12000;
const POLL_INTERVAL_MS = 1000;
const WIRE_ACTION_TOTAL_MS = 12000; // bounded; wh_domain can take ~25-30s, so live runs may time out (best-effort)
const MAX_SCRAPE_CHARS = 6000;

class WireError extends Error {}

const AUTH_HEADERS = { "X-API-Key": WIRE_API_KEY, "Content-Type": "application/json" };

function ensureKey() {
  if (!WIRE_API_KEY) throw new WireError("WIRE_API_KEY not configured");
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Search: synchronous reputation / scam-report signals ─────────────────────
type SearchResult = { url?: string; title?: string; snippet?: string; date?: string };

export async function wireSearch(query: string, limit = 5): Promise<EvidenceItem[]> {
  ensureKey();
  const res = await fetchWithTimeout(
    `${WIRE_BASE_URL}/v1/search`,
    { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify({ prompt: query, limit }) },
    SEARCH_TIMEOUT_MS,
  );
  if (!res.ok) throw new WireError(`Wire search returned ${res.status}`);

  const data = (await res.json()) as { results?: SearchResult[] };
  const results = Array.isArray(data?.results) ? data.results : [];

  return results
    .map((r): EvidenceItem | null => {
      const source = r.url ?? r.title ?? "search_result";
      const content = [r.title, r.snippet].filter(Boolean).join(" — ").trim();
      if (!content) return null;
      return { source, source_type: classifySource(source), content };
    })
    .filter((x): x is EvidenceItem => x !== null);
}

// ── Scrape: async job (submit + poll) for a posting page / company site ──────
export async function wireScrape(
  url: string,
  sourceType: SourceType,
  useBrowser = false,
): Promise<EvidenceItem> {
  ensureKey();
  const deadline = Date.now() + SCRAPE_TOTAL_MS;

  const submit = await fetchWithTimeout(
    `${WIRE_BASE_URL}/v1/url-scraper`,
    { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify({ url, useBrowser, country: "us" }) },
    SEARCH_TIMEOUT_MS,
  );
  if (!submit.ok && submit.status !== 202) {
    throw new WireError(`Wire scrape submit returned ${submit.status}`);
  }
  const submitData = (await submit.json()) as { jobId?: string; status?: string; markdown?: string };
  if (submitData.status === "completed" && submitData.markdown) {
    return toScrapeItem(url, sourceType, submitData);
  }
  const jobId = submitData.jobId;
  if (!jobId) throw new WireError("Wire scrape returned no jobId");

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const poll = await fetchWithTimeout(
      `${WIRE_BASE_URL}/v1/url-scraper/${jobId}`,
      { method: "GET", headers: AUTH_HEADERS },
      Math.min(SEARCH_TIMEOUT_MS, remaining),
    );
    const pollData = (await poll.json()) as {
      status?: string;
      markdown?: string;
      html?: string;
      generatedJson?: unknown;
    };
    if (pollData.status === "completed") return toScrapeItem(url, sourceType, pollData);
    if (pollData.status === "failed") throw new WireError("Wire scrape job failed");
  }
  throw new WireError("Wire scrape timed out");
}

function toScrapeItem(
  url: string,
  sourceType: SourceType,
  data: { markdown?: string; html?: string; generatedJson?: unknown },
): EvidenceItem {
  let content = (data.markdown ?? "").trim();
  if (!content && data.generatedJson) content = JSON.stringify(data.generatedJson).slice(0, MAX_SCRAPE_CHARS);
  if (!content && data.html) content = stripHtml(data.html);
  return {
    source: url,
    source_type: sourceType,
    content: content.slice(0, MAX_SCRAPE_CHARS) || "(no extractable content)",
  };
}

// ── Wire pre-built action (async task + poll) ────────────────────────────────
// CRITICAL: the parameter wrapper key is `params` (NOT `parameters`) — sending
// the wrong key makes Anakin's executor call `.get()` on a None dict and fail
// with "[scraper_error] 'NoneType' object has no attribute 'get'".
//
// Completed poll shape: { status:"completed", data:{ status:"ok",
//   data:{...actual result...}, error, meta } } — we unwrap to the inner result.
//
// Best-effort: callers tolerate failure/timeout. Actions can be slow (~25-30s),
// so the cap is kept modest; live runs may time out while cached demos capture
// the evidence offline.
export async function wireAction(
  actionId: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  ensureKey();
  const deadline = Date.now() + WIRE_ACTION_TOTAL_MS;
  const submit = await fetchWithTimeout(
    `${WIRE_BASE_URL}/v1/wire/task`,
    { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify({ action_id: actionId, params }) },
    SEARCH_TIMEOUT_MS,
  );
  const submitData = (await submit.json()) as { job_id?: string; jobId?: string; status?: string };
  const jobId = submitData.job_id ?? submitData.jobId;
  if (!jobId) throw new WireError("Wire action returned no job_id");

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const poll = await fetchWithTimeout(
      `${WIRE_BASE_URL}/v1/wire/jobs/${jobId}`,
      { method: "GET", headers: AUTH_HEADERS },
      Math.min(SEARCH_TIMEOUT_MS, remaining),
    );
    const data = (await poll.json()) as { status?: string; result?: unknown; data?: unknown };
    if (data.status === "completed") return unwrapActionResult(data.result ?? data.data ?? data);
    if (data.status === "failed") throw new WireError("Wire action job failed");
  }
  throw new WireError("Wire action timed out");
}

// Unwrap the v1 action envelope { status, data, error, meta } to its inner result.
function unwrapActionResult(envelope: unknown): unknown {
  if (envelope && typeof envelope === "object") {
    const env = envelope as Record<string, unknown>;
    if (env.error) throw new WireError(`Wire action error: ${String(env.error)}`);
    if ("data" in env) return env.data;
  }
  return envelope;
}

// Reddit scam-report search via the Wire pre-built action (rt_search).
// Domain registration intel via the Wire pre-built action (wh_domain / rdap.org).
// A very recently registered domain is one of the strongest job-scam signals
// (already weighted in the orchestrator prompt). Best-effort: callers tolerate
// failure/timeout (the action can take ~25-30s).
async function wireDomainIntel(domain: string): Promise<EvidenceItem> {
  const v = ((await wireAction("wh_domain", { domain })) ?? {}) as Record<string, unknown>;
  const registered = String(v.registered ?? v.creation_date ?? v.created ?? "");
  const registrar = String(v.registrar ?? "");
  const expires = String(v.expires ?? v.expiration_date ?? "");

  let ageNote = "";
  const ts = registered ? Date.parse(registered) : NaN;
  if (!Number.isNaN(ts)) {
    const days = Math.floor((Date.now() - ts) / 86_400_000);
    if (days < 180) {
      ageNote = ` The domain is only ~${days} days old — recently registered domains are a strong scam indicator.`;
    } else {
      const years = Math.floor(days / 365);
      ageNote = ` The domain is ~${years} year(s) old, indicating an established web presence.`;
    }
  }
  const content =
    `WHOIS for ${domain}: registered ${registered || "unknown"}` +
    (registrar ? `, registrar ${registrar}` : "") +
    (expires ? `, expires ${expires}` : "") +
    `.${ageNote}`;
  // Human-readable, reachable WHOIS page so the cited source is verifiable.
  return { source: `www.whois.com/whois/${domain}`, source_type: "search_result", content };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function classifySource(source: string): SourceType {
  const s = source.toLowerCase();
  if (/(glassdoor|trustpilot|sitejabber|indeed|comparably|kununu)/.test(s)) return "review_platform";
  if (/(reddit|quora|forum|community|stackexchange|scamadviser|scam-detector|bbb\.org)/.test(s)) return "forum";
  if (/(twitter|x\.com|instagram|tiktok|youtube|facebook|linkedin)/.test(s)) return "social";
  return "search_result";
}

// ── Orchestration: build the full evidence bundle for one investigation ──────
// Handles both a job-posting URL and pasted offer/recruiter text. Partial
// failures are tolerated — we return whatever we gathered.
export async function gatherEvidence(input: string, hints: JobHints): Promise<EvidenceBundle> {
  const bundle: EvidenceBundle = [];
  const trimmed = input.trim();
  const isUrl = /^https?:\/\/\S+$/i.test(trimmed);

  // The offer / recruiter message itself is primary, citable evidence. Including
  // it means the analyst can flag content-level signals (fees, off-platform
  // contact, urgency, a normal process) even when the company is unknown and web
  // evidence is thin — and the bundle is never empty for pasted text/screenshots.
  if (!isUrl && trimmed) {
    bundle.push({
      source: "The message you provided",
      source_type: "job_posting",
      content: trimmed.slice(0, 4000),
    });
  }

  const scamQuery =
    hints.search_query ||
    `${hints.company ?? trimmed} job offer scam OR legit reviews complaints`;

  const tasks: Promise<EvidenceItem | EvidenceItem[]>[] = [
    // General web search: company existence, news, scam reports.
    wireSearch(scamQuery),
  ];

  // Domain registration intel via Wire pre-built action (best-effort).
  const intelDomain =
    hints.company_domain ?? (isUrl ? hostOf(trimmed) : null);
  if (intelDomain) tasks.push(wireDomainIntel(intelDomain));

  // Scrape the posting itself when the input is a URL.
  if (isUrl) tasks.push(wireScrape(trimmed, "job_posting"));

  // Scrape the company's real site / careers page to verify the role exists.
  const careersUrl = companyCareersUrl(hints.company_domain);
  if (careersUrl && careersUrl !== trimmed) tasks.push(wireScrape(careersUrl, "company_site"));

  const settled = await Promise.allSettled(tasks);
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if (Array.isArray(r.value)) bundle.push(...r.value);
      else bundle.push(r.value);
    } else {
      console.error("[wire] evidence source failed:", r.reason?.message ?? r.reason);
    }
  }
  return bundle;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function companyCareersUrl(domain: string | null): string | null {
  if (!domain) return null;
  const clean = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  if (!/\.[a-z]{2,}$/.test(clean)) return null;
  return `https://${clean}`;
}

export { WireError };
