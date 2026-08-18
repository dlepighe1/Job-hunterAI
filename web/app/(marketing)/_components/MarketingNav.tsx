"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AuthDrawer, type AuthMode } from "@/app/(marketing)/_components/AuthDrawer";

const SECTIONS = [
  { id: "platform", label: "Platform" },
  { id: "evidence", label: "Evidence" },
  { id: "privacy", label: "Privacy" },
] as const;

function Mark() {
  return (
    <span className="marketing-mark">
      <span>R</span> ResumeAI
    </span>
  );
}

/**
 * The marketing header.
 *
 * The bar paints nothing. It used to carry a translucent obsidian plate across the full
 * width, which on scroll slid over the content beneath it as a visible rectangular patch.
 * The blur belongs to the pill and the sign-up button, which are the only things that need
 * to stay readable over moving content. `pointer-events` is disabled on the container and
 * re-enabled on its children so the transparent gutter does not eat clicks.
 */
export function MarketingNav() {
  const [active, setActive] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  /**
   * Scroll spy.
   *
   * A scroll listener rather than an IntersectionObserver, deliberately. The observer
   * version only recomputes when an observed element crosses a threshold relative to the
   * root, and these sections are far taller than any sensible detection band, so a
   * section could occupy the whole viewport without its ratio ever crossing 0.5, and the
   * indicator would silently stay on whatever fired last. It reproduced exactly that:
   * Evidence and Privacy resolved, Platform never did.
   *
   * Reading positions directly on scroll is deterministic and cheap here: one rAF-throttled
   * pass over three `getBoundingClientRect()` calls, which is well inside frame budget.
   * The active section is the last one whose top has crossed the 40% line, so the
   * highlight changes when a section takes over the reading area, not when it first peeks
   * into view. Above the first section nothing is active, which is correct: the hero is
   * not a nav destination.
   */
  useEffect(() => {
    let frame = 0;

    function resolve() {
      frame = 0;
      const line = window.innerHeight * 0.4;

      let current: string | null = null;
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= line) current = section.id;
      }

      // The last section can be too short to reach the line on a tall viewport; if the
      // page is scrolled to the bottom it is unambiguously the one being read.
      const atBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      if (atBottom) current = SECTIONS[SECTIONS.length - 1].id;

      setActive(current);
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(resolve);
    }

    resolve();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Measure the active tab so the indicator can slide to it. Layout effect because a
  // paint with the pill at the wrong offset is visible as a flash on first load.
  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (!active) return setIndicator(null);

    const tab = nav.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!tab) return setIndicator(null);

    setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
  }, [active]);

  // The rule this suppresses exists to catch effects that set state the render could have
  // derived. This one cannot be derived: the indicator's offset is a measurement of laid-out
  // DOM, which does not exist until after commit. Reading it in a layout effect and storing
  // the result is the supported way to position against real geometry, and it has to be a
  // layout effect rather than a passive one, or the pill paints at the wrong offset first
  // and the correction is visible as a flash.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <>
      <header className="marketing-nav">
        <Link href="/" aria-label="ResumeAI home">
          <Mark />
        </Link>

        <nav ref={navRef} aria-label="Primary navigation">
          <span
            className="nav-indicator"
            aria-hidden="true"
            style={{
              transform: `translateX(${indicator?.left ?? 0}px)`,
              width: indicator?.width ?? 0,
              opacity: indicator ? 1 : 0,
            }}
          />
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              data-section={section.id}
              data-active={active === section.id}
              aria-current={active === section.id ? "true" : undefined}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="marketing-nav__actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setAuthMode("sign-in")}
            style={{ background: "none", border: 0, cursor: "pointer" }}
          >
            Sign in
          </button>
          <button
            type="button"
            className="button button--light"
            onClick={() => setAuthMode("sign-up")}
          >
            Get started
          </button>
        </div>
      </header>

      {authMode && (
        <AuthDrawer
          mode={authMode}
          onModeChange={setAuthMode}
          onClose={() => setAuthMode(null)}
        />
      )}
    </>
  );
}
