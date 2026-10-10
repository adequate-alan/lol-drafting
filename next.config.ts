import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/site";

// Fully static export for GitHub Pages: no server, no API routes, no middleware.
const nextConfig: NextConfig = {
  output: "export",
  basePath: BASE_PATH,
  // pool/index.html instead of pool.html, so /lol-drafting/pool/ resolves the same way on every static host.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
