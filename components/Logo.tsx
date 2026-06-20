import Link from "next/link";

// Skeptr wordmark — used in the nav on both the landing page and the tool.
export default function Logo({
  className = "",
  size = "text-xl",
}: {
  className?: string;
  size?: string;
}) {
  return (
    <Link
      href="/"
      className={`font-bold tracking-tight text-zinc-900 dark:text-zinc-50 ${size} ${className}`}
    >
      Skep<span className="text-blue-500">tr</span>
    </Link>
  );
}
