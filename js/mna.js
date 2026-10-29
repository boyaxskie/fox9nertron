// Kirchhoff solver: Modified Nodal Analysis for resistors, voltage sources, current sources and wires.
// Node 0 is ground. Element: { type: 'R'|'V'|'I'|'W', name, a, b, value }
//   R: resistor between a and b (ohms)
//   V: voltage source, + at a, − at b (volts)
//   I: current source pushing current from a through itself to b (amps)  -> current comes OUT at b
//   W: wire (0 Ω), same as a 0 V source
// Result per element: v = Va − Vb, i = current flowing a → b through the element, p = v·i (absorbed; negative = delivering)

export function solve(elements) {
  const els = elements.map((e, k) => ({ ...e, a: e.a | 0, b: e.b | 0, idx: k }));
  if (!els.length) return { ok: false, error: 'Add at least one part.' };
  for (const e of els) {
    if (!(e.a >= 0) || !(e.b >= 0)) return { ok: false, error: `${e.name}: node numbers must be 0 or more.` };
    if (e.a === e.b) return { ok: false, error: `${e.name}: both ends are on node ${e.a}. A part needs two different nodes.` };
    if (e.type === 'R' && !(e.value > 0)) return { ok: false, error: `${e.name}: resistance must be more than 0 (use a Wire for 0 Ω).` };
    if ((e.type === 'V' || e.type === 'I') && !isFinite(e.value)) return { ok: false, error: `${e.name}: type a value.` };
  }
  // map used node numbers to matrix rows
  const nodeSet = new Set([0]);
  els.forEach(e => { nodeSet.add(e.a); nodeSet.add(e.b); });
  const nodes = [...nodeSet].sort((x, y) => x - y);
  if (!els.some(e => e.a === 0 || e.b === 0)) return { ok: false, error: 'Nothing is connected to node 0 (ground). Connect one part to node 0.' };
  const row = new Map(); nodes.filter(n => n !== 0).forEach((n, k) => row.set(n, k));
  const N = row.size;
  const vs = els.filter(e => e.type === 'V' || e.type === 'W');
  const M = N + vs.length;
  const A = Array.from({ length: M }, () => new Float64Array(M)), z = new Float64Array(M);
  const r = n => (n === 0 ? -1 : row.get(n));
  for (const e of els) {
    const ia = r(e.a), ib = r(e.b);
    if (e.type === 'R') {
      const g = 1 / e.value;
      if (ia >= 0) A[ia][ia] += g; if (ib >= 0) A[ib][ib] += g;
      if (ia >= 0 && ib >= 0) { A[ia][ib] -= g; A[ib][ia] -= g; }
    } else if (e.type === 'I') {
      if (ia >= 0) z[ia] -= e.value; if (ib >= 0) z[ib] += e.value;
    }
  }
  vs.forEach((e, k) => {
    const c = N + k, ia = r(e.a), ib = r(e.b);
    if (ia >= 0) { A[ia][c] += 1; A[c][ia] += 1; }
    if (ib >= 0) { A[ib][c] -= 1; A[c][ib] -= 1; }
    z[c] = e.type === 'W' ? 0 : e.value;
  });
  // tiny conductance to ground on every node only to name floating nodes after a failed solve
  const x = gauss(A, z);
  if (!x) return { ok: false, error: floatingHint(els, nodes) };
  const V = new Map([[0, 0]]); row.forEach((k, n) => V.set(n, x[k]));
  const res = els.map(e => {
    const v = V.get(e.a) - V.get(e.b);
    let i;
    if (e.type === 'R') i = v / e.value;
    else if (e.type === 'I') i = e.value;
    else i = x[N + vs.indexOf(e)];
    return { ...e, v, i, p: v * i };
  });
  // KCL at every node: currents leaving through each element
  const kcl = nodes.map(n => {
    const terms = [];
    for (const e of res) {
      if (e.a === n) terms.push({ name: e.name, out: e.i });
      if (e.b === n) terms.push({ name: e.name, out: -e.i });
    }
    const sum = terms.reduce((s, t) => s + t.out, 0);
    return { node: n, v: V.get(n), terms, sum };
  });
  const loops = findLoops(res).map(loop => {
    const terms = loop.map(({ e, dir }) => ({ name: e.name, type: e.type, rise: dir * -(e.v) })); // walking a→b gains −v
    return { path: loopPath(loop), terms, sum: terms.reduce((s, t) => s + t.rise, 0) };
  });
  const absorbed = res.filter(e => e.p > 0).reduce((s, e) => s + e.p, 0);
  const delivered = -res.filter(e => e.p < 0).reduce((s, e) => s + e.p, 0);
  return { ok: true, nodes: V, elements: res, kcl, loops, absorbed, delivered, balance: res.reduce((s, e) => s + e.p, 0) };
}

function gauss(A0, z0) {
  const n = z0.length, A = A0.map(r => Float64Array.from(r)), z = Float64Array.from(z0);
  let scale = 0; for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v));
  const eps = 1e-12 * (scale || 1);
  for (let c = 0; c < n; c++) {
    let p = c; for (let k = c + 1; k < n; k++) if (Math.abs(A[k][c]) > Math.abs(A[p][c])) p = k;
    if (Math.abs(A[p][c]) < eps) return null;
    [A[c], A[p]] = [A[p], A[c]]; [z[c], z[p]] = [z[p], z[c]];
    for (let k = c + 1; k < n; k++) {
      const f = A[k][c] / A[c][c]; if (!f) continue;
      for (let j = c; j < n; j++) A[k][j] -= f * A[c][j];
      z[k] -= f * z[c];
    }
  }
  const x = new Float64Array(n);
  for (let c = n - 1; c >= 0; c--) { let s = z[c]; for (let j = c + 1; j < n; j++) s -= A[c][j] * x[j]; x[c] = s / A[c][c]; }
  return x;
}

// explain why the matrix can't be solved
function floatingHint(els, nodes) {
  // nodes not reachable from ground through R / V / W
  const adj = new Map(nodes.map(n => [n, []]));
  for (const e of els) if (e.type !== 'I') { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
  const seen = new Set([0]), st = [0];
  while (st.length) { const n = st.pop(); for (const m of adj.get(n)) if (!seen.has(m)) { seen.add(m); st.push(m); } }
  const floating = nodes.filter(n => !seen.has(n));
  if (floating.length) return `Node ${floating.join(', ')} has no path to ground (only current sources or nothing). Add a resistor to it.`;
  // loop made only of voltage sources / wires
  const vsOnly = findLoops(els.map(e => ({ ...e })).filter(e => e.type === 'V' || e.type === 'W'));
  if (vsOnly.length) return `Voltage sources / wires form a closed loop (${loopPath(vsOnly[0])}). Two sources in parallel or a shorted source can't be solved. Add a small resistor.`;
  return "This circuit can't be solved. Check for current sources in series or parts that only touch one node.";
}

// independent loops (fundamental cycles) of the element graph
export function findLoops(els) {
  const parent = new Map(), depth = new Map(), via = new Map();
  const adj = new Map();
  for (const e of els) { for (const n of [e.a, e.b]) if (!adj.has(n)) adj.set(n, []); adj.get(e.a).push(e); adj.get(e.b).push(e); }
  const tree = new Set(), loops = [];
  for (const root of adj.keys()) {
    if (depth.has(root)) continue;
    depth.set(root, 0); parent.set(root, null);
    const q = [root];
    while (q.length) {
      const n = q.shift();
      for (const e of adj.get(n)) {
        const m = e.a === n ? e.b : e.a;
        if (!depth.has(m)) { depth.set(m, depth.get(n) + 1); parent.set(m, n); via.set(m, e); tree.add(e); q.push(m); }
      }
    }
  }
  for (const e of els) {
    if (tree.has(e)) continue;
    // walk: a → (e) → b, then b up to common ancestor and down to a
    const up = (n) => { const p = []; while (n != null) { p.push(n); n = parent.get(n); } return p; };
    const pa = up(e.a), pb = up(e.b);
    const setA = new Set(pa); const lca = pb.find(n => setA.has(n));
    const steps = [{ e, dir: 1, from: e.a, to: e.b }];
    let n = e.b;
    while (n !== lca) { const te = via.get(n), p = parent.get(n); steps.push({ e: te, dir: te.a === n ? 1 : -1, from: n, to: p }); n = p; }
    const down = []; n = e.a;
    while (n !== lca) { const te = via.get(n), p = parent.get(n); down.push({ e: te, dir: te.a === p ? 1 : -1, from: p, to: n }); n = p; }
    steps.push(...down.reverse());
    loops.push(steps);
  }
  return loops;
}
function loopPath(loop) { return [loop[0].from, ...loop.map(s => s.to)].join('→'); }
