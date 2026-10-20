import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
