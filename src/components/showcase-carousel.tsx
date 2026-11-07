"use client";
// Dải ảnh màn hình xếp trên mặt trụ cong, tự quay chậm; kéo chuột hoặc vuốt để lướt.
import { useEffect, useRef } from "react";

export type ShowcaseSlide = { src: string; title: string; caption: string };

const CARD_W = 340;
const GAP = 22;
const RADIUS = 1150;

export function ShowcaseCarousel({ slides }: { slides: ShowcaseSlide[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const offset = useRef(0);
  const drag = useRef<{ x: number; start: number } | null>(null);

  useEffect(() => {
    const step = CARD_W + GAP;
    const span = step * slides.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      if (!drag.current && !reduce) offset.current += dt * 0.035;
      cards.current.forEach((el, i) => {
        if (!el) return;
        // Vị trí của thẻ so với tâm màn hình, quấn vòng để dải chạy liên tục.
        let x = ((i * step - offset.current) % span + span) % span;
        if (x > span / 2) x -= span;
        const angle = x / RADIUS;
        const tx = RADIUS * Math.sin(angle);
        const tz = RADIUS * (Math.cos(angle) - 1);
        const fade = Math.max(0, 1 - Math.abs(angle) / 1.25);
        el.style.transform = `translate3d(${tx - CARD_W / 2}px,0,${tz}px) rotateY(${-angle}rad)`;
        el.style.opacity = String(Math.min(1, fade * 1.4));
        el.style.zIndex = String(Math.round(1000 + tz));
        el.style.visibility = fade <= 0 ? "hidden" : "visible";
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [slides.length]);

  return (
    <div
      ref={stage}
      className="relative h-[300px] cursor-grab select-none overflow-hidden active:cursor-grabbing sm:h-[340px]"
      style={{ perspective: "1600px" }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, start: offset.current };
        stage.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) offset.current = drag.current.start - (e.clientX - drag.current.x) * 1.2;
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      aria-label="Các màn hình chính của hệ thống"
      role="region"
    >
      <div className="absolute left-1/2 top-4 h-full" style={{ transformStyle: "preserve-3d" }}>
        {slides.map((s, i) => (
          <div
            key={s.src}
            ref={(el) => { cards.current[i] = el; }}
            className="absolute top-0 overflow-hidden rounded-2xl border border-white/15 bg-[#0b1530] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]"
            style={{ width: CARD_W, willChange: "transform" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.title} draggable={false} className="block aspect-[16/10] w-full object-cover object-top" />
            <div className="border-t border-white/10 px-4 py-3">
              <div className="text-sm font-semibold text-white">{s.title}</div>
              <div className="mt-0.5 text-xs text-[#9fb3d9]">{s.caption}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#050b1f] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#050b1f] to-transparent" />
    </div>
  );
}
