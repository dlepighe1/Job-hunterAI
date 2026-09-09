"use client";

/**
 * The right-side drawer. There is one of these, and everything uses it.
 *
 * Hunt, application details, resume preview and role details all open the same component.
 * Four separate drawer implementations is the outcome to avoid: they drift on width, on
 * animation timing, on whether Escape works, and on whether
 * focus is trapped. The third one written is always the one that forgets.
 *
 * Behaviour that is not optional here:
 *
 * - **Escape closes**, from anywhere inside.
 * - **Focus moves in on open and returns to the trigger on close.** Without the return, a
 *   keyboard user who opens a drawer from row 40 of a table lands back at the top of the
 *   document when it closes.
 * - **Tab is trapped** while open, because a modal surface whose focus can wander behind it
 *   is announced as modal and does not behave as one.
 * - **The page behind does not scroll**, and does not shift when the scrollbar goes away.
 * - **Nothing renders when closed.** Keeping a mounted drawer offscreen means its content
 *   is in the accessibility tree, its images load, and its fetches fire.
 */

import { useCallback, useEffect, useRef } from "react";

export type DrawerWidth = "standard" | "wide";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  lead,
  aside,
  width = "standard",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /**
   * Optional content left of the title, for a company mark or document icon.
   *
   * Additive so the four existing callers are untouched. The alternative was rebuilding this
   * header inside the application drawer's body, which would have printed the title twice:
   * once as the drawer's accessible name and once as the board's header block.
   */
  lead?: React.ReactNode;
  /** Optional content right of the title, before the close button. A score, typically. */
  aside?: React.ReactNode;
  /** `wide` is for document preview, where a narrow column makes a resume unreadable. */
  width?: DrawerWidth;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  /** Whatever had focus when the drawer opened, so it can be handed back on close. */
  const restoreTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Compensate for the vanishing scrollbar. Without this the whole page jumps sideways
    // as the drawer opens, which reads as a layout bug rather than a panel appearing.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const { overflow, paddingRight } = document.body.style;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    // Focus the panel itself rather than its first control: a drawer that opens with the
    // close button focused reads to a screen reader as "close", which is the least useful
    // possible summary of what just appeared.
    const frame = requestAnimationFrame(() => panel.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== "Tab" || !panel.current) return;

      const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      restoreTo.current?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="drawer" role="presentation">
      {/* A button, not a div with onClick, since the scrim is a real way to dismiss this and it
          should be reachable and announced as one. */}
      <button type="button" className="drawer__scrim" onClick={close} aria-label={`Close ${title}`} />

      <div
        ref={panel}
        className="drawer__panel"
        data-width={width}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="drawer__head">
          {lead}
          <div className="drawer__head-ident">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {aside}
          <button type="button" className="drawer__close" onClick={close} aria-label={`Close ${title}`}>
            ×
          </button>
        </header>

        <div className="drawer__body">{children}</div>

        {footer && <footer className="drawer__foot">{footer}</footer>}
      </div>
    </div>
  );
}
