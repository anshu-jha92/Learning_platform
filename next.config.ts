import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/**
 * MOBILE_EXPORT=1 produces a static bundle in out/ for the Capacitor shell.
 * In that mode there is no server, so the app must be pointed at a hosted API with
 * NEXT_PUBLIC_API_BASE_URL.
 */
const isMobileExport = process.env.MOBILE_EXPORT === "1";

/**
 * Next blocks requests to dev-only resources (/_next/hmr and friends) from any origin
 * other than localhost. That is a sensible default, but it breaks the moment you run
 * `npm run dev -- --host` and someone opens the app from another device: the page loads
 * and then hot reload is refused.
 *
 * So the machine's own LAN addresses are allowed, computed rather than hardcoded — a
 * DHCP lease changes and a pinned IP would silently stop working. Dev only; `next build`
 * ignores this entirely.
 */
function lanOrigins(): string[] {
  const origins: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) origins.push(addr.address);
    }
  }
  return origins;
}

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: this app is a single-user, always-dynamic tool.
  // Every route either reads the local JSON store or calls the model, so there is nothing
  // worth prerendering, and the explicit-caching model would only add ceremony.
  cacheComponents: false,
  allowedDevOrigins: lanOrigins(),
  ...(isMobileExport
    ? { output: "export" as const, images: { unoptimized: true } }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
