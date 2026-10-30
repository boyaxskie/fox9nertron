// Single-sided autorouter: grid maze router (Dijkstra, 8 directions, turn penalty).
// Keeps clearance to other nets with a distance map, routes short connections first, retries failed ones first.
import { analyze, netlist, padCapsule } from './pcb-core.js';

// exact Euclidean distance transform (Felzenszwalb): f = 0 at features, INF elsewhere → squared distance in cells
export function edt(mask, nx, ny) {
  const INF = 1e20, out = new Float64Array(nx * ny);
  const n = Math.max(nx, ny), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const d1 = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < nx; x++) { for (let y = 0; y < ny; y++) f[y] = mask[y * nx + x] ? 0 : INF; d1(ny); for (let y = 0; y < ny; y++) out[y * nx + x] = d[y]; }
  for (let y = 0; y < ny; y++) { for (let x = 0; x < nx; x++) f[x] = out[y * nx + x]; d1(nx); for (let x = 0; x < nx; x++) out[y * nx + x] = d[x]; }
  return out;
}

// paint a capsule (segment + radius) into a grid
function paintCap(grid, nx, ny, gs, cap, val, extra = 0) {
  const r = cap.r + extra;
  const x0 = Math.max(0, Math.floor((Math.min(cap.x1, cap.x2) - r) / gs)), x1 = Math.min(nx - 1, Math.ceil((Math.max(cap.x1, cap.x2) + r) / gs));
  const y0 = Math.max(0, Math.floor((Math.min(cap.y1, cap.y2) - r) / gs)), y1 = Math.min(ny - 1, Math.ceil((Math.max(cap.y1, cap.y2) + r) / gs));
  const vx = cap.x2 - cap.x1, vy = cap.y2 - cap.y1, l2 = vx * vx + vy * vy;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const px = i * gs, py = j * gs;
    const t = l2 ? Math.max(0, Math.min(1, ((px - cap.x1) * vx + (py - cap.y1) * vy) / l2)) : 0;
    if (Math.hypot(px - cap.x1 - t * vx, py - cap.y1 - t * vy) <= r) grid[j * nx + i] = val;
  }
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(); const n = k.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; }
  get size() { return this.k.length; }
}
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// route every missing connection. keepManual: traces drawn by hand stay. Returns { routed, failed: [{a,b}] }
export function autoroute(c, { keepManual = true, onProgress } = {}) {
  const L = c.pcb, R = L.rules, gs = R.grid;
  L.traces = keepManual ? L.traces.filter(t => !t.auto) : [];
  L.jumpers = keepManual ? (L.jumpers ?? []).filter(t => !t.auto) : [];
  const nl = netlist(c);
  const nx = Math.floor(L.w / gs) + 1, ny = Math.floor(L.h / gs) + 1, N = nx * ny;
  let best = null;
  const base = JSON.stringify(L.traces), baseJ = JSON.stringify(L.jumpers);
  const hard = new Map();          // net → how often it failed (routed earlier next time)
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let attempt = 0; attempt < 6; attempt++) {
    L.traces = JSON.parse(base); L.jumpers = JSON.parse(baseJ);
    const an = analyze(c, nl);
    // boxed-in pads (many other-net pads close by) go first, then short connections
    const crowd = (pd) => an.pads.filter(q => q.net !== pd.net && Math.hypot(q.x - pd.x, q.y - pd.y) < 3.6).length;
    let edges = an.rats.map(e => ({ e, k: e.d * (attempt >= 3 ? 0.5 + rnd() : 1) - 8 * Math.max(crowd(e.a), crowd(e.b)) - 1000 * (hard.get(e.net) ?? 0) })).sort((a, b) => a.k - b.k).map(x => x.e);
    let failed = [];
    let routed = 0;
    for (let round = 0; round < 4 && edges.length; round++) {
    failed = [];
    for (const e of edges) {
      // current connectivity (earlier routes may have joined this already)
      const now = analyze(c, nl);
      if (sameCluster(now, e.a, e.b)) continue;
      const net = e.net, power = nl.nets[net]?.power;
      let ok = false;
      const jumpsOk = R.jumpers !== false, early = jumpsOk && attempt >= 2;      // later attempts: hop early instead of boxing pads in
      for (const [w, jump] of [...(power ? [[R.power, early]] : []), [R.trace, early], ...(jumpsOk && !early ? [[R.trace, true]] : [])]) {
        const r = routeOne(c, now, nl, e, w, gs, nx, ny, N, jump);
        if (r) { for (const pts of r.traces) L.traces.push({ w, pts, auto: true }); for (const j of r.jumpers) L.jumpers.push({ ...j, auto: true }); ok = true; routed++; break; }
      }
      if (!ok) failed.push(e);
      onProgress?.(routed, edges.length);
    }
    // a route may have joined a different piece of the same net: route what is still missing
    const left = analyze(c, nl).rats;
    const fk = new Set(failed.map(edgeKey));
    edges = left.filter(e => !fk.has(edgeKey(e))).sort((a, b) => a.d - b.d);
    if (!edges.length) { failed = left; break; }
    failed = left;
    }
    const res = { routed, failed, traces: JSON.stringify(L.traces), jumpers: JSON.stringify(L.jumpers) };
    if (!best || failed.length < best.failed.length || (failed.length === best.failed.length && L.jumpers.length < JSON.parse(best.jumpers).length)) best = res;
    if (!failed.length) break;
    for (const f of failed) hard.set(f.net, (hard.get(f.net) ?? 0) + 1);
  }
  L.traces = JSON.parse(best.traces); L.jumpers = JSON.parse(best.jumpers);
  return { routed: best.routed, failed: best.failed, jumpers: L.jumpers.filter(j => j.auto).length };
}
const edgeKey = (e) => `${e.a.part.id}.${e.a.k}-${e.b.part.id}.${e.b.k}`;
function sameCluster(an, a, b) {
  const ia = an.items.find(it => it.kind === 'pad' && it.pad.part === a.part && it.pad.k === a.k);
  const ib = an.items.find(it => it.kind === 'pad' && it.pad.part === b.part && it.pad.k === b.k);
  return ia && ib && ia.cl === ib.cl;
}

function routeOne(c, an, nl, e, w, gs, nx, ny, N, allowJump = false) {
  const L = c.pcb, R = L.rules, net = e.net;
  // obstacles: copper of other nets (and unconnected pads), blocked within w/2 + clearance
  const other = new Uint8Array(N), mine = new Uint8Array(N), target = new Uint8Array(N), start = new Uint8Array(N);
  const ia = an.items.find(it => it.kind === 'pad' && it.pad.part === e.a.part && it.pad.k === e.a.k);
  for (const it of an.items) {
    const itNet = it.net;
    if (itNet === net && itNet >= 0) {
      paintCap(mine, nx, ny, gs, it.cap, 1);
      if (it.cl === ia.cl) paintCap(start, nx, ny, gs, it.kind === 'pad' ? { ...it.cap, r: Math.min(it.cap.r, 0.3) } : it.cap, 1);
      else paintCap(target, nx, ny, gs, it.kind === 'pad' ? { ...it.cap, r: Math.min(it.cap.r, 0.3) } : it.cap, 1);
    } else paintCap(other, nx, ny, gs, it.cap, 1);
  }
  const d2 = edt(other, nx, ny);
  const need = (w / 2 + R.clear) / gs + 0.75, need2 = need * need;   // +0.75 cell: grid rounding margin
  const edge = (w / 2 + R.edge) / gs;
  const free = new Uint8Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (i < edge || j < edge || i > nx - 1 - edge || j > ny - 1 - edge) continue;
    if (d2[k] < need2 - 1e-9) continue;
    free[k] = 1;
  }
  // start / target cells are allowed even inside the keep-out of their own pads' neighbours only if free
  const dist = new Float64Array(N * 8).fill(Infinity), prev = new Int32Array(N * 8).fill(-1);
  const h = new Heap();
  let any = false;
  for (let k = 0; k < N; k++) if (start[k] && free[k]) { for (let d = 0; d < 8; d++) { dist[k * 8 + d] = 0; } h.push(0, k * 8); any = true; }
  if (!any) return null;
  let end = -1;
  const TURN = 0.6, NEAR = 0.15, JUMP = 40;
  // jumper wire (top side): hop straight over traces, 5.08 / 7.62 / 10.16 mm, both ends need room for a pad
  let padFree = null; const viaJump = allowJump ? new Uint8Array(N * 8) : null;
  if (allowJump) {
    const pr = (JPAD / 2 + R.clear) / gs + 0.75, pr2 = pr * pr, pe = (JPAD / 2 + R.edge) / gs;
    padFree = new Uint8Array(N);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i >= pe && j >= pe && i <= nx - 1 - pe && j <= ny - 1 - pe && d2[k] >= pr2 && !mine[k]) padFree[k] = 1; }
  }
  const hops = allowJump ? [2, 3, 4, 5, 6, 8].map(n => Math.round(n * 2.54 / gs)) : [];
  while (h.size) {
    const s = h.pop(), k = s >> 3, dir = s & 7, cost = dist[s];
    if (cost > dist[s]) continue;
    if (target[k] && free[k]) { end = s; break; }
    const i = k % nx, j = (k - i) / nx;
    for (let d = 0; d < 8; d++) {
      const [dx, dy, len] = DIRS[d], i2 = i + dx, j2 = j + dy;
      if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
      const k2 = j2 * nx + i2;
      if (!free[k2]) continue;
      if (dx && dy && (!free[j * nx + i2] || !free[j2 * nx + i])) continue;   // no corner cutting
      // a little extra cost close to obstacles keeps traces centred in channels
      const near = d2[k2] < (need + 2) * (need + 2) ? NEAR : 0;
      const nc = cost + len + (cost > 0 && d !== dir ? TURN : 0) + near;
      const s2 = k2 * 8 + d;
      if (nc < dist[s2]) { dist[s2] = nc; prev[s2] = s; if (viaJump) viaJump[s2] = 0; h.push(nc, s2); }
    }
    if (allowJump && padFree[k] && !(viaJump[s])) for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d];
      for (const H of hops) {
        const i2 = i + dx * H, j2 = j + dy * H;
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        const k2 = j2 * nx + i2;
        if (!padFree[k2] || !free[k2]) continue;
        const nc = cost + H + JUMP, s2 = k2 * 8 + d;
        if (nc < dist[s2]) { dist[s2] = nc; prev[s2] = s; viaJump[s2] = 1; h.push(nc, s2); }
      }
    }
  }
  if (end < 0) return null;
  const states = [];
  for (let s = end; s >= 0; s = prev[s]) { states.push(s); if (dist[s] === 0) break; }
  states.reverse();
  // split into trace pieces at the jumps
  const pieces = [[]], jumpers = [];
  states.forEach((st, q) => {
    if (q > 0 && viaJump && viaJump[st]) { const a = states[q - 1] >> 3, b = st >> 3; jumpers.push([a, b]); pieces.push([]); }
    pieces[pieces.length - 1].push(st >> 3);
  });
  const xy = (k) => [round((k % nx) * gs), round(Math.floor(k / nx) * gs)];
  const corners = (cells) => cells.filter((k, q) => q === 0 || q === cells.length - 1 || cells[q + 1] - k !== k - cells[q - 1]).map(xy);
  const padAt = (k, sameCl) => { const [x, y] = xy(k); return an.items.find(it => it.kind === 'pad' && it.net === net && (sameCl ? it.cl === ia.cl : it.cl !== ia.cl) && Math.hypot(it.pad.x - x, it.pad.y - y) <= 0.3 + gs); };
  const first = pieces[0][0], lastP = pieces[pieces.length - 1], last = lastP[lastP.length - 1];
  const sp = padAt(first, true), tp = padAt(last, false);
  const traces = pieces.map((cells, q) => {
    const pts = corners(cells);
    if (q === 0 && sp) pts.unshift([round(sp.pad.x), round(sp.pad.y)]);
    if (q === pieces.length - 1 && tp) pts.push([round(tp.pad.x), round(tp.pad.y)]);
    return cleanPath(pts);
  }).filter(p => p.length >= 2);
  return { traces, jumpers: jumpers.map(([a, b]) => { const [x1, y1] = xy(a), [x2, y2] = xy(b); return { x1, y1, x2, y2 }; }) };
}
export const JPAD = 1.8;
const round = (v) => Math.round(v * 1000) / 1000;
// drop duplicate and collinear points
export function cleanPath(pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) continue; out.push(p); }
  for (let i = out.length - 2; i >= 1; i--) {
    const [ax, ay] = out[i - 1], [bx, by] = out[i], [cx, cy] = out[i + 1];
    if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) < 1e-6) out.splice(i, 1);
  }
  return out;
}
