// Component helper: colour code, SMD codes, standard values, series / parallel resistors, two-resistor combos
import { el, numField, card, grid, note, resultBox, segmented, table, store } from '../ui.js';
import { si, plain, parse, pct, nearest, SERIES, seriesValues, parallel, E96, E24 } from '../num.js';
import * as F from '../formulas.js';

export function partsTab(root) {
  // ---- value -> colour bands ----
  {
    const go = () => run();
    const R = numField('cc.R', 'Resistor value', 'Ω', { def: '4k7', onchange: go });
    const n = segmented('cc.n', [['4', '4 band'], ['5', '5 band']], '4', go);
    const pic = el('div', { class: 'resistor' }), res = resultBox();
    root.append(card('Resistor colour code', grid(R), n.el, pic, res.el));
    function run() {
      const r = R.value, digits = n.value === '5' ? 3 : 2;
      const b = F.bandsFor(r, digits);
      if (!b) { pic.innerHTML = ''; res.clear('Type a value from 0.1 Ω to 999 MΩ.'); return; }
      const tol = digits === 3 ? 'brown' : 'gold';
      const bands = [...b.bands, tol];
      pic.innerHTML = drawResistor(bands);
      res.show({ values: [['Bands', bands.join(' · '), true], ['Value', si(b.value, 'Ω')], ['Tolerance', F.TOL[tol]]],
        warn: Math.abs(b.value / r - 1) > 0.001 ? [['warn', `${si(r, 'Ω')} rounds to ${si(b.value, 'Ω')} with ${digits} digits.`]] : [] });
    }
    run();
  }
  // ---- colour bands -> value ----
  {
    const opts = F.COLORS;
    const mk = (key, list, def) => {
      const s = el('select', { class: 'sel sm', id: 'cb-' + key }, list.map(c => el('option', { value: c, text: c })));
      s.value = store.get('cb.' + key, def); s.addEventListener('change', () => { store.set('cb.' + key, s.value); run(); }); return s;
    };
    const d1 = mk('d1', opts, 'brown'), d2 = mk('d2', opts, 'black'), d3 = mk('d3', ['—', ...opts], '—'), m = mk('m', [...opts, 'gold', 'silver'], 'red'), t = mk('t', Object.keys(F.TOL), 'gold');
    const pic = el('div', { class: 'resistor' }), res = resultBox();
    root.append(card('Read the bands', note('Third digit only on 5-band resistors.'), el('div', { class: 'row wrap bands' }, d1, d2, d3, m, t), pic, res.el));
    function run() {
      const digits = [d1.value, d2.value, ...(d3.value === '—' ? [] : [d3.value])];
      const v = F.valueFromBands(digits, m.value);
      pic.innerHTML = drawResistor([...digits, m.value, t.value]);
      res.show({ values: [['Value', si(v, 'Ω'), true], ['Tolerance', F.TOL[t.value]]] });
    }
    run();
  }
  // ---- SMD code ----
  {
    const inp = el('input', { id: 'smd', class: 'num wide', value: store.get('smd', '472'), autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
    const res = resultBox();
    inp.addEventListener('input', () => { store.set('smd', inp.value); run(); });
    root.append(card('SMD resistor code', note('3 digits (472), 4 digits (4701), R as decimal point (4R7), or EIA-96 (01C).'), inp, res.el));
    function run() { const v = F.smdCode(inp.value, E96); if (v == null) res.clear("Code not recognised."); else res.show({ values: [['Value', si(v, 'Ω'), true]] }); }
    run();
  }
  // ---- nearest standard value ----
  {
    const go = () => run();
    const v = numField('std.v', 'Calculated value', '', { def: '3.3k', onchange: go });
    const res = resultBox();
    root.append(card('Nearest standard values', grid(v), res.el));
    function run() {
      if (!(v.value > 0)) { res.clear('Type a value.'); return; }
      const rows = Object.entries(SERIES).map(([k, s]) => { const n = nearest(v.value, s); return [k, si(n.below), si(n.above), `${si(n.best)} (${(n.err >= 0 ? '+' : '') + pct(n.err, 1)})`]; });
      res.clear(); res.extra.append(table(['Series', 'Below', 'Above', 'Closest'], rows));
    }
    run();
  }
  // ---- series / parallel resistors ----
  {
    const inp = el('input', { id: 'r-list', class: 'num wide', value: store.get('r.list', '1k 2k2 4k7'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const res = resultBox();
    inp.addEventListener('input', () => { store.set('r.list', inp.value); run(); });
    root.append(card('Resistors in series and parallel', note('Values separated by spaces or commas.'), inp, res.el));
    function run() {
      const v = inp.value.split(/[\s;,]+/).filter(Boolean).map(parse);
      if (!v.length || v.some(x => !(x > 0))) { res.clear('Type values like 1k 2k2.'); return; }
      const s = v.reduce((a, b) => a + b, 0), p = parallel(...v);
      res.show({ values: [['Series', si(s, 'Ω'), true], ['Parallel', si(p, 'Ω'), true]], lines: [`Series: R = ${v.map(x => si(x, 'Ω')).join(' + ')} = ${si(s, 'Ω')}`, `Parallel: 1/R = ${v.map(x => `1/${plain(x)}`).join(' + ')} → R = ${si(p, 'Ω')}`, ...(v.length === 2 ? [`Two in parallel: R = R1 × R2 ÷ (R1 + R2) = ${si(p, 'Ω')}`] : [])] });
    }
    run();
  }
  // ---- two standard resistors for an odd value ----
  {
    const go = () => run();
    const t = numField('combo.t', 'Value you need', 'Ω', { def: '3k', onchange: go });
    const ser = segmented('combo.s', [['E12', 'E12'], ['E24', 'E24']], 'E12', go);
    const res = resultBox();
    root.append(card('Make an odd value from two standard resistors', grid(t), ser.el, res.el));
    function run() {
      const target = t.value;
      if (!(target > 0)) { res.clear('Type the value you need.'); return; }
      const vals = seriesValues(SERIES[ser.value], target / 100, target * 100), out = [];
      for (const a of vals) {
        if (a <= target) { const b = nearest(target - a, SERIES[ser.value]); if (b && a >= b.best) out.push({ k: 'series', a, b: b.best, v: a + b.best }); }
        if (a >= target) { const need = 1 / (1 / target - 1 / a); if (isFinite(need) && need > 0) { const b = nearest(need, SERIES[ser.value]); if (b && a <= b.best) out.push({ k: 'parallel', a, b: b.best, v: parallel(a, b.best) }); } }
      }
      out.forEach(o => { o.err = o.v / target - 1; });
      out.sort((x, y) => Math.abs(x.err) - Math.abs(y.err));
      const seen = new Set(), best = out.filter(o => { const key = o.k + o.a + '/' + o.b; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 8);
      res.clear();
      res.extra.append(table(['How', 'R1', 'R2', 'Gives', 'Error'], best.map(o => [o.k, si(o.a, 'Ω'), si(o.b, 'Ω'), si(o.v, 'Ω'), (o.err >= 0 ? '+' : '') + pct(o.err, 2)])));
    }
    run();
  }
}

function drawResistor(bands) {
  const xs = bands.length === 4 ? [62, 82, 102, 140] : bands.length === 5 ? [58, 76, 94, 112, 142] : [56, 72, 88, 104, 120, 142];
  const b = bands.map((c, i) => `<rect x="${xs[i]}" y="14" width="10" height="42" fill="${F.HEX[c]}" class="band"/>`).join('');
  return `<svg viewBox="0 0 220 70" role="img" aria-label="Resistor bands: ${bands.join(', ')}"><line class="lead" x1="0" y1="35" x2="220" y2="35"/><rect class="body" x="45" y="12" width="130" height="46" rx="18"/>${b}</svg>`;
}
