"use client";

// Skeptr tool — /check. One input (paste a posting/URL or recruiter message) →
// progress steps while the real Wire + LLM calls run → cited Verdict Card.

import Link from "next/link";
import { useRef, useState } from "react";
import Logo from "@/components/Logo";
import ProgressSteps from "@/components/ProgressSteps";
import VerdictCard from "@/components/VerdictCard";
import type { InvestigateResponse } from "@/lib/types";

// The two demo inputs — kept in sync with data/fallback-results.json keys so the
// example buttons always resolve (live, or cached fallback) during a demo.
const EXAMPLES: { label: string; value: string }[] = [
  {
    label: "✅ Legit offer",
    value:
      "Hi, I'm a recruiter at Shopify. We're hiring a Senior Backend Developer (remote, full-time). The role is posted on our official careers site at https://www.shopify.com/careers and all interviews go through our standard process — we never charge any fees. Reply here or apply online if you're interested.",
  },
  {
    label: "🚩 Suspicious message",
    value:
      "CONGRATULATIONS! You've been shortlisted for a Remote Data Entry position ($35/hour, only 2 hrs/day). No interview needed! To get started, purchase your onboarding training kit ($150) via the link below, and send a photo of your ID and your bank account details to confirm enrollment. Message HR manager Linda on WhatsApp +1 (332) 555-0188 or recruiter.linda88@gmail.com to begin TODAY. Limited slots remaining!",
  },
];

type View = "idle" | "loading" | "result";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6MB

// OCR a screenshot in the BROWSER (works anywhere, incl. Vercel — no serverless
// worker/filesystem limits). Preprocess on a canvas (grayscale, auto-invert dark
// mode, contrast, upscale) then run tesseract.js, loaded on demand.
async function ocrInBrowser(dataUrl: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const scale = img.naturalWidth < 1000 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth * scale;
  canvas.height = img.naturalHeight * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const pix = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pix.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
  const dark = sum / (d.length / 4) < 110;
  for (let i = 0; i < d.length; i += 4) {
    let g = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (dark) g = 255 - g; // dark mode → dark text on light bg
    g = Math.min(255, Math.max(0, (g - 128) * 1.3 + 128)); // contrast
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(pix, 0, 0);

  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(canvas, "eng");
  return (data.text ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export default function CheckPage() {
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null); // data URL
  const [imageName, setImageName] = useState<string | null>(null);
  const [view, setView] = useState<View>("idle");
  const [result, setResult] = useState<InvestigateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit = input.trim().length > 0 || image !== null;

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 6MB — please use a smaller screenshot.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setImageName(file.name);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImage(null);
    setImageName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function investigate() {
    if (!canSubmit || view === "loading") return;
    setView("loading");
    setError(null);
    setResult(null);

    const started = Date.now();
    try {
      // OCR screenshots in the browser, then send plain text to the server.
      let text = input.trim();
      if (image) {
        const transcript = await ocrInBrowser(image);
        if (!transcript && !text) {
          setError(
            "Couldn't read any text from that screenshot. Try a clearer image, or paste the message text.",
          );
          setView("idle");
          return;
        }
        text = text ? `${text}\n\n${transcript}` : transcript;
      }

      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      const data = (await res.json()) as InvestigateResponse | { error?: string };
      const elapsed = Date.now() - started;
      if (elapsed < 2400) await new Promise((r) => setTimeout(r, 2400 - elapsed));

      // Only a verdict or an off-topic notice are renderable results; anything
      // else (an error payload, a bad status) becomes a friendly error message.
      if (!res.ok || !("verdict" in data || "off_topic" in data)) {
        const msg = ("error" in data && data.error) || "Something went wrong. Please try again.";
        setError(msg);
        setView("idle");
        return;
      }
      setResult(data as InvestigateResponse);
      setView("result");
    } catch {
      setError("Something went wrong. Please try again.");
      setView("idle");
    }
  }

  function reset() {
    setView("idle");
    setResult(null);
    setInput("");
    clearImage();
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-black dark:to-zinc-950">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Home
        </Link>
      </nav>

      <main className="flex flex-1 flex-col items-center px-4 pb-16 pt-6">
        <header className="mb-8 max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Is this job offer real?
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Paste a job posting, offer, or recruiter message — or upload a screenshot — and get an
            evidence-backed verdict before you reply. Every red flag is backed by a real source.
          </p>
        </header>

        {view === "idle" && (
          <div className="w-full max-w-xl space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={6}
                placeholder="Paste the job posting URL, the offer, or the recruiter's message here…"
                className="w-full resize-y rounded-xl bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
              />

              {/* Screenshot upload */}
              <div className="flex items-center gap-2 border-t border-zinc-100 px-2 pt-2 dark:border-zinc-800">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {image ? (
                  <div className="flex w-full items-center gap-2 rounded-lg bg-zinc-100 px-2 py-1.5 dark:bg-zinc-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="screenshot preview" className="h-9 w-9 rounded object-cover" />
                    <span className="flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300">
                      {imageName ?? "screenshot"}
                    </span>
                    <button
                      onClick={clearImage}
                      className="rounded px-1.5 text-xs text-zinc-400 hover:text-red-500"
                      aria-label="Remove screenshot"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-blue-600 dark:text-zinc-400"
                  >
                    <span>📎</span> Upload a screenshot (e.g. a WhatsApp chat)
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={investigate}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-blue-500 px-6 py-3.5 font-semibold text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check this offer →
            </button>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-400">
              <span>Try an example:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => setInput(ex.value)}
                  className="rounded-full border border-zinc-300 px-3 py-1 font-medium text-zinc-600 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === "loading" && (
          <div className="flex w-full flex-col items-center gap-6 pt-4">
            <p className="text-sm text-zinc-500">
              {image ? "Reading your screenshot, then checking the offer…" : "Checking this offer…"}
            </p>
            <ProgressSteps />
          </div>
        )}

        {view === "result" && result && "off_topic" in result && (
          <div className="w-full max-w-md text-center">
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-3xl">🧭</div>
              <h2 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                That&apos;s outside what Skeptr checks
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{result.message}</p>
            </div>
            <button
              onClick={reset}
              className="mt-5 text-sm font-medium text-blue-500 underline-offset-2 hover:underline"
            >
              ← Try a job offer or recruiter message
            </button>
          </div>
        )}

        {view === "result" && result && "verdict" in result && (
          <div className="flex w-full flex-col items-center gap-6">
            <VerdictCard verdict={result.verdict} servedFrom={result.served_from} />
            <button
              onClick={reset}
              className="text-sm font-medium text-blue-500 underline-offset-2 hover:underline"
            >
              ← Check another offer
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
