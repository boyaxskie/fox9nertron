// Gerber (RS-274X) + Excellon drill export, like Proteus / KiCad make: load them into the Fox9ner web app.
// All layers are written as seen from the TOP (Gerber standard), no mirroring. Units mm, origin = lower-left board corner.
import { analyze } from './pcb-core.js';

const G = (v) => String(Math.round(v * 1e6));          // format 4.6, mm → integer
const D3 = (v) => v.toFixed(3);

function head(name, func) {
  return ['G04 Fox9nertron ' + name + '*', `G04 ${func}*`, '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%'];
}

// bottom copper: pads flashed, traces drawn with round apertures
export function gerberCopper(c, an = analyze(c)) {
  const L = c.pcb, Y = (y) => L.h - y;
  const ap = new Map(); let next = 10;
  const apOf = (def) => { if (!ap.has(def)) ap.set(def, next++); return ap.get(def); };
  const body = [];
  // traces
  for (const t of L.traces) {
    const d = apOf(`C,${D3(t.w)}`);
    body.push(`D${d}*`, `X${G(t.pts[0][0])}Y${G(Y(t.pts[0][1]))}D02*`);
    for (const [x, y] of t.pts.slice(1)) body.push(`X${G(x)}Y${G(Y(y))}D01*`);
  }
  // pads (jumper pads included)
  for (const pd of an.pads) {
    const def = pd.shape === 'rect' ? `R,${D3(pd.w)}X${D3(pd.h)}` : pd.shape === 'oval' ? `O,${D3(pd.w)}X${D3(pd.h)}` : `C,${D3(pd.w)}`;
    body.push(`D${apOf(def)}*`, `X${G(pd.x)}Y${G(Y(pd.y))}D03*`);
  }
  const defs = [...ap.entries()].map(([def, n]) => `%ADD${n}${def}*%`);
  return [...head('bottom copper', 'Copper layer: bottom, viewed from top'), ...defs, 'G01*', ...body, 'M02*'].join('\n') + '\n';
}

// board outline (edge cuts)
export function gerberOutline(c) {
  const L = c.pcb;
  const pts = [[0, 0], [L.w, 0], [L.w, L.h], [0, L.h], [0, 0]];
  return [...head('board outline', 'Profile / edge cuts'), '%ADD10C,0.100*%', 'G01*', 'D10*',
    `X${G(pts[0][0])}Y${G(pts[0][1])}D02*`, ...pts.slice(1).map(([x, y]) => `X${G(x)}Y${G(y)}D01*`), 'M02*'].join('\n') + '\n';
}

// Excellon drill file, metric, decimal coordinates
export function excellon(c, an = analyze(c)) {
  const L = c.pcb, Y = (y) => L.h - y;
  const sizes = [...new Set(an.pads.filter(p => p.drill > 0).map(p => +p.drill.toFixed(3)))].sort((a, b) => a - b);
  const out = ['M48', '; Fox9nertron drill file, metric, viewed from top', 'METRIC,TZ', 'FMAT,2'];
  sizes.forEach((d, i) => out.push(`T${i + 1}C${D3(d)}`));
  out.push('%', 'G90', 'G05');
  sizes.forEach((d, i) => {
    out.push(`T${i + 1}`);
    for (const p of an.pads) if (p.drill > 0 && +p.drill.toFixed(3) === d) out.push(`X${D3(p.x)}Y${D3(Y(p.y))}`);
  });
  out.push('T0', 'M30');
  return out.join('\n') + '\n';
}
