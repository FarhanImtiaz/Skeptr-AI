import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js (local OCR) ships worker/wasm assets — keep it external so the
  // bundler doesn't try to inline them in the server build.
  serverExternalPackages: ["tesseract.js", "jimp"],
};

export default nextConfig;
