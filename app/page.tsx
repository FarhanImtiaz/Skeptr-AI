// Skeptr landing page (/). Server component — static marketing page with a
// primary CTA that routes to the tool at /check.

import Link from "next/link";
import Logo from "@/components/Logo";

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-20 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-black/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-6">
            <a
              href="#how"
              className="hidden text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:block"
            >
              How it works
            </a>
            <Link
              href="/check"
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
            >
              Check an offer
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-10rem] h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Evidence-backed · every verdict cited
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Know before
              <br />
              you <span className="text-blue-500">reply.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
              Fake recruiters, upfront-fee scams, offers that harvest your bank details. Paste a job
              posting, a recruiter message, or even a screenshot of the chat — Skeptr tells you if
              it&apos;s real, with the receipts.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/check"
                className="rounded-xl bg-blue-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-colors hover:bg-blue-600"
              >
                Check a job offer →
              </Link>
              <a
                href="#how"
                className="rounded-xl border border-zinc-300 px-7 py-3.5 text-base font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs text-zinc-400">Free · No signup · URL, pasted text, or a screenshot</p>
          </div>

          {/* Verdict preview card */}
          <VerdictPreview />
        </div>
      </section>

      {/* ── Problem ─────────────────────────────────────────────────────── */}
      <section className="border-y border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Job hunting is stressful enough without the scams.
          </h2>
          <p className="mt-4 max-w-2xl text-zinc-600 dark:text-zinc-400">
            Scammers impersonate real companies, move you to WhatsApp or Telegram, and dangle
            too-good-to-be-true pay — then ask for fees, ID, or bank details. You often can&apos;t tell
            until it&apos;s too late.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="text-2xl">{p.icon}</div>
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How Skeptr works</h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-600 dark:text-zinc-400">
            Four specialized steps run in seconds — gathering real evidence from the web, not guessing.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="text-sm font-bold text-blue-500">0{i + 1}</span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Not a black-box score</h2>
          <p className="mt-4 max-w-2xl text-zinc-600 dark:text-zinc-400">
            Every red flag and positive signal links to the source it came from — so you can verify it
            yourself, not just trust a number.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
                <div className="text-xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-500 px-8 py-16 text-center text-white shadow-xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Got an offer you&apos;re not sure about?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-blue-50">
            Check it in seconds before you reply, click a link, or send a single detail.
          </p>
          <Link
            href="/check"
            className="mt-8 inline-block rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-blue-600 shadow-lg transition-transform hover:scale-[1.02]"
          >
            Check a job offer →
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size="text-base" />
            <span className="text-zinc-400">— Know before you reply.</span>
          </div>
          <p className="text-xs text-zinc-400">
            Built on the Anakin / Wire API + DeepSeek · Anakin Blitz
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ── Static content ────────────────────────────────────────────────────── */

const PROBLEMS = [
  {
    icon: "🎭",
    title: "Fake recruiters",
    body: "Messages that impersonate real companies, then move you to WhatsApp or Telegram.",
  },
  {
    icon: "💸",
    title: "Upfront-fee scams",
    body: "“Training kits”, equipment deposits, or onboarding fees you’ll never get back.",
  },
  {
    icon: "🪪",
    title: "Data harvesting",
    body: "Requests for your ID, SSN, or bank details long before any real hiring step.",
  },
];

const STEPS = [
  { title: "Paste or upload", body: "A job-posting URL, the recruiter’s message, or a screenshot of the chat." },
  { title: "Gather evidence", body: "We search the web, scrape the posting, and check the company’s real domain." },
  { title: "Scan for red flags", body: "Known scam patterns, fee requests, fake recruiters, mismatched claims." },
  { title: "Get a cited verdict", body: "A trust score and clear recommendation — every flag links to its source." },
];

const FEATURES = [
  { icon: "🔗", title: "Cited sources", body: "Every red flag and positive signal carries a clickable source you can verify." },
  { icon: "🌐", title: "Real web evidence", body: "Live search, page scraping, and domain-age checks — not just a language model’s guess." },
  { icon: "⚡", title: "Seconds, not hours", body: "What would take you 20 minutes of digging, done while you read the result." },
  { icon: "🚩", title: "Catches the classics", body: "Upfront fees, off-platform recruiters, unrealistic pay, unverifiable companies." },
  { icon: "📸", title: "Paste, link, or screenshot", body: "A posting URL, a copy-pasted message, or a screenshot of a WhatsApp/Telegram chat — read on-device with OCR, no third-party vision service." },
  { icon: "🧭", title: "Clear next step", body: "Not just a number — a plain “engage or walk away” recommendation." },
];

/* A static mini verdict preview for the hero. */
function VerdictPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-red-500">12</span>
            <span className="text-xs uppercase tracking-wide text-zinc-400">/ 100 trust</span>
          </div>
          <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
            Dangerous
          </span>
        </div>
        <p className="mt-4 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          Multiple classic scam signals — upfront fee, bank details requested early, off-platform
          recruiter. Walk away.
        </p>
        <div className="mt-4 space-y-2">
          {[
            { c: "Asks for a $150 “training kit” upfront", s: "reddit.com/r/Scams" },
            { c: "Requests ID + bank details to “enroll”", s: "linkedin.com/advice" },
            { c: "Recruiter uses Gmail + WhatsApp, not a company domain", s: "ftc.gov" },
          ].map((f) => (
            <div
              key={f.c}
              className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span>🚩</span>
              <span className="flex-1 text-zinc-700 dark:text-zinc-300">{f.c}</span>
              <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400">
                {f.s}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
