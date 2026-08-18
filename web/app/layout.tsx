import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

import { DevIdentityProvider } from "@/components/DevIdentity";
import { DevModeBanner } from "@/components/DevModeBanner";
import { DEV_USER_EMAIL, DEV_USER_NAME, isDevMode } from "@/lib/dev-mode";

export const metadata: Metadata = {
  title: "ResumeAI: Find out what your resume is missing",
  description:
    "Score a resume against a job posting. See which requirements it doesn't evidence and which terms an applicant tracking system would miss. Free, no account needed.",
};

/** The design contract this build is held to. Audited against the render at review time. */
const DESIGN_CONTRACT = `<!--
THESIS: A resume tool that shows its working. Refuses the category's confidence-theatre
  hero: no "98% match!", no invented logo wall, no fabricated pipeline. The hero shows a
  score of 74 because the model does not produce a 92.
OWN-WORLD: Cyber Obsidian. Dark neumorphism on obsidian #08080C, surfaces stepping to
  #101016 / #14141B / #18181F. Every surface extruded from the ground by one fixed top-left
  light source; no element defined primarily by a border. Three elevation levels only.
  Clash Display / Satoshi / JetBrains Mono, self-hosted. Electric cyan #56CCF2 is the sole
  accent; teal #00F5A0 affirms, gold #F2C14E cautions, rose #FF7A8A fails. Dark only,
  there is no light mode to fall back to.
GROUND: Not flat black. A fixed, pointer-events-none stack sits behind everything: an
  ambient radial field, a topographic contour map with ten animated data currents, a
  cursor-tracking spotlight, and film grain on top. The grain is load-bearing, not
  decoration, because near-black gradients band into visible rings without it.
STORY: A job seeker learns this scores honestly, sees the measurement behind the number,
  and runs the matcher without signing up.
FIRST VIEWPORT: Split, copy left and permanent, a fixed-ratio framed viewport right
  rotating through three product illustrations on a 6s dwell. Every figure on them is drawn
  in SVG over an empty raster, so no claim is baked into a pixel. Rotation pauses on hover
  and focus, and never auto-runs under reduced motion. Primary CTA under the lede. The copy
  leads at every width.
FORM: Tactile instrument panel. Brief-pinned by the user: neumorphism, obsidian retained,
  Clash Display + Satoshi chosen from three offered pairings.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
  the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
        <head>
          <link
            rel="preload"
            href="/fonts/ClashDisplay-Variable.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
          <link
            rel="preload"
            href="/fonts/Satoshi-Variable.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        </head>
        <body className="flex min-h-full flex-col">
          {/* JSX comments are stripped by the compiler, so the design contract is emitted
              as a real HTML comment, since it has to be greppable in the built output to be
              auditable at all. */}
          <div hidden dangerouslySetInnerHTML={{ __html: DESIGN_CONTRACT }} />
          <DevModeBanner />
          {/* The private flag is read here, on the server, and passed down, see
              components/DevIdentity.tsx for why it is not a NEXT_PUBLIC_ variable. */}
          <DevIdentityProvider
            value={{
              active: isDevMode(),
              name: DEV_USER_NAME,
              email: DEV_USER_EMAIL,
            }}
          >
            {children}
          </DevIdentityProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
