"use client";

// Progress animation (BUILD_PLAN.md §6). Sequential labeled "agent" steps shown
// while the real API call runs underneath. Narrative, not literal accuracy.

import { useEffect, useState } from "react";

const STEPS = [
  "Checking if this company is real…",
  "Cross-checking the role and recruiter…",
  "Scanning for known scam patterns…",
  "Reaching a verdict…",
];

const STEP_MS = 1800;

export default function ProgressSteps() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // Advance but hold on the last step until the real call resolves.
      setActive((a) => Math.min(a + 1, STEPS.length - 1));
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full max-w-lg space-y-3">
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-300 ${
              current
                ? "border-blue-500/50 bg-blue-500/10"
                : done
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              {done ? (
                <span className="text-emerald-500">✓</span>
              ) : current ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              )}
            </span>
            <span
              className={`text-sm ${
                current
                  ? "font-medium text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
