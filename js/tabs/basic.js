// Ohm's law, voltage divider, resistor power
import { el, numField, select, card, grid, note, resultBox, table, segmented } from '../ui.js';
import { si, plain, nearest, SERIES, seriesValues, parallel, pct } from '../num.js';
import * as F from '../formulas.js';

const S = si;

// ================= OHM =================
export function ohmTab(root) {
  const go = () => run();
  const V = numField('ohm.V', 'Voltage V', 'V', { onchange: go, def: '12' });
  const I = numField('ohm.I', 'Current I', 'A', { onchange: go });
  const R = numField('ohm.R', 'Resistance R', 'Ω', { onchange: go, def: '1k' });
  const P = numField('ohm.P', 'Power P', 'W', { onchange: go });
  const res = resultBox();
  const clear = el('button', { class: 'btn', type: 'button', text: 'Clear', onclick: () => { [V, I, R, P].forEach(f => f.set('')); run(); } });
  root.append(card("Ohm's law", note('Type any <b>two</b> values. The other two are calculated. Examples: <code>12</code>, <code>4k7</code>, <code>20m</code> (= 0.02 A), <code>1/4</code>.'),
    grid(V, I, R, P), el('div', { class: 'row' }, clear), res.el),
    card('Formulas', el('pre', { class: 'steps static', text: 'V = I × R        I = V ÷ R        R = V ÷ I\nP = V × I        P = I² × R       P = V² ÷ R\nV = √(P × R)     I = √(P ÷ R)' })));
  function run() {
    const fs = { V, I, R, P }, given = Object.entries(fs).filter(([, f]) => f.value != null);
    Object.values(fs).forEach(f => f.show(''));
    if (given.length < 2) { res.clear('Type two values.'); return; }
    const use = Object.fromEntries(given.slice(0, 2).map(([k, f]) => [k, f.value]));
    const o = F.ohm(use);
    if (!o || ![o.V, o.I, o.R, o.P].every(isFinite)) { res.clear("Those values can't be combined (division by zero?)."); return; }
    for (const k of ['V', 'I', 'R', 'P']) if (!(k in use)) fs[k].show(plain(o[k]));
    const L = [];
    const v = plain(o.V), i = plain(o.I), r = plain(o.R), p = plain(o.P);
    switch (o.from) {
      case 'VI': L.push(`R = V ÷ I = ${v} ÷ ${i} = ${S(o.R, 'Ω')}`, `P = V × I = ${v} × ${i} = ${S(o.P, 'W')}`); break;
      case 'VR': L.push(`I = V ÷ R = ${v} ÷ ${r} = ${S(o.I, 'A')}`, `P = V² ÷ R = ${v}² ÷ ${r} = ${S(o.P, 'W')}`); break;
      case 'VP': L.push(`I = P ÷ V = ${p} ÷ ${v} = ${S(o.I, 'A')}`, `R = V² ÷ P = ${v}² ÷ ${p} = ${S(o.R, 'Ω')}`); break;
      case 'IR': L.push(`V = I × R = ${i} × ${r} = ${S(o.V, 'V')}`, `P = I² × R = ${i}² × ${r} = ${S(o.P, 'W')}`); break;
      case 'IP': L.push(`V = P ÷ I = ${p} ÷ ${i} = ${S(o.V, 'V')}`, `R = P ÷ I² = ${p} ÷ ${i}² = ${S(o.R, 'Ω')}`); break;
      default: L.push(`V = √(P × R) = √(${p} × ${r}) = ${S(o.V, 'V')}`, `I = √(P ÷ R) = √(${p} ÷ ${r}) = ${S(o.I, 'A')}`);
    }
    const warn = [];
    if (given.length > 2) {
      const extra = given.slice(2).map(([k, f]) => { const d = Math.abs(f.value / o[k] - 1); return d > 0.01 ? `${k} you typed (${S(f.value)}) doesn't match ${S(o[k])} from the first two.` : null; }).filter(Boolean);
      extra.forEach(t => warn.push(['warn', t]));
    }
    const rate = F.ratingFor(o.P, 2);
    if (o.P > 0) warn.push([rate && rate <= 0.25 ? 'ok' : rate && rate <= 2 ? 'warn' : 'bad', rate ? `Resistor rating with 2× margin: ${wattName(rate)} or bigger.` : 'Over 50 W: use a power resistor on a heatsink or rethink the circuit.']);
    res.show({ values: [['V', S(o.V, 'V'), !('V' in use)], ['I', S(o.I, 'A'), !('I' in use)], ['R', S(o.R, 'Ω'), !('R' in use)], ['P', S(o.P, 'W'), !('P' in use)]], lines: L, warn });
  }
  run();
}

export const wattName = (w) => ({ 0.0625: '1/16 W', 0.125: '1/8 W', 0.25: '1/4 W', 0.5: '1/2 W' }[w] ?? `${w} W`);

// ================= DIVIDER =================
export function dividerTab(root) {
  const go = () => run();
  const Vin = numField('div.Vin', 'Vin', 'V', { onchange: go, def: '12' });
  const R1 = numField('div.R1', 'R1 (top)', 'Ω', { onchange: go, def: '10k' });
  const R2 = numField('div.R2', 'R2 (bottom)', 'Ω', { onchange: go, def: '4k7' });
  const Vout = numField('div.Vout', 'Vout', 'V', { onchange: go });
  const RL = numField('div.RL', 'Load RL (optional)', 'Ω', { onchange: go, hint: 'What Vout connects to. Empty = no load (ADC input ≈ none).' });
  const ser = select('div.series', 'Standard values', [['E12', 'E12 (10 %)'], ['E24', 'E24 (5 %)'], ['E96', 'E96 (1 %)']], 'E24', go);
  const res = resultBox();
  const pairs = el('div');
  root.append(card('Voltage divider', note('Fill <b>three</b> of Vin, R1, R2, Vout and leave the one you want empty. Fill only Vin and Vout to get resistor pairs.'),
    el('div', { class: 'split' }, svgDivider(), grid(Vin, R1, R2, Vout, RL, ser)), res.el), card('Resistor pairs from standard values', pairs));
  function run() {
    [Vin, R1, R2, Vout].forEach(f => f.show(''));
    const v = { Vin: Vin.value, R1: R1.value, R2: R2.value, Vout: Vout.value };
    const known = Object.values(v).filter(x => x != null).length;
    pairs.innerHTML = '';
    if (v.Vin != null && v.Vout != null) pairTable(v.Vin, v.Vout, RL.value);
    else pairs.append(note('Type Vin and Vout to see the best standard resistor pairs.'));
    if (known < 3) { res.clear('Fill three of the four.'); return; }
    let d = F.divider(v);
    if (known === 4) d = { ...F.divider({ Vin: v.Vin, R1: v.R1, R2: v.R2 }), typedVout: v.Vout };
    if (!d || ![d.Vin, d.R1, d.R2, d.Vout].every(x => isFinite(x)) || d.R1 < 0 || d.R2 < 0) { res.clear('Not possible: Vout must be between 0 and Vin.'); return; }
    if (d.solved && d.solved !== 'Vout' || known === 3) ({ Vin, R1, R2, Vout })[d.solved]?.show(plain(d[d.solved]));
    const L = [], warn = [], vals = [];
    const p = plain;
    switch (d.solved) {
      case 'Vin': L.push(`Vin = Vout × (R1 + R2) ÷ R2 = ${p(d.Vout)} × (${p(d.R1)} + ${p(d.R2)}) ÷ ${p(d.R2)} = ${S(d.Vin, 'V')}`); break;
      case 'R1': L.push(`R1 = R2 × (Vin − Vout) ÷ Vout = ${p(d.R2)} × (${p(d.Vin)} − ${p(d.Vout)}) ÷ ${p(d.Vout)} = ${S(d.R1, 'Ω')}`); break;
      case 'R2': L.push(`R2 = R1 × Vout ÷ (Vin − Vout) = ${p(d.R1)} × ${p(d.Vout)} ÷ (${p(d.Vin)} − ${p(d.Vout)}) = ${S(d.R2, 'Ω')}`); break;
      default: L.push(`Vout = Vin × R2 ÷ (R1 + R2) = ${p(d.Vin)} × ${p(d.R2)} ÷ (${p(d.R1)} + ${p(d.R2)}) = ${S(d.Vout, 'V')}`);
    }
    if (d.typedVout != null && Math.abs(d.typedVout / d.Vout - 1) > 0.005) warn.push(['warn', `All four filled: R1, R2 and Vin give ${S(d.Vout, 'V')}, not ${S(d.typedVout, 'V')}. Empty one box to solve it.`]);
    const I = d.Vin / (d.R1 + d.R2);
    L.push(`I = Vin ÷ (R1 + R2) = ${p(d.Vin)} ÷ ${p(d.R1 + d.R2)} = ${S(I, 'A')}`);
    L.push(`P(R1) = I² × R1 = ${S(I * I * d.R1, 'W')}     P(R2) = I² × R2 = ${S(I * I * d.R2, 'W')}`);
    const Rth = parallel(d.R1, d.R2);
    L.push(`Output resistance = R1 ∥ R2 = ${S(Rth, 'Ω')}  (what the load "sees")`);
    vals.push(['Vin', S(d.Vin, 'V'), d.solved === 'Vin'], ['R1', S(d.R1, 'Ω'), d.solved === 'R1'], ['R2', S(d.R2, 'Ω'), d.solved === 'R2'], ['Vout', S(d.Vout, 'V'), d.solved === 'Vout'], ['Divider current', S(I, 'A')]);
    if (RL.value != null && RL.value > 0) {
      const R2L = parallel(d.R2, RL.value), Vl = F.divOut(d.Vin, d.R1, R2L);
      L.push('', `With load: R2 ∥ RL = ${p(d.R2)} ∥ ${p(RL.value)} = ${S(R2L, 'Ω')}`, `Vout(loaded) = ${p(d.Vin)} × ${p(R2L)} ÷ (${p(d.R1)} + ${p(R2L)}) = ${S(Vl, 'V')}  (${pct(Vl / d.Vout - 1, 2)})`,
        `Load current = ${S(Vl / RL.value, 'A')}`);
      vals.push(['Vout loaded', S(Vl, 'V'), true]);
      const drop = 1 - Vl / d.Vout;
      warn.push([drop < 0.01 ? 'ok' : drop < 0.05 ? 'warn' : 'bad', drop < 0.01 ? 'Load is light: Vout stays within 1 %.' : `Load pulls Vout down ${pct(drop)}. Make RL ≥ 100× R2, use smaller R1/R2, or buffer with an op-amp.`]);
    }
    if (d.solved === 'R1' || d.solved === 'R2') {
      const series = SERIES[ser.value], n = nearest(d[d.solved], series);
      const other = d.solved === 'R1' ? d.R2 : d.R1;
      const vo = (x) => d.solved === 'R1' ? F.divOut(d.Vin, x, other) : F.divOut(d.Vin, other, x);
      L.push('', `Nearest ${ser.value}: ${S(n.below, 'Ω')} → Vout ${S(vo(n.below), 'V')}   |   ${S(n.above, 'Ω')} → Vout ${S(vo(n.above), 'V')}`);
    }
    if (I > 0.02) warn.push(['warn', `Divider wastes ${S(I, 'A')}. For signals or ADC use 10k–100k range.`]);
    if (Math.max(I * I * d.R1, I * I * d.R2) > 0.125) warn.push(['bad', 'A divider resistor runs over 1/8 W: check the Power tab.']);
    if (Rth > 10e3) warn.push(['warn', `Output resistance ${S(Rth, 'Ω')} is high for most ADCs (ESP32/STM32 like < 10 kΩ). Add 100 nF from Vout to GND.`]);
    res.show({ values: vals, lines: L, warn });
  }
  function pairTable(vin, vout, rl) {
    if (!(vout > 0 && vout < vin)) { pairs.append(note('Vout must be between 0 and Vin.')); return; }
    const series = SERIES[ser.value], want = vout / vin, out = [];
    for (const r2 of seriesValues(series, 1000, 100000)) {
      const r1n = nearest(r2 * (1 - want) / want, series);
      for (const r1 of new Set([r1n.below, r1n.above])) {
        const v = F.divOut(vin, r1, rl ? parallel(r2, rl) : r2);
        out.push({ r1, r2, v, err: v / vout - 1, I: vin / (r1 + r2) });
      }
    }
    out.sort((a, b) => Math.abs(a.err) - Math.abs(b.err));
    const seen = new Set(), best = [];
    for (const o of out) { const k = (o.r1 / o.r2).toPrecision(4); if (seen.has(k)) continue; seen.add(k); best.push(o); if (best.length >= 8) break; }
    pairs.append(note(`Best ${ser.value} pairs with R2 between 1 kΩ and 100 kΩ${rl ? ' (load included)' : ''}:`),
      table(['R1', 'R2', 'Vout', 'Error', 'Current'], best.map(o => [S(o.r1, 'Ω'), S(o.r2, 'Ω'), S(o.v, 'V'), (o.err >= 0 ? '+' : '') + pct(o.err, 2), S(o.I, 'A')])));
  }
  run();
}

function svgDivider() {
  return el('div', {
    class: 'diagram', html: `<svg viewBox="0 0 120 170" role="img" aria-label="Divider: Vin, R1 to Vout, R2 to ground">
<g class="wire"><path d="M40 10 V30 M40 70 V95 M40 135 V160 M40 82 H85 M30 160 H50 M34 165 H46"/></g>
<g class="part"><path d="M40 30 l8 4 -16 6 16 6 -16 6 16 6 -16 6 8 4"/><path d="M40 95 l8 4 -16 6 16 6 -16 6 16 6 -16 6 8 4"/></g>
<circle class="dot" cx="40" cy="10" r="3"/><circle class="dot" cx="85" cy="82" r="3"/>
<text x="48" y="13">Vin</text><text x="56" y="52">R1</text><text x="56" y="117">R2</text><text x="78" y="75">Vout</text><text x="60" y="166">GND</text></svg>` });
}

// ================= POWER =================
export function powerTab(root) {
  const go = () => run();
  const V = numField('pw.V', 'Voltage across it', 'V', { onchange: go, def: '10' });
  const I = numField('pw.I', 'Current through it', 'A', { onchange: go });
  const R = numField('pw.R', 'Resistance', 'Ω', { onchange: go, def: '220' });
  const margin = segmented('pw.m', [['1.5', '1.5×'], ['2', '2× safe'], ['3', '3× cool']], '2', go);
  const amb = numField('pw.T', 'Inside a box? Room temp', '°C', { onchange: go, def: '30', hint: 'Resistors lose rating above 70 °C ambient.' });
  const res = resultBox(), tbl = el('div');
  root.append(card('Resistor power', note('Type any <b>two</b> of V, I, R. Example: LED resistor 220 Ω with 12 − 2 = 10 V across it.'),
    grid(V, I, R, amb), el('div', { class: 'row' }, el('span', { class: 'lab', text: 'Safety margin' }), margin.el), res.el), card('Standard ratings', tbl));
  function run() {
    [V, I, R].forEach(f => f.show(''));
    const g = { V: V.value, I: I.value, R: R.value }, k = Object.values(g).filter(x => x != null).length;
    tbl.innerHTML = '';
    if (k < 2) { res.clear('Type two of V, I, R.'); return; }
    const o = F.ohm(g.V != null && g.I != null ? { V: g.V, I: g.I } : g.V != null && g.R != null ? { V: g.V, R: g.R } : { I: g.I, R: g.R });
    if (g.V == null) V.show(plain(o.V)); if (g.I == null) I.show(plain(o.I)); if (g.R == null) R.show(plain(o.R));
    const m = +margin.value, T = amb.value ?? 25;
    // derating: full power to 70 °C, linear to 0 at 155 °C (typical carbon/metal film)
    const derate = T <= 70 ? 1 : Math.max(0, (155 - T) / 85);
    const need = o.P * m / (derate || 1e-9);
    const L = [`P = ${o.from === 'VI' ? `V × I = ${plain(o.V)} × ${plain(o.I)}` : o.from === 'VR' ? `V² ÷ R = ${plain(o.V)}² ÷ ${plain(o.R)}` : `I² × R = ${plain(o.I)}² × ${plain(o.R)}`} = ${S(o.P, 'W')}`,
      `Needed rating = P × margin${derate < 1 ? ' ÷ derating' : ''} = ${plain(o.P)} × ${m}${derate < 1 ? ` ÷ ${derate.toFixed(2)}` : ''} = ${S(need, 'W')}`];
    if (derate < 1) L.push(`Derating at ${T} °C: (155 − ${T}) ÷ 85 = ${(derate * 100).toFixed(0)} % of the rating is usable`);
    const pick = F.RATINGS.find(r => r >= need);
    L.push(`Surface temperature of a 1/4 W part at full load ≈ ambient + 100 °C. Keep load ≤ 50 % for a part you can touch.`);
    res.show({ values: [['Power', S(o.P, 'W'), true], ['Use', pick ? wattName(pick) : '> 50 W', true], ['V', S(o.V, 'V')], ['I', S(o.I, 'A')]], lines: L,
      warn: [[pick && pick <= 0.5 ? 'ok' : pick && pick <= 5 ? 'warn' : 'bad', pick ? `Use ${wattName(pick)} or bigger.` : 'More than 50 W: power resistor bolted to a heatsink.']] });
    tbl.append(table(['Rating', 'Load', 'Status'], F.RATINGS.filter(r => r <= 25).map(r => {
      const load = o.P / (r * derate || 1e-12);
      const st = load > 1 ? ['bad', 'Burns'] : load > 1 / m ? ['warn', 'Hot'] : ['ok', 'Safe'];
      return { cls: 'st-' + st[0], cells: [wattName(r), pct(load, 0), st[1]] };
    }), 'rate'));
  }
  run();
}
