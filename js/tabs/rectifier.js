// AC → DC: bridge / center-tap / half-wave rectifier with a smoothing capacitor
import { el, numField, card, grid, note, resultBox, segmented, select } from '../ui.js';
import { si, plain, pct, nearest, E12 } from '../num.js';
import * as F from '../formulas.js';

const PIVS = [50, 100, 200, 400, 600, 800, 1000, 1200, 1600];

export function rectifierTab(root) {
  const go = () => run();
  const Vrms = numField('rc.V', 'AC voltage (RMS)', 'V', { def: '12', onchange: go, hint: 'Transformer secondary, or 220 for mains direct.' });
  const freq = segmented('rc.f', [['60', '60 Hz (PH)'], ['50', '50 Hz']], '60', go);
  const type = segmented('rc.t', [['bridge', 'Bridge'], ['ct', 'Center-tap'], ['half', 'Half-wave']], 'bridge', go);
  const Vf = numField('rc.Vf', 'Diode drop each', 'V', { def: '0.9', onchange: go, hint: '1N400x ≈ 0.9 V at 1 A, Schottky ≈ 0.45 V' });
  const C = numField('rc.C', 'Filter capacitor', 'F', { def: '2200u', onchange: go });
  const I = numField('rc.I', 'Load current', 'A', { def: '1', onchange: go, hint: 'or leave empty and give a load resistor' });
  const R = numField('rc.R', 'Load resistor (if no current)', 'Ω', { onchange: go });
  const Rs = numField('rc.Rs', 'Series resistance', 'Ω', { def: '0.5', onchange: go, hint: 'Winding + wires, or an NTC. Sets the switch-on surge.' });
  const want = numField('rc.want', 'Wanted ripple (optional)', 'V', { def: '1', onchange: go });
  const res = resultBox(), graph = el('div', { class: 'graph' });
  root.append(card('Rectifier and filter capacitor', note('Full-wave bridge with smoothing capacitor (or center-tap / half-wave). Ripple uses V<sub>ripple</sub> ≈ I ÷ (f<sub>ripple</sub> × C).'),
    el('div', { class: 'row wrap' }, freq.el, type.el), grid(Vrms, Vf, C, I, R, Rs, want), res.el),
    card('Waveform (3 mains cycles)', graph, el('div', { class: 'legend' }, el('span', { class: 'lg a', text: 'rectified (no cap)' }), el('span', { class: 'lg b', text: 'capacitor / DC output' }))));
  function run() {
    const v = Vrms.value, c = C.value, i = I.value, r = R.value, f = +freq.value, t = type.value, vf = Vf.value ?? 0.7, rs = Rs.value ?? 0;
    graph.innerHTML = '';
    if (!(v > 0)) { res.clear('Type the AC voltage.'); return; }
    if (i == null && !(r > 0)) { res.clear('Type the load current or the load resistor.'); return; }
    const o = F.rectifier({ Vrms: v, f, type: t, Vf: vf, C: c > 0 ? c : null, I: i, R: i == null ? r : null, Rs: rs });
    const S = si, p = plain;
    const L = [
      `Vpeak = Vrms × √2 = ${p(v)} × 1.4142 = ${S(o.Vpk, 'V')}`,
      `Peak on capacitor = Vpeak − ${o.drops} × Vf = ${p(o.Vpk)} − ${o.drops} × ${p(vf)} = ${S(o.Vpo, 'V')}   (${t === 'bridge' ? '2 diodes conduct at a time' : '1 diode conducts'})`,
      `Ripple frequency = ${t === 'half' ? 'f' : '2 × f'} = ${S(o.fr, 'Hz')}`,
    ];
    if (i == null) L.push(`Load current = Vdc ÷ R = ${p(o.Vdc)} ÷ ${p(r)} = ${S(o.Iload, 'A')}`);
    if (c > 0) {
      L.push(`Ripple = I ÷ (f × C) = ${p(o.Iload)} ÷ (${p(o.fr)} × ${p(c)}) = ${S(o.Vr, 'V')} peak-to-peak`,
        `Vdc (average) = Vpeak_cap − ripple ÷ 2 = ${p(o.Vpo)} − ${p(o.Vr)} ÷ 2 = ${S(o.Vdc, 'V')}`,
        `Lowest voltage = ${p(o.Vpo)} − ${p(o.Vr)} = ${S(o.Vmin, 'V')}`,
        `Diode conducts only ${S(o.tc, 's')} of every ${S(o.Tr, 's')} (${pct(o.tc / o.Tr, 0)}) = cos⁻¹(1 − Vr ÷ Vpk) ÷ (2π f)`,
        `Diode peak current ≈ 2 × I × T ÷ t_on = 2 × ${p(o.Iload)} × ${p(o.Tr)} ÷ ${p(o.tc)} = ${S(o.IdPk, 'A')}`,
        `Capacitor ripple current ≈ I × √(4T ÷ 3t_on − 1) = ${S(o.IcapRms, 'A')} RMS`);
    } else L.push(`No capacitor: Vdc = ${t === 'half' ? 'Vpk ÷ π' : '2 × Vpk ÷ π'} = ${S(o.Vdc, 'V')} (pulsing DC)`);
    L.push(`Diode reverse voltage (PIV) = ${t === 'bridge' ? 'Vpeak' : '2 × Vpeak'} = ${S(o.PIV, 'V')}`,
      `Diode average current = ${t === 'half' ? 'I' : 'I ÷ 2'} = ${S(o.IdAvg, 'A')}`);
    if (rs > 0) L.push(`Switch-on surge (empty cap) = Vpeak ÷ Rseries = ${p(o.Vpk)} ÷ ${p(rs)} = ${S(o.Isurge, 'A')}`);
    const vals = [['DC output', S(o.Vdc, 'V'), true], ['Ripple p-p', c > 0 ? S(o.Vr, 'V') : '100 %', true], ['Peak', S(o.Vpo, 'V')], ['Ripple %', pct(o.ripplePct)], ['Load current', S(o.Iload, 'A')], ['Diode PIV', S(o.PIV, 'V')]];
    const warn = [];
    if (v > 50) warn.push(['bad', 'Mains voltage: no isolation without a transformer. Everything, including the DC side and the negative rail, is live. Use a fuse, enclosure and never touch it while plugged in.']);
    const piv = PIVS.find(x => x >= o.PIV * 1.5);
    const diode = o.IdAvg <= 0.6 ? '1N4007 (1 A)' : o.IdAvg <= 2 ? '1N5408 (3 A)' : o.IdAvg <= 4 ? 'GBU6 / KBU6 bridge (6 A)' : o.IdAvg <= 12 ? 'KBPC2510 bridge (25 A) on a heatsink' : 'KBPC3510 bridge (35 A) on a heatsink';
    warn.push(['ok', `Diodes: ${diode}, rated ${piv ?? '> 1600'} V or more (1.5× PIV).`]);
    if (c > 0) {
      const cv = F.capVoltRating(o.Vpo);
      warn.push([cv ? 'ok' : 'bad', cv ? `Capacitor: ${S(c, 'F')} / ${cv} V or more (1.25× peak), 105 °C type, ripple current rating ≥ ${S(o.IcapRms, 'A')}.` : 'Peak is above 500 V: use capacitors in series with balancing resistors.']);
      if (o.ripplePct > 0.1) warn.push(['warn', `Ripple is ${pct(o.ripplePct, 0)} of Vdc. Use a bigger capacitor or add a regulator (keep the lowest voltage ${S(o.Vmin, 'V')} above the regulator's input minimum).`]);
      if (o.IdPk > 30 * o.IdAvg || (rs > 0 && o.Isurge > 50)) warn.push(['warn', `Big current pulses: diodes see ${S(o.IdPk, 'A')} peaks${rs > 0 ? ` and ${S(o.Isurge, 'A')} at switch-on` : ''}. Choose diodes with high IFSM, add an NTC for big capacitors.`]);
    }
    if (want.value > 0 && o.Iload > 0) {
      const cmin = F.capForRipple(o.Iload, o.fr, want.value), n = nearest(cmin, E12);
      L.push('', `For ${S(want.value, 'V')} ripple: C = I ÷ (f × Vr) = ${p(o.Iload)} ÷ (${p(o.fr)} × ${p(want.value)}) = ${S(cmin, 'F')}  → use ${S(n.above, 'F')}`);
      vals.push([`C for ${S(want.value, 'V')} ripple`, S(n.above, 'F'), true]);
    }
    res.show({ values: vals, lines: L, warn });
    graph.innerHTML = drawWave(F.rectWave({ Vpo: o.Vpo, f, type: t, C: c > 0 ? c : null, Iload: o.Iload, R: i == null ? r : null }), o);
  }
  run();
}

function drawWave(pts, o) {
  const W = 600, H = 220, pl = 46, pr = 10, pt = 10, pb = 26;
  const T = pts[pts.length - 1][0], V = o.Vpo * 1.08 || 1;
  const x = t => pl + (t / T) * (W - pl - pr), y = v => H - pb - (v / V) * (H - pt - pb);
  const line = k => 'M' + pts.map(p => `${x(p[0]).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' L');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * V);
  const grid = ticks.map(v => `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${plain(v, 3)}</text>`).join('');
  const tt = [0, 1, 2, 3].map(k => k * T / 3).map(t => `<text class="ax" x="${x(t)}" y="${H - 8}" text-anchor="middle">${si(t, 's', 2)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rectifier waveform">${grid}${tt}<path class="wa" d="${line(1)}"/><path class="wb" d="${line(2)}"/><text class="ax" x="${pl}" y="${pt + 2}">V</text></svg>`;
}
