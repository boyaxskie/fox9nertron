// 🔬 Analyze: Bode plot, tolerance test, heat over time, SPICE netlist import. Opens from the Schematic toolbar.
// © 2026 Yaxboom (Fox9ner). All rights reserved.
import { el, store, numField, select, note, resultBox, table } from '../ui.js';
import { si, plain } from '../num.js';
import * as S from '../sch-core.js';
import * as A from '../analysis.js';

const COL = { bg: '#07120C', grid: 'rgba(80,140,100,0.25)', axis: '#9AD7A8', y: '#FFE16B', b: '#4FC3F7', red: '#FF6B6B', green: '#3DDC84', dim: '#7E8A97' };
const btn = (text, on, cls = '') => el('button', { class: 'btn ' + cls, type: 'button', text, onclick: on });

// ---------- small chart: lines on linear / log x, left + optional right axis ----------
function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), st = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= step0) ?? 10 * mag;
  const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-6; v += st) out.push(+v.toPrecision(10)); return out;
}
export function chart(cv, { series, logX = false, xFmt = (v) => plain(v, 3), yL, yR, marks = [], hlines = [] }) {
  const dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect(), w = Math.round(r.width) || 480, h = Math.round(r.height) || 240;
  cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
  const all = series.flatMap(s => s.pts); if (!all.length) return;
  const L = 46, Rm = yR ? 46 : 12, T = 12, B = 26, pw = w - L - Rm, ph = h - T - B;
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0]));
  if (logX) { x0 = Math.log10(x0); x1 = Math.log10(x1); }
  if (x1 === x0) x1 = x0 + 1;
  const range = (side) => {
    const ys = series.filter(s => (s.axis ?? 'L') === side).flatMap(s => s.pts.map(p => p[1])).concat(side === 'L' ? hlines.map(l => l.y) : []);
    if (!ys.length) return null;
    let a = Math.min(...ys), b = Math.max(...ys); const cfg = side === 'L' ? yL : yR;
    if (cfg?.min != null) a = Math.min(a, cfg.min); if (cfg?.max != null) b = Math.max(b, cfg.max);
    if (b - a < (cfg?.span ?? 1e-9)) { const m = (a + b) / 2, s = (cfg?.span ?? 1) / 2; a = m - s; b = m + s; }
    const pad = (b - a) * 0.08; return [a - pad, b + pad];
  };
  const rL = range('L'), rR = range('R');
  const px = (v) => L + ((logX ? Math.log10(v) : v) - x0) / (x1 - x0) * pw;
  const py = (v, rg) => T + (1 - (v - rg[0]) / (rg[1] - rg[0])) * ph;
  x.font = '10.5px ui-monospace, monospace'; x.lineWidth = 1;
  // x grid
  const xt = logX ? Array.from({ length: Math.floor(x1) - Math.ceil(x0) + 1 }, (_, i) => 10 ** (Math.ceil(x0) + i)) : niceTicks(x0, x1, 6);
  if (logX) for (let d = Math.floor(x0); d <= x1; d++) for (let k = 2; k < 10; k++) { const v = k * 10 ** d, lv = Math.log10(v); if (lv < x0 || lv > x1) continue; x.strokeStyle = 'rgba(80,140,100,0.12)'; x.beginPath(); x.moveTo(px(v) + .5, T); x.lineTo(px(v) + .5, T + ph); x.stroke(); }
  x.textAlign = 'center'; x.fillStyle = COL.axis;
  for (const v of xt) { const X = Math.round(px(v)) + .5; x.strokeStyle = COL.grid; x.beginPath(); x.moveTo(X, T); x.lineTo(X, T + ph); x.stroke(); x.fillText(xFmt(v), X, h - 8); }
  const yAxis = (rg, side, cfg) => {
    if (!rg) return;
    x.textAlign = side === 'L' ? 'right' : 'left'; x.fillStyle = cfg?.col ?? COL.axis;
    for (const v of niceTicks(rg[0], rg[1], 5)) {
      const Y = Math.round(py(v, rg)) + .5;
      if (side === 'L') { x.strokeStyle = COL.grid; x.beginPath(); x.moveTo(L, Y); x.lineTo(L + pw, Y); x.stroke(); }
      x.fillText((cfg?.fmt ?? ((q) => plain(q, 3)))(v), side === 'L' ? L - 5 : L + pw + 5, Y + 3.5);
    }
  };
  yAxis(rL, 'L', yL); yAxis(rR, 'R', yR);
  for (const l of hlines) { if (!rL) break; const Y = py(l.y, rL); x.setLineDash([5, 4]); x.strokeStyle = l.col; x.beginPath(); x.moveTo(L, Y); x.lineTo(L + pw, Y); x.stroke(); x.setLineDash([]); x.fillStyle = l.col; x.textAlign = 'right'; x.fillText(l.label, L + pw - 4, Y - 4); }
  for (const m of marks) { const X = px(m.x); x.setLineDash([3, 3]); x.strokeStyle = m.col; x.beginPath(); x.moveTo(X, T); x.lineTo(X, T + ph); x.stroke(); x.setLineDash([]); x.fillStyle = m.col; x.textAlign = 'left'; x.fillText(m.label, X + 4, T + 11 + (m.row ?? 0) * 13); }
  for (const s of series) {
    const rg = (s.axis ?? 'L') === 'L' ? rL : rR; if (!rg || !s.pts.length) continue;
    x.strokeStyle = s.col; x.lineWidth = 2; x.beginPath();
    s.pts.forEach((p, i) => { const X = px(p[0]), Y = py(p[1], rg); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.stroke();
    if (s.dots) { x.fillStyle = s.col; for (const p of s.pts) { x.beginPath(); x.arc(px(p[0]), py(p[1], rg), 2.2, 0, 7); x.fill(); } }
  }
  x.strokeStyle = COL.dim; x.strokeRect(L + .5, T + .5, pw, ph);
}
function histogram(cv, xs, { v0, unit }) {
  const dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect(), w = Math.round(r.width) || 480, h = Math.round(r.height) || 160;
  cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
  if (!xs?.length) return;
  const lo = Math.min(...xs, v0), hi = Math.max(...xs, v0), nb = 20, bw = (hi - lo) / nb || 1, bins = new Array(nb).fill(0);
  for (const v of xs) bins[Math.min(nb - 1, Math.floor((v - lo) / bw))]++;
  const mx = Math.max(...bins), L = 10, B = 24, pw = w - 2 * L, ph = h - B - 10;
  bins.forEach((n, i) => { const bh = n / mx * ph; x.fillStyle = COL.b; x.fillRect(L + i * pw / nb + 1, 10 + ph - bh, pw / nb - 2, bh); });
  const X0 = L + (v0 - lo) / ((hi - lo) || 1) * pw; x.strokeStyle = COL.y; x.lineWidth = 2; x.beginPath(); x.moveTo(X0, 6); x.lineTo(X0, 10 + ph); x.stroke();
  x.font = '10.5px ui-monospace, monospace'; x.fillStyle = COL.axis; x.textAlign = 'left'; x.fillText(si(lo, unit, 4), L, h - 7); x.textAlign = 'right'; x.fillText(si(hi, unit, 4), w - L, h - 7);
  x.textAlign = 'center'; x.fillStyle = COL.y; x.fillText('nominal ' + si(v0, unit, 4), Math.max(60, Math.min(w - 60, X0)), h - 7);
}
const csv = (rows) => rows.map(r => r.map(v => (typeof v === 'number' ? +v.toPrecision(8) : `"${String(v).replace(/"/g, '""')}"`)).join(',')).join('\n') + '\n';

// ---------- the dialog ----------
export function analyzeDialog(api, start = store.get('an.tab', 'bode')) {
  const body = el('div', { class: 'an-body' });
  const tabs = [['bode', '📉 Bode'], ['tol', '🎲 Tolerance'], ['heat', '🌡 Heat'], ['import', '📥 Import netlist']];
  let ctl = null;
  const stop = () => { if (ctl) ctl.stop = true; };
  const seg = el('div', { class: 'seg an-seg' }, tabs.map(([k, t]) => el('button', { type: 'button', class: 'segb', 'data-k': k, text: t, onclick: () => go(k) })));
  const d = el('dialog', { class: 'dlg an-dlg' }, el('div', { class: 'dlg-title2', text: '🔬 Analyze the circuit' }), el('div', { class: 'dlg-pad' }, seg), body,
    el('form', { method: 'dialog', class: 'dlg-buttons' }, el('button', { class: 'btn', text: 'Close' })));
  function go(k) {
    stop(); store.set('an.tab', k);
    for (const b of seg.children) b.classList.toggle('on', b.dataset.k === k);
    body.replaceChildren();
    try { ({ bode: bodeView, tol: tolView, heat: heatView, import: importView })[k](body); } catch (e) { console.error(e); body.append(el('p', { class: 'flag bad', text: 'Error: ' + e.message })); }
  }
  document.body.append(d); d.addEventListener('close', () => { stop(); d.remove(); }); d.showModal();
  go(tabs.some(t => t[0] === start) ? start : 'bode');

  // ===== Bode =====
  function bodeView(root) {
    const c = api.getC(), sigs = c.parts.filter(p => p.type === 'SIG');
    root.append(note('Sweeps a sine from the <b>Signal generator</b> through the circuit and plots how much comes out at each frequency. Wire the <b>Scope CH1 to the input</b> (generator), <b>CH2 to the output</b>, COM to ground. It runs the real simulation at every frequency, so transistors and op-amps behave like on the bench.'));
    const err = A.bodeCheck(c);
    if (err) { root.append(el('p', { class: 'flag warn', text: err }), btn('Load the RC filter example to try it', () => { api.load(S.example('rc'), 'Loaded the RC filter. Open 🔬 Analyze → Bode.'); d.close(); })); return; }
    const fA = numField('an.f1', 'From', 'Hz', { def: '10' }), fB = numField('an.f2', 'To', 'Hz', { def: '100k' }), nP = numField('an.n', 'Points', '', { def: '25' });
    const amp = numField('an.amp', 'Test amplitude', 'V', { def: '', hint: 'empty = the generator\'s own' });
    const sigSel = sigs.length > 1 ? select('an.sig', 'Input', sigs.map(p => [String(p.id), p.name]), String(sigs[0].id)) : null;
    const prog = el('progress', { class: 'an-prog', max: 1, value: 0, hidden: true });
    const cv = el('canvas', { class: 'an-cv' }), rb = resultBox(), out = el('div', { class: 'an-out' });
    let pts = [];
    const runB = btn('▶ Sweep', run, 'primary'), stopB = btn('■ Stop', stop); stopB.hidden = true;
    const csvB = btn('⬇ CSV', () => api.shareFile(`${c.title ?? 'circuit'}-bode.csv`, csv([['Hz', 'gain dB', 'phase deg', 'Vin peak', 'Vout peak'], ...pts.map(p => [p.f, p.db, p.phase, p.vin, p.vout])]), 'text/csv')); csvB.hidden = true;
    root.append(el('div', { class: 'fields' }, fA.el, fB.el, nP.el, amp.el, sigSel?.el), el('div', { class: 'row wrap' }, runB, stopB, csvB, prog), cv, rb.el, out);
    cv.hidden = true; rb.clear();
    function paint() {
      const sm = A.bodeSummary(pts), marks = [];
      if (sm?.f3lo) marks.push({ x: sm.f3lo, col: COL.red, label: '−3 dB ' + si(sm.f3lo, 'Hz', 3) });
      if (sm?.f3hi) marks.push({ x: sm.f3hi, col: COL.red, label: '−3 dB ' + si(sm.f3hi, 'Hz', 3), row: 1 });
      chart(cv, { logX: true, xFmt: (v) => si(v, '', 3).replace(' ', ''), series: [{ pts: pts.map(p => [p.f, p.db]), col: COL.y, dots: true }, { pts: pts.map(p => [p.f, p.phase]), col: COL.b, axis: 'R' }],
        yL: { fmt: (v) => plain(v, 3) + 'dB', col: COL.y, span: 6 }, yR: { fmt: (v) => Math.round(v) + '°', col: COL.b, span: 20 }, marks });
      return sm;
    }
    async function run() {
      const f1 = fA.value, f2 = fB.value, n = Math.round(nP.value ?? 25);
      if (!(f1 > 0) || !(f2 > f1) || !(n >= 3 && n <= 200)) { rb.clear('Check the numbers: From > 0, To bigger than From, 3–200 points.'); return; }
      ctl = { stop: false }; pts = []; runB.hidden = true; stopB.hidden = false; csvB.hidden = true; prog.hidden = false; prog.value = 0; cv.hidden = false; out.replaceChildren();
      rb.clear('Sweeping… each frequency runs until the output settles.');
      const r = await A.bode(api.getC(), { sigId: sigSel ? +sigSel.value : undefined, f1, f2, n, amp: amp.value ?? undefined }, (p, i) => { pts.push(p); pts.sort((u, v) => u.f - v.f); prog.value = Math.min(1, (i + 1) / n); paint(); }, ctl);
      runB.hidden = false; stopB.hidden = true; prog.hidden = true;
      if (r.error) { rb.clear(r.error); return; }
      if (!pts.length) { rb.clear('Stopped.'); return; }
      csvB.hidden = false;
      const sm = paint(), warn = [];
      const clip = pts.some(p => p.vout > 0 && Math.abs(p.dcOut) > 0 && p.vout > 0.9 * Math.abs(p.dcOut) && p.db > 0);
      if (clip) warn.push(['warn', 'The output swing is close to its DC level: it may clip. Try a smaller test amplitude for a clean small-signal curve.']);
      if (pts.some(p => !p.settled)) warn.push(['warn', 'Some frequencies did not fully settle (very slow capacitors). Sweep again with a higher From frequency.']);
      if (sm.slope != null && sm.slope < -8) warn.push(['ok', `Falls ${Math.round(-sm.slope)} dB per decade at the top: ≈ ${Math.max(1, Math.round(-sm.slope / 20))}${Math.round(-sm.slope / 20) === 1 ? 'st' : Math.round(-sm.slope / 20) === 2 ? 'nd' : 'th'}-order roll-off.`]);
      const at = (f) => pts.reduce((a, b) => (Math.abs(Math.log(b.f / f)) < Math.abs(Math.log(a.f / f)) ? b : a));
      const vals = [['Type', sm.kind], ['Max gain', `${sm.peak.db.toFixed(1)} dB (×${plain(sm.peak.gain, 3)}) at ${si(sm.peak.f, 'Hz', 3)}`, true]];
      if (sm.f3lo) vals.push(['Low −3 dB', si(sm.f3lo, 'Hz', 3)]);
      if (sm.f3hi) vals.push(['High −3 dB', si(sm.f3hi, 'Hz', 3)]);
      if (sm.bw) vals.push(['Bandwidth', si(sm.bw, 'Hz', 3)]);
      if (f1 <= 1000 && f2 >= 1000) { const p = at(1000); vals.push(['At ≈ 1 kHz', `${p.db.toFixed(1)} dB, ${Math.round(p.phase)}°`]); }
      rb.show({ values: vals, warn, lines: ['Yellow = gain (dB, left), blue = phase (°, right). 0 dB = same size out as in, −6 dB = half, +20 dB = ×10.'] });
      out.append(el('details', {}, el('summary', { text: 'Table' }), table(['Frequency', 'Gain', 'Phase', 'Vout peak'], pts.map(p => [si(p.f, 'Hz', 4), plain(p.db, 3) + ' dB', Math.round(p.phase) + '°', si(p.vout, 'V', 3)]))));
    }
  }

  // ===== Tolerance =====
  function tolView(root) {
    const c = api.getC();
    root.append(note('Builds your circuit 100 times with every resistor, capacitor and coil off by a random amount inside its tolerance, like real parts from the shop. Shows how much each <b>Voltmeter, Ammeter, Scope channel and LED current</b> moves, which part moves it most, and whether some builds overheat a part.'));
    const nR = numField('an.runs', 'Builds', '', { def: '100' }), tR = numField('an.tr', 'Resistors ±', '%', { def: '5' }), tC = numField('an.tc', 'Capacitors ±', '%', { def: '20' }), tL = numField('an.tl', 'Coils ±', '%', { def: '10' });
    const dist = select('an.dist', 'Spread', [['flat', 'Flat (worst case)'], ['bell', 'Bell curve (typical)']], 'flat');
    const dyn = S.isDynamic(c), tE = numField('an.te', 'Run each build for', 's', { def: plain(A.autoTolTime(c), 3) });
    const prog = el('progress', { class: 'an-prog', max: 1, value: 0, hidden: true }), out = el('div', { class: 'an-out' }), rb = resultBox();
    const runB = btn('▶ Run test', run, 'primary'), stopB = btn('■ Stop', stop); stopB.hidden = true;
    if (c.parts.some(p => S.isBoard(p.type) && p.props.run && p.props.code)) root.append(el('p', { class: 'flag warn', text: 'Board code (💻) does not run in this test: pins keep the modes they have now.' }));
    root.append(el('div', { class: 'fields' }, nR.el, tR.el, tC.el, tL.el, dist.el, dyn ? tE.el : null), el('div', { class: 'row wrap' }, runB, stopB, prog), rb.el, out);
    rb.clear(dyn ? 'Time circuit: each build runs the simulation, then averages the last 20 %. Takes a few seconds.' : 'DC circuit: fast.');
    async function run() {
      ctl = { stop: false }; runB.hidden = true; stopB.hidden = false; prog.hidden = false; prog.value = 0; out.replaceChildren(); rb.clear('Building…');
      const runs = Math.max(5, Math.min(2000, Math.round(nR.value ?? 100)));
      const r = await A.tolerance(api.getC(), { runs, tolR: (tR.value ?? 5) / 100, tolC: (tC.value ?? 20) / 100, tolL: (tL.value ?? 10) / 100, tEnd: tE.value ?? 0.05, gauss: dist.value === 'bell' }, (k, n) => { prog.value = k / n; }, ctl);
      runB.hidden = false; stopB.hidden = true; prog.hidden = true;
      if (r.error) { rb.clear(r.error); return; }
      const warn = [];
      for (const b of r.nomStress) warn.push(['bad', `Already as drawn: ${b}.`]);
      for (const [b, n] of r.burns) if (!r.nomStress.includes(b)) warn.push([n / r.runs > 0.1 ? 'bad' : 'warn', `${b} in ${n} of ${r.runs} builds (${Math.round(n / r.runs * 100)} %).`]);
      if (!r.burns.length && !r.nomStress.length) warn.push(['ok', `No part overheats or over-currents in any of the ${r.runs} builds.`]);
      if (r.failed) warn.push(['warn', `${r.failed} builds could not be solved.`]);
      if (!r.varied) warn.push(['warn', 'No resistors, capacitors or coils to vary.']);
      rb.show({ values: [['Builds', String(r.runs)], ['Parts varied', String(r.varied)]], warn });
      const cv = el('canvas', { class: 'an-cv an-hist' }), pickSel = el('select', { class: 'sel sm' }, r.rows.map((x, i) => el('option', { value: i, text: x.name })));
      const drawH = () => { const x = r.rows[+pickSel.value]; histogram(cv, x.xs, { v0: x.nominal, unit: x.unit }); };
      pickSel.onchange = drawH;
      pickSel.value = String(r.rows.reduce((bi, x, i) => ((x.spread ?? 0) > (r.rows[bi].spread ?? 0) ? i : bi), 0));
      out.append(table(['Reading', 'Nominal', 'Lowest', 'Highest', '±', 'Moved most by'], r.rows.map(x => ({
        cls: x.spread > 0.1 ? 'bad' : x.spread > 0.05 ? 'warn' : '',
        cells: [x.name, si(x.nominal, x.unit, 4), si(x.lo, x.unit, 4), si(x.hi, x.unit, 4), x.spread != null ? (x.spread * 100).toFixed(1) + ' %' : '—', x.cause ?? '—'] }))),
      el('div', { class: 'row wrap' }, el('span', { class: 'muted', text: 'Spread of' }), pickSel), cv,
      note('Yellow line = the value with exact parts. If a reading moves too much, use a tighter part (1 % resistor) for the one in "Moved most by", or a design that does not depend on it.'));
      requestAnimationFrame(drawH);
    }
  }

  // ===== Heat =====
  function heatView(root) {
    const c = api.getC(), types = new Set(['R', 'D', 'ZD', 'NPN', 'PNP', 'NMOS', 'PMOS', 'REG', 'LM2596', 'OPAMP', 'T555', 'LAMP']);
    const cands = c.parts.filter(p => types.has(p.type));
    root.append(note('Parts warm up slowly. This shows the temperature inside the part over time for the power it burns, with or without a heatsink, and which heatsink keeps it safe. Philippine room ≈ 32 °C, inside a closed box ≈ 45 °C.'));
    if (!cands.length) { root.append(el('p', { class: 'flag warn', text: 'No part that makes heat (resistor, diode, transistor, MOSFET, regulator…) in this circuit.' })); return; }
    // power right now from the simulation (or the DC operating point)
    let live = api.getRes(); if (!live?.ok) { try { live = S.solveCircuit(c, null, { sigOff: true }); } catch { live = null; } }
    const pw = (p) => Math.abs(live?.ok ? live.parts.get(p.id)?.p ?? 0 : 0);
    const sorted = [...cands].sort((a, b) => pw(b) - pw(a)), pre = api.selId() != null && cands.some(p => p.id === api.selId()) ? api.selId() : sorted[0].id;
    const partSel = select('an.hpart', 'Part', sorted.map(p => [String(p.id), `${p.name} (${p.props.model ?? S.TYPES[p.type].label}) ${si(pw(p), 'W', 3)}`]), String(pre));
    partSel.set(String(pre));
    const pkgs = [['resistor', 'Resistor body'], ...Object.entries(A.PACKAGES).map(([k, v]) => [k, `${k}: ${v.note}`])];
    const pkgSel = select('an.hpkg', 'Package', pkgs, 'TO-220'), sinkSel = select('an.hsink', 'Heatsink', Object.entries(A.HEATSINKS).map(([k, v]) => [k, v.label]), 'none');
    const P = numField('an.hp', 'Power', 'W', {}), Ta = numField('an.ta', 'Air around it', '°C', { def: '32' }), rsa = numField('an.rsa', 'Own heatsink', '°C/W', { hint: 'from its datasheet, overrides the list' });
    const cv = el('canvas', { class: 'an-cv' }), rb = resultBox();
    const sync = () => {
      const p = c.parts.find(q => q.id === +partSel.value); if (!p) return;
      pkgSel.set(A.packageOf(p)); P.set(plain(pw(p), 3));
      sinkSel.sel.disabled = rsa.input.disabled = pkgSel.value === 'resistor';
      calc();
    };
    partSel.sel.addEventListener('change', sync);
    for (const f of [pkgSel, sinkSel]) f.sel.addEventListener('change', () => { sinkSel.sel.disabled = rsa.input.disabled = pkgSel.value === 'resistor'; calc(); });
    for (const f of [P, Ta, rsa]) f.input.addEventListener('input', calc);
    root.append(el('div', { class: 'fields' }, partSel.el, P.el, pkgSel.el, sinkSel.el, rsa.el, Ta.el), cv, rb.el);
    function calc() {
      const p = c.parts.find(q => q.id === +partSel.value), Pw = P.value, ta = Ta.value ?? 32;
      if (!(Pw >= 0)) { rb.clear('Type the power in watts.'); return; }
      const h = A.heat({ P: Pw, pkg: pkgSel.value, rating: p?.props.rating ?? 0.25, sink: sinkSel.value, rsa: pkgSel.value === 'resistor' ? undefined : rsa.value ?? undefined, ta });
      const mins = h.T >= 120;
      chart(cv, { series: [{ pts: h.pts.map(q => [mins ? q[0] / 60 : q[0], q[1]]), col: h.verdict === 'bad' ? COL.red : h.verdict === 'warn' ? COL.y : COL.green }],
        xFmt: (v) => plain(v, 3) + (mins ? ' min' : ' s'), yL: { fmt: (v) => Math.round(v) + '°', min: ta, max: Math.min(h.tmax + 10, Math.max(h.tjSteady, ta + 10)) },
        hlines: [{ y: h.tmax, col: COL.red, label: `max ${h.tmax} °C` }] });
      const warn = [];
      const fmtT = (t) => (t >= 120 ? plain(t / 60, 2) + ' min' : plain(t, 2) + ' s');
      if (h.verdict === 'bad') warn.push(['bad', `Too hot: reaches ${h.tmax} °C after ${h.tHit != null ? fmtT(h.tHit) : 'a while'} and keeps climbing to ${Math.round(h.tjSteady)} °C. It will fail.`]);
      else if (h.verdict === 'warn') warn.push(['warn', `Hot: settles at ${Math.round(h.tjSteady)} °C, close to its ${h.tmax} °C limit. Works on a cool day, fails in a hot box.`]);
      else warn.push(['ok', `Safe: settles at ${Math.round(h.tjSteady)} °C (max ${h.tmax} °C).`]);
      if (pkgSel.value === 'resistor') { const need = [0.25, 0.5, 1, 2, 3, 5, 10].find(r => r >= Pw * 2); warn.push(['ok', `Rule of thumb: use a resistor rated 2× the power → ${need ? need + ' W' : 'a power resistor on a heatsink'}.`]); }
      else if (h.needRsa != null) {
        if (h.needRsa <= 0) warn.push(['bad', `Even a perfect heatsink can't hold it: ${si(Pw, 'W', 3)} is too much for this package. Use a bigger part, share the load, or a switching design.`]);
        else if (!h.withSink && h.verdict !== 'good') warn.push(['warn', `Needs a heatsink of ${plain(h.needRsa, 2)} °C/W or better (smaller number = bigger heatsink). ${Object.values(A.HEATSINKS).filter(s => s.rsa != null && s.rsa <= h.needRsa).map(s => s.label.split(' (')[0])[0] ?? 'Large + fan'} is enough.`]);
        else if (h.withSink && h.verdict !== 'good') warn.push(['warn', `Pick a heatsink of ${plain(h.needRsa, 2)} °C/W or better.`]);
      }
      rb.show({ values: [['Settles at', Math.round(h.tjSteady) + ' °C', true], ['Time to settle', '≈ ' + fmtT(h.tauSlow * 3)], ['Thermal resistance', plain(h.rTot, 3) + ' °C/W']], warn,
        lines: [`Temperature = air + power × thermal resistance = ${plain(ta, 3)} + ${plain(Pw, 3)} × ${plain(h.rTot, 3)} = ${Math.round(h.tjSteady)} °C`] });
    }
    sync();
  }

  // ===== Import =====
  function importView(root) {
    root.append(note('Paste a <b>SPICE netlist</b> (LTspice: View → SPICE Netlist; KiCad: Simulator → export; ngspice / Proteus SPICE exports) or open the file. R, C, L, V (DC, SINE, PULSE), I, D (diode / LED / zener), Q (NPN / PNP) and M (MOSFET) come in. Parts are laid out in a row with one bus wire per net: drag them into a nicer drawing afterwards.'));
    const ta = el('textarea', { class: 'an-ta', spellcheck: 'false', placeholder: '* my circuit\nV1 N001 0 12\nR1 N001 N002 1k\nD1 N002 0 LED\n.end' });
    ta.value = store.get('an.net', '');
    ta.addEventListener('input', () => store.set('an.net', ta.value));
    const rb = resultBox();
    const fileB = btn('📂 Open file…', () => { const f = el('input', { type: 'file', accept: '.net,.cir,.sp,.spice,.txt,.ckt' }); f.onchange = async () => { const file = f.files[0]; if (!file) return; ta.value = await file.text(); store.set('an.net', ta.value); }; f.click(); });
    const goB = btn('📥 Import into Schematic', () => {
      const r = A.importSpice(ta.value);
      if (r.error) { rb.clear(r.error); return; }
      const warn = [];
      if (!r.hasGround) warn.push('No ground (node 0) in the netlist: add a GND part before running.');
      if (r.skipped.length) warn.push(`Skipped ${r.skipped.length} line${r.skipped.length > 1 ? 's' : ''} (sub-circuits / ICs / controlled sources): ${r.skipped.slice(0, 4).map(s => s.split(/\s+/)[0]).join(', ')}${r.skipped.length > 4 ? '…' : ''}. Add those parts by hand.`);
      api.load(r.circuit, `📥 Imported ${r.parts} parts on ${r.nets} nets.${warn.length ? ' ' + warn.join(' ') : ''}`);
      d.close();
    }, 'primary');
    root.append(ta, el('div', { class: 'row wrap' }, fileB, goB), rb.el);
    rb.clear('Your current circuit is saved in Projects first ("Before import …"), then the netlist replaces it on screen.');
  }
}
