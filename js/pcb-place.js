// Auto placement: moves / turns the PCB parts so the connections get short and cross each other as little as possible
// (single-sided board: every crossing is a detour or a jumper). Simulated annealing; ESP32 / UNO boards and 📌 locked parts stay put.
import { rotPt, isBoard } from './sch-core.js';
import { netlist, footprintOf, partExtents, onBoard, snap, fitBoard, setBigPads } from './pcb-core.js';

const G = 1.27;          // placement grid
let GAP = 2;             // mm kept free between part bodies (room for a trace to pass)
let W_CROSS = 20;      // one crossing costs like 20 mm of extra wire
const W_OVL = 30;        // per mm² of overlap
const W_HIT = 25;        // per overlapping pair (so small overlaps still count)

// minimal spanning tree of the pads of one net (Prim) → its length and edges
function mst(pts) {
  const n = pts.length; if (n < 2) return { len: 0, edges: [] };
  const inT = new Uint8Array(n), d = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
  d[0] = 0; let len = 0; const edges = [];
  for (let it = 0; it < n; it++) {
    let b = -1; for (let i = 0; i < n; i++) if (!inT[i] && (b < 0 || d[i] < d[b])) b = i;
    inT[b] = 1; if (from[b] >= 0) { len += d[b]; edges.push([pts[from[b]], pts[b]]); }
    for (let i = 0; i < n; i++) if (!inT[i]) { const q = Math.abs(pts[i][0] - pts[b][0]) + Math.abs(pts[i][1] - pts[b][1]); if (q < d[i]) { d[i] = q; from[i] = b; } }
  }
  return { len, edges };
}
const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const cross = (p, q) => orient(p[0], p[1], q[0]) * orient(p[0], p[1], q[1]) < 0 && orient(q[0], q[1], p[0]) * orient(q[0], q[1], p[1]) < 0;
function netCross(A, B) {
  let n = 0;
  for (const e of A.edges) {
    const ex0 = Math.min(e[0][0], e[1][0]), ex1 = Math.max(e[0][0], e[1][0]), ey0 = Math.min(e[0][1], e[1][1]), ey1 = Math.max(e[0][1], e[1][1]);
    for (const f of B.edges) {
      if (Math.max(f[0][0], f[1][0]) < ex0 || Math.min(f[0][0], f[1][0]) > ex1 || Math.max(f[0][1], f[1][1]) < ey0 || Math.min(f[0][1], f[1][1]) > ey1) continue;
      if (cross(e, f)) n++;
    }
  }
  return n;
}

// steps: yields { it, iters, run, runs, cost, best, len, crosses, overlaps } now and then (L.parts shows the current try);
// returns { before, after } with { len, crosses, overlaps }. gen.return() keeps the best placement so far.
export function* autoPlaceSteps(c, opts = {}) {
  GAP = opts.gap ?? 2; W_CROSS = opts.wCross ?? 20;
  setBigPads(c.pcb?.rules?.bigPads);
  const L = c.pcb, nl = netlist(c);
  const parts = c.parts.filter(p => onBoard(p) && L.parts[p.id]);
  const N = parts.length;
  // per part: pad offsets + net for each of the 4 turns, body box for each turn
  const info = parts.map(p => {
    const bp = L.parts[p.id], nets = nl.pinNet.get(p.id) ?? [];
    const f = footprintOf(p, bp);
    const pads = f.pads.filter(pd => pd.pin >= 0 && nets[pd.pin] != null).map(pd => ({ x: pd.x, y: pd.y, net: nets[pd.pin] }));
    const rots = [0, 1, 2, 3].map(r => ({ pads: pads.map(pd => { const [x, y] = rotPt([pd.x, pd.y], r); return [x, y, pd.net]; }), box: partExtents(p, { ...bp, x: 0, y: 0, rot: r }) }));
    const fixed = isBoard(p.type) || !!bp.lock;
    return { p, bp, rots, fixed, nets: [...new Set(pads.map(q => q.net))] };
  });
  const st = info.map(i => ({ x: i.bp.x, y: i.bp.y, r: i.bp.rot & 3 }));
  const movable = info.map((_, k) => k).filter(k => !info[k].fixed);
  // nets that touch 2+ pads
  const netParts = new Map();
  info.forEach((inf, k) => inf.nets.forEach(n => { if (!netParts.has(n)) netParts.set(n, new Set()); netParts.get(n).add(k); }));
  const netIds = [...netParts.keys()].filter(n => info.reduce((s, inf) => s + inf.rots[0].pads.filter(q => q[2] === n).length, 0) >= 2);
  const nIdx = new Map(netIds.map((n, i) => [n, i]));
  const M = netIds.length;
  const netPts = (n) => { const out = []; for (const k of netParts.get(n)) { const s = st[k]; for (const q of info[k].rots[s.r].pads) if (q[2] === n) out.push([s.x + q[0], s.y + q[1]]); } return out; };
  let trees = netIds.map(n => mst(netPts(n)));
  let X = Array.from({ length: M }, () => new Int32Array(M));
  for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) X[a][b] = X[b][a] = netCross(trees[a], trees[b]);
  const box = (k) => { const s = st[k], b = info[k].rots[s.r].box; return [s.x + b[0] - GAP / 2, s.y + b[1] - GAP / 2, s.x + b[2] + GAP / 2, s.y + b[3] + GAP / 2]; };
  const ovl = (i, j) => { const a = box(i), b = box(j); const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return ox > 0 && oy > 0 ? ox * oy : 0; };
  const partOvl = (k, skip = -1) => { let s = 0, h = 0; for (let j = 0; j < N; j++) if (j !== k && j !== skip) { const o = ovl(k, j); if (o) { s += o; h++; } } return W_OVL * s + W_HIT * h; };
  const totals = () => {
    let len = 0, cr = 0, ov = 0, hits = 0;
    for (const t of trees) len += t.len;
    for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) cr += X[a][b];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const o = ovl(i, j); if (o) { ov += o; hits++; } }
    return { len, crosses: cr, overlaps: hits, cost: len + W_CROSS * cr + W_OVL * ov + W_HIT * hits };
  };
  const before = totals();
  if (!movable.length || !M) { return { before, after: before, nothing: true }; }

  // one move = change parts ks; cost delta from their nets + their overlaps
  const touched = (ks) => { const s = new Set(); for (const k of ks) for (const n of info[k].nets) if (nIdx.has(n)) s.add(nIdx.get(n)); return [...s]; };
  function localCost(ks, nets) {
    let c0 = 0; for (const a of nets) c0 += trees[a].len;
    const ns = new Set(nets);
    for (const a of nets) for (let b = 0; b < M; b++) if (b !== a && !(ns.has(b) && b < a)) c0 += W_CROSS * X[a][b];
    c0 += partOvl(ks[0]); if (ks[1] != null) c0 += partOvl(ks[1], ks[0]);
    return c0;
  }
  function tryMove(ks, apply, T) {
    const nets = touched(ks);
    const c0 = localCost(ks, nets);
    const old = ks.map(k => ({ ...st[k] })), oldT = nets.map(a => trees[a]), oldX = nets.map(a => Array.from(X[a]));
    apply();
    for (const a of nets) trees[a] = mst(netPts(netIds[a]));
    for (const a of nets) for (let b = 0; b < M; b++) if (b !== a) X[a][b] = X[b][a] = netCross(trees[a], trees[b]);
    const d = localCost(ks, nets) - c0;
    if (d <= 0 || Math.random() < Math.exp(-d / T)) return d;
    ks.forEach((k, i) => { st[k] = old[i]; });
    nets.forEach((a, i) => { trees[a] = oldT[i]; for (let b = 0; b < M; b++) X[a][b] = X[b][a] = oldX[i][b]; });
    return null;
  }
  // board size → how far a part may jump
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let k = 0; k < N; k++) { const b = box(k); bx0 = Math.min(bx0, b[0]); by0 = Math.min(by0, b[1]); bx1 = Math.max(bx1, b[2]); by1 = Math.max(by1, b[3]); }
  const span = Math.max(20, bx1 - bx0, by1 - by0);
  const pick = () => movable[(Math.random() * movable.length) | 0];
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += Math.random(); return (u - 2) * 1.22; };
  function randomMove(T, reach) {
    const r = Math.random();
    if (r < 0.15 && movable.length > 1) {                              // swap two parts
      const a = pick(); let b = pick(); if (a === b) return null;
      return tryMove([a, b], () => { const sa = st[a], sb = st[b]; [sa.x, sb.x] = [sb.x, sa.x]; [sa.y, sb.y] = [sb.y, sa.y]; }, T);
    }
    const k = pick();
    if (r < 0.32 && opts.rotate !== false) return tryMove([k], () => { st[k].r = (st[k].r + (Math.random() < 0.5 ? 1 : 3)) & 3; }, T);
    const sr = Math.max(G, reach);
    const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));      // stays inside the area the parts use now
    return tryMove([k], () => { st[k].x = snap(cl(st[k].x + gauss() * sr, bx0, bx1), G); st[k].y = snap(cl(st[k].y + gauss() * sr, by0, by1), G); }, T);
  }
  const snapState = () => st.map(s => ({ ...s }));
  const write = (S) => { info.forEach((inf, k) => { if (inf.fixed) return; inf.bp.x = S[k].x; inf.bp.y = S[k].y; inf.bp.rot = S[k].r; }); };
  const restore = (S) => { S.forEach((s, k) => { st[k] = { ...s }; }); trees = netIds.map(n => mst(netPts(n))); for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) X[a][b] = X[b][a] = netCross(trees[a], trees[b]); };

  // temperature from the size of typical moves
  const start = snapState();
  let sum = 0, cnt = 0;
  for (let i = 0; i < 60; i++) { const d = randomMove(1e9, span * 0.2); if (d != null) { sum += Math.abs(d); cnt++; } }
  restore(start);
  const T0 = Math.max(1, (sum / Math.max(1, cnt)) * 0.6), T1 = T0 * 0.002;
  const runs = opts.runs ?? 2, iters = opts.iters ?? Math.min(30000, Math.max(3000, 500 * movable.length));
  let best = { ...before, S: start };
  let shownAt = 0;
  try {
    for (let run = 0; run < runs; run++) {
      restore(run === 0 || !best.S ? start : best.S);
      let cur = totals().cost, runBest = { cost: cur, S: snapState() };
      for (let it = 0; it < iters; it++) {
        const f = it / iters, T = T0 * Math.pow(T1 / T0, f) * (run ? 0.3 : 1);
        const d = randomMove(T, span * 0.35 * Math.pow(1 - f, 1.5));
        if (d != null) { cur += d; if (cur < runBest.cost - 1e-9) runBest = { cost: cur, S: snapState() }; }
        if (it - shownAt >= Math.ceil(iters / 60) || it === iters - 1) {
          shownAt = it;
          write(st);
          const tt = totals();
          yield { run, runs, it: it + 1, iters, cost: tt.cost, best: Math.min(best.cost, runBest.cost), len: tt.len, crosses: tt.crosses, overlaps: tt.overlaps };
        }
      }
      restore(runBest.S);
      const tt = totals();
      if (tt.cost < best.cost) best = { ...tt, S: runBest.S };
    }
  } finally {
    // apply the best one found, clean leftovers (snap, push touching bodies apart), fit the board around it
    restore(best.S); write(best.S);
    // bodies still touching: push apart (a fixed part never moves, the other one takes the whole push)
    for (let pass = 0; pass < 120; pass++) {
      let moved = false;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        if (info[i].fixed && info[j].fixed) continue;
        const a = partExtents(info[i].p, info[i].bp), b = partExtents(info[j].p, info[j].bp);
        const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + GAP, oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + GAP;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const wa = info[i].fixed ? 0 : info[j].fixed ? 1 : 0.5, wb = 1 - wa, A = info[i].bp, B = info[j].bp;
        if (ox < oy) { const s = (a[0] + a[2] < b[0] + b[2] ? 1 : -1) * (ox + 0.7); A.x -= s * wa; B.x += s * wb; }
        else { const s = (a[1] + a[3] < b[1] + b[3] ? 1 : -1) * (oy + 0.7); A.y -= s * wa; B.y += s * wb; }
      }
      if (!moved) break;
    }
    for (const inf of info) if (!inf.fixed) { inf.bp.x = snap(inf.bp.x, G); inf.bp.y = snap(inf.bp.y, G); }
    fitBoard(c, 4);
  }
  // final numbers from the real board
  info.forEach((inf, k) => { st[k] = { x: inf.bp.x, y: inf.bp.y, r: inf.bp.rot & 3 }; });
  trees = netIds.map(n => mst(netPts(n))); for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) X[a][b] = X[b][a] = netCross(trees[a], trees[b]);
  return { before, after: totals() };
}
export function autoPlace(c, opts) { const g = autoPlaceSteps(c, opts); let s; do s = g.next(); while (!s.done); return s.value; }
