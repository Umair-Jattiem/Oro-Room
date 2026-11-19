/* eslint-disable */
// @ts-nocheck
/*
 * 3D engine for the interactive bedroom: the room scene, the beanbag in it, panel icons and 4K studio renders.
 * Extracted from "The Room Preview" prototype. Browser-only: import it dynamically from a client component.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/* Final film grade: ACES tone mapping, a gentle warm-shadow grade, slight desaturation, vignette and fine grain. */
var GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, exposure: { value: 0.96 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float time; uniform float exposure; varying vec2 vUv;',
    'vec3 rrt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
    'vec3 aces(vec3 c) {',
    '  const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);',
    '  const mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);',
    '  c *= exposure / 0.6; c = o * rrt(i * c); return clamp(c, 0.0, 1.0);',
    '}',
    'vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main() {',
    '  vec3 c = aces(texture2D(tDiffuse, vUv).rgb);',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(l), c, 0.9);',                                   // a touch less saturated, more photographic
    '  c += vec3(0.028, 0.014, 0.0) * (1.0 - l) * (1.0 - l);',        // warm the shadows
    '  c = mix(c, c * vec3(0.97, 0.99, 1.03), smoothstep(0.55, 1.0, l));', // keep highlights clean
    '  vec2 d = (vUv - 0.5) * vec2(1.0, 0.85);',
    '  c *= mix(0.58, 1.0, smoothstep(0.82, 0.22, length(d)));',      // vignette
    '  c = toSRGB(c);',
    '  c += (hash(vUv * vec2(1931.0, 1087.0) + fract(time)) - 0.5) * 0.03;', // grain
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n'),
};
import { kitById } from '../shared/kits';
import { drawBadge, drawBadgeBump, kitBadge, scatterBills } from '../shared/kit-art';
import { drawKitFabric, drawKitDecal, kitIconURL } from '../shared/kit-art';
import { bagPoint, smoothstep } from '../shared/beanbag-shape';

var T = THREE;
var reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

function webglOK() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
var small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
var TEX_W = small ? 1024 : 2048, TEX_H = small ? 512 : 1024, WALES = 96;
function rgbOf(hex) { var c = parseInt(hex.slice(1), 16); return [c >> 16 & 255, c >> 8 & 255, c & 255]; }
function shade(hex, f) {
    var c = rgbOf(hex);
    function m(v) { return Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))); }
    return 'rgb(' + m(c[0]) + ',' + m(c[1]) + ',' + m(c[2]) + ')';
  }
function rand(a, b) { return a + Math.random() * (b - a); }
function drawWales(g, x0, y0, w, h, count) {
    var p = w / count;
    for (var i = 0; i < count; i++) {
      var x = x0 + i * p, gr = g.createLinearGradient(x, 0, x + p, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(0.16, 'rgba(0,0,0,0.07)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.84, 'rgba(0,0,0,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gr; g.fillRect(x, y0, p + 0.6, h);
    }
  }
function drawWaleBump(g, x0, y0, w, h, count) {
    var p = w / count;
    for (var i = 0; i < count; i++) {
      var x = x0 + i * p, gr = g.createLinearGradient(x, 0, x + p, 0);
      gr.addColorStop(0, '#000'); gr.addColorStop(0.2, '#6d6d6d'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(0.8, '#6d6d6d'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(x, y0, p + 0.6, h);
    }
  }
function addNap(g, w, h, amount, hairs) {
    var id = g.getImageData(0, 0, w, h), d = id.data;
    for (var k = 0; k < d.length; k += 4) { var n = (Math.random() - 0.5) * amount; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
    g.putImageData(id, 0, 0);
    g.lineWidth = 1;
    for (var i = 0; i < hairs; i++) {
      var x = Math.random() * w, y = Math.random() * h, l = rand(5, 14);
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y + l); g.stroke();
    }
  }
var fabricCache = {}, matCache = {};
var plainMats = {};
function plainMat(hex, rough) { var k = hex + rough; return plainMats[k] || (plainMats[k] = new T.MeshStandardMaterial({ color: hex, roughness: rough })); }
function darkenHex(hex, f) { var c = parseInt(hex.slice(1), 16); function q(v) { v = Math.max(0, Math.min(255, Math.round(v * f))); return ('0' + v.toString(16)).slice(-2); } return '#' + q(c >> 16 & 255) + q(c >> 8 & 255) + q(c & 255); }
function curInfo(cur) { if (typeof CURRENCIES !== 'undefined' && cur) for (var i = 0; i < CURRENCIES.length; i++) if (CURRENCIES[i].id === cur) return CURRENCIES[i]; return { sym: '$', paper: '#EFEACF', ink: '#3F6E4B' }; }
function drawBill(g, x, y, w, h, cur) {
    var CI = curInfo(cur);
    function rr(a, b, c, d, r) { g.beginPath(); g.moveTo(a + r, b); g.arcTo(a + c, b, a + c, b + d, r); g.arcTo(a + c, b + d, a, b + d, r); g.arcTo(a, b + d, a, b, r); g.arcTo(a, b, a + c, b, r); g.closePath(); }
    var dk = CI.ink, gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, CI.paper); gr.addColorStop(1, darkenHex(CI.paper, 0.9));
    rr(x, y, w, h, h * 0.05); g.fillStyle = gr; g.fill();
    g.strokeStyle = dk; g.lineWidth = h * 0.035; rr(x + h * 0.05, y + h * 0.05, w - h * 0.1, h - h * 0.1, h * 0.03); g.stroke();
    g.lineWidth = h * 0.01; rr(x + h * 0.11, y + h * 0.11, w - h * 0.22, h - h * 0.22, h * 0.02); g.stroke();
    g.lineWidth = h * 0.006;
    for (var i = 0; i < 18; i++) { var yy = y + h * 0.2 + i * h * 0.034; g.beginPath(); g.moveTo(x + h * 0.2, yy); g.lineTo(x + w * 0.27, yy); g.moveTo(x + w * 0.73, yy); g.lineTo(x + w - h * 0.2, yy); g.stroke(); }
    [0.12, 0.88].forEach(function (f) {
      var cx = x + w * f, cy = y + h * 0.5;
      g.lineWidth = h * 0.012; [0.22, 0.18, 0.14].forEach(function (r) { g.beginPath(); g.arc(cx, cy, h * r, 0, 7); g.stroke(); });
      g.fillStyle = dk; g.beginPath(); g.arc(cx, cy, h * 0.12, 0, 7); g.fill();
      g.fillStyle = CI.paper; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 ' + (h * 0.17) + 'px Manrope, Arial, sans-serif'; g.fillText(CI.sym, cx, cy + h * 0.01);
    });
    var cx = x + w / 2, cy = y + h / 2;
    g.fillStyle = darkenHex(CI.paper, 0.86); g.beginPath(); g.ellipse(cx, cy, h * 0.3, h * 0.37, 0, 0, 7); g.fill(); g.lineWidth = h * 0.02; g.stroke();
    g.save(); g.beginPath(); g.ellipse(cx, cy, h * 0.3, h * 0.37, 0, 0, 7); g.clip();
    g.fillStyle = dk; g.beginPath(); g.arc(cx, cy - h * 0.08, h * 0.1, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx - h * 0.25, cy + h * 0.4); g.quadraticCurveTo(cx, cy - h * 0.03, cx + h * 0.25, cy + h * 0.4); g.closePath(); g.fill();
    g.restore();
  }
function ringText(g, phrase, cx, cy, r, size, color) {
    var circ = Math.PI * 2 * r, n = Math.max(1, Math.round(circ / (size * 0.8 * phrase.length))), txt = '', i;
    for (i = 0; i < n; i++) txt += phrase;
    var step = Math.PI * 2 / txt.length;
    g.save(); g.fillStyle = color; g.font = '800 ' + size + 'px Manrope, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (i = 0; i < txt.length; i++) { var a = -Math.PI / 2 + i * step; g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillText(txt.charAt(i), 0, 0); g.restore(); }
    g.restore();
  }
function heartPath(g, cx, cy, s) {
    g.beginPath(); g.moveTo(cx, cy + s * 0.9);
    g.bezierCurveTo(cx - s * 1.5, cy + s * 0.1, cx - s * 1.1, cy - s * 1.0, cx, cy - s * 0.35);
    g.bezierCurveTo(cx + s * 1.1, cy - s * 1.0, cx + s * 1.5, cy + s * 0.1, cx, cy + s * 0.9); g.closePath();
  }
function sparkPath(g, cx, cy, r) {
    g.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.28 : r; if (i) g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); else g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
    g.closePath();
  }
var decalCache = {};
function decalTex(full) {
    if (decalCache[full]) return decalCache[full];
    var parts = String(full).split(':'), kind = parts[0], arg = parts[1], S = 2048, t;
    var num = arg || '8', sym = arg || '$';
    if (kind === 'kitpatch' || kind === 'kitprint') {
      t = canvasTex(S, S, function (g) { drawKitDecal(g, S, kind, kitById(arg)); });
    } else if (kind === 'circle') {
      t = canvasTex(S, S, function (g) { drawBadge(g, S, badgeFor(full)); });
    } else if (kind === 'circle-flat') { // the original flat pool-ball patch, kept for reference
      t = canvasTex(S, S, function (g) {
        g.fillStyle = '#F7F6F2'; g.fillRect(0, 0, S, S);
        for (var i = 0; i < 6000; i++) { g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(Math.random() * S, Math.random() * S, rand(10, 40), 1.5); }
        g.setLineDash([S * 0.016, S * 0.012]); g.strokeStyle = '#BDBAB2'; g.lineWidth = S * 0.005; g.beginPath(); g.arc(S / 2, S / 2, S * 0.455, 0, 7); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#121212'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '800 ' + (S * 0.64) + 'px Manrope, "Arial Black", Arial, sans-serif'; g.fillText(num, S / 2, S * 0.53);
      });
    } else if (kind === 'print') {
      t = canvasTex(S, S, function (g) {
        g.clearRect(0, 0, S, S);
        g.fillStyle = num === '1' ? '#1A1717' : '#F4F2EE'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '800 ' + (S * 0.72) + 'px Manrope, "Arial Black", Arial, sans-serif'; g.fillText(num, S / 2, S * 0.53);
        g.globalCompositeOperation = 'destination-out';
        var pitch = S / 16;
        for (var i = 0; i < 16; i++) { var gr = g.createLinearGradient(i * pitch, 0, (i + 1) * pitch, 0); gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = gr; g.fillRect(i * pitch, 0, pitch, S); }
        g.globalCompositeOperation = 'source-over';
      });
    } else if (kind === 'bagsign') {
      t = canvasTex(S, S, function (g) {
        g.fillStyle = '#F2E6C4'; g.fillRect(0, 0, S, S);
        for (var i = 0; i < 2000; i++) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(Math.random() * S, Math.random() * S, rand(8, 30), 1); }
        g.setLineDash([16, 12]); g.strokeStyle = '#B9A87A'; g.lineWidth = 5; g.beginPath(); g.arc(S / 2, S / 2, S * 0.455, 0, 7); g.stroke(); g.setLineDash([]);
        var cx = S / 2, cy = S * 0.55;
        g.fillStyle = '#141414';
        g.beginPath(); g.moveTo(cx - S * 0.08, cy - S * 0.2);
        g.bezierCurveTo(cx - S * 0.12, cy - S * 0.1, cx - S * 0.3, cy - S * 0.02, cx - S * 0.3, cy + S * 0.14);
        g.bezierCurveTo(cx - S * 0.3, cy + S * 0.3, cx - S * 0.15, cy + S * 0.34, cx, cy + S * 0.34);
        g.bezierCurveTo(cx + S * 0.15, cy + S * 0.34, cx + S * 0.3, cy + S * 0.3, cx + S * 0.3, cy + S * 0.14);
        g.bezierCurveTo(cx + S * 0.3, cy - S * 0.02, cx + S * 0.12, cy - S * 0.1, cx + S * 0.08, cy - S * 0.2);
        g.closePath(); g.fill();
        g.beginPath(); g.moveTo(cx - S * 0.1, cy - S * 0.2); g.quadraticCurveTo(cx - S * 0.21, cy - S * 0.33, cx - S * 0.12, cy - S * 0.31);
        g.quadraticCurveTo(cx, cy - S * 0.22, cx + S * 0.12, cy - S * 0.31); g.quadraticCurveTo(cx + S * 0.21, cy - S * 0.33, cx + S * 0.1, cy - S * 0.2); g.closePath(); g.fill();
        g.fillStyle = '#F2E6C4'; g.fillRect(cx - S * 0.095, cy - S * 0.215, S * 0.19, S * 0.022);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 ' + (S * 0.3) + 'px Manrope, "Arial Black", Arial, sans-serif'; g.fillText(sym, cx, cy + S * 0.14);
      });
    }
    return (decalCache[full] = t);
  }
function capGeometry(R, angle) {
    var geo = new T.SphereGeometry(R, 96, 24, 0, Math.PI * 2, 0, angle);
    var pos = geo.attributes.position, uv = geo.attributes.uv, rr = R * Math.sin(angle);
    for (var i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * rr), 0.5 - pos.getZ(i) / (2 * rr));
    uv.needsUpdate = true; return geo;
  }
function shadowify(m) { m.castShadow = true; m.receiveShadow = true; return m; }
var clipPlane = T ? new T.Plane(new T.Vector3(0, 1, 0), 0) : null, clipCache = {};
function dollarMat(fabric, cur) {
    var cord = fabric === 'corduroy', CI = curInfo(cur);
    var map = canvasTex(2048, 1024, function (g, w, h) {
      scatterBills(g, w, h, darkenHex(CI.paper, 0.62), function (g2, x, y, bw, bh) { drawBill(g2, x, y, bw, bh, cur); });
      if (cord) { g.save(); g.globalAlpha = 0.5; drawWales(g, 0, 0, w, h, 48); g.restore(); }
      addNap(g, w, h, cord ? 6 : 10, 0);
    });
    map.wrapS = map.wrapT = T.RepeatWrapping; map.repeat.set(2, 2);
    return new T.MeshPhysicalMaterial({ map: map, roughness: cord ? 0.95 : 0.88, metalness: 0, sheen: 0.25, sheenRoughness: 0.7, sheenColor: new T.Color(CI.paper) });
  }
function domeMat(s) {
    var dollar = s.patch === 'dollar', k = (dollar ? '$' + (s.cur || 'USD') : s.hex) + s.fabric;
    if (!clipCache[k]) { var m = (dollar ? dollarMat(s.fabric, s.cur) : fabricMat(s.hex, s.fabric)).clone(); m.clippingPlanes = [clipPlane]; m.clipShadows = true; clipCache[k] = m; }
    return clipCache[k];
  }
function drawPlainCrest(g, S, hex) {
    g.fillStyle = hex; g.fillRect(0, 0, S, S);
    var cx = S / 2, cy = S / 2, col = '#EADFC8';
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = S * 0.02; g.beginPath(); g.arc(cx, cy, S * 0.43, 0, 7); g.stroke();
    g.lineWidth = S * 0.045;
    for (var k = 0; k < 3; k++) { var y = cy - S * 0.1 + k * S * 0.105; g.beginPath(); g.moveTo(cx - S * 0.18, y + S * 0.075); g.lineTo(cx, y - S * 0.02); g.lineTo(cx + S * 0.18, y + S * 0.075); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 ' + (S * 0.04) + 'px Manrope, Arial, sans-serif'; g.fillText('YOUR EMBLEM HERE', cx, cy + S * 0.3);
  }
function drawGameCrest(g, S) {
    var cx = S / 2, cy = S / 2;
    var rim = g.createRadialGradient(cx, cy, S * 0.44, cx, cy, S * 0.5); rim.addColorStop(0, '#c9428a'); rim.addColorStop(1, '#ea64a8');
    g.fillStyle = rim; g.fillRect(0, 0, S, S);
    g.fillStyle = '#140b1f'; g.beginPath(); g.arc(cx, cy, S * 0.462, 0, 7); g.fill();
    ringText(g, 'PLAYER ONE • ', cx, cy, S * 0.418, S * 0.05, '#cbb8f2');
    g.strokeStyle = '#e2589f'; g.lineWidth = S * 0.011; g.beginPath(); g.arc(cx, cy, S * 0.372, 0, 7); g.stroke();

    g.save(); g.beginPath(); g.arc(cx, cy, S * 0.365, 0, 7); g.clip();
    var yh = cy + S * 0.06;
    var sky = g.createLinearGradient(0, cy - S * 0.37, 0, yh);
    sky.addColorStop(0, '#24104f'); sky.addColorStop(0.45, '#6a2490'); sky.addColorStop(0.82, '#e05a9b'); sky.addColorStop(1, '#ffad8c');
    g.fillStyle = sky; g.fillRect(0, 0, S, yh);
    var sy = yh - S * 0.025, sr = S * 0.15;
    var sg = g.createLinearGradient(0, sy - sr, 0, sy + sr * 0.3); sg.addColorStop(0, '#fff0b0'); sg.addColorStop(0.55, '#ffbd7c'); sg.addColorStop(1, '#ff7aa0');
    g.fillStyle = sg; g.beginPath(); g.arc(cx, sy, sr, 0, 7); g.fill();
    g.fillStyle = '#c94585';
    for (var i = 0; i < 5; i++) g.fillRect(cx - sr, sy - sr * 0.28 + i * sr * 0.17, sr * 2, sr * (0.03 + i * 0.022));
    var gd = g.createLinearGradient(0, yh, 0, cy + S * 0.37); gd.addColorStop(0, '#2a0f52'); gd.addColorStop(1, '#0c0520');
    g.fillStyle = gd; g.fillRect(0, yh, S, S);
    g.strokeStyle = 'rgba(190,96,255,0.85)'; g.lineWidth = S * 0.0035;
    for (var j = 1; j <= 8; j++) { var yy = yh + S * 0.32 * Math.pow(j / 8, 1.9); g.beginPath(); g.moveTo(0, yy); g.lineTo(S, yy); g.stroke(); }
    for (var k = -10; k <= 10; k++) { g.beginPath(); g.moveTo(cx + k * S * 0.012, yh); g.lineTo(cx + k * S * 0.12, yh + S * 0.34); g.stroke(); }
    var hz = g.createLinearGradient(0, yh - S * 0.01, 0, yh + S * 0.02); hz.addColorStop(0, 'rgba(255,170,210,0)'); hz.addColorStop(0.4, 'rgba(255,170,210,0.9)'); hz.addColorStop(1, 'rgba(255,170,210,0)');
    g.fillStyle = hz; g.fillRect(0, yh - S * 0.01, S, S * 0.03);
    function palm(x0, y0, lean, sc) {
      var tx = x0 + lean * S * 0.06 * sc, ty = y0 - S * 0.27 * sc;
      g.strokeStyle = '#08030f'; g.fillStyle = '#08030f'; g.lineCap = 'round';
      g.lineWidth = S * 0.012 * sc; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + lean * S * 0.09 * sc, y0 - S * 0.13 * sc, tx, ty); g.stroke();
      [-172, -146, -118, -90, -62, -34, -8].forEach(function (deg) {
        var a = deg * Math.PI / 180, len = S * 0.115 * sc, droop = len * 0.5 * Math.abs(Math.cos(a));
        var ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.45 + droop;
        var mx = tx + Math.cos(a) * len * 0.55, my = ty + Math.sin(a) * len * 0.6 - len * 0.12;
        g.beginPath(); g.moveTo(tx, ty);
        g.quadraticCurveTo(mx, my - S * 0.014 * sc, ex, ey);
        g.quadraticCurveTo(mx, my + S * 0.012 * sc, tx, ty); g.fill();
      });
      g.beginPath(); g.arc(tx, ty, S * 0.01 * sc, 0, 7); g.fill();
    }
    palm(cx - S * 0.21, yh + S * 0.03, 1, 1); palm(cx + S * 0.22, yh + S * 0.035, -1, 0.9);
    g.restore();

    var fs = S * 0.085, txt = 'GAME ON';
    g.font = 'italic 900 ' + fs + 'px Manrope, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    var tw = g.measureText(txt).width, ty2 = cy + S * 0.245;
    var lg = g.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.55, '#ffd2ec'); lg.addColorStop(0.75, '#ff6fb5'); lg.addColorStop(1, '#8f6bff');
    g.lineJoin = 'round'; g.strokeStyle = '#12061f'; g.lineWidth = S * 0.014; g.strokeText(txt, cx, ty2);
    g.fillStyle = lg; g.fillText(txt, cx, ty2);
  }
function drawGirlCrest(g, S) {
    var cx = S / 2, cy = S / 2, i;
    var rim = g.createRadialGradient(cx, cy, S * 0.42, cx, cy, S * 0.52); rim.addColorStop(0, '#f77fb6'); rim.addColorStop(1, '#ff9cc8');
    g.fillStyle = rim; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffe4f0'; g.beginPath(); g.arc(cx, cy, S * 0.425, 0, 7); g.fill();
    for (i = 0; i < 22; i++) { var a = i / 22 * Math.PI * 2; g.fillStyle = i % 2 ? '#ff8fc0' : '#ff4f9a'; heartPath(g, cx + Math.cos(a) * S * 0.39, cy + Math.sin(a) * S * 0.39, S * 0.019); g.fill(); }
    var inner = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.355); inner.addColorStop(0, '#fff3f8'); inner.addColorStop(1, '#ffc6de');
    g.fillStyle = inner; g.beginPath(); g.arc(cx, cy, S * 0.355, 0, 7); g.fill();
    g.setLineDash([S * 0.018, S * 0.012]); g.strokeStyle = '#ffffff'; g.lineWidth = S * 0.007; g.beginPath(); g.arc(cx, cy, S * 0.352, 0, 7); g.stroke(); g.setLineDash([]);
    ringText(g, 'MAIN CHARACTER ENERGY • ', cx, cy, S * 0.3, S * 0.04, '#b0145e');
    g.save(); g.shadowColor = 'rgba(160,0,70,0.3)'; g.shadowBlur = S * 0.02; g.shadowOffsetY = S * 0.006;
    var hg = g.createLinearGradient(0, cy - S * 0.15, 0, cy + S * 0.15); hg.addColorStop(0, '#ff6aa8'); hg.addColorStop(1, '#dd166c');
    g.fillStyle = hg; heartPath(g, cx, cy - S * 0.01, S * 0.14); g.fill(); g.restore();
    g.strokeStyle = '#ffffff'; g.lineWidth = S * 0.011; heartPath(g, cx, cy - S * 0.01, S * 0.14); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(cx - S * 0.075, cy - S * 0.085, S * 0.026, S * 0.013, -0.7, 0, 7); g.fill();
    [[-0.2, -0.13, 0.042], [0.2, -0.06, 0.034], [0.15, 0.15, 0.042], [-0.17, 0.13, 0.03]].forEach(function (p) {
      g.fillStyle = '#ffffff'; g.strokeStyle = '#f2b84b'; g.lineWidth = S * 0.005; sparkPath(g, cx + p[0] * S, cy + p[1] * S, p[2] * S); g.fill(); g.stroke();
    });
  }
var pileBumpTex = null;
function pileBump() {
    if (pileBumpTex) return pileBumpTex;
    pileBumpTex = canvasTex(1024, 1024, function (g, w, h) {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      var id = g.getImageData(0, 0, w, h), d = id.data;
      for (var k = 0; k < d.length; k += 4) { var n = 128 + (Math.random() - 0.5) * 140; d[k] = d[k + 1] = d[k + 2] = n; }
      g.putImageData(id, 0, 0);
      g.lineWidth = 1;
      for (var i = 0; i < 14000; i++) { var x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6.28, l = rand(2, 5); g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    }, false);
    return pileBumpTex;
  }
var bindCache = {};
function bindingMat(hex) {
    if (bindCache[hex]) return bindCache[hex];
    var map = canvasTex(512, 64, function (g, w, h) {
      g.fillStyle = hex; g.fillRect(0, 0, w, h);
      var id = g.getImageData(0, 0, w, h), d = id.data;
      for (var k = 0; k < d.length; k += 4) { var n = (Math.random() - 0.5) * 30; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
      g.putImageData(id, 0, 0);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
      for (var x = 0; x < w; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, h); g.stroke(); }
    });
    map.wrapS = T.RepeatWrapping; map.repeat.set(24, 1);
    return (bindCache[hex] = new T.MeshStandardMaterial({ map: map, roughness: 1, side: T.DoubleSide }));
  }
function crestTexture(s) {
    var S = small ? 1024 : 2048;
    return canvasTex(S, S, function (g) {
      var tmp = document.createElement('canvas'); tmp.width = tmp.height = S; var tg = tmp.getContext('2d');
      if (s.patch === 'game') drawGameCrest(tg, S); else if (s.patch === 'girl') drawGirlCrest(tg, S); else drawPlainCrest(tg, S, s.hex);
      try { g.filter = 'blur(' + (S / 1100).toFixed(2) + 'px)'; } catch (e) {}
      g.drawImage(tmp, 0, 0);
      try { g.filter = 'none'; } catch (e) {}
      addPile(g, S);
    });
  }
function buildMat(s) {
    var g = new T.Group(), R = 1.5, h = 0.036;
    if (s.patch === 'girl') {
      var pts = [], i;
      for (i = 0; i < 720; i++) { var a = i / 720 * Math.PI * 2, r = R * (0.9 + 0.1 * Math.abs(Math.cos(8 * a))); pts.push(new T.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
      var bs = 0.014, geo = new T.ExtrudeGeometry(new T.Shape(pts), { depth: h - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: bs, bevelSegments: 3, steps: 1 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, 0.008, 0);
      var tex = crestTexture(s), Rt = R + bs; tex.repeat.set(1 / (2 * Rt), 1 / (2 * Rt)); tex.offset.set(0.5, 0.5);
      var mesh = new T.Mesh(geo, [rugTop(tex), bindingMat('#f27fb3')]); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    } else {
      var edgeHex = s.patch === 'game' ? '#d9549b' : s.hex;
      var prof = [[R - 0.03, 0], [R - 0.008, 0.004], [R, 0.018], [R - 0.008, h - 0.004], [R - 0.03, h]].map(function (p) { return new T.Vector2(p[0], p[1]); });
      var edge = new T.Mesh(new T.LatheGeometry(prof, 160), bindingMat(edgeHex)); edge.castShadow = true; edge.receiveShadow = true; g.add(edge);
      var bottom = new T.Mesh(new T.CircleGeometry(R - 0.028, 96), plainMat('#1a1418', 1)); bottom.rotation.x = Math.PI / 2; bottom.position.y = 0.001; g.add(bottom);
      var top = new T.Mesh(new T.CircleGeometry(R - 0.026, 160), rugTop(crestTexture(s)));
      top.rotation.x = -Math.PI / 2; top.position.y = h - 0.001; top.castShadow = true; top.receiveShadow = true; g.add(top);
    }
    g.userData.foot = 4.4; return g;
  }
function buildModel(s) {
    if (s.kind === 'money') return buildMoney(s);
    if (s.kind === 'chair') return buildChair(s);
    if (s.kind === 'mat') return buildMat(s);
    return buildDome(s);
  }
function disposeGroup(g) { g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
function blobTex() { return canvasTex(256, 256, function (g, w, h) { var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,0.62)'); r.addColorStop(0.55, 'rgba(0,0,0,0.26)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, false); }
function dotTex() { return canvasTex(64, 64, function (g, w, h) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,240,210,1)'); r.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, false); }
function glowTex() {
    return canvasTex(128, 256, function (g, w, h) {
      var a = g.createLinearGradient(0, 0, w, 0); a.addColorStop(0, 'rgba(255,214,160,0)'); a.addColorStop(0.5, 'rgba(255,226,178,0.95)'); a.addColorStop(1, 'rgba(255,214,160,0)');
      g.fillStyle = a; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      var b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, 'rgba(0,0,0,1)'); b.addColorStop(0.7, 'rgba(0,0,0,0.8)'); b.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = b; g.fillRect(0, 0, w, h);
    }, false);
  }
function plankTex() {
    var t = canvasTex(1024, 1024, function (g, w, h) {
      var rows = 8, rh = h / rows;
      for (var r = 0; r < rows; r++) {
        g.fillStyle = 'hsl(' + rand(20, 27) + ',' + rand(38, 48) + '%,' + rand(26, 33) + '%)'; g.fillRect(0, r * rh, w, rh);
        for (var i = 0; i < 70; i++) { g.fillStyle = 'rgba(40,15,5,' + rand(0.03, 0.1) + ')'; g.fillRect(rand(0, w), r * rh + rand(0, rh), rand(60, 340), 1.5); }
        g.fillStyle = 'rgba(30,10,4,0.55)'; g.fillRect(0, r * rh, w, 3);
        g.fillRect(rand(0, w), r * rh, 3, rh);
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(5, 4); return t;
  }
function wallTex() {
    return canvasTex(8, 512, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#EDB296'); gr.addColorStop(0.55, '#F3C6B0'); gr.addColorStop(1, '#F7D7C9'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  }
var swatchCache = {};
function swatchURL(hex, fabric, w, h) {
    var key = hex + fabric + w; if (swatchCache[key]) return swatchCache[key];
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'), lum = lumOf(hex);
    g.fillStyle = hex; g.fillRect(0, 0, w, h); mottle(g, w, h, fabric === 'corduroy' ? 0.04 : 0.07, 18);
    if (fabric === 'corduroy') drawRibs(g, w, h, Math.round(w / 5), lum);
    addNap(g, w, h, 6 + 16 * lum, Math.round(w * h / 50));
    var lg = g.createLinearGradient(0, 0, w, h); lg.addColorStop(0, 'rgba(255,255,255,0.14)'); lg.addColorStop(0.55, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.22)'); g.fillStyle = lg; g.fillRect(0, 0, w, h);
    return (swatchCache[key] = c.toDataURL('image/jpeg', 0.86));
  }
function oakTex() {
    var W = small ? 1024 : 2048, planks = 6, pw = W / planks;
    var map = canvasTex(W, W, function (g) {
      for (var p = 0; p < planks; p++) {
        var x = p * pw, y = -rand(0, W * 0.8);
        while (y < W) {
          var len = rand(0.9, 1.7) * W;
          g.fillStyle = 'hsl(' + rand(29, 33).toFixed(1) + ',' + rand(24, 30).toFixed(1) + '%,' + rand(58, 64).toFixed(1) + '%)'; g.fillRect(x, y, pw, len);
          for (var k = 0; k < 26; k++) {
            var gx = x + rand(2, pw - 2), wob = rand(2, 7), ph = rand(0, 6);
            g.strokeStyle = 'rgba(95,60,30,' + rand(0.03, 0.09).toFixed(3) + ')'; g.lineWidth = rand(0.6, 1.8);
            g.beginPath(); g.moveTo(gx, y);
            for (var t = 0; t <= 1.0001; t += 0.05) g.lineTo(gx + Math.sin(t * 7 + ph) * wob, y + t * len);
            g.stroke();
          }
          if (Math.random() < 0.12) { var kx = x + rand(10, pw - 10), ky = y + rand(0.2, 0.8) * len; for (var r = 1; r < 5; r++) { g.strokeStyle = 'rgba(70,40,15,' + (0.25 - r * 0.04) + ')'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(kx, ky, r * 2.2, r * 6, 0, 0, 7); g.stroke(); } }
          g.fillStyle = 'rgba(40,24,10,0.6)'; g.fillRect(x, y, pw, 2);
          y += len;
        }
        g.fillStyle = 'rgba(35,20,8,0.7)'; g.fillRect(x, 0, 2.5, W);
      }
      mottle(g, W, W, 0.03, 160); addNap(g, W, W, 7, 0);
    });
    map.wrapS = map.wrapT = T.RepeatWrapping; map.repeat.set(2.6, 3.4);
    var bump = new T.CanvasTexture(map.image); bump.wrapS = bump.wrapT = T.RepeatWrapping; bump.repeat.copy(map.repeat); bump.anisotropy = 8;
    return { map: map, bump: bump };
  }
function plasterTex(hex) {
    var t = canvasTex(1024, 1024, function (g, w, h) { g.fillStyle = hex; g.fillRect(0, 0, w, h); mottle(g, w, h, 0.025, 260); addNap(g, w, h, 5, 0); });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 1); return t;
  }
function walnutTex() {
    var t = canvasTex(1024, 1024, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#5a3a26'); gr.addColorStop(0.5, '#62412b'); gr.addColorStop(1, '#553522'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 260; k++) { var x = rand(0, w), wob = rand(2, 10), ph = rand(0, 6); g.strokeStyle = 'rgba(30,16,8,' + rand(0.05, 0.22).toFixed(3) + ')'; g.lineWidth = rand(0.6, 2.4); g.beginPath(); g.moveTo(x, 0); for (var t2 = 0; t2 <= 1.0001; t2 += 0.04) g.lineTo(x + Math.sin(t2 * 6 + ph) * wob, t2 * h); g.stroke(); }
      mottle(g, w, h, 0.04, 80); addNap(g, w, h, 6, 0);
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }
function skyTex() {
    return canvasTex(2048, 1024, function (g, w, h) {
      var sk = g.createLinearGradient(0, 0, 0, h * 0.74);
      sk.addColorStop(0, '#0a0f24'); sk.addColorStop(0.38, '#272344'); sk.addColorStop(0.66, '#7c4234'); sk.addColorStop(0.88, '#cf6f38'); sk.addColorStop(1, '#ef9a52');
      g.fillStyle = sk; g.fillRect(0, 0, w, h);
      var sx = w * 0.16, sy = h * 0.7, glow = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.32);
      glow.addColorStop(0, 'rgba(255,240,205,1)'); glow.addColorStop(0.06, 'rgba(255,226,170,0.95)'); glow.addColorStop(0.25, 'rgba(255,190,130,0.4)'); glow.addColorStop(1, 'rgba(255,170,120,0)');
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      for (var c = 0; c < 9; c++) { var cy = rand(h * 0.12, h * 0.48), cx = rand(0, w), cw = rand(w * 0.12, w * 0.3); var cg = g.createLinearGradient(0, cy - 10, 0, cy + 14); cg.addColorStop(0, 'rgba(255,214,190,0)'); cg.addColorStop(0.5, 'rgba(255,200,180,' + rand(0.12, 0.28).toFixed(2) + ')'); cg.addColorStop(1, 'rgba(255,214,190,0)'); g.fillStyle = cg; g.beginPath(); g.ellipse(cx, cy, cw, rand(6, 14), 0, 0, 7); g.fill(); }
      var mg = g.createLinearGradient(0, h * 0.42, 0, h * 0.78); mg.addColorStop(0, '#2b2231'); mg.addColorStop(1, '#16121b');
      g.fillStyle = mg; g.beginPath(); g.moveTo(w * 0.17, h * 0.79);
      var pts = [[0.42, 0.66], [0.47, 0.55], [0.5, 0.5], [0.52, 0.49], [0.545, 0.54], [0.57, 0.52], [0.6, 0.455], [0.66, 0.448], [0.72, 0.452], [0.78, 0.447], [0.84, 0.452], [0.87, 0.47], [0.9, 0.55], [0.95, 0.62], [1.0, 0.66], [1.0, 0.78]].map(function (p) { return [0.2 + (p[0] - 0.36) * 0.47, 0.62 + (p[1] - 0.45) * 0.5]; }).concat([[0.5, 0.79]]);
      pts.forEach(function (p) { g.lineTo(w * p[0] + rand(-3, 3), h * p[1] + rand(-2, 2)); }); g.closePath(); g.fill();
      var hz = g.createLinearGradient(0, h * 0.6, 0, h * 0.8); hz.addColorStop(0, 'rgba(207,111,56,0)'); hz.addColorStop(1, 'rgba(207,111,56,0.35)'); g.fillStyle = hz; g.fillRect(0, h * 0.6, w, h * 0.2);
      /* the brand on the face of Table Mountain, lit like a hillside sign */
      g.save();
      var ox = w * 0.372, oy = h * 0.668, fs = h * 0.05;
      g.font = '800 ' + fs + 'px Manrope, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = (fs * 0.28).toFixed(0) + 'px';
      g.shadowColor = 'rgba(255,196,120,0.9)'; g.shadowBlur = fs * 0.45;
      g.fillStyle = '#FFE8C2'; g.fillText('ORO', ox, oy);
      g.shadowBlur = fs * 0.12; g.fillStyle = '#FFF6E6'; g.fillText('ORO', ox, oy);
      g.restore();
      var hzc = g.createLinearGradient(0, h * 0.78, 0, h); hzc.addColorStop(0, '#3a2f3e'); hzc.addColorStop(1, '#241d28'); g.fillStyle = hzc; g.fillRect(0, h * 0.8, w, h * 0.2); g.fillStyle = '#2a2230'; var x = 0;
      while (x < w) { var bw = rand(8, 26), bh = rand(h * 0.008, h * 0.045) * (x > w * 0.25 && x < w * 0.4 ? 1.6 : 1); g.fillRect(x, h * 0.8 - bh, bw, bh + h * 0.2); for (var wy = h * 0.8 - bh + 3; wy < h * 0.86; wy += 5) for (var wx = x + 2; wx < x + bw - 2; wx += 4) if (Math.random() < 0.16) { g.fillStyle = 'rgba(255,214,150,' + rand(0.5, 0.95).toFixed(2) + ')'; g.fillRect(wx, wy, 2, 2); g.fillStyle = '#2a2230'; } x += bw + rand(0, 6); }
      g.fillStyle = '#1f1a24'; g.fillRect(0, h * 0.92, w, h * 0.08);
    });
  }
function leafTex() {
    return canvasTex(256, 384, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3f6b33'); gr.addColorStop(1, '#22441f');
      g.fillStyle = gr; g.beginPath(); g.moveTo(w / 2, h * 0.98); g.bezierCurveTo(w * 0.02, h * 0.7, w * 0.04, h * 0.12, w / 2, h * 0.02); g.bezierCurveTo(w * 0.96, h * 0.12, w * 0.98, h * 0.7, w / 2, h * 0.98); g.fill();
      g.strokeStyle = 'rgba(200,230,170,0.45)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h * 0.96); g.lineTo(w / 2, h * 0.06); g.stroke();
      g.lineWidth = 1.4; for (var i = 1; i < 9; i++) { var y = h * (0.9 - i * 0.09); g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w * 0.32, y - 16, w * 0.14, y - 30); g.moveTo(w / 2, y); g.quadraticCurveTo(w * 0.68, y - 16, w * 0.86, y - 30); g.stroke(); }
    });
  }
function artTex() {
    return canvasTex(768, 1024, function (g, w, h) {
      g.fillStyle = '#E8DED0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#B5583A'; g.beginPath(); g.arc(w * 0.38, h * 0.42, w * 0.3, 0, 7); g.fill();
      g.fillStyle = '#1D1A1A'; g.fillRect(w * 0.48, h * 0.18, w * 0.34, h * 0.56);
      g.fillStyle = '#D9A86C'; g.beginPath(); g.arc(w * 0.66, h * 0.76, w * 0.16, Math.PI, 0); g.fill();
      g.strokeStyle = '#1D1A1A'; g.lineWidth = 6; g.beginPath(); g.moveTo(w * 0.1, h * 0.86); g.lineTo(w * 0.9, h * 0.86); g.stroke();
      addNap(g, w, h, 10, 0);
    });
  }
var BAG_POS = new (T ? T.Vector3 : Object)(2.42, 0, -2.08), MAT_POS = new (T ? T.Vector3 : Object)(-0.45, 0, -0.35);
var iconCache = {};
function bagIcon(d, hex, fabric) {
    var key = d.id + hex + fabric; if (iconCache[key]) return iconCache[key];
    if (d.kit) return (iconCache[key] = kitIconURL(d.kit, 116));
    var S = 116, c = document.createElement('canvas'); c.width = c.height = S; var g = c.getContext('2d');
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.clip();
    if (d.patch === 'dollar') { g.fillStyle = '#bdb78f'; g.fillRect(0, 0, S, S); drawBill(g, -10, 18, 136, 58); drawBill(g, -60, 80, 136, 58); drawBill(g, 70, 80, 136, 58); }
    else { g.fillStyle = hex; g.fillRect(0, 0, S, S); if (fabric === 'corduroy') drawRibs(g, S, S, 20, lumOf(hex)); addNap(g, S, S, 6 + 14 * lumOf(hex), 200); }
    if (d.patch === 'circle' || d.patch === 'bagsign') { if (T) g.drawImage(decalTex(d.patch).image, S * 0.16, S * 0.16, S * 0.68, S * 0.68); }
    if (d.patch === 'print') { g.fillStyle = '#F4F2EE'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 ' + (S * 0.56) + 'px Manrope, Arial, sans-serif'; g.fillText('8', S / 2, S * 0.54); }
    var sh = g.createRadialGradient(S * 0.35, S * 0.3, S * 0.05, S / 2, S / 2, S * 0.62); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = sh; g.fillRect(0, 0, S, S); g.restore();
    return (iconCache[key] = c.toDataURL('image/png'));
  }
function matIcon(d, hex) {
    var key = d.id + hex; if (iconCache[key]) return iconCache[key];
    var S = 116, c = document.createElement('canvas'); c.width = c.height = S; var g = c.getContext('2d');
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.clip();
    if (d.patch === 'game') drawGameCrest(g, S); else if (d.patch === 'girl') drawGirlCrest(g, S); else drawPlainCrest(g, S, hex);
    g.restore(); return (iconCache[key] = c.toDataURL('image/png'));
  }
/*
 * o.canvas, o.hotBag: DOM nodes. o.getOpen(): which panel is open ('bag' | 'mat' | null).
 * o.getBagSpec() / o.getMatSpec(): what to build. o.onPick(kind), o.onClose(), o.onReady(): callbacks.
 * Returns a handle with setBag/setMat/toggleSit/resetSit/dispose.
 */
function initRoom(o) {
    var $c = o.canvas, hotBag = o.hotBag, disposed = false, raf = 0;
    var state = { get open() { return o.getOpen(); } };
    var renderer = new T.WebGLRenderer({ canvas: $c, antialias: true });
    renderer.setPixelRatio(hqPixelRatio(window.innerWidth, window.innerHeight)); hqInit(renderer);
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.localClippingEnabled = true;
    var scene = new T.Scene(); scene.background = new T.Color('#0a0908');
    var camera = new T.PerspectiveCamera(38, 1, 0.05, 60);
    var room = buildBedroom(scene, renderer); renderer.shadowMap.autoUpdate = false;

    /* film look: render in HDR, then bloom the lamps and the sign, and grade (ACES, warm shadows, vignette, grain) */
    var post = null;
    if (!small) {
      renderer.toneMapping = T.NoToneMapping; // the grade pass does the tone mapping
      var composer = new EffectComposer(renderer, new T.WebGLRenderTarget(2, 2, { type: T.HalfFloatType }));
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new T.Vector2(256, 256), 0.38, 0.6, 0.95));
      var grade = new ShaderPass(GRADE_SHADER); composer.addPass(grade);
      post = { composer: composer, grade: grade };
    }

    var bagG = new T.Group(); bagG.position.copy(BAG_POS); bagG.rotation.y = -0.35; bagG.scale.setScalar(0.62); bagG.userData.kind = 'bag'; scene.add(bagG);
    var matG = new T.Group(); matG.position.copy(MAT_POS); matG.rotation.y = 0.4; matG.scale.setScalar(0.633); matG.userData.kind = 'mat';
    var bagBlob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.7 }));
    bagBlob.rotation.x = -Math.PI / 2; bagBlob.position.set(BAG_POS.x, 0.004, BAG_POS.z); bagBlob.scale.set(1.6, 1.6, 1); scene.add(bagBlob);
    var matBlob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.35 }));
    matBlob.rotation.x = -Math.PI / 2; matBlob.position.set(MAT_POS.x, 0.002, MAT_POS.z); matBlob.scale.set(2.3, 2.3, 1);

    var bag = null, mat = null, settle = 0, settleTo = 0, plop = 0;
    function ease(k) { return k * k * (3 - 2 * k); }
    function setBag(animate) {
      if (bag) { bagG.remove(bag); disposeGroup(bag); }
      bag = buildModel(o.getBagSpec()); bagG.add(bag);
      if (settle > 0) bag.userData.morphs.forEach(function (m) { applyShape(m, ease(settle)); });
      if (animate && !reduce) plop = performance.now();
    }
    function setMat() { if (mat) { matG.remove(mat); disposeGroup(mat); } mat = buildModel(o.getMatSpec()); matG.add(mat); }
    setBag(false);

    /* camera: the page opens on WIDE and dollies into the chapter shots. Scrolling moves `progress` from shot to shot. */
    var V = function (x, y, z) { return new T.Vector3(x, y, z); };
    var WIDE = { pos: V(0.0, 2.25, 5.2), look: V(0.4, 0.9, -1.5) };
    var SHOTS = [
      { pos: V(0.25, 1.5, 3.4), look: V(1.35, 0.8, -1.9) },                                           // 0 the room
      { pos: V(BAG_POS.x - 1.85, 1.15, BAG_POS.z + 2.7), look: V(BAG_POS.x - 0.6, 0.55, BAG_POS.z - 0.2) }, // 1 the beanbag
      { pos: V(BAG_POS.x - 0.95, 0.78, BAG_POS.z + 1.5), look: V(BAG_POS.x - 0.32, 0.44, BAG_POS.z - 0.05) }, // 2 the stitching
      { pos: V(0.2, 1.2, 1.0), look: V(2.3, 1.75, -6) },                                              // 3 the view
    ];
    var progress = 0, tmpA = V(0, 0, 0), tmpB = V(0, 0, 0);
    function shotAt(p, port) {
      var i = Math.max(0, Math.min(SHOTS.length - 1, Math.floor(p))), j = Math.min(SHOTS.length - 1, i + 1), t = Math.max(0, Math.min(1, p - i));
      t = t * t * (3 - 2 * t);
      var pos = tmpA.copy(SHOTS[i].pos).lerp(SHOTS[j].pos, t).clone(), look = tmpB.copy(SHOTS[i].look).lerp(SHOTS[j].look, t).clone();
      if (port) pos.sub(look).multiplyScalar(1.3).add(look); // pull back a little on tall screens
      return { pos: pos, look: look };
    }
    var HOME = SHOTS[0];
    function focusFor(kind, portrait) {
      var m = portrait ? 1.9 : 1;
      if (kind === 'bag') return portrait ? { pos: new T.Vector3(BAG_POS.x - 1.6, 1.5, BAG_POS.z + 3.4), look: new T.Vector3(BAG_POS.x - 0.1, 0.45, BAG_POS.z) } : { pos: new T.Vector3(BAG_POS.x - 1.45, 1.05, BAG_POS.z + 2.1), look: new T.Vector3(BAG_POS.x, 0.45, BAG_POS.z) };
      if (kind === 'mat') return portrait ? { pos: new T.Vector3(MAT_POS.x + 1.2, 2.75, MAT_POS.z + 2.7), look: new T.Vector3(MAT_POS.x, 0, MAT_POS.z - 0.3) } : { pos: new T.Vector3(MAT_POS.x + 1.0, 2.2, MAT_POS.z + 1.9), look: new T.Vector3(MAT_POS.x, 0, MAT_POS.z) };
      return shotAt(progress, portrait);
    }
    var camPos = HOME.pos.clone(), camLook = HOME.look.clone(), offX = 0, offY = 0, mx = 0, my = 0, pmx = 0, pmy = 0;
    var W = 1, H = 1, portrait = false;
    function resize() {
      W = $c.clientWidth || window.innerWidth; H = $c.clientHeight || window.innerHeight; portrait = W / H < 0.9;
      renderer.setPixelRatio(hqPixelRatio(W, H)); renderer.setSize(W, H, false); if (room.mirror) { var dpr = renderer.getPixelRatio(); room.mirror.resize(W * dpr, H * dpr); } camera.aspect = W / H; camera.fov = portrait ? 62 : 46; camera.updateProjectionMatrix();
      if (post) { post.composer.setPixelRatio(renderer.getPixelRatio()); post.composer.setSize(W, H); }
      if (!state.open) { var f = focusFor(null, portrait); camPos.copy(f.pos); camLook.copy(f.look); }
    }
    window.addEventListener('resize', resize); resize();
    // start wide and dolly in slowly, like an opening camera move
    if (!reduce) { camPos.copy(WIDE.pos); camLook.copy(WIDE.look); }
    var introT0 = performance.now();

    /* hover + click */
    var ray = new T.Raycaster(), ndc = new T.Vector2(), hovered = null, down = null;
    function pick(e) {
      var r = $c.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects([bagG], true);
      for (var i = 0; i < hits.length; i++) { var o = hits[i].object; while (o && !o.userData.kind) o = o.parent; if (o) return o.userData.kind; }
      return null;
    }
    $c.addEventListener('pointermove', function (e) {
      mx = e.clientX / W * 2 - 1; my = e.clientY / H * 2 - 1;
      if (e.pointerType !== 'mouse') return;
      hovered = pick(e); $c.style.cursor = hovered ? 'pointer' : 'default';
      hotBag.classList.toggle('on', hovered === 'bag');
    });
    $c.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; });
    $c.addEventListener('pointerup', function (e) {
      if (!down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 8) return;
      var k = pick(e); if (k) o.onPick(k); else if (state.open) o.onClose();
    });

    var hotTmp = new T.Vector3();
    function placeHot(el, v) {
      hotTmp.copy(v).project(camera);
      var vis = hotTmp.z < 1 && Math.abs(hotTmp.x) < 1.1 && Math.abs(hotTmp.y) < 1.1;
      el.style.opacity = vis && !state.open ? '1' : '0'; el.style.pointerEvents = vis && !state.open ? 'auto' : 'none';
      el.style.left = ((hotTmp.x + 1) / 2 * W).toFixed(1) + 'px'; el.style.top = ((1 - hotTmp.y) / 2 * H).toFixed(1) + 'px';
    }
    var hotBagPos = new T.Vector3(BAG_POS.x, 1.0, BAG_POS.z), hotMatPos = new T.Vector3(MAT_POS.x + 0.55, 0.04, MAT_POS.z + 0.62);

    var last = performance.now(), first = true;
    function frame(now) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now; hqFrame(dt, resize);
      var intro = reduce || state.open ? 1 : Math.min(1, (now - introT0) / 4200);
      var f = focusFor(state.open, portrait), k = reduce ? 1 : 1 - Math.pow(intro < 1 ? 0.45 : 0.02, dt);
      camPos.lerp(f.pos, k); camLook.lerp(f.look, k);
      pmx += (mx - pmx) * (reduce ? 0 : 0.04); pmy += (my - pmy) * (reduce ? 0 : 0.04);
      var par = state.open ? 0.25 : 1;
      // a faint handheld drift so the shot never feels frozen
      var hand = reduce ? 0 : 1, hx = hand * (Math.sin(now * 0.00041) * 0.012 + Math.sin(now * 0.00093 + 2) * 0.005), hy = hand * Math.sin(now * 0.00057 + 1) * 0.008;
      camera.position.set(camPos.x + pmx * 0.18 * par + hx, camPos.y - pmy * 0.08 * par + hy, camPos.z - pmx * 0.06 * par); camera.lookAt(camLook);
      /* keep the selected item clear of the panel */
      var wantX = state.open && !portrait ? Math.min(416, W * 0.4) : 0, wantY = state.open && portrait ? Math.min(H * 0.5, 420) : 0;
      offX += (wantX - offX) * k; offY += (wantY - offY) * k;
      if (offX > 0.5 || offY > 0.5) camera.setViewOffset(W + offX, H + offY, offX, offY, W, H); else camera.clearViewOffset();
      if (settle !== settleTo) { var ds = settleTo - settle, step = reduce ? 1 : dt * 2.2; settle = Math.abs(ds) <= step ? settleTo : settle + (ds > 0 ? step : -step); bag.userData.morphs.forEach(function (m) { applyShape(m, ease(settle)); }); }
      if (plop) { var t = (now - plop) / 520; if (t >= 1) { plop = 0; bagG.scale.setScalar(0.62); } else { var b = Math.sin(t * Math.PI) * (1 - t); bagG.scale.set(0.62 * (1 + 0.05 * b), 0.62 * (1 - 0.08 * b), 0.62 * (1 + 0.05 * b)); } }
      if (!reduce) { var a = room.motes.geometry.attributes.position; for (var i = 0; i < a.count; i++) { var y = a.getY(i) + room.moteV[i] * dt; if (y > 2.7) y = 0.1; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(now * 0.0003 + i) * 0.0004); } a.needsUpdate = true; }
      clipPlane.constant = 0; camera.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true; room.mirror.update(scene, camera);
      if (post) { post.grade.uniforms.time.value = now * 0.001; post.composer.render(); } else renderer.render(scene, camera);
      placeHot(hotBag, hotBagPos);
      if (first) { first = false; if (o.onReady) o.onReady(); }
    }
    raf = requestAnimationFrame(frame);
    function dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (bag) disposeGroup(bag); if (mat) disposeGroup(mat);
      if (post && post.composer.dispose) post.composer.dispose();
      renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {}
    }
    return {
      setBag: setBag, setMat: setMat, dispose: dispose,
      toggleSit: function () { settleTo = settleTo > 0 ? 0 : 1; return settleTo > 0; }, resetSit: function () { settleTo = 0; },
      setProgress: function (p) { progress = p; }, shotCount: SHOTS.length,
    };
  }
function addPile(g, S) {
    for (var i = 0; i < 140; i++) {
      var x = Math.random() * S, y = Math.random() * S, r = rand(S * 0.03, S * 0.12), gr = g.createRadialGradient(x, y, 0, x, y, r);
      var c = Math.random() < 0.5 ? '0,0,0' : '255,255,255'; gr.addColorStop(0, 'rgba(' + c + ',0.03)'); gr.addColorStop(1, 'rgba(' + c + ',0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    var id = g.getImageData(0, 0, S, S), d = id.data;
    for (var k = 0; k < d.length; k += 4) { var n = (Math.random() - 0.5) * 14; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
    g.putImageData(id, 0, 0);
  }
function rugTop(tex) { return new T.MeshStandardMaterial({ map: tex, bumpMap: pileBump(), bumpScale: 0.06, roughness: 1, metalness: 0, envMapIntensity: 0.5 }); }
function rrShape(w, d, rc) {
    var s = new T.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + rc, y); s.lineTo(x + w - rc, y); s.quadraticCurveTo(x + w, y, x + w, y + rc); s.lineTo(x + w, y + d - rc);
    s.quadraticCurveTo(x + w, y + d, x + w - rc, y + d); s.lineTo(x + rc, y + d); s.quadraticCurveTo(x, y + d, x, y + d - rc); s.lineTo(x, y + rc); s.quadraticCurveTo(x, y, x + rc, y);
    return s;
  }
function softBox(w, h, d, b) {
    b = Math.min(b, h * 0.45, w * 0.45, d * 0.45);
    var iw = w - 2 * b, id = d - 2 * b, depth = Math.max(0.001, h - 2 * b);
    var g = new T.ExtrudeGeometry(rrShape(iw, id, Math.max(0.002, Math.min(iw, id) * 0.06)), { depth: depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, -depth / 2, 0); return g;
  }
function weaveTex(base, line, rep, noise) {
    var t = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.22; g.strokeStyle = line; g.lineWidth = 1;
      for (var i = 0; i < w; i += 3) { g.beginPath(); g.moveTo(i + rand(-0.5, 0.5), 0); g.lineTo(i + rand(-0.5, 0.5), h); g.stroke(); }
      for (var j = 0; j < h; j += 3) { g.beginPath(); g.moveTo(0, j); g.lineTo(w, j + rand(-0.5, 0.5)); g.stroke(); }
      g.globalAlpha = 1; mottle(g, w, h, 0.04, 60); addNap(g, w, h, noise, 0);
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); return t;
  }
function knitTex() {
    var t = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#7A6E64'; g.fillRect(0, 0, w, h);
      var cw = 32, ch = 24;
      for (var y = 0; y < h + ch; y += ch) for (var x = 0; x < w; x += cw) {
        var gr = g.createLinearGradient(x, y, x + cw / 2, y + ch); gr.addColorStop(0, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + cw * 0.25, y + ch * 0.9, x + cw / 2, y + ch); g.quadraticCurveTo(x + cw * 0.15, y + ch * 0.4, x, y); g.fill();
        g.beginPath(); g.moveTo(x + cw, y); g.quadraticCurveTo(x + cw * 0.75, y + ch * 0.9, x + cw / 2, y + ch); g.quadraticCurveTo(x + cw * 0.85, y + ch * 0.4, x + cw, y); g.fill();
      }
      addNap(g, w, h, 10, 0);
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(4, 4); return t;
  }
function velvetMat(hex) {
    var t = canvasTex(512, 512, function (g, w, h) { g.fillStyle = hex; g.fillRect(0, 0, w, h); mottle(g, w, h, 0.06, 90); addNap(g, w, h, 10, 0); });
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return new T.MeshPhysicalMaterial({ map: t, roughness: 0.75, sheen: 1, sheenRoughness: 0.45, sheenColor: new T.Color(shade(hex, 0.45)), envMapIntensity: 0.5 });
  }
function makeMirror(w, h, renderer) {
    var rt = new T.WebGLRenderTarget(512, 512), tm = new T.Matrix4();
    var mat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: tm }, tint: { value: new T.Color(0.84, 0.86, 0.88) } },
      vertexShader: ['uniform mat4 textureMatrix;', 'varying vec4 vUv;', 'void main() {', '  vUv = textureMatrix * vec4(position, 1.0);', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n'),
      fragmentShader: ['uniform vec3 tint;', 'uniform sampler2D tDiffuse;', 'varying vec4 vUv;', 'void main() {', '  vec4 b = texture2DProj(tDiffuse, vUv);', '  gl_FragColor = vec4(b.rgb * tint, 1.0);', '  #include <tonemapping_fragment>', '  #include <encodings_fragment>', '}'].join('\n')
    });
    var mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    var vc = new T.PerspectiveCamera(), plane = new T.Plane(), clip = new T.Vector4(), q = new T.Vector4();
    var mp = new T.Vector3(), cp = new T.Vector3(), n = new T.Vector3(), view = new T.Vector3(), look = new T.Vector3(), tgt = new T.Vector3(), rot = new T.Matrix4();
    function resize(W, H) { rt.setSize(Math.max(256, Math.round(W * 0.5)), Math.max(256, Math.round(H * 0.5))); }
    function update(scene, camera) {
      mp.setFromMatrixPosition(mesh.matrixWorld); cp.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(mesh.matrixWorld); n.set(0, 0, 1).applyMatrix4(rot);
      view.subVectors(mp, cp); if (view.dot(n) > 0) return;
      view.reflect(n).negate(); view.add(mp);
      rot.extractRotation(camera.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot); look.add(cp);
      tgt.subVectors(mp, look); tgt.reflect(n).negate(); tgt.add(mp);
      vc.position.copy(view); vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(n); vc.lookAt(tgt);
      vc.far = camera.far; vc.near = camera.near; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
      tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); tm.multiply(vc.projectionMatrix); tm.multiply(vc.matrixWorldInverse); tm.multiply(mesh.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(n, mp); plane.applyMatrix4(vc.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      var pm = vc.projectionMatrix;
      q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0]; q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5]; q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
      clip.multiplyScalar(2.0 / clip.dot(q));
      pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.003; pm.elements[14] = clip.w;
      mesh.visible = false; var prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, vc); renderer.setRenderTarget(prev); mesh.visible = true;
    }
    return { mesh: mesh, update: update, resize: resize };
  }
function buildBedroom(scene, renderer) {
    function add(geo, mat, x, y, z, cast) { var m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast !== false; m.receiveShadow = true; scene.add(m); return m; }
    function box(w, h, d, x, y, z, mat, cast) { return add(new T.BoxGeometry(w, h, d), mat, x, y, z, cast); }
    function soft(w, h, d, b, x, y, z, mat, cast) { return add(softBox(w, h, d, b), mat, x, y, z, cast); }

    /* shell */
    var oak = oakTex(); oak.map.repeat.set(3, 4.2); oak.bump.repeat.copy(oak.map.repeat);
    var floor = new T.Mesh(new T.PlaneGeometry(7.3, 8.6), new T.MeshStandardMaterial({ map: oak.map, bumpMap: oak.bump, bumpScale: 0.25, roughness: 0.42, metalness: 0, envMapIntensity: 0.6, color: '#6a5a4c' }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1.1); floor.receiveShadow = true; scene.add(floor);
    var wallM = new T.MeshStandardMaterial({ map: plasterTex('#2A2B2E'), roughness: 0.92, envMapIntensity: 0.35 });
    box(0.15, 3, 8.6, -3.575, 1.5, 1.1, wallM); box(0.15, 3, 8.6, 3.575, 1.5, 1.1, wallM);
    box(7.3, 0.1, 8.6, 0, 3.05, 1.1, new T.MeshStandardMaterial({ color: '#1B1C1E', roughness: 1 }));
    box(7.3, 0.1, 0.15, 0, 2.97, -3.075, wallM);
    var skirtM = new T.MeshStandardMaterial({ color: '#121213', roughness: 0.6 });
    box(0.015, 0.1, 8.6, -3.49, 0.05, 1.1, skirtM, false); box(0.015, 0.1, 8.6, 3.49, 0.05, 1.1, skirtM, false);

    /* full-width window with slim black frames */
    var alu = new T.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.38, metalness: 0.6 });
    box(7.0, 0.06, 0.1, 0, 2.89, -3.0, alu); box(7.0, 0.05, 0.12, 0, 0.025, -3.0, alu);
    [-3.47, -2.1, -0.7, 0.7, 2.1, 3.47].forEach(function (x) { box(0.05, 2.9, 0.08, x, 1.45, -3.0, alu); });
    var glass = new T.Mesh(new T.PlaneGeometry(7.0, 2.86), new T.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.04, metalness: 0, envMapIntensity: 1.2, depthWrite: false }));
    glass.position.set(0, 1.45, -3.03); scene.add(glass);
    var sky = new T.Mesh(new T.PlaneGeometry(44, 20), new T.MeshBasicMaterial({ map: skyTex(), toneMapped: false }));
    sky.position.set(9.5, 6.2, -16); scene.add(sky); // shifted so Table Mountain and the sign sit in the window beside the beanbag

    /* bed: walnut plinth, mattress, linen duvet, knitted throw, pillows, channel-tufted velvet headboard */
    var walnut = new T.MeshStandardMaterial({ map: walnutTex(), roughness: 0.5, envMapIntensity: 0.6 });
    var linenW = weaveTex('#3A3B3E', '#2C2D30', 2, 5), linenG = weaveTex('#6B655D', '#5B564F', 2, 5);
    var duvetM = new T.MeshPhysicalMaterial({ map: linenW, bumpMap: linenW, bumpScale: 0.25, roughness: 0.95, sheen: 0.35, sheenColor: new T.Color('#8a8c90'), envMapIntensity: 0.35 });
    var sheetG = new T.MeshPhysicalMaterial({ map: linenG, bumpMap: linenG, bumpScale: 0.25, roughness: 0.95, sheen: 0.3, sheenColor: new T.Color('#d0ccc4'), envMapIntensity: 0.4 });
    var throwM = new T.MeshStandardMaterial({ map: knitTex(), roughness: 0.95, envMapIntensity: 0.3 });
    var velvet = velvetMat('#2E3134');
    var BX = -0.3, BZ = -1.3;
    box(2.0, 0.09, 2.1, BX, 0.045, BZ, new T.MeshStandardMaterial({ color: '#1a1410', roughness: 0.9 }));
    soft(2.25, 0.18, 2.3, 0.02, BX, 0.18, BZ, walnut);
    soft(2.02, 0.26, 2.08, 0.07, BX, 0.4, BZ - 0.02, sheetG);
    soft(2.14, 0.36, 1.68, 0.1, BX, 0.48, BZ + 0.2, duvetM);
    soft(2.14, 0.1, 0.36, 0.05, BX, 0.67, BZ - 0.6, duvetM);
    soft(2.2, 0.39, 0.42, 0.08, BX, 0.5, BZ + 0.86, throwM);
    var pg = new T.SphereGeometry(1, 40, 24);
    function pillow(x, z, sx, mat, tilt) { var p = add(pg, mat, x, 0.72, z); p.scale.set(sx, 0.12, 0.24); p.rotation.x = tilt; return p; }
    pillow(BX - 0.5, BZ - 0.88, 0.42, sheetG, -0.55); pillow(BX + 0.5, BZ - 0.88, 0.42, sheetG, -0.55);
    pillow(BX - 0.48, BZ - 0.72, 0.38, duvetM, -0.35); pillow(BX + 0.48, BZ - 0.72, 0.38, duvetM, -0.35);
    var acc = add(pg, velvet, BX, 0.7, BZ - 0.56); acc.scale.set(0.26, 0.1, 0.16); acc.rotation.x = -0.2;
    for (var c = 0; c < 8; c++) soft(0.295, 1.15, 0.14, 0.065, BX - 1.05 + c * 0.3, 0.78, BZ - 1.19, velvet);
    soft(2.5, 0.05, 0.2, 0.01, BX, 1.38, BZ - 1.2, walnut);

    /* nightstands, table lamp, books */
    soft(0.55, 0.5, 0.45, 0.02, BX - 1.55, 0.25, BZ - 0.95, walnut); soft(0.55, 0.5, 0.45, 0.02, BX + 1.55, 0.25, BZ - 0.95, walnut);
    var gapM = new T.MeshStandardMaterial({ color: '#160e09', roughness: 0.9 });
    box(0.5, 0.006, 0.004, BX - 1.55, 0.3, BZ - 0.723, gapM, false); box(0.5, 0.006, 0.004, BX + 1.55, 0.3, BZ - 0.723, gapM, false);
    var lampBase = new T.Mesh(new T.LatheGeometry([[0, 0], [0.07, 0], [0.09, 0.05], [0.05, 0.2], [0.02, 0.32], [0, 0.32]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 40), new T.MeshStandardMaterial({ color: '#151515', roughness: 0.5, envMapIntensity: 0.6 }));
    lampBase.position.set(BX - 1.55, 0.5, BZ - 1.0); lampBase.castShadow = true; scene.add(lampBase);
    var shadeM = new T.MeshStandardMaterial({ color: '#C9B391', emissive: '#ffb86b', emissiveIntensity: 0.9, roughness: 0.9, side: T.DoubleSide });
    var tshade = new T.Mesh(new T.CylinderGeometry(0.13, 0.16, 0.2, 40, 1, true), shadeM); tshade.position.set(BX - 1.55, 0.92, BZ - 1.0); scene.add(tshade);
    var tl = new T.PointLight(0xffb066, 1.3, 3.5, 2); tl.position.set(BX - 1.55, 0.9, BZ - 1.0); scene.add(tl);
    [['#2B2B2B', 0.04], ['#C9B9A0', 0.035]].forEach(function (b, i) { box(0.22, b[1], 0.16, BX + 1.5, 0.5 + b[1] / 2 + i * 0.04, BZ - 0.95, new T.MeshStandardMaterial({ color: b[0], roughness: 0.8 })); });

    /* rug under the bed (decor, not a product) */
    var rugT = canvasTex(512, 512, function (g, w, h) { g.fillStyle = '#2A2623'; g.fillRect(0, 0, w, h); mottle(g, w, h, 0.05, 80); addNap(g, w, h, 12, 0); }); rugT.wrapS = rugT.wrapT = T.RepeatWrapping; rugT.repeat.set(3, 3);
    soft(3.4, 0.02, 2.8, 0.008, BX, 0.01, BZ + 0.55, new T.MeshStandardMaterial({ map: rugT, bumpMap: rugT, bumpScale: 0.2, roughness: 1, envMapIntensity: 0.4 }), false);

    /* desk on the right, facing the view */
    var DX = 2.45, DZ = 0.95, blackM = new T.MeshStandardMaterial({ color: '#1a1a1b', roughness: 0.45, metalness: 0.5 });
    soft(1.5, 0.04, 0.7, 0.012, DX, 0.74, DZ, walnut);
    [[-0.7, -0.31], [0.7, -0.31], [-0.7, 0.31], [0.7, 0.31]].forEach(function (o) { box(0.03, 0.72, 0.03, DX + o[0], 0.36, DZ + o[1], blackM); });
    var aluL = new T.MeshStandardMaterial({ color: '#c9cbcf', roughness: 0.3, metalness: 0.9, envMapIntensity: 1 });
    soft(0.34, 0.015, 0.24, 0.004, DX - 0.15, 0.768, DZ + 0.05, aluL);
    var scr = new T.Group(); scr.position.set(DX - 0.15, 0.775, DZ - 0.07); scr.rotation.x = -0.32; scene.add(scr);
    var scrB = new T.Mesh(softBox(0.34, 0.008, 0.23, 0.003), aluL); scrB.rotation.x = Math.PI / 2; scrB.position.set(0, 0.115, 0); scrB.castShadow = true; scr.add(scrB);
    var disp = new T.Mesh(new T.PlaneGeometry(0.31, 0.2), new T.MeshBasicMaterial({ color: new T.Color(0.55, 0.62, 0.8), toneMapped: true })); disp.position.set(0, 0.115, 0.005); scr.add(disp);
    box(0.2, 0.012, 0.26, DX + 0.4, 0.766, DZ, new T.MeshStandardMaterial({ color: '#6b4a3a', roughness: 0.7 }));
    /* desk chair */
    var leather = new T.MeshPhysicalMaterial({ color: '#1c1a19', roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.6 });
    var chrome = new T.MeshStandardMaterial({ color: '#d8d9dc', roughness: 0.15, metalness: 1, envMapIntensity: 1.2 });
    var CZ = DZ + 0.62;
    var seat = add(pg, leather, DX, 0.5, CZ); seat.scale.set(0.27, 0.06, 0.25);
    var back = add(pg, leather, DX, 0.86, CZ + 0.24); back.scale.set(0.25, 0.3, 0.05); back.rotation.x = 0.12;
    add(new T.CylinderGeometry(0.025, 0.025, 0.4, 16), chrome, DX, 0.25, CZ);
    for (var k = 0; k < 5; k++) { var a = k / 5 * Math.PI * 2, leg = add(new T.BoxGeometry(0.035, 0.025, 0.3), chrome, DX + Math.sin(a) * 0.14, 0.04, CZ + Math.cos(a) * 0.14); leg.rotation.y = a; }

    /* mirror door on the left wall */
    var mirror = makeMirror(1.0, 2.45, renderer);
    var MZ = -0.5; mirror.mesh.position.set(-3.485, 1.245, MZ); mirror.mesh.rotation.y = Math.PI / 2; scene.add(mirror.mesh);
    box(0.03, 2.53, 0.04, -3.485, 1.265, MZ - 0.52, alu); box(0.03, 2.53, 0.04, -3.485, 1.265, MZ + 0.52, alu); box(0.03, 0.04, 1.08, -3.485, 2.5, MZ, alu);
    box(0.03, 0.5, 0.02, -3.46, 1.1, MZ + 0.44, chrome);

    /* plant in the back-left corner, art above the desk */
    var pot = new T.Mesh(new T.LatheGeometry([[0, 0], [0.17, 0], [0.2, 0.05], [0.235, 0.42], [0.225, 0.44], [0, 0.44]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 48), new T.MeshStandardMaterial({ color: '#222222', roughness: 0.75, envMapIntensity: 0.5 }));
    var PX = -3.0, PZ = -2.5; pot.position.set(PX, 0, PZ); pot.castShadow = true; pot.receiveShadow = true; scene.add(pot);
    var lt = leafTex(), leafM = new T.MeshStandardMaterial({ map: lt, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.55, envMapIntensity: 0.5 });
    var leafD = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: lt, alphaTest: 0.5 });
    var stemM = new T.MeshStandardMaterial({ color: '#4a3a28', roughness: 0.9 }), leafG = new T.PlaneGeometry(0.26, 0.36);
    for (var st = 0; st < 6; st++) {
      var an = st / 6 * Math.PI * 2 + rand(-0.3, 0.3), lean = rand(0.08, 0.22), hgt = rand(0.9, 1.6);
      var top = new T.Vector3(PX + Math.cos(an) * lean, 0.44 + hgt, PZ + Math.sin(an) * lean);
      var stem = new T.Mesh(new T.CylinderGeometry(0.008, 0.012, hgt, 6), stemM); stem.position.set((PX + top.x) / 2, 0.44 + hgt / 2, (PZ + top.z) / 2);
      stem.lookAt(top); stem.rotateX(Math.PI / 2); stem.castShadow = true; scene.add(stem);
      for (var lf = 0; lf < 6; lf++) {
        var f = 0.35 + lf * 0.13, p = new T.Vector3(PX + (top.x - PX) * f, 0.44 + hgt * f, PZ + (top.z - PZ) * f);
        var leaf = new T.Mesh(leafG, leafM); leaf.customDepthMaterial = leafD;
        var ang = an + rand(-1.2, 1.2); leaf.position.set(p.x + Math.cos(ang) * 0.12, p.y, p.z + Math.sin(ang) * 0.12);
        leaf.rotation.set(rand(-0.9, -0.3), -ang + Math.PI / 2, rand(-0.4, 0.4)); leaf.scale.setScalar(rand(0.75, 1.15));
        leaf.castShadow = true; leaf.receiveShadow = true; scene.add(leaf);
      }
    }
    var art = new T.Group(); art.position.set(3.475, 1.7, DZ); art.rotation.y = -Math.PI / 2; scene.add(art);
    var frame = new T.Mesh(new T.BoxGeometry(1.1, 0.8, 0.035), new T.MeshStandardMaterial({ color: '#141212', roughness: 0.5 })); frame.castShadow = true; art.add(frame);
    var canvasArt = new T.Mesh(new T.PlaneGeometry(1.02, 0.72), new T.MeshStandardMaterial({ map: canvasTex(1024, 720, function (g, w, h) {
      g.fillStyle = '#E8DED0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1D1A1A'; g.fillRect(w * 0.08, h * 0.15, w * 0.38, h * 0.7);
      g.fillStyle = '#B5583A'; g.beginPath(); g.arc(w * 0.68, h * 0.5, h * 0.28, 0, 7); g.fill(); addNap(g, w, h, 10, 0);
    }), roughness: 0.9 })); canvasArt.position.z = 0.019; canvasArt.receiveShadow = true; art.add(canvasArt);

    /* arc lamp over the beanbag */
    var brass = new T.MeshStandardMaterial({ color: '#b48b52', roughness: 0.3, metalness: 1, envMapIntensity: 1 });
    var LB = new T.Vector3(3.2, 0, -2.75), LE = new T.Vector3(BAG_POS.x, 2.0, BAG_POS.z);
    var lbase = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.045, 48), new T.MeshStandardMaterial({ color: '#141414', roughness: 0.35, envMapIntensity: 0.8 }));
    lbase.position.set(LB.x, 0.0225, LB.z); lbase.castShadow = true; lbase.receiveShadow = true; scene.add(lbase);
    var curve = new T.CatmullRomCurve3([new T.Vector3(LB.x, 0.04, LB.z), new T.Vector3(LB.x, 1.3, LB.z), new T.Vector3(LB.x - 0.12, 2.15, LB.z + 0.12), new T.Vector3((LB.x + LE.x) / 2, 2.32, (LB.z + LE.z) / 2), new T.Vector3(LE.x, LE.y + 0.06, LE.z)]);
    var pole = new T.Mesh(new T.TubeGeometry(curve, 80, 0.012, 10, false), brass); pole.castShadow = true; scene.add(pole);
    var shade2 = new T.Mesh(new T.SphereGeometry(0.2, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: '#b48b52', roughness: 0.32, metalness: 1, side: T.DoubleSide, envMapIntensity: 1 }));
    shade2.position.set(LE.x, LE.y - 0.05, LE.z); shade2.castShadow = true; scene.add(shade2);
    var bulb = new T.Mesh(new T.SphereGeometry(0.05, 16, 12), new T.MeshBasicMaterial({ color: new T.Color(3, 2.4, 1.6), toneMapped: false })); bulb.position.set(LE.x, LE.y - 0.07, LE.z); scene.add(bulb);
    var lampL = new T.PointLight(0xffb066, 2.8, 5, 2); lampL.position.set(LE.x, LE.y - 0.12, LE.z); scene.add(lampL);

    /* soft shadows where walls meet the floor, and under furniture */
    var aoT = canvasTex(64, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
    function ao(w, d, x, z, ry) { var m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ map: aoT, transparent: true, depthWrite: false, opacity: 0.55 })); m.position.set(x, 0.002, z); m.rotation.set(-Math.PI / 2, ry, 0, 'YXZ'); scene.add(m); }
    ao(8.6, 0.45, -3.5 + 0.225, 1.1, -Math.PI / 2); ao(8.6, 0.45, 3.5 - 0.225, 1.1, Math.PI / 2);
    function blob(x, z, sx, sz, op) { var m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: op })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.022, z); m.scale.set(sx, sz, 1); scene.add(m); }
    blob(BX, BZ, 2.9, 3.0, 0.45); blob(DX, DZ + 0.2, 1.9, 1.4, 0.35); blob(PX, PZ, 0.8, 0.8, 0.5); blob(LB.x, LB.z, 0.55, 0.55, 0.5);

    /* light: golden-hour sun through the full-width window */
    scene.add(new T.HemisphereLight(0xffd9b8, 0x3a2a20, 0.14));
    var sun = new T.DirectionalLight(0xff8a48, 2.3); sun.position.set(-6, 3.4, -10.6); sun.target.position.set(0, 0, -0.8);
    sun.castShadow = true; sun.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
    var sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30;
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.02; scene.add(sun); scene.add(sun.target);
    var bounce = new T.PointLight(0xffa870, 0.3, 7, 2); bounce.position.set(0, 0.4, 0.5); scene.add(bounce);
    var front = new T.DirectionalLight(0xffe2c8, 0.1); front.position.set(-2, 4, 6); scene.add(front);

    var es = new T.Scene();
    es.add(new T.Mesh(new T.BoxGeometry(12, 6, 12), new T.MeshBasicMaterial({ color: '#4a3d35', side: T.BackSide })));
    var w1 = new T.Mesh(new T.PlaneGeometry(8, 4), new T.MeshBasicMaterial({ color: new T.Color(1.7, 0.95, 0.55) })); w1.position.set(0, 1.6, -5.9); es.add(w1);
    var w2 = new T.Mesh(new T.SphereGeometry(0.3, 16, 12), new T.MeshBasicMaterial({ color: new T.Color(3, 2.3, 1.5) })); w2.position.set(2.4, 2.0, -2); es.add(w2);
    var w4 = new T.Mesh(new T.PlaneGeometry(10, 10), new T.MeshBasicMaterial({ color: new T.Color(0.55, 0.38, 0.24) })); w4.rotation.x = -Math.PI / 2; w4.position.y = -2.9; es.add(w4);
    var pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.04).texture; pm.dispose();

    var N = small ? 80 : 160, pp = new Float32Array(N * 3), vv = [];
    for (var i = 0; i < N; i++) { pp[i * 3] = rand(-3, 3); pp[i * 3 + 1] = rand(0.1, 2.7); pp[i * 3 + 2] = rand(-2.9, 0.8); vv.push(rand(0.01, 0.04)); }
    var pgeo = new T.BufferGeometry(); pgeo.setAttribute('position', new T.BufferAttribute(pp, 3));
    var motes = new T.Points(pgeo, new T.PointsMaterial({ size: 0.012, map: dotTex(), transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending, color: '#ffd9a8' }));
    scene.add(motes);
    return { motes: motes, moteV: vv, mirror: mirror };
  }
var HQ_TEX = small ? 2048 : 4096, SNAP_TEX = 4096, ANISO = 8, RIBS = 360;
var hqAcc = 0, hqN = 0, hqScale = 1;
function hqInit(renderer) { try { ANISO = renderer.capabilities.getMaxAnisotropy() || 8; } catch (e) {} }
function hqPixelRatio(w, h) { var d = window.devicePixelRatio || 1; return Math.max(1, Math.min(d, 2, Math.sqrt(8.3e6 / Math.max(1, w * h))) * hqScale); }
function hqFrame(dt, onDrop) { hqAcc += dt; hqN++; if (hqN >= 90) { var avg = hqAcc / hqN; hqAcc = 0; hqN = 0; if (avg > 0.045 && hqScale > 0.62) { hqScale -= 0.15; onDrop(); } } }
function canvasTex(w, h, draw, srgb) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); if (srgb !== false) t.encoding = T.sRGBEncoding; t.anisotropy = ANISO; return t;
  }
var tileCache = {};
function fibreTile(size, mode) {
    var key = size + mode; if (tileCache[key]) return tileCache[key];
    var c = document.createElement('canvas'); c.width = c.height = size; var g = c.getContext('2d');
    if (mode === 'grey') {
      var id = g.createImageData(size, size), d = id.data;
      for (var k = 0; k < d.length; k += 4) { var n = 128 + (Math.random() - 0.5) * 70; d[k] = d[k + 1] = d[k + 2] = n; d[k + 3] = 255; }
      g.putImageData(id, 0, 0);
    }
    var count = Math.round(size * size / (mode === 'grey' ? 30 : 55));
    for (var i = 0; i < count; i++) {
      var x = Math.random() * size, y = Math.random() * size, l = rand(2, 7), a = rand(-0.5, 0.5) + (Math.random() < 0.5 ? 0 : Math.PI);
      var light = Math.random() < 0.55;
      g.strokeStyle = light ? 'rgba(255,255,255,' + rand(0.08, 0.22).toFixed(2) + ')' : 'rgba(0,0,0,' + rand(0.08, 0.2).toFixed(2) + ')';
      g.lineWidth = rand(0.5, 1.1); g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.sin(a) * l * 0.5 + rand(-1, 1), y + Math.cos(a) * l * 0.5, x + Math.sin(a) * l, y + Math.cos(a) * l); g.stroke();
    }
    return (tileCache[key] = c);
  }
function layTile(g, w, h, tile, alpha, op) {
    g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = op || 'source-over';
    g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, w, h); g.restore();
  }
function mottle(g, w, h, a, count) {
    for (var i = 0; i < count; i++) {
      var x = Math.random() * w, y = Math.random() * h, r = rand(w * 0.02, w * 0.09), gr = g.createRadialGradient(x, y, 0, x, y, r);
      var c = Math.random() < 0.5 ? '0,0,0' : '255,255,255'; gr.addColorStop(0, 'rgba(' + c + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
function lumOf(hex) { var c = rgbOf(hex); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
function drawRibs(g, w, h, n, lum) {
    var p = w / n, d = 0.05 + 0.08 * lum, l = 0.01 + 0.016 * (1 - lum);
    for (var i = 0; i < n; i++) {
      var x = i * p, gr = g.createLinearGradient(x, 0, x + p, 0);
      gr.addColorStop(0, 'rgba(0,0,0,' + d + ')'); gr.addColorStop(0.3, 'rgba(0,0,0,' + (d * 0.25).toFixed(3) + ')'); gr.addColorStop(0.5, 'rgba(255,255,255,' + l + ')');
      gr.addColorStop(0.7, 'rgba(0,0,0,' + (d * 0.25).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(0,0,0,' + d + ')');
      g.fillStyle = gr; g.fillRect(x, 0, p + 0.5, h);
    }
  }
function drawSeams(g, w, h) {
    var sw = Math.max(1.5, w * 0.0009), st = Math.max(2, h * 0.006), gap = h * 0.011;
    for (var k = 0; k <= 6; k++) {
      var x = k * w / 6;
      g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(x - sw, 0, sw * 2, h);
      g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x - sw * 3.4, 0, sw * 0.8, h); g.fillRect(x + sw * 2.6, 0, sw * 0.8, h);
      for (var y = 0; y < h; y += gap) {
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - sw * 5.2, y, sw * 0.9, st); g.fillRect(x + sw * 4.3, y, sw * 0.9, st);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x - sw * 5.2, y + st, sw * 0.9, st * 0.3); g.fillRect(x + sw * 4.3, y + st, sw * 0.9, st * 0.3);
      }
    }
  }
function fabricTextures(hex, fabric, size, kit) {
    var W = size || HQ_TEX, H = W / 2, key = hex + '|' + fabric + '|' + W + (kit ? '|' + kit.id : ''); if (fabricCache[key]) return fabricCache[key];
    var cord = fabric === 'corduroy', lum = lumOf(hex);
    var map = canvasTex(W, H, function (g, w, h) {
      g.fillStyle = hex; g.fillRect(0, 0, w, h);
      if (kit) drawKitFabric(g, w, h, kit);
      mottle(g, w, h, cord ? 0.035 : 0.06, cord ? 170 : 320);
      if (cord) drawRibs(g, w, h, RIBS, lum);
      layTile(g, w, h, fibreTile(509, 'grey'), cord ? 0.32 : 0.45, 'overlay');
      layTile(g, w, h, fibreTile(383, 'hair'), 0.35 + 0.2 * (1 - lum));
      layTile(g, w, h, fibreTile(257, 'hair'), 0.3);
      drawSeams(g, w, h);
    });
    map.wrapS = T.RepeatWrapping;
    var bump = canvasTex(W, H, function (g, w, h) {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      if (cord) { var p = w / RIBS; for (var i = 0; i < RIBS; i++) { var x = i * p, gr = g.createLinearGradient(x, 0, x + p, 0); gr.addColorStop(0, '#4a4a4a'); gr.addColorStop(0.3, '#9a9a9a'); gr.addColorStop(0.5, '#c4c4c4'); gr.addColorStop(0.7, '#9a9a9a'); gr.addColorStop(1, '#4a4a4a'); g.fillStyle = gr; g.fillRect(x, 0, p + 0.5, h); } }
      layTile(g, w, h, fibreTile(509, 'grey'), cord ? 0.35 : 0.5, 'overlay');
      for (var k = 0; k <= 6; k++) { var sx = k * w / 6, sg = g.createLinearGradient(sx - w * 0.005, 0, sx + w * 0.005, 0); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(sx - w * 0.005, 0, w * 0.01, h); }
    }, false);
    bump.wrapS = T.RepeatWrapping;
    return (fabricCache[key] = { map: map, bump: bump });
  }
function fabricMat(hex, fabric, size, kit) {
    var key = hex + '|' + fabric + '|' + (size || HQ_TEX) + (kit ? '|' + kit.id : ''); if (matCache[key]) return matCache[key];
    var t = fabricTextures(hex, fabric, size, kit), cord = fabric === 'corduroy';
    return (matCache[key] = new T.MeshPhysicalMaterial({
      map: t.map, bumpMap: t.bump, bumpScale: cord ? 0.018 : 0.025, roughness: cord ? 0.92 : 0.86, metalness: 0, envMapIntensity: 0.38,
      sheen: cord ? 0.55 : 0.65, sheenRoughness: 0.45, sheenColor: new T.Color(shade(hex, cord ? 0.16 : 0.26))
    }));
  }
var detailTexV = null;
function detailTex() {
    if (detailTexV) return detailTexV;
    var t = new T.CanvasTexture(fibreTile(1024, 'grey')); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = ANISO;
    return (detailTexV = t);
  }
function addFibreDetail(m) {
    m.onBeforeCompile = function (sh) {
      sh.uniforms.detailMap = { value: detailTex() };
      sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n  vec3 fibreD = texture2D( detailMap, vUv * vec2( 40.0, 20.0 ) ).rgb;\n  diffuseColor.rgb *= mix( vec3( 1.0 ), fibreD * 2.0, 0.28 );')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= mix( 0.88, 1.08, fibreD.r );');
    };
    m.customProgramCacheKey = function () { return 'fibre-detail'; };
    return m;
  }




function morphable(geo, off, ao) {
    var p = geo.attributes.position, n = p.count, d = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { var x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.sqrt(x * x + y * y + z * z) || 1; d[i * 3] = x / l; d[i * 3 + 1] = y / l; d[i * 3 + 2] = z / l; }
    if (ao) geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
    return { geo: geo, dirs: d, off: off, ao: ao };
  }
function applyShape(m, s) {
    var p = m.geo.attributes.position, d = m.dirs, o = [0, 0, 0, 0], col = m.ao ? m.geo.attributes.color : null;
    for (var i = 0; i < p.count; i++) {
      bagPoint(d[i * 3], d[i * 3 + 1], d[i * 3 + 2], s, m.off, o); p.setXYZ(i, o[0], o[1], o[2]);
      if (col) { var hgt = o[1] * 0.88 + 0.7, ao = 1 + Math.max(-0.42, Math.min(0.06, o[3] * 9)); ao *= 0.5 + 0.5 * smoothstep(0.0, 0.45, hgt); col.setXYZ(i, ao, ao, ao); }
    }
    p.needsUpdate = true; if (col) col.needsUpdate = true; m.geo.computeVertexNormals(); m.geo.computeBoundingSphere();
  }
function capGeometryHQ(R, angle) {
    var geo = new T.SphereGeometry(R, small ? 128 : 192, small ? 32 : 48, 0, Math.PI * 2, 0, angle);
    var pos = geo.attributes.position, uv = geo.attributes.uv, rr = R * Math.sin(angle);
    for (var i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * rr), 0.5 - pos.getZ(i) / (2 * rr));
    uv.needsUpdate = true; return geo;
  }
var bagMatCache = {};
function bagBodyMat(s) {
    var dollar = s.patch === 'dollar', size = s.texSize || HQ_TEX, k = 'bag|' + (dollar ? '$' + (s.cur || 'USD') : s.hex) + s.fabric + size + (s.kit ? '|' + s.kit.id : '');
    if (!bagMatCache[k]) {
      var m = (dollar ? dollarMat(s.fabric, s.cur) : fabricMat(s.hex, s.fabric, size, s.kit)).clone();
      m.clippingPlanes = [clipPlane]; m.clipShadows = true; m.vertexColors = true; m.envMapIntensity = 0.38;
      bagMatCache[k] = addFibreDetail(m);
    }
    return bagMatCache[k];
  }
function buildDome(s) {
    var g = new T.Group(), inner = new T.Group();
    inner.scale.set(1, 0.88, 1); inner.position.y = 0.7; g.add(inner);
    var hq = !small || s.texSize === SNAP_TEX;
    var body = shadowify(new T.Mesh(new T.SphereGeometry(1, hq ? 256 : 160, hq ? 192 : 120), bagBodyMat(s)));
    var mb = morphable(body.geometry, 0, true); applyShape(mb, 0); inner.add(body);
    var morphs = [mb];
    var printed = s.patch === 'print' || s.patch === 'kitprint';
    if (s.patch === 'circle' || printed || s.patch === 'bagsign' || (s.patch === 'kitpatch' && s.kit)) {
      var cg = capGeometryHQ(1, 0.56); cg.rotateX(Math.PI / 2 - 0.12);
      var mc = morphable(cg, 0.0045, false); applyShape(mc, 0);
      var dk = s.patch + ':' + (s.kit ? s.kit.id : s.patch === 'bagsign' ? curInfo(s.cur).sym : String(s.num || 8));
      var badge = s.patch === 'kitpatch' || s.patch === 'circle';
      var mat = new T.MeshStandardMaterial({ map: decalTex(dk), bumpMap: badge ? decalBump(dk) : detailTex(), bumpScale: badge ? 0.9 : 0.02, roughness: printed ? 0.92 : badge ? 0.72 : 0.85, envMapIntensity: 0.4, transparent: printed, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      var cap = new T.Mesh(cg, mat); cap.castShadow = true; cap.receiveShadow = true; if (printed) cap.renderOrder = 2;
      inner.add(cap); morphs.push(mc);
    }
    g.userData.morphs = morphs; return g;
  }
function renderStudio(spec, W, H) {
    var r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    try {
      r.setPixelRatio(1); r.setSize(W, H, false);
      r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.localClippingEnabled = true;
      var sc = new T.Scene(); sc.background = new T.Color('#E9E2D9');
      var fl = canvasTex(2048, 2048, function (g, w, h) { g.fillStyle = '#CFC7BC'; g.fillRect(0, 0, w, h); mottle(g, w, h, 0.05, 420); layTile(g, w, h, fibreTile(509, 'grey'), 0.18, 'overlay'); });
      fl.wrapS = fl.wrapT = T.RepeatWrapping; fl.repeat.set(5, 5);
      var floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshStandardMaterial({ map: fl, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
      var wall = new T.Mesh(new T.PlaneGeometry(40, 16), new T.MeshStandardMaterial({ color: '#F2EDE6', roughness: 1 })); wall.position.set(0, 8, -4); wall.receiveShadow = true; sc.add(wall);
      sc.add(new T.HemisphereLight(0xfffaf3, 0xb8ab9b, 0.75));
      var key = new T.DirectionalLight(0xfff1df, 1.9); key.position.set(-4.5, 7, 5.5); key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
      var c = key.shadow.camera; c.near = 1; c.far = 26; c.left = -4; c.right = 4; c.top = 4; c.bottom = -4; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.015; key.target.position.set(0, 0.6, 0);
      sc.add(key); sc.add(key.target);
      var fill = new T.DirectionalLight(0xffffff, 0.35); fill.position.set(5, 3, 4); sc.add(fill);
      var rim = new T.DirectionalLight(0xfff4e8, 0.6); rim.position.set(2, 4, -6); sc.add(rim);
      var es = new T.Scene(); es.add(new T.Mesh(new T.BoxGeometry(12, 6, 12), new T.MeshBasicMaterial({ color: '#6a5f56', side: T.BackSide })));
      var lp = new T.Mesh(new T.PlaneGeometry(4, 4), new T.MeshBasicMaterial({ color: new T.Color(2.4, 2.2, 2.0) })); lp.position.set(-3, 3, 5.9); lp.rotation.y = Math.PI; es.add(lp);
      var pm = new T.PMREMGenerator(r); sc.environment = pm.fromScene(es, 0.04).texture; pm.dispose();
      var blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.55 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.003; blob.scale.set(2.6, 2.6, 1); sc.add(blob);
      var s = {}; for (var k in spec) s[k] = spec[k]; s.texSize = SNAP_TEX;
      var m = buildModel(s); m.rotation.y = -0.3; sc.add(m);
      var cam = new T.PerspectiveCamera(28, W / H, 0.1, 60); cam.position.set(1.3, 1.45, 4.6); cam.lookAt(0, 0.72, 0);
      clipPlane.constant = 0; r.render(sc, cam);
      var url = r.domElement.toDataURL('image/jpeg', 0.93);
      disposeGroup(m);
      return url;
    } finally { r.dispose(); try { r.forceContextLoss(); } catch (e) {} }
  }

export { webglOK, initRoom, renderStudio, bagIcon, matIcon, swatchURL };

/* embroidered badge for a decal key ('kitpatch:messi' or 'circle:8') and its relief map */
function badgeFor(full) {
  var parts = String(full).split(':');
  if (parts[0] === 'kitpatch') return kitBadge(kitById(parts[1]));
  return { bg: '#F3EFE6', ring: '#E4DDCD', ink: '#151515', main: parts[1] || '8' };
}
var decalBumpCache = {};
function decalBump(full) {
  if (decalBumpCache[full]) return decalBumpCache[full];
  var S = 1024;
  return (decalBumpCache[full] = canvasTex(S, S, function (g) { drawBadgeBump(g, S, badgeFor(full)); }, false));
}
