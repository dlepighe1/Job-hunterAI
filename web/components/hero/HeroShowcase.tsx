"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { ApplicationsOverlay } from "./ApplicationsOverlay";
import { NetworkOverlay } from "./NetworkOverlay";
import { PlatesOverlay } from "./PlatesOverlay";
import { DWELL_MS, nextIndex, shouldAutoAdvance } from "./rotation";

interface Asset {
  id: string;
  /**
   * The raster behind the overlay, when there is one.
   *
   * Two of the three assets do not have one. They are flat product UI (panels, rows,
   * pills, meters) and asking an image model for flat UI is what produced the first
   * attempt, where the analysis plates came back looking like a door intercom and the
   * contact graph like five billiard balls. UI draws as UI: crisp at any size, coloured by
   * the same tokens as the rest of the product, and correctable in a diff.
   *
   * The applications asset keeps its raster, because a laptop in three-quarter view is a
   * genuinely three-dimensional object and SVG is the wrong tool for it.
   */
  src?: string;
  /** Intrinsic size of the raster. Renders at roughly 560px wide, so these are 2x. */
  width?: number;
  height?: number;
  /**
   * The animated layer drawn over the raster.
   *
   * Every figure a visitor can read lives here rather than in the image, which is the
   * whole reason the assets are generated empty. A wrong number becomes a one-line diff
   * instead of a regeneration that has to come back looking like its two siblings.
   */
  Overlay: () => React.ReactElement;
  /** Names the panel in its dot control's accessible label. */
  label: string;
  /**
   * Says what the picture is. Every asset carries one, because an illustration of output the
   * product has not actually produced has to say so, and a caption that only appears on
   * some panels is worse than none, because it implies the uncaptioned ones are real.
   */
  caption: string;
}

const ASSETS: readonly Asset[] = [
  {
    id: "applications",
    src: "/img/hero/applications.webp",
    width: 1600,
    height: 900,
    Overlay: ApplicationsOverlay,
    label: "Scoring a posting against a resume",
    caption: "ILLUSTRATION OF THE MATCHER'S OUTPUT, NOT A REAL ANALYSIS",
  },
  {
    id: "plates",
    Overlay: PlatesOverlay,
    label: "A resume re-scored after tailoring",
    caption: "ILLUSTRATION OF THE MATCHER'S OUTPUT, NOT A REAL ANALYSIS",
  },
  {
    id: "network",
    Overlay: NetworkOverlay,
    label: "Mapping contacts at a company",
    caption: "ON THE ROADMAP, NOT A BUILT FEATURE",
  },
] as const;

/**
 * The hero centrepiece: one framed illustration at a time, rotating.
 *
 * Replaces an extruded orb carrying three drifting stat chips. The orb showed nothing about
 * the product, being merely a shape, and the chips put three unrelated figures in a visitor's
 * face before they had read the headline. A rail shows the actual surfaces, one thought at
 * a time.
 *
 * Three things about it are not negotiable:
 *
 * The frame has a fixed `aspect-ratio` in CSS, so the assets differing in height cannot
 * reflow the page mid-rotation. Content moving under a reader who did not ask for it is
 * the failure mode a carousel is most prone to.
 *
 * Rotation stops on hover and on focus. Anything else fights someone who is reading, or
 * yanks the panel out from under someone tabbing through the dots.
 *
 * Under `prefers-reduced-motion: reduce` it never advances on its own at all. The dots
 * still work, since the setting asks for no unbidden motion rather than a static page.
 */
export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Read after mount, never during render: the server has no `matchMedia`, and branching on
  // it during render would make the first client paint disagree with the markup.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // A timeout re-armed on each index rather than a standing interval. The dwell then
  // restarts when a dot is clicked, instead of the next auto-advance arriving early
  // because it was already part-way through a tick someone else started.
  useEffect(() => {
    if (!shouldAutoAdvance({ paused, reduced, total: ASSETS.length })) return;
    const timer = setTimeout(() => {
      setIndex((current) => nextIndex(current, ASSETS.length));
    }, DWELL_MS);
    return () => clearTimeout(timer);
  }, [index, paused, reduced]);

  const active = ASSETS[index];

  return (
    <figure
      className="hero-showcase"
      aria-roledescription="carousel"
      aria-label="Product illustrations"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      // React's onFocus/onBlur are delegated from focusin/focusout, so these fire for the
      // dots inside as well as the figure itself. That is the point: tabbing to a dot has
      // to stop the rotation just as hovering does.
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero-showcase__frame">
        {ASSETS.map((asset, i) => (
          <div
            key={asset.id}
            className="hero-showcase__panel"
            data-active={i === index}
            aria-hidden={i !== index}
          >
            {asset.src && asset.width && asset.height && (
              <Image
                src={asset.src}
                alt=""
                width={asset.width}
                height={asset.height}
                // Only the first is worth blocking the hero on. The other two are behind a
                // six-second dwell, by which point a lazy fetch has long since landed.
                priority={i === 0}
                loading={i === 0 ? undefined : "lazy"}
                sizes="(max-width: 1080px) 90vw, 46rem"
              />
            )}
            {/* Mounted only while showing. Keeping all three alive would leave two hidden
                panels animating behind the visible one for nothing, and remounting means
                the rings and pulses replay each time a panel comes back round rather than
                arriving already finished. */}
            {i === index && <asset.Overlay />}
          </div>
        ))}
      </div>

      <div className="hero-showcase__dots" role="group" aria-label="Choose an illustration">
        {ASSETS.map((asset, i) => (
          <button
            key={asset.id}
            type="button"
            className="hero-showcase__dot"
            // `aria-pressed` rather than `aria-current`: these are toggles reporting which
            // one is showing, and a screen reader announces the state on every dot rather
            // than only on the selected one.
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            <span className="hero-showcase__dot-label">{asset.label}</span>
          </button>
        ))}
      </div>

      {/* Keyed so a screen reader re-reads it when the panel changes, because otherwise the
          caption for asset one silently stands over asset three. */}
      <figcaption key={active.id} className="hero-showcase__caption">
        {active.caption}
      </figcaption>
    </figure>
  );
}
