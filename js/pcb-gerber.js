// Gerber export in the same style Proteus 9 writes ("CADCAM" Gerber X2), so the Fox9ner web app reads it like a Proteus file:
// %FSLAX45Y45*% (mm, 5 decimals, signed coordinates like X+1649620Y+600000), round apertures, drill marks as a Gerber too.
// Seen from the TOP, not mirrored, origin = lower-left board corner. Excellon is still available for other tools.
import { analyze } from './pcb-core.js';

const N = (v) => { const n = Math.round(v * 1e5); return (n < 0 ? '-' : '+') + Math.abs(n); };
const A = (v) => v.toFixed(6);
const uuid = () => (crypto?.randomUUID?.() ?? 'f9t-' + Date.now().toString(16));

function head(func, same) {
  return ['G04 FOX9NERTRON GERBER X2 FILE (Proteus CADCAM style)*', '%TF.GenerationSoftware,Fox9ner,Fox9nertron,1.8.0*%', `%TF.CreationDate,${new Date().toISOString().slice(0, 19)}+00:00*%`,
    `%TF.FileFunction,${func}*%`, '%TF.FilePolarity,Positive*%', '%TF.Part,Single*%', `%TF.SameCoordinates,{${same}}*%`, '%FSLAX45Y45*%', '%MOMM*%', 'G01*'];
}
// pad size as a round aperture (square / oval pads become round, like Proteus' round pads)
const padD = (pd) => Math.min(pd.w, pd.h);

export function gerberSet(c, an = analyze(c)) {
  const same = uuid();
  return { copper: gerberCopper(c, an, same), drill: gerberDrill(c, an, same), outline: gerberOutline(c, same) };
}

export function gerberCopper(c, an = analyze(c), same = uuid()) {
  const L = c.pcb, Y = (y) => L.h - y;
  const out = head('Copper,L2,Bot', same);
  // apertures: traces (Conductor) then pads (ComponentPad)
  const tr = [...new Set(L.traces.map(t => +t.w.toFixed(6)))];
  const pads = [...new Set(an.pads.map(p => +padD(p).toFixed(6)))];
  let d = 10; const tA = new Map(), pA = new Map();
  for (const w of tr) { out.push('%TA.AperFunction,Conductor*%', `%ADD${d}C,${A(w)}*%`); tA.set(w, d++); }
  for (const w of pads) { out.push('%TA.AperFunction,ComponentPad*%', `%ADD${d}C,${A(w)}*%`); pA.set(w, d++); }
  out.push('%TD.AperFunction*%');
  let cur = -1;
  for (const t of L.traces) {
    const ap = tA.get(+t.w.toFixed(6)); if (ap !== cur) { out.push(`D${ap}*`); cur = ap; }
    out.push(`X${N(t.pts[0][0])}Y${N(Y(t.pts[0][1]))}D02*`);
    for (const [x, y] of t.pts.slice(1)) out.push(`X${N(x)}Y${N(Y(y))}D01*`);
  }
  for (const [w, ap] of pA) {
    out.push(`D${ap}*`);
    for (const p of an.pads) if (+padD(p).toFixed(6) === w) out.push(`X${N(p.x)}Y${N(Y(p.y))}D03*`);
  }
  out.push('M02*');
  return out.join('\n') + '\n';
}

// drill marks, Proteus "Drill_TOP-BOT_Plated" style: one flash per hole, aperture = drill diameter
export function gerberDrill(c, an = analyze(c), same = uuid()) {
  const L = c.pcb, Y = (y) => L.h - y;
  const out = head('Plated,0,2,PTH', same);
  const sizes = [...new Set(an.pads.filter(p => p.drill > 0).map(p => +p.drill.toFixed(6)))].sort((a, b) => a - b);
  let d = 20; const ap = new Map();
  for (const s of sizes) { out.push('%TA.AperFunction,ComponentDrill*%', `%ADD${d}C,${A(s)}*%`); ap.set(s, d++); }
  out.push('%TD.AperFunction*%');
  for (const s of sizes) {
    out.push(`D${ap.get(s)}*`);
    for (const p of an.pads) if (p.drill > 0 && +p.drill.toFixed(6) === s) out.push(`X${N(p.x)}Y${N(Y(p.y))}D03*`);
  }
  out.push('M02*');
  return out.join('\n') + '\n';
}

export function gerberOutline(c, same = uuid()) {
  const L = c.pcb;
  const pts = [[0, 0], [L.w, 0], [L.w, L.h], [0, L.h], [0, 0]];
  return [...head('Profile,NP', same), '%TA.AperFunction,Profile*%', '%ADD30C,0.100000*%', '%TD.AperFunction*%', 'D30*',
    `X${N(pts[0][0])}Y${N(pts[0][1])}D02*`, ...pts.slice(1).map(([x, y]) => `X${N(x)}Y${N(y)}D01*`), 'M02*'].join('\n') + '\n';
}

// Excellon drill file (for other CAM tools), metric, decimal coordinates
export function excellon(c, an = analyze(c)) {
  const L = c.pcb, Y = (y) => L.h - y;
  const sizes = [...new Set(an.pads.filter(p => p.drill > 0).map(p => +p.drill.toFixed(3)))].sort((a, b) => a - b);
  const out = ['M48', '; Fox9nertron drill file, metric, viewed from top', 'METRIC,TZ', 'FMAT,2'];
  sizes.forEach((d, i) => out.push(`T${i + 1}C${d.toFixed(3)}`));
  out.push('%', 'G90', 'G05');
  sizes.forEach((d, i) => { out.push(`T${i + 1}`); for (const p of an.pads) if (p.drill > 0 && +p.drill.toFixed(3) === d) out.push(`X${p.x.toFixed(3)}Y${Y(p.y).toFixed(3)}`); });
  out.push('T0', 'M30');
  return out.join('\n') + '\n';
}
