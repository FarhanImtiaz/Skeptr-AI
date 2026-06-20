"use client";

// Verdict Card (BUILD_PLAN.md §6). Large score + color-coded risk badge,
// confidence tag, prominent summary, red flags / positive signals each WITH a
// visible source chip (the core differentiator — §4), sentiment, recommendation.

import type { Citation, RiskLevel, Verdict } from "@/lib/types";

const RISK_STYLES: Record<RiskLevel, { badge: string; ring: string; text: string }> = {
  Safe: {
    badge: "bg-emerald-500 text-white",
    ring: "text-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  Caution: {
    badge: "bg-yellow-400 text-black",
    ring: "text-yellow-500",
    text: "text-yellow-600 dark:text-yellow-400",
  },
  "High Risk": {
    badge: "bg-orange-500 text-white",
    ring: "text-orange-500",
    text: "text-orange-600 dark:text-orange-400",
  },
  Dangerous: {
    badge: "bg-red-600 text-white",
    ring: "text-red-500",
    text: "text-red-600 dark:text-red-400",
  },
};

// Resolve a source string to a visitable href, or null if it isn't a link.
function sourceHref(source: string): string | null {
  const s = source.trim();
  if (/^https?:\/\//i.test(s)) return s;
  // Bare domain (no spaces, has a dot + TLD) → assume https.
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return `https://${s}`;
  return null;
}

function SourceChip({ source }: { source: string }) {
  const href = sourceHref(source);
  const label = source.length > 42 ? source.slice(0, 42) + "…" : source;
  const base =
    "ml-2 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={source}
        className={`${base} border-blue-300 bg-blue-50 text-blue-600 underline-offset-2 transition-colors hover:bg-blue-100 hover:underline dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/40`}
      >
        <span className="opacity-60">↳</span>
        {label}
        <span aria-hidden className="opacity-60">↗</span>
      </a>
    );
  }

  return (
    <span
      title={source}
      className={`${base} border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400`}
    >
      <span className="text-zinc-400">↳</span>
      {`source: ${label}`}
    </span>
  );
}

function CitationRow({ item, tone }: { item: Citation; tone: "flag" | "signal" }) {
  return (
    <li className="flex flex-wrap items-start gap-y-1 rounded-md border border-zinc-100 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span className="mr-1 mt-0.5 shrink-0">{tone === "flag" ? "🚩" : "✅"}</span>
      <span className="flex-1 text-zinc-800 dark:text-zinc-200">{item.claim}</span>
      <SourceChip source={item.source} />
    </li>
  );
}

export default function VerdictCard({
  verdict,
  servedFrom,
}: {
  verdict: Verdict;
  servedFrom?: "live" | "fallback";
}) {
  const risk = RISK_STYLES[verdict.risk_level] ?? RISK_STYLES.Caution;

  return (
    <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
      {/* Score + risk header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className={`text-6xl font-bold tracking-tight ${risk.text}`}>
            {verdict.trust_score}
          </span>
          <div className="flex flex-col">
            <span className="text-sm text-zinc-400">/ 100</span>
            <span className="text-xs uppercase tracking-wide text-zinc-400">
              Trust Score
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${risk.badge}`}>
            {verdict.risk_level}
          </span>
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
            {verdict.confidence} confidence
          </span>
        </div>
      </div>

      {/* Summary — the "would I trust this" answer */}
      <p className="text-lg font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">
        {verdict.summary}
      </p>

      {/* Red flags */}
      {verdict.red_flags.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-red-500">
            Red Flags
          </h3>
          <ul className="space-y-2">
            {verdict.red_flags.map((f, i) => (
              <CitationRow key={i} item={f} tone="flag" />
            ))}
          </ul>
        </section>
      )}

      {/* Positive signals */}
      {verdict.positive_signals.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
            Positive Signals
          </h3>
          <ul className="space-y-2">
            {verdict.positive_signals.map((s, i) => (
              <CitationRow key={i} item={s} tone="signal" />
            ))}
          </ul>
        </section>
      )}

      {/* Sentiment */}
      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Community Sentiment
        </h3>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {verdict.sentiment_summary}
        </p>
      </section>

      {/* Recommendation */}
      <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">
          {verdict.recommendation}
        </p>
      </div>

      {servedFrom === "fallback" && (
        <p className="text-right text-[11px] text-zinc-400">cached result</p>
      )}
    </div>
  );
}
