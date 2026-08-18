"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useDevIdentity } from "@/components/DevIdentity";
import { ACCENT_KEY, applyAccent } from "@/lib/accents";
import { NAV_ITEMS, TOOL_ITEMS } from "@/lib/nav";

function ProductMark() {
  return (
    <span className="product-mark" aria-label="ResumeAI">
      <span className="product-mark__icon">R</span>
      <span>
        Resume<span className="product-mark__ai">AI</span>
      </span>
    </span>
  );
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    LayoutDashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    Target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    Briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </>
    ),
    FileText: (
      <>
        <path d="M6 2h8l4 4v16H6z" />
        <path d="M14 2v5h5M9 12h6M9 16h6" />
      </>
    ),
    Users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a5 5 0 0 1 10 0v2M16 11a3 3 0 1 0 0-6M17 14a5 5 0 0 1 4 4v2" />
      </>
    ),
    Mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    Help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.25-1.2.9-1.2 1.6v.5" />
        <path d="M12 17h.01" />
      </>
    ),
    Settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
  };

  return (
    <svg
      className="side-nav__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/**
 * The authenticated chrome: sidebar, mobile drawer, content stage and footer.
 *
 * This lives outside `app/(app)/layout.tsx` because of what it needs and what the backdrop
 * needs. The shell needs client hooks — `usePathname`, Clerk's `useUser`, the accent read
 * from `localStorage`. `ObsidianBackdrop` needs the opposite: it is a server component whose
 * contour field renders once to static markup and ships no JavaScript, and importing it into
 * a `"use client"` file would pull the whole thing into the bundle without any visible
 * symptom.
 *
 * So the route layout stays on the server and passes the backdrop down as an element. It
 * arrives here already rendered, and this file never imports it.
 *
 * `backdrop` is rendered as the first child of `.obsidian-app` rather than beside it. The
 * layers sit at negative z-indices, which only keeps them behind the content and in front of
 * the shell's own background while `.obsidian-app` contains them — it sets
 * `isolation: isolate` for exactly this. Mounted outside, they would paint under
 * `background: var(--obsidian)` and be invisible.
 */
export function AppShell({
  backdrop,
  children,
}: {
  backdrop: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, isSignedIn: clerkSignedIn, isLoaded: clerkLoaded } = useUser();
  const dev = useDevIdentity();
  const [open, setOpen] = useState(false);

  // In dev mode there is no Clerk session, so the shell would render "Sign in" beside a
  // fully populated workspace. Treated as signed in for chrome purposes only. Nothing
  // here grants access, which every route decides for itself on the server.
  const isSignedIn = dev.active || clerkSignedIn;
  const isLoaded = dev.active || clerkLoaded;

  useEffect(() => {
    applyAccent(localStorage.getItem(ACCENT_KEY));
  }, [pathname]);

  const sidebar = (
    <>
      <div className="sidebar__brand">
        <Link href={isSignedIn ? "/dashboard" : "/matcher"}>
          <ProductMark />
        </Link>
      </div>

      <nav className="side-nav" aria-label="Workspace">
        <span className="side-nav__label">Workspace</span>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={active ? "side-nav__item is-active" : "side-nav__item"}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
              {/* A locked screen is labelled as one in the nav, so nobody clicks Outreach
                  three times wondering why it looks empty. */}
              {item.comingSoon && <small title="Not built yet">soon</small>}
            </Link>
          );
        })}
      </nav>

      <nav className="side-nav side-nav--tools" aria-label="Tools">
        <span className="side-nav__label">Tools</span>
        {TOOL_ITEMS.map((item) => {
          const active = pathname === item.href.split("#")[0];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={active ? "side-nav__item is-active" : "side-nav__item"}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__bottom">
        {/*
          The upgrade card. Deliberately the quietest thing in this column: it uses the
          inset surface rather than a raised one, so it reads as a note rather than as the
          product's main call to action. Billing is a Phase 1 non-goal (FEATURES.md §8), so
          it links to Settings and says what it is instead of implying a checkout exists.
        */}
        {isLoaded && isSignedIn && (
          <Link href="/settings" className="upgrade-card">
            <strong>Upgrade to Pro</strong>
            <span>Unlimited matches and written feedback.</span>
            <em>Not yet available</em>
          </Link>
        )}

        {isLoaded &&
          (isSignedIn ? (
            <>
              <div className="sidebar-profile">
                <span className="user-glyph" aria-hidden="true" />
                <div>
                  <strong>
                    {user?.fullName ||
                      user?.primaryEmailAddress?.emailAddress ||
                      (dev.active ? dev.name : "Signed in")}
                  </strong>
                  <span>{dev.active ? "Fixture data" : "Free plan"}</span>
                </div>
              </div>

              {/* No Clerk session to sign out of in dev mode; the button would throw. */}
              {!dev.active && (
                <SignOutButton redirectUrl="/">
                  <button className="sidebar-utility sidebar-utility--danger" type="button">
                    ↪ <span>Log out</span>
                  </button>
                </SignOutButton>
              )}
            </>
          ) : (
            <Link className="sidebar-utility" href="/sign-in">
              ↪ <span>Sign in</span>
            </Link>
          ))}
      </div>
    </>
  );

  return (
    <div className="obsidian-app">
      {backdrop}

      <aside className="app-sidebar">{sidebar}</aside>

      <header className="mobile-header">
        <Link href={isSignedIn ? "/dashboard" : "/matcher"}>
          <ProductMark />
        </Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation">
          ☰
        </button>
      </header>

      {open && (
        <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            className="mobile-drawer__backdrop"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="mobile-drawer__panel">
            <button
              className="mobile-drawer__close"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              ×
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="app-stage">
        <main className="app-content" key={pathname}>
          {children}
        </main>
        <footer className="app-footer">
          <strong>ResumeAI</strong>
          <span>A private workspace for one job search</span>
        </footer>
      </div>
    </div>
  );
}
