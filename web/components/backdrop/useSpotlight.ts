import { useEffect, useRef } from "react";

/** Position string for the spotlight layer. Kept pure so it is testable without a DOM. */
export function spotlightTransform(x: number, y: number): string {
  return `translate3d(${x}px, ${y}px, 0)`;
}

/**
 * Move a layer with the pointer, on the compositor and nowhere near React.
 *
 * The returned ref goes on the element to move. Nothing about the pointer is held in
 * state: a `setState` per pointer event would re-render the tree at roughly the rate the
 * mouse reports, to reposition one decorative gradient. The transform is written straight
 * to the node instead, which is also why the position never survives a re-render, and it does
 * not need to, since the next pointer move rewrites it and there is nothing to restore.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Two reasons never to start. Reduced motion is the stated rule. A coarse pointer is
    // the honest one: a touch screen has no hovering cursor, so `pointermove` fires only
    // mid-drag, so the glow would chase the finger and then strand itself wherever the touch
    // ended. Both cases leave `data-active` unset, and CSS keeps the layer at opacity 0.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }

    let frame = 0;
    let x = 0;
    let y = 0;

    // One frame in flight at a time. `pointermove` fires faster than the display refreshes,
    // so a write per event repeats the same work several times over and only the last write
    // before each paint is ever seen. `frame` doubles as the already-scheduled flag, which
    // is why it is cleared here rather than after the write.
    function draw() {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      el.style.transform = spotlightTransform(x, y);
      el.dataset.active = "true";
    }

    function onPointerMove(event: PointerEvent) {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(draw);
    }

    // On `window`, not the element: the element is `pointer-events: none`, so it never
    // receives a pointer event of its own. `passive` because nothing here can cancel.
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      // A frame can be queued at unmount, and its callback would touch a detached node.
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
