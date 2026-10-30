// Schematic core: part library, circuit model, netlist from pins + wires, DC solver (MNA) with LEDs / diodes.
// Coordinates are grid units, y points DOWN (like paper). Parts sit on grid points and rotate in 90° steps.

export const LED_COLORS = {
  red: { vf: 1.8, rs: 12, hex: '#FF3B30' }, orange: { vf: 2.0, rs: 12, hex: '#FF9500' }, yellow: { vf: 2.1, rs: 12, hex: '#FFD60A' },
  green: { vf: 2.2, rs: 14, hex: '#34C759' }, blue: { vf: 3.0, rs: 16, hex: '#0A84FF' }, white: { vf: 3.0, rs: 16, hex: '#F2F2F7' },
};
export const DIODES = {
  '1N4007': { vf: 0.7, rs: 0.05, imax: 1, piv: 1000, note: 'general 1 A rectifier' },
  '1N5408': { vf: 0.75, rs: 0.02, imax: 3, piv: 1000, note: '3 A rectifier' },
  '1N4148': { vf: 0.65, rs: 0.5, imax: 0.2, piv: 75, note: 'small signal' },
  '1N5819': { vf: 0.35, rs: 0.05, imax: 1, piv: 40, note: 'Schottky, low drop (flyback diode)' },
};

// pins: local coords; first pin is "a" (+ / anode / start), second "b"
export const TYPES = {
  R: { label: 'Resistor', prefix: 'R', pins: [[-2, 0], [2, 0]], box: [-2, -0.7, 2, 0.7], props: { r: 1000, rating: 0.25 } },
  POT: { label: 'Potentiometer', prefix: 'RV', pins: [[-2, 0], [2, 0], [0, -2]], box: [-2, -2, 2, 0.8], props: { r: 10000, pos: 50 } },
  BAT: { label: 'Battery / DC supply', prefix: 'B', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { v: 9, rint: 0 } },
  ISRC: { label: 'Current source', prefix: 'I', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { i: 0.01 } },
  SW: { label: 'Switch', prefix: 'S', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 0.6], props: { on: false } },
  SPDT: { label: 'SPDT switch (1 pole, 2 ways)', prefix: 'S', pins: [[-2, 0], [2, -1], [2, 1]], box: [-2, -1.6, 2, 1.6], props: { on: false } },
  DPDT: { label: 'DPDT switch (2 poles, 2 ways)', prefix: 'S', pins: [[-2, -2], [2, -3], [2, -1], [-2, 2], [2, 1], [2, 3]], box: [-2, -3.6, 2, 3.6], props: { on: false } },
  PB: { label: 'Push button', prefix: 'PB', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 0.6], props: { on: false } },
  LED: { label: 'LED', prefix: 'LED', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 0.8], props: { color: 'red', imax: 0.02 } },
  D: { label: 'Diode', prefix: 'D', pins: [[-2, 0], [2, 0]], box: [-2, -0.8, 2, 0.8], props: { model: '1N4007' } },
  LAMP: { label: 'Lamp / bulb', prefix: 'LP', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { vr: 12, wr: 5 } },
  GND: { label: 'Ground', prefix: 'GND', pins: [[0, 0]], box: [-0.8, 0, 0.8, 1.6], props: {} },
  VM: { label: 'Voltmeter', prefix: 'VM', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: {} },
  AM: { label: 'Ammeter', prefix: 'AM', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: {} },
};
export const PALETTE = ['R', 'POT', 'BAT', 'LED', 'D', 'SW', 'SPDT', 'DPDT', 'PB', 'LAMP', 'ISRC', 'VM', 'AM', 'GND'];

const R_WIRE = 1e-4, R_OPEN = 1e12, G_MIN = 1e-12;

export const rotPt = ([x, y], rot) => { for (let k = 0; k < (rot & 3); k++) [x, y] = [-y, x]; return [x, y]; };
export const pinsOf = (p) => TYPES[p.type].pins.map(q => { const [x, y] = rotPt(q, p.rot); return [p.x + x, p.y + y]; });
export const key = (x, y) => `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`;

export function newCircuit() { return { v: 1, nextId: 1, parts: [], wires: [] }; }
export function addPart(c, type, x, y, rot = 0) {
  const t = TYPES[type];
  const n = c.parts.filter(p => p.type === type).length;
  let k = n + 1; const names = new Set(c.parts.map(p => p.name));
  while (names.has(t.prefix + k)) k++;
  const p = { id: c.nextId++, type, name: type === 'GND' ? 'GND' : t.prefix + k, x, y, rot, props: structuredClone(t.props) };
  c.parts.push(p);
  return p;
}
// does point (px,py) lie on segment (strictly inside)?
function onSeg(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return false;
  const cross = (px - w.x1) * dy - (py - w.y1) * dx;
  if (Math.abs(cross) > 1e-6 * Math.sqrt(l2)) return false;
  const t = ((px - w.x1) * dx + (py - w.y1) * dy) / l2;
  return t > 1e-6 && t < 1 - 1e-6;
}

// split wires at every pin / wire end lying on them (T junctions)
export function wirePieces(c) {
  const pts = [];
  for (const p of c.parts) for (const q of pinsOf(p)) pts.push(q);
  for (const w of c.wires) { pts.push([w.x1, w.y1]); pts.push([w.x2, w.y2]); }
  const out = [];
  c.wires.forEach((w, wi) => {
    const inner = pts.filter(([x, y]) => onSeg(x, y, w));
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
    const ts = [...new Set(inner.map(([x, y]) => ((x - w.x1) * dx + (y - w.y1) * dy) / l2).map(t => +t.toFixed(9)))].sort((a, b) => a - b);
    const cuts = [0, ...ts, 1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1];
      out.push({ wi, x1: w.x1 + dx * a, y1: w.y1 + dy * a, x2: w.x1 + dx * b, y2: w.y1 + dy * b });
    }
  });
  return out;
}

// how many things meet at each point (for junction dots)
export function junctions(c) {
  const count = new Map();
  const add = (x, y) => { const k = key(x, y); count.set(k, (count.get(k) ?? 0) + 1); };
  for (const w of wirePieces(c)) { add(w.x1, w.y1); add(w.x2, w.y2); }
  for (const p of c.parts) for (const [x, y] of pinsOf(p)) add(x, y);
  return [...count.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
}

// ---------- solver ----------
export function solveCircuit(c) {
  const grounds = c.parts.filter(p => p.type === 'GND');
  const nodeOf = new Map();       // point key -> node index (0 = ground)
  let nextNode = 1;
  const gkeys = new Set(grounds.map(g => key(...pinsOf(g)[0])));
  const node = (x, y) => {
    const k = key(x, y);
    if (gkeys.has(k)) return 0;
    if (!nodeOf.has(k)) nodeOf.set(k, nextNode++);
    return nodeOf.get(k);
  };
  const notes = [];
  const pieces = wirePieces(c);
  const els = [];       // {kind:'R'|'V'|'I', a, b, val, owner, role}
  const R = (a, b, val, owner, role) => els.push({ kind: 'R', a, b, val, owner, role });
  const V = (a, b, val, owner, role) => els.push({ kind: 'V', a, b, val, owner, role });
  const I = (a, b, val, owner, role) => els.push({ kind: 'I', a, b, val, owner, role });
  const inner = () => nextNode++;

  // auto ground if none: the − side of the first battery
  let autoGround = null;
  if (!grounds.length) {
    const b = c.parts.find(p => p.type === 'BAT');
    if (b) { const [x, y] = pinsOf(b)[1]; gkeys.add(key(x, y)); autoGround = b.name; }
  }
  pieces.forEach((w, k) => R(node(w.x1, w.y1), node(w.x2, w.y2), R_WIRE, null, 'wire' + k));
  const diodes = [];
  for (const p of c.parts) {
    if (p.type === 'GND') continue;
    const pins = pinsOf(p).map(([x, y]) => node(x, y));
    const [a, b] = pins, pr = p.props;
    switch (p.type) {
      case 'R': R(a, b, Math.max(pr.r, 1e-6), p, 'main'); break;
      case 'POT': {
        const f = Math.min(1, Math.max(0, pr.pos / 100));
        R(a, pins[2], Math.max(pr.r * f, 1e-3), p, 'aw'); R(pins[2], b, Math.max(pr.r * (1 - f), 1e-3), p, 'wb'); break;
      }
      case 'BAT':
        if (pr.rint > 0) { const n = inner(); V(a, n, pr.v, p, 'main'); R(n, b, pr.rint, p, 'rint'); } else V(a, b, pr.v, p, 'main');
        break;
      case 'ISRC': I(a, b, pr.i, p, 'main'); break;
      case 'SW': case 'PB': R(a, b, pr.on ? R_WIRE : R_OPEN, p, 'main'); break;
      case 'SPDT': R(a, b, pr.on ? R_OPEN : R_WIRE, p, 'p1a'); R(a, pins[2], pr.on ? R_WIRE : R_OPEN, p, 'p1b'); break;
      case 'DPDT':
        R(a, b, pr.on ? R_OPEN : R_WIRE, p, 'p1a'); R(a, pins[2], pr.on ? R_WIRE : R_OPEN, p, 'p1b');
        R(pins[3], pins[4], pr.on ? R_OPEN : R_WIRE, p, 'p2a'); R(pins[3], pins[5], pr.on ? R_WIRE : R_OPEN, p, 'p2b');
        break;
      case 'LAMP': R(a, b, pr.vr * pr.vr / Math.max(pr.wr, 1e-6), p, 'main'); break;
      case 'VM': R(a, b, 10e6, p, 'main'); break;
      case 'AM': R(a, b, R_WIRE, p, 'main'); break;
      case 'LED': case 'D': {
        const m = p.type === 'LED' ? LED_COLORS[pr.color] ?? LED_COLORS.red : DIODES[pr.model] ?? DIODES['1N4007'];
        diodes.push({ p, a, b, vf: m.vf, rs: m.rs, on: false, n: inner() });
        break;
      }
    }
  }
  if (!c.parts.some(p => p.type !== 'GND')) return { ok: false, error: 'Add some parts.' };
  if (!grounds.length && !autoGround) notes.push('No ground and no battery: voltages are measured from an arbitrary point.');
  if (autoGround) notes.push(`No ground symbol: the − side of ${autoGround} is used as 0 V.`);

  let res = null;
  for (let it = 0; it < 60; it++) {
    const all = [...els];
    for (const d of diodes) {
      if (d.on) { all.push({ kind: 'V', a: d.a, b: d.n, val: d.vf, owner: d.p, role: 'main' }); all.push({ kind: 'R', a: d.n, b: d.b, val: d.rs, owner: d.p, role: 'rs' }); }
      else all.push({ kind: 'R', a: d.a, b: d.b, val: 1e10, owner: d.p, role: 'main' });
    }
    res = mna(all, nextNode);
    if (!res) return { ok: false, error: 'Two voltage sources (batteries) are connected directly in parallel or shorted by a wire. Add a resistor.' };
    let changed = false;
    for (const d of diodes) {
      const vd = res.v[d.a] - res.v[d.b];
      if (d.on) { const e = res.els.find(x => x.owner === d.p && x.role === 'main'); if (e.i < -1e-12) { d.on = false; changed = true; } }
      else if (vd > d.vf + 1e-9) { d.on = true; changed = true; }
    }
    if (!changed) break;
    if (it === 59) notes.push('Diodes did not settle; results are approximate.');
  }
  // per-part results
  const parts = new Map();
  for (const p of c.parts) {
    if (p.type === 'GND') continue;
    const pins = pinsOf(p).map(([x, y]) => node(x, y));
    const va = res.v[pins[0]], vb = res.v[pins[1]];
    const mine = res.els.filter(e => e.owner === p);
    let i = 0, pw = 0;
    const main = mine.find(e => e.role === 'main');
    if (p.type === 'POT') {
      const aw = mine.find(e => e.role === 'aw'), wb = mine.find(e => e.role === 'wb');
      parts.set(p.id, { va, vb, vw: res.v[pins[2]], v: va - vb, iaw: aw.i, iwb: wb.i, i: aw.i, p: aw.i * aw.i * aw.val + wb.i * wb.i * wb.val });
      continue;
    }
    if (p.type === 'SPDT' || p.type === 'DPDT') {
      const cur = (role) => mine.find(e => e.role === role)?.i ?? 0;
      const i1 = p.props.on ? cur('p1b') : cur('p1a'), i2 = p.type === 'DPDT' ? (p.props.on ? cur('p2b') : cur('p2a')) : 0;
      parts.set(p.id, { va, vb, v: 0, i: i1, i1, i2, p: 0 });
      continue;
    }
    i = main ? main.i : 0;
    pw = mine.reduce((s, e) => s + (e.kind === 'R' ? e.i * e.i * e.val : e.kind === 'V' ? e.val * e.i : e.val * (res.v[e.a] - res.v[e.b])), 0);
    const d = diodes.find(x => x.p === p);
    parts.set(p.id, { va, vb, v: va - vb, i, p: pw, on: d ? d.on : undefined });
  }
  for (const p of c.parts) if (p.type === 'BAT' && Math.abs(parts.get(p.id).i) > 50) notes.push(`SHORT CIRCUIT: ${p.name} is shorted (${Math.abs(parts.get(p.id).i).toFixed(0)} A). Real batteries get hot, wires melt, fuses blow.`);
  const wires = pieces.map((w, k) => ({ ...w, i: res.els.find(e => e.role === 'wire' + k).i, va: res.v[node(w.x1, w.y1)], vb: res.v[node(w.x2, w.y2)] }));
  const vAt = (x, y) => { const k = key(x, y); if (gkeys.has(k)) return 0; const n = nodeOf.get(k); return n == null ? null : res.v[n]; };
  const sources = c.parts.filter(p => p.type === 'BAT' || p.type === 'ISRC');
  const delivered = sources.reduce((s, p) => s - parts.get(p.id).p, 0);
  return { ok: true, parts, wires, vAt, notes, delivered, nodes: nextNode };
}

// Modified Nodal Analysis with a tiny conductance to ground on every node (so open parts never make it unsolvable)
function mna(els, nNodes) {
  const vs = els.filter(e => e.kind === 'V');
  const N = nNodes - 1, M = N + vs.length;
  const A = Array.from({ length: M }, () => new Float64Array(M)), z = new Float64Array(M);
  const r = n => n - 1;
  for (let k = 0; k < N; k++) A[k][k] += G_MIN;
  for (const e of els) {
    const ia = r(e.a), ib = r(e.b);
    if (e.kind === 'R') {
      const g = 1 / e.val;
      if (ia >= 0) A[ia][ia] += g; if (ib >= 0) A[ib][ib] += g;
      if (ia >= 0 && ib >= 0) { A[ia][ib] -= g; A[ib][ia] -= g; }
    } else if (e.kind === 'I') { if (ia >= 0) z[ia] -= e.val; if (ib >= 0) z[ib] += e.val; }
  }
  vs.forEach((e, k) => {
    const c = N + k, ia = r(e.a), ib = r(e.b);
    if (ia >= 0) { A[ia][c] += 1; A[c][ia] += 1; }
    if (ib >= 0) { A[ib][c] -= 1; A[c][ib] -= 1; }
    z[c] = e.val;
  });
  const x = gauss(A, z);
  if (!x) return null;
  const v = new Float64Array(nNodes); for (let k = 0; k < N; k++) v[k + 1] = x[k];
  const out = els.map(e => {
    let i;
    if (e.kind === 'R') i = (v[e.a] - v[e.b]) / e.val;
    else if (e.kind === 'I') i = e.val;
    else i = x[N + vs.indexOf(e)];
    return { ...e, i };
  });
  return { v, els: out };
}
function gauss(A0, z0) {
  const n = z0.length, A = A0.map(r => Float64Array.from(r)), z = Float64Array.from(z0);
  for (let c = 0; c < n; c++) {
    let p = c; for (let k = c + 1; k < n; k++) if (Math.abs(A[k][c]) > Math.abs(A[p][c])) p = k;
    if (Math.abs(A[p][c]) < 1e-18) return null;
    [A[c], A[p]] = [A[p], A[c]]; [z[c], z[p]] = [z[p], z[c]];
    for (let k = c + 1; k < n; k++) { const f = A[k][c] / A[c][c]; if (!f) continue; for (let j = c; j < n; j++) A[k][j] -= f * A[c][j]; z[k] -= f * z[c]; }
  }
  const x = new Float64Array(n);
  for (let c = n - 1; c >= 0; c--) { let s = z[c]; for (let j = c + 1; j < n; j++) s -= A[c][j] * x[j]; x[c] = s / A[c][c]; }
  return x;
}

// ---------- examples ----------
export function example(name) {
  const c = newCircuit();
  const W = (x1, y1, x2, y2) => c.wires.push({ x1, y1, x2, y2 });
  if (name === 'led') {
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 9;                   // vertical, + on top
    const r = addPart(c, 'R', 4, 0); r.props.r = 470;
    const l = addPart(c, 'LED', 10, 0); l.props.color = 'red';
    addPart(c, 'GND', 0, 10);
    const s = addPart(c, 'SW', 14, 4, 1); s.props.on = true;
    W(0, 4, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(12, 0, 14, 0); W(14, 0, 14, 2); W(14, 6, 14, 10); W(14, 10, 0, 10); W(0, 8, 0, 10);
  } else if (name === 'divider') {
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const r1 = addPart(c, 'R', 6, 2, 1); r1.props.r = 10000;
    const r2 = addPart(c, 'R', 6, 8, 1); r2.props.r = 4700;
    addPart(c, 'VM', 12, 8, 1);
    addPart(c, 'GND', 0, 12);
    W(0, 4, 0, 0); W(0, 0, 6, 0); W(6, 4, 6, 6); W(6, 10, 6, 12); W(0, 8, 0, 12); W(0, 12, 12, 12); W(6, 5, 12, 5); W(12, 5, 12, 6); W(12, 10, 12, 12);
  } else if (name === 'esp32') {
    // 12 V solenoid coil (lamp as the coil load) switched by a push button, with flyback diode across it
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const coil = addPart(c, 'LAMP', 8, 4, 1); coil.name = 'COIL'; coil.props.vr = 12; coil.props.wr = 6;
    const d = addPart(c, 'D', 12, 4, 3); d.props.model = '1N5819';
    const pb = addPart(c, 'PB', 8, 10, 1);
    const am = addPart(c, 'AM', 4, 0);
    addPart(c, 'GND', 0, 14);
    W(0, 4, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(8, 0, 8, 2); W(8, 0, 12, 0); W(12, 0, 12, 2); W(8, 6, 8, 8); W(12, 6, 12, 7); W(12, 7, 8, 7);
    W(8, 12, 8, 14); W(8, 14, 0, 14); W(0, 8, 0, 14);
  } else if (name === 'dpdt') {
    // DPDT reversing a DC motor: battery on the two commons, throws cross-wired to the motor. Flip = motor reverses.
    const b = addPart(c, 'BAT', 0, 8, 1); b.props.v = 12;
    addPart(c, 'DPDT', 8, 8);                      // commons (6,6) (6,10) · throws A1 (10,5) B1 (10,7) A2 (10,9) B2 (10,11)
    const m = addPart(c, 'R', 16, 8, 1); m.name = 'MOTOR'; m.props.r = 24; m.props.rating = 10;
    addPart(c, 'GND', 0, 12);
    W(0, 6, 6, 6); W(0, 10, 6, 10); W(0, 10, 0, 12);
    W(10, 5, 16, 5);                                // A1 -> motor top
    W(10, 7, 13, 7); W(13, 7, 13, 9); W(10, 9, 13, 9); W(13, 9, 13, 10); W(13, 10, 16, 10);   // B1 + A2 -> motor bottom
    W(10, 11, 10, 13); W(10, 13, 18, 13); W(18, 13, 18, 4); W(18, 4, 16, 4); W(16, 4, 16, 6);   // B2 -> motor top (around)
  } else if (name === 'bridge') {
    const b = addPart(c, 'BAT', 0, 8, 1); b.props.v = 10;
    addPart(c, 'R', 6, 4, 1).props.r = 1000;   // R1 top-left
    addPart(c, 'R', 6, 12, 1).props.r = 2000;  // R2 bottom-left
    addPart(c, 'R', 16, 4, 1).props.r = 1500;  // R3 top-right
    addPart(c, 'R', 16, 12, 1).props.r = 2000; // R4 bottom-right
    addPart(c, 'VM', 11, 8);
    addPart(c, 'GND', 0, 16);
    W(0, 6, 0, 0); W(0, 0, 16, 0); W(6, 0, 6, 2); W(16, 0, 16, 2); W(6, 6, 6, 10); W(16, 6, 16, 10);
    W(6, 8, 9, 8); W(13, 8, 16, 8); W(6, 14, 6, 16); W(16, 14, 16, 16); W(0, 10, 0, 16); W(0, 16, 16, 16);
  }
  return c;
}
