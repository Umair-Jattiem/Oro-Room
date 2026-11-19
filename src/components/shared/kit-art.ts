/* Canvas drawing for kit fabrics, name-and-number decals, floating balls and chip icons. Browser-only. */
import type { Kit } from './kits';

type G = CanvasRenderingContext2D;
const FONT = (px: number) => `800 ${px}px Manrope, "Arial Black", Arial, sans-serif`;

/* The kit colours across a fabric texture that wraps once around the beanbag (u = around, v = top to bottom). */
export function drawKitFabric(g: G, w: number, h: number, kit: Kit) {
  g.fillStyle = kit.hex; g.fillRect(0, 0, w, h);
  if (kit.pattern === 'stripes') {
    const n = 12, sw = w / n; // vertical stripes, as on the Argentina shirt
    g.fillStyle = kit.hex2;
    for (let i = 1; i < n; i += 2) g.fillRect(i * sw, 0, sw, h);
  } else if (kit.pattern === 'checks') {
    const cols = 24, size = w / cols, rows = Math.ceil(h / size);
    g.fillStyle = kit.hex2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) % 2) g.fillRect(c * size, r * size, size, size);
  } else {
    // a thin collar-style band near the top in the second colour
    g.fillStyle = kit.hex2; g.fillRect(0, h * 0.07, w, h * 0.018);
  }
  // tonal jacquard weave, like a modern match shirt: fine diagonal lines, lighter and darker
  g.save(); g.lineWidth = Math.max(1, w / 1400);
  const step = w / 180;
  for (let x = -h; x < w; x += step) {
    g.strokeStyle = (Math.round(x / step) % 2) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke();
  }
  g.restore();
}

/* ---------- embroidered badge (football legends and pool balls) ---------- */
export type Badge = { bg: string; ring: string; ink: string; top?: string; main: string };

/* text along the top of a circle */
function arcText(g: G, text: string, cx: number, cy: number, r: number, px: number) {
  g.save(); g.font = FONT(px); g.textAlign = 'center'; g.textBaseline = 'middle';
  const widths = [...text].map((ch) => g.measureText(ch).width * 1.12);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = -Math.PI / 2 - total / r / 2;
  [...text].forEach((ch, i) => {
    const step = widths[i] / r; a += step / 2;
    g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    a += step / 2;
  });
  g.restore();
}

/* satin-stitch texture clipped to whatever path is current */
function satin(g: G, S: number, angle: number, alpha: number) {
  g.save(); g.clip();
  g.translate(S / 2, S / 2); g.rotate(angle); g.lineWidth = S * 0.0022;
  for (let x = -S; x < S; x += S * 0.0055) {
    g.strokeStyle = `rgba(255,255,255,${alpha})`; g.beginPath(); g.moveTo(x, -S); g.lineTo(x, S); g.stroke();
    g.strokeStyle = `rgba(0,0,0,${alpha * 0.8})`; g.beginPath(); g.moveTo(x + S * 0.0027, -S); g.lineTo(x + S * 0.0027, S); g.stroke();
  }
  g.restore();
}

/* A round embroidered patch: twill backing, satin-stitched border, running-stitch ring, arched name, raised number. */
export function drawBadge(g: G, S: number, b: Badge) {
  const cx = S / 2, cy = S / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // twill backing
  g.fillStyle = b.bg; g.fillRect(0, 0, S, S);
  g.save(); g.lineWidth = S * 0.0015;
  for (let x = -S; x < S; x += S * 0.006) { g.strokeStyle = 'rgba(0,0,0,0.05)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + S, S); g.stroke(); }
  g.restore();
  // satin-stitched border
  g.beginPath(); g.arc(cx, cy, S * 0.47, 0, 7); g.arc(cx, cy, S * 0.405, 0, 7, true);
  g.fillStyle = b.ring; g.fill('evenodd');
  g.beginPath(); g.arc(cx, cy, S * 0.47, 0, 7); g.arc(cx, cy, S * 0.405, 0, 7, true);
  for (let i = 0; i < 360; i++) { // radial satin stitches
    const a = (i / 360) * Math.PI * 2;
    g.strokeStyle = i % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)'; g.lineWidth = S * 0.003;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * S * 0.405, cy + Math.sin(a) * S * 0.405); g.lineTo(cx + Math.cos(a) * S * 0.47, cy + Math.sin(a) * S * 0.47); g.stroke();
  }
  // running stitch just inside the border
  g.setLineDash([S * 0.012, S * 0.009]); g.lineWidth = S * 0.0045; g.strokeStyle = b.ring;
  g.beginPath(); g.arc(cx, cy, S * 0.375, 0, 7); g.stroke(); g.setLineDash([]);
  // arched name
  if (b.top) { g.fillStyle = b.ink; arcText(g, b.top.toUpperCase(), cx, cy, S * 0.3, S * 0.085); }
  // raised number: soft drop shadow, satin fill, top-left highlight
  const px = S * (b.top ? 0.4 : 0.46), ny = cy + S * (b.top ? 0.07 : 0.02);
  g.font = FONT(px);
  g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = S * 0.02; g.shadowOffsetY = S * 0.01;
  g.fillStyle = b.ink; g.fillText(b.main, cx, ny); g.restore();
  g.save(); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillText(b.main, cx - S * 0.004, ny - S * 0.005); g.restore();
  g.fillStyle = b.ink; g.fillText(b.main, cx, ny);
  // stitch texture inside the number
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = S; const tg = tmp.getContext('2d')!;
  tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.font = FONT(px); tg.fillStyle = '#fff'; tg.fillText(b.main, cx, ny);
  tg.globalCompositeOperation = 'source-in'; tg.beginPath(); tg.rect(0, 0, S, S); satin(tg, S, -0.6, 0.2);
  g.drawImage(tmp, 0, 0);
}

/* Height map for the badge: border, stitching and lettering stand proud of the backing so light catches them. */
export function drawBadgeBump(g: G, S: number, b: Badge) {
  const cx = S / 2, cy = S / 2;
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, S, S);
  g.filter = `blur(${(S / 600).toFixed(1)}px)`;
  g.beginPath(); g.arc(cx, cy, S * 0.47, 0, 7); g.arc(cx, cy, S * 0.405, 0, 7, true); g.fillStyle = '#e8e8e8'; g.fill('evenodd');
  g.setLineDash([S * 0.012, S * 0.009]); g.lineWidth = S * 0.0045; g.strokeStyle = '#cfcfcf';
  g.beginPath(); g.arc(cx, cy, S * 0.375, 0, 7); g.stroke(); g.setLineDash([]);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2f2f2';
  if (b.top) arcText(g, b.top.toUpperCase(), cx, cy, S * 0.3, S * 0.085);
  g.font = FONT(S * (b.top ? 0.4 : 0.46)); g.fillText(b.main, cx, cy + S * (b.top ? 0.07 : 0.02));
  g.filter = 'none';
}

/* badge colours for a football legend */
export function kitBadge(kit: Kit): Badge {
  const darkInk = kit.ink === '#F4F4F2' || kit.ink === '#E9C46A' ? kit.hex : kit.ink;
  return { bg: '#F1ECE2', ring: kit.pattern === 'stripes' ? kit.hex : kit.hex2 === '#F7F7F2' || kit.hex2 === '#F5F5F2' ? kit.hex : kit.hex2, ink: darkInk, top: kit.name, main: String(kit.num) };
}

/* ---------- money print: banknotes scattered and overlapping, wrapping seamlessly ---------- */
export function scatterBills(g: G, w: number, h: number, base: string, draw: (g: G, x: number, y: number, bw: number, bh: number) => void) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const bw = w * 0.3, bh = bw * 0.43;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h, rot = (rnd() - 0.5) * 1.1;
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      if (x + dx < -bw || x + dx > w + bw || y + dy < -bw || y + dy > h + bw) continue;
      g.save(); g.translate(x + dx, y + dy); g.rotate(rot);
      g.shadowColor = 'rgba(0,0,0,0.38)'; g.shadowBlur = w * 0.01; g.shadowOffsetY = w * 0.004;
      draw(g, -bw / 2, -bh / 2, bw, bh);
      g.restore();
    }
  }
}

/* Decal for the front of the beanbag.
   'kitpatch': a round cream patch with a coloured ring, the name and the number.
   'kitprint': the name and number printed straight onto the fabric (transparent background). */
export function drawKitDecal(g: G, S: number, kind: 'kitpatch' | 'kitprint', kit: Kit) {
  const name = kit.name.toUpperCase(), num = String(kit.num);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'kitpatch') {
    drawBadge(g, S, kitBadge(kit));
  } else {
    g.clearRect(0, 0, S, S);
    g.lineJoin = 'round';
    g.font = FONT(S * 0.13); fitText(g, name, S * 0.8, S * 0.13);
    g.lineWidth = S * 0.012; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeText(name, S / 2, S * 0.2);
    g.fillStyle = kit.ink; g.fillText(name, S / 2, S * 0.2);
    g.font = FONT(S * 0.6);
    g.lineWidth = S * 0.018; g.strokeText(num, S / 2, S * 0.58);
    g.fillText(num, S / 2, S * 0.58);
    // let the corduroy ribs show through the print
    g.globalCompositeOperation = 'destination-out';
    const pitch = S / 18;
    for (let i = 0; i < 18; i++) {
      const gr = g.createLinearGradient(i * pitch, 0, (i + 1) * pitch, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gr; g.fillRect(i * pitch, 0, pitch, S);
    }
    g.globalCompositeOperation = 'source-over';
  }
}

/* shrink the font until the text fits the width */
function fitText(g: G, text: string, maxW: number, px: number) {
  let size = px;
  while (g.measureText(text).width > maxW && size > 8) { size *= 0.94; g.font = FONT(size); }
}

/* Texture for the small floating balls: kit colours with the number in two white circles. */
export function drawKitBall(g: G, w: number, h: number, kit: Kit) {
  drawKitFabric(g, w, h, kit);
  [w * 0.25, w * 0.75].forEach((cx) => {
    g.fillStyle = '#F7F6F2'; g.beginPath(); g.arc(cx, h / 2, h * 0.25, 0, 7); g.fill();
    g.fillStyle = kit.ink === '#F4F4F2' || kit.ink === '#E9C46A' ? kit.hex : kit.ink;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = FONT(h * 0.3); g.fillText(String(kit.num), cx, h / 2 + h * 0.02);
  });
}

/* Round chip icon used in the pickers. */
export function kitIconURL(kit: Kit, S = 72) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.clip();
  drawKitFabric(g, S * 2, S, kit);
  g.fillStyle = '#F7F6F2'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.26, 0, 7); g.fill();
  g.fillStyle = kit.ink === '#F4F4F2' || kit.ink === '#E9C46A' ? kit.hex : kit.ink;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = FONT(S * 0.28); g.fillText(String(kit.num), S / 2, S * 0.53);
  const hl = g.createRadialGradient(S * 0.32, S * 0.28, 1, S * 0.5, S * 0.5, S * 0.6);
  hl.addColorStop(0, 'rgba(255,255,255,0.4)'); hl.addColorStop(0.4, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = hl; g.fillRect(0, 0, S, S);
  g.restore();
  return c.toDataURL('image/png');
}
