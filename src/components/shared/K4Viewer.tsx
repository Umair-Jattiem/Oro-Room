'use client';

import { useEffect, useRef, useState } from 'react';
import { lockScroll } from '../motion/SmoothScroll';

type Render = (spec: unknown, w: number, h: number) => string;
export type K4Request = { spec: unknown; label: string; render: Render };

/* Renders the current beanbag at 3840 × 2160 (falling back to 2560 × 1440) and shows it fitted or at actual pixels.
   Each opening mounts a fresh dialog, so its state starts clean. */
export default function K4Viewer({ request, onClose }: { request: K4Request | null; onClose: () => void }) {
  return request ? <K4Dialog request={request} onClose={onClose} /> : null;
}

function K4Dialog({ request, onClose }: { request: K4Request; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);

  useEffect(() => {
    lockScroll(true);
    return () => lockScroll(false);
  }, []);

  useEffect(() => {
    returnTo.current = document.activeElement;
    const timer = setTimeout(() => {
      const sizes: [number, number][] = [[3840, 2160], [2560, 1440]];
      for (const s of sizes) {
        try { setUrl(request.render(request.spec, s[0], s[1])); setSize(s); closeRef.current?.focus(); return; } catch (e) { console.error(e); }
      }
      setFailed(true);
    }, 60);
    return () => clearTimeout(timer);
  }, [request]);

  useEffect(() => {
    const onKey =(e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onMove = (e: PointerEvent) => {
      const v = viewRef.current, d = drag.current;
      if (v && d) { v.scrollLeft = d.l - (e.clientX - d.x); v.scrollTop = d.t - (e.clientY - d.y); }
    };
    const onUp = () => { drag.current = null; };
    document.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  });

  useEffect(() => {
    const v = viewRef.current;
    if (full && v) { v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2; v.scrollTop = (v.scrollHeight - v.clientHeight) / 2; }
  }, [full, loaded]);

  function close() {
    onClose();
    const r = returnTo.current as HTMLElement | null;
    try { r?.focus(); } catch {}
  }

  const title = size && size[0] !== 3840 ? `${size[0]} × ${size[1]} render · ${request.label}` : `4K render · ${request.label}`;
  return (
    <div className="k4" role="dialog" aria-modal="true" aria-label="4K render">
      <div className="k4-bar">
        <span className="k4-t">{title}</span>
        <span className="k4-n">3D concept, not a photograph</span>
        <button type="button" className="k4-b" aria-pressed={!full} onClick={() => setFull(false)}>Fit to screen</button>
        <button type="button" className="k4-b" aria-pressed={full} onClick={() => setFull(true)}>Actual pixels</button>
        <button type="button" className="k4-x" aria-label="Close" ref={closeRef} onClick={close}>&times;</button>
      </div>
      <div
        ref={viewRef}
        className={'k4-view' + (full ? ' full' : '')}
        data-lenis-prevent
        onDoubleClick={() => setFull((f) => !f)}
        onPointerDown={(e) => {
          const v = viewRef.current;
          if (full && v && e.pointerType === 'mouse') drag.current = { x: e.clientX, y: e.clientY, l: v.scrollLeft, t: v.scrollTop };
        }}
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            hidden={!loaded}
            onLoad={() => setLoaded(true)}
            alt={size ? `4K render of the ${request.label} beanbag, ${size[0]} × ${size[1]} pixels` : ''}
          />
        )}
        {!loaded && <div className="k4-load">{failed ? 'This device could not create a 4K render.' : 'Rendering at 3840 × 2160…'}</div>}
      </div>
    </div>
  );
}
