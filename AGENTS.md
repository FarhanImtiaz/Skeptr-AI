<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Skeptr — guide for coding agents

**Skeptr — "Know before you reply."** A focused tool for one user (job seekers) with one recurring,
high-stakes pain: vetting suspicious job offers and recruiter messages. Paste a **job-posting URL**,
a **pasted offer / recruiter message**, or **a screenshot** of the chat (WhatsApp, LinkedIn, Telegram, email — OCR'd in your browser via tesseract.js);
Skeptr gathers web evidence via the **Anakin / Wire API**, runs **DeepSeek** reasoning, and
returns a cited trust verdict (score, risk level, red flags, positive signals, recommendation).
**Every red flag and positive signal carries its source.** A cheap scope guard keeps non-job input
out (friendly redirect, no Anakin spend).

This file is shared, tool-agnostic guidance. For the full architecture, pipeline, API reference, and
constraints, see [CLAUDE.md](CLAUDE.md) (it imports this file). The product spec lives in
[BUILD_PLAN.md](BUILD_PLAN.md).

## Stack & run

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind.** Single app, no separate backend.
- No database / auth / persistence — in-memory, request-scoped only.
- `npm install`, then copy `.env.local.example` → `.env.local` and fill `DEEPSEEK_API_KEY` and
  `WIRE_API_KEY`. `npm run dev` → http://localhost:3000.

## Repo map

```
app/page.tsx                 single paste/URL input → progress steps → Verdict Card
app/api/investigate/route.ts POST { input }: scope guard → Wire evidence → DeepSeek verdict → fallback (screenshot OCR runs in the browser)
lib/types.ts                 EvidenceItem, JobHints, Verdict, VerdictResponse | OffTopicResponse
lib/wire.ts                  Anakin wrappers: search, url-scraper (async), wire/task actions
lib/orchestrator.ts          transcribeImage() + extractJobEntities() (gate+hints) + runOrchestrator()
lib/fallback-cache.ts        demo safety net
components/                  ProgressSteps, VerdictCard
data/fallback-results.json   cached real demos (legit / scam)
```

## Non-negotiables

1. **Demo reliability** > breadth > architectural purity. Never let a live failure show a raw error
   or hang — fall back to the cached result.
2. **Source attribution on every red flag / positive signal** is the core differentiator. Never drop
   it under time pressure.
3. Keep it simple and demo-first. No premature abstraction, no persistence layer.

## Gotchas (will bite you)

- **Anakin Wire actions: the parameter wrapper key is `params`, NOT `parameters`.** Wrong key →
  `[scraper_error] 'NoneType' object has no attribute 'get'`. This is a client mistake, not an Anakin
  outage. Failed Wire jobs cost 0 credits.
- **Anakin credits are scarce (~300 total).** Don't burn them on redundant live tests — test against
  the zero-credit cached path; reserve live calls for capturing demo fallbacks and the live demo.
- **DeepSeek** (`deepseek-chat`): use `response_format: { type: "json_object" }` for clean JSON.
  Screenshot OCR runs **in the browser** (tesseract.js + canvas preprocessing) and only the extracted
  text reaches the server — DeepSeek has no vision input, so don't try to send it images.
- Keys live in `.env.local` (gitignored) — never commit them.
