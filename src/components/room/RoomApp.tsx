'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import K4Viewer, { type K4Request } from '../shared/K4Viewer';
import { gsap, useGSAP, REDUCED } from '../motion/gsap';
import Magnet from '../react-bits/Magnet';
import { kitById, type Kit } from '../shared/kits';

const CLEAR = 'transform,opacity,visibility';

/* Products shown in the bedroom. Edit these lists to add or change designs, fabrics and colours. */
type Colour = { id: string; name: string; hex: string };
const COLOURS: Colour[] = [
  { id: 'black',     name: 'Black',      hex: '#141213' },
  { id: 'charcoal',  name: 'Charcoal',   hex: '#3A3D3F' },
  { id: 'navy',      name: 'Navy',       hex: '#1F2A44' },
  { id: 'green',     name: 'Felt green', hex: '#17503C' },
  { id: 'oat',       name: 'Oat',        hex: '#CBC3B4' },
  { id: 'sand',      name: 'Sand',       hex: '#B9A27A' },
  { id: 'pink',      name: 'Blush pink', hex: '#E9A3BF' },
  { id: 'chocolate', name: 'Chocolate',  hex: '#3A2218' },
];
const FABRICS = [{ id: 'corduroy', name: 'Corduroy' }, { id: 'microsuede', name: 'Microsuede' }];
type BagDesign = { id: string; name: string; patch: string; colour: string; fabric: string; fixed?: boolean; kit?: Kit };
const BAG_DESIGNS: BagDesign[] = [
  { id: 'messi',   name: 'Messi 10',       patch: 'kitpatch', colour: 'black', fabric: 'corduroy', fixed: true, kit: kitById('messi') },
  { id: 'ols01',   name: 'Classic 8-ball', patch: 'circle',   colour: 'black', fabric: 'corduroy' },
  { id: 'dollar',  name: 'Dollar print',   patch: 'dollar',   colour: 'green', fabric: 'corduroy', fixed: true },
];
type MatDesign = { id: string; name: string; patch: string; colour: string; fixed?: boolean };
const MAT_DESIGNS: MatDesign[] = [
  { id: 'matgame', name: 'Neon crest',   patch: 'game',  colour: 'black', fixed: true },
  { id: 'matgirl', name: 'Pink scallop', patch: 'girl',  colour: 'pink',  fixed: true },
  { id: 'matmin',  name: 'Your emblem',  patch: 'crest', colour: 'charcoal' },
];
/* Scroll chapters: each one is a camera shot in the room (see SHOTS in engine.js) with three headline words.
   layout 'a' = words top-left, middle-right, bottom-left; 'b' = mirrored. */
const CHAPTERS = [
  { words: ['Crafted', 'for', 'Comfort'], layout: 'a', copy: 'A Cape Town bedroom at dusk, built in 3D around one piece: an Oro beanbag. Interactive concept, not a photograph.' },
  { words: ['Precision', 'through', 'Stitch'], layout: 'b', copy: 'Six sewn panels in heavy corduroy, with a base that settles exactly where you drop it.' },
  { words: ['Made', 'by', 'Hand'], layout: 'a', copy: 'Embroidered patches with satin-stitched borders and raised numbers. Tap the beanbag to make it yours.' },
  { words: ['Rooted', 'in', 'Cape Town'], layout: 'a', copy: 'Designed under Table Mountain. Designs, sizes and prices to be confirmed.', copyTop: true },
] as const;

function byId<T extends { id: string }>(list: T[], id: string): T {
  return list.find((x) => x.id === id) || list[0];
}

type Bag = { id: string; fabric: string; colour: string };
type Mat = { id: string; colour: string };
type Kind = 'bag' | 'mat' | null;
type RoomEngine = typeof import('./engine');
type RoomHandle = {
  setBag: (animate: boolean) => void; setMat: () => void; toggleSit: () => boolean; resetSit: () => void; dispose: () => void;
  setProgress: (p: number) => void;
};

const bagSpec = (b: Bag) => { const d = byId(BAG_DESIGNS, b.id); return { id: d.id, kind: 'dome', patch: d.patch, hex: d.kit ? d.kit.hex : byId(COLOURS, b.colour).hex, fabric: b.fabric, kit: d.kit }; };
const matSpec = (m: Mat) => { const d = byId(MAT_DESIGNS, m.id); return { id: d.id, kind: 'mat', patch: d.patch, hex: byId(COLOURS, m.colour).hex, fabric: 'corduroy' }; };
const summary = (b: Bag) => { const d = byId(BAG_DESIGNS, b.id); return 'Beanbag: ' + d.name + ' (' + byId(FABRICS, b.fabric).name + (d.fixed ? '' : ', ' + byId(COLOURS, b.colour).name) + ').'; };

export default function RoomApp() {
  const [bag, setBagState] = useState<Bag>({ id: 'messi', fabric: 'corduroy', colour: 'black' });
  const [mat, setMatState] = useState<Mat>({ id: 'matgame', colour: 'black' });
  const [open, setOpen] = useState<Kind>(null);
  const [engine, setEngine] = useState<RoomEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [hintHidden, setHintHidden] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', msg: '' });
  const [formMsg, setFormMsg] = useState<{ title: string; body: string } | null>(null);
  const [k4, setK4] = useState<K4Request | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hotBagRef = useRef<HTMLButtonElement>(null);
  const hotMatRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<RoomHandle | null>(null);
  const bagRef = useRef(bag), matRef = useRef(mat), openRef = useRef(open);
  useLayoutEffect(() => { bagRef.current = bag; matRef.current = mat; openRef.current = open; });

  /* motion: header and footnote arrive once the room is ready; panel contents stagger in when it opens */
  const appRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ready || window.matchMedia(REDUCED).matches) return;
    gsap.from('.rv-save', { y: -20, autoAlpha: 0, duration: 0.8, ease: 'power3.out', delay: 0.6, clearProps: CLEAR });
    gsap.from('.rv-pill', { xPercent: -50, x: 0, y: 24, autoAlpha: 0, duration: 0.9, ease: 'power3.out', delay: 0.8, clearProps: CLEAR });
  }, { scope: appRef, dependencies: [ready] });

  /* scroll chapters: wheel, touch, arrow keys or the dots move `progress` between camera shots;
     each chapter's words fade and blur in and out with it, and the view blurs slightly while the camera travels */
  const chRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prog = useRef({ p: 0, target: 0 });
  const [chapter, setChapter] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const N = CHAPTERS.length, st = prog.current, still = window.matchMedia(REDUCED).matches;
    const canvas = canvasRef.current, t0 = performance.now();
    let raf = 0, last = t0, snap = 0, shown = -1, touchY = 0, prevP = st.p;
    const clampT = (v: number) => Math.max(0, Math.min(N - 1, v));
    const blocked = (t: EventTarget | null) => !!openRef.current || (t instanceof Element && !!t.closest('.panel, .modal, .k4'));
    const nudged = () => { setHintHidden(true); clearTimeout(snap); snap = window.setTimeout(() => { st.target = Math.round(st.target); }, 220); };
    const onWheel = (e: WheelEvent) => { if (blocked(e.target)) return; st.target = clampT(st.target + e.deltaY * 0.0016); nudged(); };
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => { if (blocked(e.target)) return; const y = e.touches[0].clientY; st.target = clampT(st.target + (touchY - y) * 0.005); touchY = y; nudged(); };
    const onKey = (e: KeyboardEvent) => {
      if (blocked(e.target) || (e.target instanceof Element && e.target.closest('input, textarea, select'))) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { st.target = clampT(Math.round(st.target) + 1); nudged(); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { st.target = clampT(Math.round(st.target) - 1); nudged(); }
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      st.p += (st.target - st.p) * (still ? 1 : 1 - Math.exp(-dt / 0.35));
      if (Math.abs(st.target - st.p) < 0.0005) st.p = st.target;
      roomRef.current?.setProgress(st.p);
      const intro = still ? 1 : Math.min(1, (now - t0) / 1800);
      chRefs.current.forEach((el, i) => {
        if (!el) return;
        const d = Math.abs(st.p - i), a = Math.max(0, 1 - d * 1.8) * (i === 0 ? intro : 1);
        const blur = still ? 0 : Math.min(28, d * 40 + (i === 0 ? (1 - intro) * 18 : 0));
        el.style.opacity = a.toFixed(3);
        el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : '';
        el.style.visibility = a < 0.01 ? 'hidden' : 'visible';
      });
      const vel = Math.abs(st.p - prevP) / Math.max(dt, 0.001); prevP = st.p;
      if (canvas && !still) { const b = Math.min(3.5, vel * 2.2); canvas.style.filter = b > 0.25 ? `blur(${b.toFixed(2)}px)` : ''; }
      const idx = Math.round(st.p); if (idx !== shown) { shown = idx; setChapter(idx); }
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(snap);
      window.removeEventListener('wheel', onWheel); window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove); window.removeEventListener('keydown', onKey);
    };
  }, [ready]);
  const goTo = (i: number) => { prog.current.target = i; setHintHidden(true); };
  useGSAP(() => {
    if (!open || window.matchMedia(REDUCED).matches) return;
    gsap.from('.panel .ph, .panel .sec:not([hidden]), .panel .mrow, .panel .facts, .panel .btn.wide', {
      y: 18, autoAlpha: 0, stagger: 0.05, duration: 0.55, ease: 'power3.out', delay: 0.12, clearProps: CLEAR,
    });
  }, { scope: appRef, dependencies: [open], revertOnUpdate: true });

  function openPanel(kind: 'bag' | 'mat') {
    openRef.current = kind; setOpen(kind); setHintHidden(true);
    setTimeout(() => { try { closeRef.current?.focus({ preventScroll: true }); } catch {} }, 50);
  }
  function closePanel() {
    const was = openRef.current;
    openRef.current = null; setOpen(null);
    try { (was === 'mat' ? hotMatRef : hotBagRef).current?.focus({ preventScroll: true }); } catch {}
  }

  /* start the 3D room once the fonts used on the textures are ready */
  useEffect(() => {
    let handle: RoomHandle | null = null, cancelled = false;
    const fail = () => { setNoGL(true); setReady(true); };
    (async () => {
      const mod = await import('./engine');
      if (cancelled) return;
      if (!mod.webglOK()) { fail(); return; }
      if (document.fonts?.load) await Promise.race([document.fonts.load('800 80px Manrope'), new Promise((r) => setTimeout(r, 2000))]);
      if (cancelled || !canvasRef.current || !hotBagRef.current) return;
      try {
        handle = mod.initRoom({
          canvas: canvasRef.current,
          hotBag: hotBagRef.current,
          getOpen: () => openRef.current,
          getBagSpec: () => bagSpec(bagRef.current),
          getMatSpec: () => matSpec(matRef.current),
          onPick: (k: 'bag' | 'mat') => openPanel(k),
          onClose: () => closePanel(),
          onReady: () => setReady(true),
        }) as RoomHandle;
        roomRef.current = handle;
        setEngine(mod);
      } catch (e) { console.error(e); fail(); }
    })().catch((e) => { console.error(e); fail(); });
    return () => { cancelled = true; handle?.dispose(); roomRef.current = null; };
  }, []);

  /* Escape closes the modal first, then the panel */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || k4) return;
      if (modal) setModal(false); else if (openRef.current) closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function updateBag(next: Bag) { bagRef.current = next; setBagState(next); roomRef.current?.setBag(true); }
  function updateMat(next: Mat) { matRef.current = next; setMatState(next); roomRef.current?.setMat(); }
  function openModal() {
    setForm((f) => ({ ...f, msg: summary(bagRef.current) })); setFormMsg(null); setModal(true);
    setTimeout(() => { try { nameRef.current?.focus(); } catch {} }, 30);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = form.name.trim(), em = form.email.trim();
    if (!n || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setFormMsg({ title: 'Check your details', body: 'Please add your name and a valid email address.' }); return; }
    setFormMsg({ title: 'Prototype only', body: 'Nothing has been sent or saved. On the live site, this form will send your details to [EMAIL ADDRESS OR FORM SERVICE TO BE SET UP].' });
  }

  const isBag = open !== 'mat';
  const d = byId(BAG_DESIGNS, bag.id), hex = byId(COLOURS, bag.colour).hex;
  const m = byId(MAT_DESIGNS, mat.id), mh = byId(COLOURS, mat.colour).hex;

  return (
    <div id="app" ref={appRef} className={'rv' + (open ? ' is-open' : '')}>
      <canvas id="c" ref={canvasRef} hidden={noGL} role="img" aria-label="Interactive 3D bedroom with a view of Cape Town and a beanbag. Use the button on the beanbag to change its style." />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img id="fallback" src="/images/ols01-room-render.jpg" alt="Concept render of the Classic 8-ball beanbag in a room" hidden={!noGL} />

      {/* chapter headlines: three giant words placed around the frame, plus a line of copy */}
      <div className="rv-words" aria-live="polite">
        {CHAPTERS.map((c, i) => (
          <div key={i} ref={(el) => { chRefs.current[i] = el; }} className={'rv-ch ' + c.layout} aria-hidden={i !== chapter} style={{ opacity: 0, visibility: 'hidden' }}>
            <p className="rv-w w0">{c.words[0]}</p>
            <p className="rv-w w1">{c.words[1]}</p>
            <p className="rv-w w2">{c.words[2]}</p>
            <p className={'rv-copy' + ('copyTop' in c ? ' top' : '')}>{c.copy}</p>
          </div>
        ))}
      </div>

      <Magnet padding={50} magnetStrength={4} maxOffset={8} wrapperClassName="rv-save-wrap">
        <button type="button" className="rv-save" aria-pressed={saved} onClick={() => setSaved((s) => !s)}>
          <span>{saved ? 'Saved' : 'Save'}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        </button>
      </Magnet>

      <button type="button" className="hot" ref={hotBagRef} hidden={noGL} aria-label="Customise the beanbag" onClick={() => openPanel('bag')}>
        <span className="dot" /><span className="lbl">Beanbag · change style</span>
      </button>
      <button type="button" className="hot" ref={hotMatRef} hidden aria-label="Customise the floor mat" onClick={() => openPanel('mat')}>
        <span className="dot" /><span className="lbl">Floor mat · change style</span>
      </button>

      <div className="rv-hint" style={hintHidden && !noGL ? { opacity: 0 } : undefined}>
        {noGL ? 'The interactive room needs WebGL, which this browser does not support.' : 'Scroll to explore · tap the beanbag to make it yours'}
      </div>

      {/* bottom bar: brand, chapter dots, menu */}
      <nav className="rv-pill" aria-label="Chapters">
        <span className="rv-mark">Oro</span>
        <span className="rv-dots">
          {CHAPTERS.map((c, i) => (
            <button key={i} type="button" className="rv-dot" aria-label={`Chapter ${i + 1}: ${c.words.join(' ')}`} aria-current={i === chapter} onClick={() => goTo(i)} />
          ))}
        </span>
        <button type="button" className="rv-menu" aria-label="Customise the beanbag" onClick={() => (open ? closePanel() : openPanel('bag'))}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </nav>

      <aside className={'panel' + (open ? '' : ' closed')} aria-label="Customise" aria-hidden={!open}>
        <div className="ph">
          <div><p className="eyebrow">{isBag ? 'Beanbag' : 'Floor mat'}</p><h2>{isBag ? d.name : m.name}</h2></div>
          <button type="button" className="x" ref={closeRef} aria-label="Back to the room" onClick={closePanel}>&times;</button>
        </div>
        {engine && (isBag ? (
          <>
            <div className="sec">
              <div className="lab">Design</div>
              <div className="designs" role="group" aria-label="Design">
                {BAG_DESIGNS.map((x) => {
                  const xh = x.id === d.id ? hex : byId(COLOURS, x.colour).hex, xf = x.id === d.id ? bag.fabric : x.fabric;
                  return (
                    <button key={x.id} type="button" className="dz" aria-pressed={x.id === d.id} onClick={() => { if (x.id !== bag.id) updateBag({ id: x.id, fabric: x.fabric, colour: x.colour }); }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="" src={engine.bagIcon(x, xh, xf)} /><span>{x.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sec">
              <div className="lab">Fabric <em>(proposed)</em></div>
              <div className="fabs" role="group" aria-label="Fabric">
                {FABRICS.map((f) => (
                  <button key={f.id} type="button" className="fz" aria-pressed={f.id === bag.fabric} onClick={() => { if (f.id !== bag.fabric) updateBag({ ...bag, fabric: f.id }); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={engine.swatchURL(d.kit ? d.kit.hex : d.fixed ? '#bdb78f' : hex, f.id, 80, 80)} />{f.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="sec" hidden={!!d.fixed}>
              <div className="lab">Colour <span>{byId(COLOURS, bag.colour).name}</span></div>
              <div className="cols" role="group" aria-label="Colour">
                {COLOURS.map((c) => (
                  <button key={c.id} type="button" className="cz" aria-label={c.name} aria-pressed={c.id === bag.colour} onClick={() => { if (c.id !== bag.colour) updateBag({ ...bag, colour: c.id }); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={engine.swatchURL(c.hex, bag.fabric, 60, 60)} />
                  </button>
                ))}
              </div>
            </div>
            <div className="mrow">
              <button type="button" className="btn ghost" aria-pressed={sitting} onClick={() => { if (roomRef.current) setSitting(roomRef.current.toggleSit()); }}>{sitting ? 'Stand up' : 'Sit on it'}</button>
              <button type="button" className="btn ghost" onClick={() => setK4({ spec: bagSpec(bag), label: d.name, render: engine.renderStudio as K4Request['render'] })}>View in 4K</button>
            </div>
            <p className="facts"><b>Proposed size:</b> 120 × 120 × 85 cm. Fabric, filling and price to be confirmed.{d.patch === 'dollar' ? ' The banknote artwork is a placeholder.' : ''}</p>
          </>
        ) : (
          <>
            <div className="sec">
              <div className="lab">Design</div>
              <div className="designs" role="group" aria-label="Design">
                {MAT_DESIGNS.map((x) => (
                  <button key={x.id} type="button" className="dz" aria-pressed={x.id === m.id} onClick={() => { if (x.id !== mat.id) updateMat({ id: x.id, colour: x.colour }); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={engine.matIcon(x, x.id === m.id ? mh : byId(COLOURS, x.colour).hex)} /><span>{x.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sec" hidden={!!m.fixed}>
              <div className="lab">Colour <span>{byId(COLOURS, mat.colour).name}</span></div>
              <div className="cols" role="group" aria-label="Colour">
                {COLOURS.map((c) => (
                  <button key={c.id} type="button" className="cz" aria-label={c.name} aria-pressed={c.id === mat.colour} onClick={() => { if (c.id !== mat.colour) updateMat({ ...mat, colour: c.id }); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={engine.swatchURL(c.hex, 'microsuede', 60, 60)} />
                  </button>
                ))}
              </div>
            </div>
            <p className="facts"><b>Size, pile and price:</b> to be confirmed. The printed artwork and lettering are placeholders.</p>
          </>
        ))}
        <button type="button" className="btn wide" onClick={openModal}>Register interest in this design</button>
      </aside>


      {modal && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle" onClick={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
          <form className="mbox" noValidate onSubmit={submit}>
            <h2 id="mTitle">Register interest</h2>
            <p>We are still developing these designs. Leave your details and we will let you know when they are ready.</p>
            <div className="field"><label htmlFor="fName">Name</label><input id="fName" ref={nameRef} type="text" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="fEmail">Email</label><input id="fEmail" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="fMsg">Your setup</label><textarea id="fMsg" rows={3} value={form.msg} onChange={(e) => setForm({ ...form, msg: e.target.value })} /></div>
            <div aria-live="polite">{formMsg && <div className="msg"><b>{formMsg.title}</b>{formMsg.body}</div>}</div>
            <div className="mrow"><button type="submit" className="btn">Register interest</button><button type="button" className="btn ghost" onClick={() => setModal(false)}>Close</button></div>
          </form>
        </div>
      )}

      <div className={'loader' + (ready ? ' done' : '')}>Setting up the room…</div>
      <K4Viewer request={k4} onClose={() => setK4(null)} />
    </div>
  );
}
