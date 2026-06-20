# Skeptr — Build Plan (Anakin Blitz, 6-hour solo build)

> **Tagline: "Know before you reply."**
> This plan reflects the **current** product. Skeptr began as a generic trust-scorer ("TrustOS"),
> then pivoted to a focused job-scam checker (briefly "JobShield"), now **Skeptr**. The pivot was
> deliberate — see §1. Earlier generic-product history is preserved only in this doc's git history.

## 0. Constraints (read before doing anything)

- **Format:** Anakin Blitz, 6-hour virtual hackathon, built around the **Wire API + Anakin Universal
  Scraper**. LLM provider is **DeepSeek** (`deepseek-chat`); screenshot OCR runs in the browser via tesseract.js.
- **Team:** Solo.
- **Goal:** A working, demoable product by hour 6. Optimize for: **reliability of the live demo >
  breadth of features > architectural purity.**
- **Judging rubric (drives every decision):** 40% Idea (one specific user + one specific pain;
  explicitly penalizes generic "AI for X"), 30% Execution (one polished feature beats five broken
  ones), 30% real-world use case (bonus if you'd actually keep using it).

## 1. Product Summary

**Skeptr** — one user, one recurring high-stakes pain: **job seekers vetting suspicious job offers
and recruiter messages.** Paste a **job-posting URL** or a **pasted offer / recruiter message**, and
Skeptr gathers web evidence (via Wire/Anakin), reasons over it with one LLM call, and returns a
**Trust Score (0–100)**, risk level, confidence, **red flags**, **positive signals**, sentiment, and
a plain-language **"engage vs. walk away"** recommendation — **every claim backed by a cited source**,
not a black-box number.

**Why this focus (vs. the original generic trust-scorer):** fake remote jobs, "task-based" payment
scams, fake recruiters on WhatsApp/Telegram/LinkedIn, offers demanding upfront fees or banking
details, companies that don't exist. The pain is **recurring** (job seekers vet many offers over
weeks) and **high-stakes** (career, money, personal data). That scores far better on all three rubric
axes than a do-everything lookup tool.

**Out of scope (mention only as "what's next"):** websites/products/influencers, browser extension,
authenticated scraping of gated review sites.

## 2. Architecture (fixed)

**Single Next.js app. No separate backend.** One service to run, debug, and deploy — critical for a
solo 6-hour build.

```
/app
  /page.tsx                   single paste/URL input → progress steps → Verdict Card
  /layout.tsx                 metadata (title/description)
  /api/investigate/route.ts   POST { input }: detect URL vs text → hints → Wire evidence → LLM verdict
/lib
  /types.ts                   EvidenceItem, JobHints, Verdict, request/response contracts
  /wire.ts                    Anakin wrappers: search, url-scraper (async), wire/task actions
  /orchestrator.ts            transcribeImage() (OCR) + extractJobEntities() + runOrchestrator() (DeepSeek JSON)
  /fallback-cache.ts          demo safety net (pre-baked + generic fallback)
/components
  /ProgressSteps.tsx          four sequential progress steps during the call
  /VerdictCard.tsx            score + risk badge + sourced (clickable) flags/signals + recommendation
/data/fallback-results.json   real cached demos (legit offer / scam message)
```

No database. No auth. No persistence. In-memory, request-scoped only.

## 3. Pipeline (what happens on submit)

1. `POST /api/investigate { input }`. Screenshots are OCR'd **in the browser** (tesseract.js + canvas
   dark-mode preprocessing) and submitted as text, so the API itself is text-only — and OCR works on Vercel.
2. **Scope guard + hints** (`extractJobEntities()`, one cheap DeepSeek call **before any paid Anakin
   call**): classifies whether the input is plausibly job-related (permissive — off-topic input gets a
   friendly redirect, zero Anakin spend) and extracts company/role/recruiter/domain + a search query.
   For URLs the domain is back-filled from the hostname. On gate failure it fails **open** (proceeds).
3. **Gather evidence** (`gatherEvidence`, partial-failure tolerant — `Promise.allSettled`):
   - `POST /v1/search` — company existence, news, **scam reports** (synchronous, returns citations).
   - `POST /v1/url-scraper` (async submit + poll) — the posting page (URL inputs) and/or the
     company's careers site (to check the role really exists there).
   - `POST /v1/wire/task` `wh_domain` — **domain registration age** via a Wire pre-built action
     (recently-registered domain = strong scam signal). Best-effort (see §7).
4. Every evidence item keeps its **source** → assembled into a flat `EvidenceBundle`.
5. **One** structured DeepSeek call (`runOrchestrator`, the §4 prompt) → clean Verdict JSON.
6. Render as the Verdict Card.
7. **On any failure or >~35s timeout → serve cached fallback silently** (§7). The live demo must
   never show a raw error or an infinite spinner.

Architecture note: this is **not** a multi-agent system. It's one orchestrator that gathers evidence
(several Anakin calls) and makes a single LLM call. The UI progress steps are just sequential status
labels for that one pipeline — be straightforward about this if asked.

## 4. Orchestrator Prompt (core artifact)

System prompt persona: **"You are Skeptr, an evidence-based analyst that helps job seekers tell real
job offers apart from scams."** It reasons over job-scam angles and returns ONLY the Verdict JSON
(no markdown fences), grounded strictly in the provided evidence — if a claim can't be attributed to
a piece of evidence, it's omitted.

Red flags weighted heavily: upfront fees / "training kits" / equipment deposits; early requests for
banking details / ID / personal data; pay wildly inconsistent with the work; free-email or
off-platform recruiters (WhatsApp/Telegram) instead of a company domain; no verifiable company or a
very recently registered domain; role not listed on the official careers page; copy-pasted language;
urgency / pressure tactics; grammar/branding inconsistencies vs. the real company.

Positive signals: verifiable established company, role listed on the official careers page, recruiter
on the company domain, long-established domain, real reviews, a normal hiring process.

**Verdict JSON contract** (unchanged shape, job-seeker framing):

```ts
{
  trust_score: number,                 // 0–100
  confidence: "low" | "medium" | "high",
  risk_level: "Safe" | "Caution" | "High Risk" | "Dangerous",
  summary: string,                     // 1–2 sentence plain-language verdict
  red_flags: { claim: string, source: string }[],
  positive_signals: { claim: string, source: string }[],
  sentiment_summary: string,           // or "insufficient data"
  recommendation: string               // answers: engage with this offer, or walk away?
}
```

**Source attribution on every red flag / positive signal is non-negotiable** — it's the single
biggest differentiator. Never cut it under time pressure.

## 5. Evidence Bundle Shape

```ts
type SourceType =
  | "job_posting" | "company_site" | "search_result"
  | "review_platform" | "social" | "forum";

type EvidenceItem = { source: string; source_type: SourceType; content: string };
type EvidenceBundle = EvidenceItem[];
```

Flat, request-scoped array, built fresh per investigation, passed straight into the prompt. No DB.

## 6. UI Requirements

- **Single input** (textarea): paste a job-posting URL **or** the offer / recruiter message, **or
  upload a screenshot** (WhatsApp, LinkedIn, Telegram, email) — OCR'd in your browser automatically. No entity toggle. Two
  example chips (✅ legit offer / 🚩 suspicious message) load cached demos instantly. Off-topic input
  gets a friendly "outside what Skeptr checks" notice instead of a verdict.
- **Progress animation** (not a blank spinner): "Checking if this company is real…" →
  "Cross-checking the role and recruiter…" → "Scanning for known scam patterns…" → "Reaching a
  verdict…". Narrative, ~1.8s/step.
- **Verdict Card**: large score + color-coded risk badge (Safe=green, Caution=yellow, High Risk=orange,
  Dangerous=red), subtle confidence tag, prominent summary, red-flags and positive-signals lists —
  **each with a clickable source chip** — sentiment paragraph, bolded recommendation.

## 7. Anakin / Wire usage + Demo Safety Net

**Anakin services used** (base `https://api.anakin.io`, header `X-API-Key`):

| Service | Endpoint | Role | Notes |
|---|---|---|---|
| Search API | `POST /v1/search` | scam reports, news, reviews (cited) | synchronous, 100% reliable |
| URL Scraper | `POST /v1/url-scraper` + poll | scrape posting + careers page | async, ~7–10s |
| Wire action | `POST /v1/wire/task` (`wh_domain`) + poll `…/jobs/{id}` | domain age (scam signal) | async ~25–30s; **param key is `params` not `parameters`**; failed jobs cost 0 credits |

Discover Wire actions via `GET /v1/wire/catalog[/{slug}]`.

**Demo safety net:** two real inputs were run through the live pipeline and their exact verdicts saved
to `data/fallback-results.json` (keyed by normalized input). If the input matches a cached key OR the
live call errors/times out, serve the cached result silently. The live demo never shows a raw error.

- ✅ **Legit:** a Shopify recruiter-message → high score, cites WHOIS Wire-action evidence.
- 🚩 **Scam:** a classic data-entry scam (upfront fee, ID/bank ask, Gmail/WhatsApp recruiter) →
  0 / Dangerous, ~10 sourced red flags, "walk away immediately."

## 8. Build Priority Order (cut from the bottom)

1. Working end-to-end: input (URL or text) → Wire evidence → orchestrator → cited verdict. **Must-have.**
2. Source attribution on every flag/signal. **Must-have — core differentiator.**
3. Two contrasting demo examples + fallback cache. **Must-have — demo reliability.**
4. Job-scam-tuned prompt that catches obvious red flags well. **Must-have.**
5. Progress animation + Verdict Card polish (color-coded badge, clickable sources). Do it.
6. Deeper Wire usage (domain-age action wired in and cited). Done.
7. Anything fancier (radar visual, extension mockup). Only if all above are solid.

## 9. Environment / Setup Checklist

- [x] `WIRE_API_KEY` (Anakin) and `DEEPSEEK_API_KEY` in `.env.local` (gitignored, never committed).
- [x] Next.js app initialized and running (`npm run dev` → http://localhost:3000).
- [x] Anakin Search + URL Scraper live-verified; Wire `wh_domain` action live-verified.
- [x] Two demo inputs chosen, run live, and cached in `data/fallback-results.json`.
- [ ] Deploy target ready before hour 5:30; one full dry run incl. the deliberate-failure path.

## 10. Pitch Closing Beats

1. Problem in one sentence: "Job seekers can't tell a real offer from a scam before they reply —
   and replying can cost them money, data, or their job search."
2. Live demo: the legit offer (high score, clean evidence, real company + established domain).
3. Live demo: the scam message (0 / Dangerous, visible red flags each with a source) — the contrast
   is the wow moment.
4. Point out source attribution explicitly — "every flag is backed by where it came from, not a black
   box," including a clickable WHOIS source from a Wire pre-built action.
5. What's next: same pipeline, new evidence sources (Glassdoor-style reviews, company registries,
   job-board cross-checks); a browser extension that vets offers inline.

## 11. Known constraints / gotchas

- **Anakin credits are scarce (~300 total).** Don't burn them on redundant live tests — reserve for
  capturing demo fallbacks and the live demo. Test UI/logic against the zero-credit cached path.
- **Wire action param key is `params`, not `parameters`** — the wrong key yields
  `[scraper_error] 'NoneType' object has no attribute 'get'`. This is a client mistake, not an Anakin
  outage.
- **DeepSeek** (`deepseek-chat`): JSON mode (`response_format: { type: "json_object" }`) keeps output
  clean. Screenshot OCR runs **in the browser** (tesseract.js + canvas preprocessing) — works on Vercel,
  and DeepSeek has no vision input.
