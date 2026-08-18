import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Wraps client-side navigations in `document.startViewTransition`, which is what makes
     * the marketing page hand off to the dashboard as one continuous motion rather than a
     * hard swap. The animation itself is `::view-transition-old/new(root)` in globals.css.
     *
     * Degrades cleanly: browsers without the View Transitions API navigate instantly, and
     * `prefers-reduced-motion` zeroes the durations.
     */
    viewTransition: true,
  },
};

export default nextConfig;
