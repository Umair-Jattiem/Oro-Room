/* The beanbag's shape, shared by the main site and the room.
   Takes a direction on a unit sphere and returns the deformed point: a heavy, spread base, a slumped crown
   with a gathered dimple, panel seams, lumps of filling and sharp fabric creases. `s` (0..1) is how far
   someone is sitting in it. out = [x, y, z, crease] where crease (negative = deeper) drives the baked shading. */

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}
export function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz), b = hash3(ix + 1, iy, iz), c = hash3(ix, iy + 1, iz), d = hash3(ix + 1, iy + 1, iz);
  const e = hash3(ix, iy, iz + 1), f = hash3(ix + 1, iy, iz + 1), g = hash3(ix, iy + 1, iz + 1), h = hash3(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}

export function bagPoint(nx: number, ny: number, nz: number, s: number, off: number, out: number[]) {
  const th = Math.atan2(nx, nz), hr = Math.sqrt(nx * nx + nz * nz);
  const c3 = Math.cos(3 * th), fade = smoothstep(0.05, 0.4, hr);
  const groove = Math.exp(-(c3 * c3) / 0.035), bulge = Math.sqrt(Math.abs(c3)) - 0.62; // six sewn panels

  // silhouette: flattened crown, base that spreads out where it meets the floor
  const base = 1 + fade * 0.03 * bulge - 0.11 * smoothstep(0.55, 1, ny) + 0.13 * smoothstep(0.15, -0.7, ny);
  // big, soft lumps of filling
  const lumps = (vnoise(nx * 1.4 + 3.1, ny * 1.4 + 1.3, nz * 1.4 + 7.7) - 0.5) * 0.11;
  // creases: ridged noise makes sharp folds, strongest on the upper half where the fabric is loose
  const rn = vnoise(nx * 2.3 + 11, ny * 2.3, nz * 2.3 + 5);
  let ridge = 1 - Math.abs(2 * rn - 1); ridge = ridge * ridge * ridge * ridge;
  const folds = -ridge * 0.045 * (0.3 + 0.7 * smoothstep(-0.3, 0.9, ny));
  // wrinkles gathering towards the crown
  const gather = Math.pow(Math.abs(Math.sin(th * 7 + vnoise(nx * 2, ny * 2, nz * 2) * 4)), 10) * smoothstep(0.35, 0.95, ny) * (1 - smoothstep(0.97, 1, ny));
  const fine = (vnoise(nx * 12 + 2, ny * 12 + 9, nz * 12) - 0.5) * 0.012 + (vnoise(nx * 26, ny * 26 + 3, nz * 26 + 1) - 0.5) * 0.004;
  const dimple = -0.07 * Math.exp(-(hr * hr) / 0.02) * smoothstep(0.8, 1, ny);
  const detail = -fade * 0.012 * groove + folds - gather * 0.03 + fine;

  const r = base + lumps + detail + dimple + off;
  let x = nx * r, y = ny * r, z = nz * r;
  z -= 0.08 * smoothstep(0, 1, y);   // leans back a little
  x += 0.03 * smoothstep(0.2, 1, y); // and not perfectly symmetric
  if (s > 0) {
    y -= s * 0.22 * smoothstep(-0.3, 1, y);
    y -= s * 0.19 * Math.exp(-(x * x + (z - 0.05) * (z - 0.05)) / 0.24) * smoothstep(0.1, 1, ny);
    const k = 1 + s * 0.11 * (1 - Math.min(1, Math.abs(y + 0.1))); x *= k; z *= k;
  }
  out[0] = x; out[1] = y; out[2] = z; out[3] = detail + dimple * 0.5;
}
