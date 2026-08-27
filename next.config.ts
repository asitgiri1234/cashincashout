import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * NOTE: `experimental.viewTransition` is deliberately NOT enabled.
   *
   * It only exposes React's <ViewTransition> component (which needs the React
   * experimental channel) — it does not wrap App Router navigations in
   * document.startViewTransition(). Verified empirically: with the flag on,
   * clicking a <Link> produced zero startViewTransition calls and zero
   * ::view-transition pseudo-element animations, while adding ~12kB to the
   * shared bundle.
   *
   * The navigation morph is implemented directly instead — see
   * components/view-transitions.tsx.
   */

  images: {
    /**
     * Uploaded product images live in Vercel Blob, which serves them from
     * <storeId>.public.blob.vercel-storage.com. next/image refuses any remote
     * host not listed here — that allowlist is what stops the optimizer being
     * used as an open proxy for arbitrary URLs.
     *
     * The store id is part of the hostname and differs per environment, so it
     * is wildcarded rather than hardcoded; the suffix still pins this to
     * Vercel Blob. Locally served images under /public are unaffected —
     * remotePatterns only governs absolute URLs.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
