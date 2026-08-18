"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal children once, when they first scroll into view.
 *
 * One-way on purpose: content that fades back out when you scroll up is a novelty the
 * second time and an irritation the tenth. The observer disconnects after firing, so a
 * long page does not keep dozens of them alive.
 *
 * The initial hidden state lives in CSS (`.reveal`), and `prefers-reduced-motion` forces
 * it visible there, so if this component never mounts or JS fails, the content is still
 * on the page rather than permanently transparent.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger, in ms. Keep under ~200, since past that it reads as the page being slow. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `reveal ${className}` : "reveal"}
      data-shown={shown}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
