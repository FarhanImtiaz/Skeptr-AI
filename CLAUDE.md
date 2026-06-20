@AGENTS.md

# CLAUDE.md — Skeptr

> The shared agent primer (product one-liner, stack, repo map, non-negotiables, gotchas) is in
> **[AGENTS.md](AGENTS.md)** (imported above). This file is the deeper working contract: pipeline,
> verdict contract, and the full Anakin API reference. Product spec: **[BUILD_PLAN.md](BUILD_PLAN.md)**.

> **Product (current): Skeptr — "Know before you reply."** Pivoted from a generic trust-scorer
> ("TrustOS", briefly "JobShield") to a focused **job-scam checker** for job seekers. The chat pivot
> brief is authoritative for product scope/input/prompt/copy; BUILD_PLAN.md governs architecture,
> pipeline shape, build priorities, and demo-safety discipline.
>
> Stack note: **Next.js 16 + React 19** — newer than older training data. Check
> `node_modules/next/dist/docs/` before writing framework code (see AGENTS.md).

## What it does

A job seeker pastes a **job-posting URL**, an **offer / recruiter message**, or **a screenshot** of
the chat (OCR'd locally via tesseract.js). Skeptr gathers web evidence via the **Anakin / Wire API**, runs
one evidence-grounded **DeepSeek** pass, and returns a **Trust Score (0–100)**, risk level, confidence,
red flags, positive signals, sentiment, and an **"engage vs. walk away"** recommendation. **Every
flag/signal is backed by a cited source** — the core differentiator, never cut it. One input mode, no
entity toggle. A cheap **scope guard** keeps non-job input out (friendly redirect, no Anakin spend).

## Architecture (single Next.js app, no separate backend)

```
app/page.tsx                  single paste/URL input → progress steps → Verdict Card
app/layout.tsx                metadata (title/description)
app/api/investigate/route.ts  POST { input }: URL-vs-text → hints → Wire evidence → DeepSeek verdict → fallback
lib/types.ts                  EvidenceItem, JobHints, Verdict, request/response contracts
lib/wire.ts                   Anakin wrappers: search, url-scraper (async), wire/task actions
lib/orchestrator.ts           transcribeImage() (local tesseract.js OCR) + extractJobEntities() (gate+hints) + runOrchestrator()
lib/fallback-cache.ts         demo safety net (pre-baked + generic fallback)
components/ProgressSteps.tsx, components/VerdictCard.tsx
data/fallback-results.json    two real cached demos (legit offer / scam message)
```

No database, no auth, no persistence. Request-scoped only.

## Pipeline

1. `POST /api/investigate { input?, image? }`. If `image` (a screenshot data URL) is sent,
   `transcribeImage()` (local tesseract.js OCR, with jimp dark-mode preprocessing) reads it to text first.
2. **Scope guard + hints** via `extractJobEntities()` (one cheap DeepSeek call before any paid Anakin
   call): is it job-related? (permissive; off-topic → `{ off_topic, message }`, zero Anakin spend) +
   extract company/role/recruiter/domain. URL domain back-filled from hostname. Fails **open**.
3. `gatherEvidence` (partial-failure tolerant via `Promise.allSettled`):
   - `POST /v1/search` — company existence, news, scam reports (synchronous, cited).
   - `POST /v1/url-scraper` (async submit + poll) — the posting page and/or the company careers site.
   - `POST /v1/wire/task` `wh_domain` — **domain registration age** (Wire pre-built action; recently
     registered = scam signal). Best-effort: it's slow (~25–30s) so live runs may time out, but the
     evidence is captured in cached demos.
4. One `runOrchestrator` DeepSeek call over the bundle → cited Verdict JSON.
5. Render as the Verdict Card (clickable source chips).
6. **On any failure / timeout (live budget ~35s) → serve cached fallback silently.** Never show a raw
   error or infinite spinner during a demo.

## Verdict JSON contract

```ts
{ trust_score: 0-100, confidence: "low"|"medium"|"high",
  risk_level: "Safe"|"Caution"|"High Risk"|"Dangerous",
  summary: string,
  red_flags: { claim, source }[], positive_signals: { claim, source }[],
  sentiment_summary: string,
  recommendation: string /* engage vs. walk away */ }
```

Red flags weighted heavily: upfront fees / "training kits", early requests for banking/ID, pay
inconsistent with work, free-email/off-platform recruiters (WhatsApp/Telegram), no verifiable company
or recently-registered domain, role not on the official careers page, copy-paste language,
urgency/pressure.

## Anakin / Wire API (live-verified)

- Base `https://api.anakin.io`, auth header **`X-API-Key`**.
- `POST /v1/search {prompt,limit}` → `{results:[{url,title,snippet,date}]}` (sync, has citations).
- `POST /v1/url-scraper {url,useBrowser,country}` → `202 {jobId}`; poll `GET /v1/url-scraper/{jobId}`
  until `status:"completed"` → `{markdown,html,generatedJson}` (~7–10s).
- Wire pre-built actions: `POST /v1/wire/task {action_id, params}` → `{job_id}`; poll
  `GET /v1/wire/jobs/{job_id}` → `{data:{status,data:{...},meta}}` (unwrap to inner `.data.data`).
  Discover via `GET /v1/wire/catalog[/{slug}]`. **Failed jobs cost 0 credits.**
  **GOTCHA:** the param wrapper key MUST be **`params`**, NOT `parameters` — wrong key →
  `[scraper_error] 'NoneType' object has no attribute 'get'`. NOT an Anakin outage. We use
  `wh_domain` (domain age). See memory `wire-params-key-gotcha`.

## Constraints

- **Anakin credits are scarce (~300 total).** Reserve live calls for demo fallbacks + the live demo;
  test everything else on the zero-credit cached path. See memory `conserve-anakin-credits`.
- LLM = **DeepSeek** (`deepseek-chat`, `DEEPSEEK_API_KEY`); JSON mode (`response_format`) for clean output. Screenshot OCR is **local** via tesseract.js (+ jimp dark-mode preprocessing) — no vision API.
- Keys in `.env.local` (gitignored, never committed).
