# Skeptr

**Know before you reply.**

Skeptr helps job seekers tell real job offers apart from scams. Paste a **job posting URL**, a
**recruiter message / offer**, or **a screenshot of the chat** (e.g. WhatsApp), and Skeptr gathers
web evidence, reasons over it, and returns a trust score with a risk verdict — **every red flag and
positive signal backed by a cited source**.

Built for the Anakin Blitz hackathon on the **Anakin / Wire API** + **DeepSeek** (with local tesseract.js OCR).

## How it works

1. You paste a posting URL / offer text, or upload a **screenshot** — which is OCR'd locally (tesseract.js) into
   text first.
2. A cheap DeepSeek **scope guard** checks the input is actually job-related (off-topic input gets a
   friendly redirect, no API spend) and extracts context (company, role, recruiter, domain).
3. It gathers evidence via Anakin: **Search API** (scam reports, news, reviews), **URL Scraper**
   (the posting + company careers page), and a **Wire pre-built action** (`wh_domain` — domain age,
   a top scam signal).
4. One structured DeepSeek call produces a cited verdict: score, risk level, red flags, positive
   signals, sentiment, and an "engage vs. walk away" recommendation.
5. Known demo inputs and any failure fall back to cached results so the live demo never breaks.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in DEEPSEEK_API_KEY and WIRE_API_KEY
npm run dev                        # http://localhost:3000
```

Required env (see `.env.local.example`):

- `DEEPSEEK_API_KEY` — DeepSeek (LLM orchestrator)
- `WIRE_API_KEY` — Anakin / Wire API (web evidence)

## Try it

Two example chips on the home page load **cached** demos instantly (0 API credits, always work):

- ✅ **Legit offer** — a Shopify recruiter message → high score, cites a real WHOIS Wire-action source.
- 🚩 **Suspicious message** — a classic data-entry scam (upfront fee, ID/bank ask, Gmail/WhatsApp
  recruiter) → **0 / Dangerous**, ~10 sourced red flags, "walk away."

Typing anything else runs the **live** pipeline (real Anakin + DeepSeek, a few credits, ~15s).

## Project structure

```
app/page.tsx                  input UI → progress steps → Verdict Card
app/api/investigate/route.ts  the pipeline endpoint (Wire evidence → DeepSeek → fallback)
lib/wire.ts                   Anakin: search, url-scraper, wire/task actions
lib/orchestrator.ts           DeepSeek: entity extraction + verdict; tesseract.js: screenshot OCR
lib/fallback-cache.ts         demo safety net
data/fallback-results.json    cached real demos
```

## Tech

Single Next.js 16 (App Router) + React 19 app, TypeScript, Tailwind. No database — in-memory,
request-scoped. See [CLAUDE.md](CLAUDE.md) and [BUILD_PLAN.md](BUILD_PLAN.md) for architecture,
conventions, and the build plan.
