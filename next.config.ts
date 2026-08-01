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
};

export default nextConfig;
