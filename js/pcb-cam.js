// CAM for a CNC 3018 (GRBL): isolation milling with a V-bit, drilling, board cutout with tabs.
// Copper is drawn into a fine bitmap, a distance map gives the tool centre line at the bit radius (marching squares).
// Machine origin: lower-left corner of the board, Z0 = top of the copper. Bottom copper is mirrored (flip the board left↔right).
import { analyze, padCapsule } from './pcb-core.js';
import { edt } from './pcb-route.js';

export const vWidth = (cam) => cam.vTip + 2 * cam.isoDepth * Math.tan((cam.vAngle / 2) * Math.PI / 180);

// ---------- copper bitmap ----------
function paint(mask, nx, ny, res, ox, oy, pd) {
  // pd: {kind:'cap', x1,y1,x2,y2,r} or {kind:'rect', x,y,w,h}
  const pad = pd.kind === 'rect' ? 0 : pd.r;
  const xa = pd.kind === 'rect' ? pd.x - pd.w / 2 : Math.min(pd.x1, pd.x2) - pad, xb = pd.kind === 'rect' ? pd.x + pd.w / 2 : Math.max(pd.x1, pd.x2) + pad;
  const ya = pd.kind === 'rect' ? pd.y - pd.h / 2 : Math.min(pd.y1, pd.y2) - pad, yb = pd.kind === 'rect' ? pd.y + pd.h / 2 : Math.max(pd.y1, pd.y2) + pad;
  const i0 = Math.max(0, Math.floor((xa - ox) / res)), i1 = Math.min(nx - 1, Math.ceil((xb - ox) / res));
  const j0 = Math.max(0, Math.floor((ya - oy) / res)), j1 = Math.min(ny - 1, Math.ceil((yb - oy) / res));
  if (pd.kind === 'rect') { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = ox + i * res, y = oy + j * res; if (x >= xa && x <= xb && y >= ya && y <= yb) mask[j * nx + i] = 1; } return; }
  const vx = pd.x2 - pd.x1, vy = pd.y2 - pd.y1, l2 = vx * vx + vy * vy, r2 = pd.r * pd.r;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = ox + i * res, y = oy + j * res;
    const t = l2 ? Math.max(0, Math.min(1, ((x - pd.x1) * vx + (y - pd.y1) * vy) / l2)) : 0;
    const dx = x - pd.x1 - t * vx, dy = y - pd.y1 - t * vy;
    if (dx * dx + dy * dy <= r2) mask[j * nx + i] = 1;
  }
}
export function copperShapes(c, an) {
  const sh = [];
  for (const pd of an.pads) sh.push(pd.shape === 'rect' ? { kind: 'rect', x: pd.x, y: pd.y, w: pd.w, h: pd.h } : { kind: 'cap', ...padCapsule(pd) });
  for (const t of c.pcb.traces) for (let k = 0; k + 1 < t.pts.length; k++) sh.push({ kind: 'cap', x1: t.pts[k][0], y1: t.pts[k][1], x2: t.pts[k + 1][0], y2: t.pts[k + 1][1], r: t.w / 2 });
  return sh;
}

// ---------- marching squares: closed contours of field f at level 0 (f < 0 = inside) ----------
function contours(f, nx, ny) {
  const N = nx * ny, pts = new Map();             // edge id → [x, y] in grid units
  const ept = (id) => {
    if (pts.has(id)) return id;
    let a, b, x0, y0, x1, y1;
    if (id < N) { const i = id % nx, j = (id - i) / nx; a = f[id]; b = f[id + 1]; x0 = i; y0 = j; x1 = i + 1; y1 = j; }
    else { const k = id - N, i = k % nx, j = (k - i) / nx; a = f[k]; b = f[k + nx]; x0 = i; y0 = j; x1 = i; y1 = j + 1; }
    const t = a / (a - b);
    pts.set(id, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    return id;
  };
  const link = new Map();                        // edge id → [other ends]
  const add = (e1, e2) => { ept(e1); ept(e2); (link.get(e1) ?? link.set(e1, []).get(e1)).push(e2); (link.get(e2) ?? link.set(e2, []).get(e2)).push(e1); };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = j * nx + i;
    const tl = f[k] < 0, tr = f[k + 1] < 0, br = f[k + nx + 1] < 0, bl = f[k + nx] < 0;
    const cs = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (cs === 0 || cs === 15) continue;
    const T = k, B = k + nx, Lf = N + k, Rt = N + k + 1;
    switch (cs) {
      case 1: case 14: add(Lf, B); break;
      case 2: case 13: add(B, Rt); break;
      case 3: case 12: add(Lf, Rt); break;
      case 4: case 11: add(T, Rt); break;
      case 6: case 9: add(T, B); break;
      case 7: case 8: add(Lf, T); break;
      case 5: case 10: {
        const ctr = (f[k] + f[k + 1] + f[k + nx] + f[k + nx + 1]) / 4 < 0;
        if ((cs === 5) === ctr) { add(Lf, T); add(B, Rt); } else { add(Lf, B); add(T, Rt); }
        break;
      }
    }
  }
  const used = new Set(), loops = [];
  for (const start of link.keys()) {
    if (used.has(start)) continue;
    const loop = [start]; used.add(start);
    let prev = start, cur = link.get(start)[0];
    while (cur != null && !used.has(cur)) {
      loop.push(cur); used.add(cur);
      const nb = link.get(cur); const nxt = nb[0] === prev ? nb[1] : nb[0];
      prev = cur; cur = nxt;
    }
    if (loop.length > 2) loops.push(loop.map(id => pts.get(id)));
  }
  return loops;
}
// Ramer–Douglas–Peucker
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], vx = bx - ax, vy = by - ay, l = Math.hypot(vx, vy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * vy - (pts[i][1] - ay) * vx) / l; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ---------- the three jobs ----------
export function isolationPaths(c, an = analyze(c)) {
  const L = c.pcb, cam = L.cam, w = vWidth(cam);
  const passes = Math.max(1, Math.round(cam.isoPasses)), step = w * (1 - Math.min(0.9, Math.max(0, cam.isoOverlap)));
  const reach = w / 2 + (passes - 1) * step;
  let res = Math.min(0.05, Math.max(0.02, w / 4));
  const M = reach + 1;
  // keep the bitmap under ~6 M pixels
  while (((L.w + 2 * M) / res) * ((L.h + 2 * M) / res) > 6e6) res *= 1.25;
  const ox = -M, oy = -M, nx = Math.ceil((L.w + 2 * M) / res) + 1, ny = Math.ceil((L.h + 2 * M) / res) + 1;
  const mask = new Uint8Array(nx * ny);
  for (const s of copperShapes(c, an)) paint(mask, nx, ny, res, ox, oy, s);
  const d2 = edt(mask, nx, ny);
  const dist = new Float32Array(nx * ny); for (let k = 0; k < dist.length; k++) dist[k] = Math.sqrt(d2[k]) * res;
  const loops = [];
  const f = new Float32Array(nx * ny);
  for (let p = 0; p < passes; p++) {
    // + res: bitmap rounding, + tol: straightening arcs into chords — keeps the bit clear of the copper
    const tol = res * 0.3, lvl = w / 2 + p * step + res + tol;
    for (let k = 0; k < f.length; k++) f[k] = dist[k] - lvl;
    for (const lp of contours(f, nx, ny)) {
      const mm = simplify(lp.map(([i, j]) => [ox + i * res, oy + j * res]), tol);
      if (mm.length > 2) loops.push({ pass: p, pts: mm });
    }
  }
  return { loops, w, res, passes, margin: res * 1.3 };
}
// smallest bit that is not smaller than the hole (−0.05 mm), else the biggest
export function bitFor(d, bits) { const ok = bits.filter(b => b >= d - 0.051).sort((a, b) => a - b); return ok[0] ?? Math.max(...bits); }
export function drillHoles(c, an = analyze(c)) {
  const bits = String(c.pcb.cam.bits).split(/[ ,;]+/).map(Number).filter(b => b > 0);
  if (!bits.length) bits.push(0.8);
  const groups = new Map();
  for (const pd of an.pads) if (pd.drill > 0) { const b = bitFor(pd.drill, bits); (groups.get(b) ?? groups.set(b, []).get(b)).push({ x: pd.x, y: pd.y, d: pd.drill }); }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([bit, holes]) => ({ bit, holes: nearestOrder(holes) }));
}
function nearestOrder(items, at = [0, 0], key = (h) => [h.x, h.y]) {
  const left = items.slice(), out = []; let [cx, cy] = at;
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((h, i) => { const [x, y] = key(h); const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; bi = i; } }); const h = left.splice(bi, 1)[0]; out.push(h); [cx, cy] = key(h); }
  return out;
}
// cutout: rectangle around the board (tool outside), with tabs in the deepest passes
export function cutoutPath(c) {
  const L = c.pcb, cam = L.cam, r = cam.cutDia / 2;
  const x0 = -r, y0 = -r, x1 = L.w + r, y1 = L.h + r;
  const corners = [[x0, y1], [x1, y1], [x1, y0], [x0, y0], [x0, y1]];    // board coords (y down): start bottom-left, go around
  const sides = []; for (let i = 0; i < 4; i++) sides.push([corners[i], corners[i + 1]]);
  const nt = Math.max(0, Math.round(cam.tabs));
  // which sides get a tab: 4 → all, 2 → left + right, 1..3 → first sides, more → split evenly
  const tabsOn = sides.map((_, i) => (nt >= 4 ? Math.floor(nt / 4) + (i < nt % 4 ? 1 : 0) : nt === 2 ? (i % 2 === 1 ? 1 : 0) : i < nt ? 1 : 0));
  const tabLen = cam.tabW + cam.cutDia;
  const depth = cam.cutDepth, stepz = Math.max(0.05, cam.cutStep), tabTop = -(cam.thick - cam.tabH);
  const passes = []; for (let z = -stepz; ; z -= stepz) { passes.push(Math.max(z, -depth)); if (z <= -depth) break; }
  const out = [];
  for (const z of passes) {
    const pts = [];
    sides.forEach(([[ax, ay], [bx, by]], si) => {
      const len = Math.hypot(bx - ax, by - ay), n = tabsOn[si];
      const at = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
      if (z >= tabTop || !n || len < tabLen * 2) { pts.push([...at(0), z]); return; }
      pts.push([...at(0), z]);
      for (let k = 1; k <= n; k++) {
        const mid = k / (n + 1), t0 = mid - tabLen / 2 / len, t1 = mid + tabLen / 2 / len;
        pts.push([...at(t0), z], [...at(t0), tabTop], [...at(t1), tabTop], [...at(t1), z]);
      }
    });
    pts.push([...corners[4], z]);
    out.push({ z, pts });
  }
  return out;
}

// ---------- G-code ----------
const f3 = (v) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(3).replace(/\.?0+$/, ''));
function machine(c) {
  const L = c.pcb, mir = !!L.cam.mirror;
  return ([x, y]) => [mir ? L.w - x : x, L.h - y];
}
function header(c, title, lines = []) {
  const L = c.pcb, cam = L.cam;
  return [`(Fox9nertron PCB · ${title})`, `(${c.title ?? 'circuit'} · board ${L.w} x ${L.h} mm${cam.mirror ? ' · MIRRORED for bottom copper' : ''})`, '(Origin X0 Y0 = lower-left board corner, Z0 = top of the copper)', ...lines.map(l => `(${l})`),
    'G21', 'G90', 'G94', 'G17', `G0 Z${f3(cam.zSafe)}`, `M3 S${Math.round(cam.rpm)}`, 'G4 P3'];
}
const footer = (cam) => [`G0 Z${f3(cam.zSafe)}`, 'M5', 'G0 X0 Y0', 'M2'];

export function camAll(c) {
  const L = c.pcb, cam = L.cam, an = analyze(c), M = machine(c);
  const iso = isolationPaths(c, an), holes = drillHoles(c, an), cut = cutoutPath(c);
  const stats = {}, warn = [];
  // isolation
  {
    const g = header(c, 'isolation (V-bit)', [`V-bit ${cam.vAngle} deg, tip ${cam.vTip} mm, depth ${cam.isoDepth} mm → cuts ${f3(iso.w)} mm wide`, `${iso.passes} pass(es), ${iso.loops.length} loops`]);
    let cutLen = 0, travel = 0, at = [0, 0];
    const order = nearestOrder(iso.loops, [0, L.h], (lp) => lp.pts[0]);
    for (const lp of order) {
      const p0 = lp.pts[0];
      travel += Math.hypot(p0[0] - at[0], p0[1] - at[1]);
      const [X, Y] = M(p0);
      g.push(`G0 Z${f3(cam.zTravel)}`, `G0 X${f3(X)} Y${f3(Y)}`, `G1 Z${f3(-cam.isoDepth)} F${Math.round(cam.plunge)}`);
      let first = true;
      for (const p of [...lp.pts.slice(1), p0]) { const [x, y] = M(p); g.push(`G1 X${f3(x)} Y${f3(y)}${first ? ` F${Math.round(cam.isoFeed)}` : ''}`); first = false; }
      for (let k = 0; k < lp.pts.length; k++) { const a = lp.pts[k], b = lp.pts[(k + 1) % lp.pts.length]; cutLen += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      at = p0;
    }
    g.push(...footer(cam));
    stats.iso = { lines: g.length, cutLen, minutes: cutLen / cam.isoFeed + order.length * (cam.isoDepth + cam.zTravel) / cam.plunge + travel / 1000 };
    stats.iso.gcode = g.join('\n') + '\n';
  }
  // drilling
  {
    const g = header(c, 'drilling', holes.map(h => `${h.holes.length} holes with ${h.bit} mm bit`));
    let n = 0, travel = 0;
    holes.forEach((grp, gi) => {
      if (gi > 0) g.push(`G0 Z${f3(Math.max(cam.zSafe, 10))}`, 'M5', `(CHANGE BIT TO ${grp.bit} mm, set Z0 on the copper again, then resume)`, 'M0', `M3 S${Math.round(cam.rpm)}`, 'G4 P3');
      else g.push(`(BIT ${grp.bit} mm)`);
      let at = [0, L.h];
      for (const h of grp.holes) {
        const [X, Y] = M([h.x, h.y]); travel += Math.hypot(h.x - at[0], h.y - at[1]); at = [h.x, h.y];
        g.push(`G0 X${f3(X)} Y${f3(Y)}`, `G1 Z${f3(-cam.drillDepth)} F${Math.round(cam.drillFeed)}`, `G0 Z${f3(cam.zTravel)}`); n++;
      }
    });
    g.push(...footer(cam));
    stats.drill = { holes: n, bits: holes.map(h => h.bit), minutes: n * (cam.drillDepth + cam.zTravel) / cam.drillFeed + travel / 1000 + (holes.length - 1) * 1, gcode: g.join('\n') + '\n' };
  }
  // cutout
  {
    const g = header(c, 'board cutout', [`end mill ${cam.cutDia} mm, ${cut.length} passes to ${cam.cutDepth} mm, ${cam.tabs} tabs ${cam.tabW} mm wide x ${cam.tabH} mm high`]);
    let len = 0;
    const p0 = cut[0].pts[0], [X0, Y0] = M(p0);
    g.push(`G0 Z${f3(cam.zTravel)}`, `G0 X${f3(X0)} Y${f3(Y0)}`);
    for (const ps of cut) {
      let first = true;
      for (const [x, y, z] of ps.pts) {
        const [X, Y] = M([x, y]);
        g.push(`G1 X${f3(X)} Y${f3(Y)} Z${f3(z)} F${Math.round(first ? cam.plunge : cam.cutFeed)}`); first = false;
      }
      for (let k = 0; k + 1 < ps.pts.length; k++) len += Math.hypot(ps.pts[k + 1][0] - ps.pts[k][0], ps.pts[k + 1][1] - ps.pts[k][1]);
    }
    g.push(...footer(cam));
    stats.cut = { passes: cut.length, minutes: len / cam.cutFeed + cut.length * cam.cutStep / cam.plunge, gcode: g.join('\n') + '\n' };
  }
  // will the V-bit fit between copper of different nets?
  const tight = [];
  const items = an.items;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (A.cl === B.cl) continue;
    if (A.net >= 0 && A.net === B.net) continue;
    const a = A.cap, b = B.cap;
    if (Math.abs((a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2) > 30 && Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) > 30) continue;
    const d = segGap(a, b);
    if (d < iso.w + 2 * iso.margin - 0.005) tight.push({ x: (a.x1 + b.x1) / 2, y: (a.y1 + b.y1) / 2, d });
  }
  if (tight.length) warn.push(['bad', `${tight.length} gap(s) narrower than the ${f3(iso.w)} mm cut: those spots stay joined (short). Smallest gap ${f3(Math.min(...tight.map(t => t.d)))} mm, needs ${f3(iso.w + 2 * iso.margin)} mm. Use a sharper / shallower V-bit or move traces apart.`]);
  if (an.rats.length) warn.push(['warn', `${an.rats.length} connection(s) are not routed yet: the board would be missing them.`]);
  if (an.shorts.length) warn.push(['bad', `Short circuit on the board: ${an.shorts.map(s => s.nets.join(' + ')).join(', ')}.`]);
  return { iso, holes, cut, stats, warn, tight };
}
function segGap(a, b) {
  const pt = (px, py, x1, y1, x2, y2) => { const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy; const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2)) : 0; return Math.hypot(px - x1 - t * vx, py - y1 - t * vy); };
  return Math.min(pt(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2), pt(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2), pt(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2), pt(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2)) - a.r - b.r;
}

// copper artwork for toner transfer / photo resist: top view, 1:1, black copper, holes as white dots
export function copperSvg(c, an = analyze(c)) {
  const L = c.pcb, out = [];
  for (const s of copperShapes(c, an)) {
    if (s.kind === 'rect') out.push(`<rect x="${f3(s.x - s.w / 2)}" y="${f3(s.y - s.h / 2)}" width="${f3(s.w)}" height="${f3(s.h)}"/>`);
    else out.push(`<line x1="${f3(s.x1)}" y1="${f3(s.y1)}" x2="${f3(s.x2)}" y2="${f3(s.y2)}" stroke="#000" stroke-width="${f3(2 * s.r)}" stroke-linecap="round"/>`);
  }
  const holes = an.pads.filter(p => p.drill > 0).map(p => `<circle cx="${f3(p.x)}" cy="${f3(p.y)}" r="${f3(Math.min(0.35, p.drill / 3))}" fill="#fff"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}mm" height="${L.h}mm" viewBox="0 0 ${L.w} ${L.h}">
<!-- Fox9nertron copper, seen from the parts side. Print at 100 % (no scaling) for toner transfer. -->
<rect x="0" y="0" width="${L.w}" height="${L.h}" fill="#fff" stroke="#000" stroke-width="0.1"/>
<g fill="#000">${out.join('')}</g>${holes.join('')}
</svg>`;
}

// Copper as a PDF at exact 1:1 scale (vector), seen from the parts side like the SVG. Every printer and phone opens a PDF.
// A4 page (bigger if the board is bigger), a 50 mm check ruler and "print at 100 %" note.
export function copperPdf(c, an = analyze(c), title = 'board') {
  const L = c.pcb, k = 72 / 25.4, mx = 15, my = 32;
  const pw = Math.max(210, L.w + 2 * mx), ph = Math.max(297, L.h + my + 40);
  const P = (v) => (Math.round(v * 1000) / 1000).toString();
  const ops = [];
  // board, in mm with y down: origin at (mx, my) from the top-left
  ops.push('q', `${P(k)} 0 0 ${P(-k)} ${P(mx * k)} ${P((ph - my) * k)} cm`, '1 J 1 j');
  ops.push('0 G 0.1 w', `0 0 ${P(L.w)} ${P(L.h)} re S`, '0 g');
  for (const s of copperShapes(c, an)) {
    if (s.kind === 'rect') ops.push(`${P(s.x - s.w / 2)} ${P(s.y - s.h / 2)} ${P(s.w)} ${P(s.h)} re f`);
    else ops.push(`${P(2 * s.r)} w ${P(s.x1)} ${P(s.y1)} m ${P(s.x2)} ${P(s.y2)} l S`);
  }
  ops.push('1 g');
  const K = 0.5523;
  for (const p of an.pads) {
    if (!(p.drill > 0)) continue;
    const r = Math.min(0.35, p.drill / 3), x = p.x, y = p.y;
    ops.push(`${P(x + r)} ${P(y)} m ${P(x + r)} ${P(y + K * r)} ${P(x + K * r)} ${P(y + r)} ${P(x)} ${P(y + r)} c ${P(x - K * r)} ${P(y + r)} ${P(x - r)} ${P(y + K * r)} ${P(x - r)} ${P(y)} c ${P(x - r)} ${P(y - K * r)} ${P(x - K * r)} ${P(y - r)} ${P(x)} ${P(y - r)} c ${P(x + K * r)} ${P(y - r)} ${P(x + r)} ${P(y - K * r)} ${P(x + r)} ${P(y)} c f`);
  }
  // 50 mm ruler under the board
  const ry = L.h + 12;
  ops.push('0 G 0.3 w', `0 ${P(ry)} m 50 ${P(ry)} l S`);
  for (let t = 0; t <= 50; t += 5) ops.push(`${t} ${P(ry)} m ${t} ${P(ry - (t % 10 ? 1.5 : 3))} l S`);
  ops.push('Q');
  const txt = (x, y, size, s) => ops.push('BT', `/F1 ${size} Tf`, `${P(x * k)} ${P((ph - y) * k)} Td`, `(${s.replace(/[\\()]/g, (m) => '\\' + m)}) Tj`, 'ET');
  ops.push('0 g');
  txt(mx, 14, 12, `Fox9nertron copper - ${title} - board ${+L.w.toFixed(2)} x ${+L.h.toFixed(2)} mm - seen from the parts side`);
  txt(mx, 20, 10, 'PRINT AT 100 % / ACTUAL SIZE (no "fit to page"). Check: the ruler below the board must measure exactly 50 mm.');
  txt(mx, my + L.h + 18, 9, '0');
  txt(mx + 47, my + L.h + 18, 9, '50 mm');
  const stream = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${P(pw * k)} ${P(ph * k)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
