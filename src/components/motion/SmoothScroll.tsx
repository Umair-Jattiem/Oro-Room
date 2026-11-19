'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap, ScrollTrigger, REDUCED } from './gsap';

/* Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger animations stay in sync.
   Skipped for people who prefer reduced motion (the page then scrolls natively). */
let lenis: Lenis | null = null;
export const getLenis = () => lenis;

/* jump to the top, through Lenis when it is running */
export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
}
/* pause page scrolling while an overlay is open */
export function lockScroll(locked: boolean) {
  if (!lenis) return;
  if (locked) lenis.stop(); else lenis.start();
}

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia(REDUCED).matches) return;
    const instance = new Lenis({ autoRaf: false, lerp: 0.1, smoothWheel: true });
    lenis = instance;
    instance.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      instance.destroy();
      if (lenis === instance) lenis = null;
    };
  }, []);
  return null;
}
