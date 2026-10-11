"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A titled row that scrolls sideways, with previous/next buttons on wider screens. */
export function Carousel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  function update() {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const page = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="dc-section" aria-label={title}>
      <div className="dc-head">
        <h2>{title}</h2>
        <div className="dc-head-end">
          {action}
          <div className="dc-arrows">
            <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label={`Scroll ${title} back`}>‹</button>
            <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label={`Scroll ${title} forward`}>›</button>
          </div>
        </div>
      </div>
      <div className="dc-track" ref={track}>{children}</div>
    </section>
  );
}
