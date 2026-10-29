// Inductors: air core, RF / high frequency, ferrite & iron-powder cores, laminated iron core (transformer), general
import { el, numField, card, grid, note, resultBox, segmented, select, table, store } from '../ui.js';
import { si, plain, parse, pct, nearest, E12 } from '../num.js';
import * as F from '../formulas.js';

const mm = v => (v == null ? null : v / 1000);
const awgTxt = d => `AWG ${F.nearestAwg(d)} (${(F.awgDia(F.nearestAwg(d)) * 1000).toFixed(2)} mm)`;

export function inductorTab(root) {
  const body = el('div');
  const pick = segmented('ind.mode', [['air', 'Air core'], ['rf', 'High freq / RF'], ['core', 'Ferrite / iron powder'], ['iron', 'Iron core 50/60 Hz'], ['gen', 'General']], 'air', () => show());
  root.append(el('div', { class: 'subnav' }, pick.el), body);
  const show = () => { body.innerHTML = ''; ({ air, rf, core, iron, gen })[pick.value](body); };
  show();
}

// ---------- air core ----------
function air(root) {
  const go = () => run();
  const kind = segmented('air.kind', [['single', 'Single layer'], ['multi', 'Multi-layer']], 'single', go);
  const D = numField('air.D', 'Former (pipe) outside diameter', 'mm', { def: '20', onchange: go });
  const w = numField('air.w', 'Wire diameter (with enamel)', 'mm', { def: '0.8', onchange: go });
  const N = numField('air.N', 'Turns', '', { def: '20', onchange: go });
  const len = numField('air.l', 'Coil length (empty = close-wound)', 'mm', { onchange: go });
  const depth = numField('air.b', 'Winding depth (multi-layer)', 'mm', { def: '5', onchange: go });
  const Lt = numField('air.Lt', 'Target inductance (optional)', 'H', { def: '10u', onchange: go, hint: 'Gives the turns you need (single layer, close-wound)' });
  const res = resultBox();
  root.append(card('Air core coil (Wheeler formula)', note('Accurate to about 1–2 % for coils longer than 0.4 × diameter. No core = no saturation, works up to RF.'), kind.el,
    grid(D, w, N, len, depth, Lt), res.el, coilSvg()));
  function run() {
    const d0 = mm(D.value), wd = mm(w.value), n = N.value, multi = kind.value === 'multi';
    depth.el.hidden = !multi;
    if (!(d0 > 0 && wd > 0)) { res.clear('Type the former and wire diameter.'); return; }
    const L = [], vals = [], warn = [];
    if (n > 0) {
      const l = mm(len.value) ?? (multi ? null : n * wd * 1.03);
      if (!multi) {
        const d = d0 + wd, Lh = F.airSingleL(d, l, n);
        L.push(`Coil diameter (wire centres) d = ${plain(d0 * 1000)} + ${plain(wd * 1000)} = ${plain(d * 1000)} mm`,
          `Length l = ${len.value != null ? 'as typed' : `turns × wire × 1.03 (close-wound)`} = ${plain(l * 1000)} mm`,
          `L(µH) = d² × N² ÷ (457.2 d + 1016 l)  [d, l in mm]`,
          `      = ${plain(d * 1000)}² × ${plain(n)}² ÷ (457.2 × ${plain(d * 1000)} + 1016 × ${plain(l * 1000)}) = ${si(Lh, 'H')}`);
        vals.push(['Inductance', si(Lh, 'H'), true]);
        const wl = n * Math.PI * d, Rdc = F.wireR(wl + 0.04, wd * 0.93);
        L.push(`Wire length = N × π × d = ${plain(n)} × π × ${plain(d * 1000)} mm = ${si(wl, 'm')} (+ 20 mm per lead)`, `DC resistance ≈ ${si(Rdc, 'Ω')} (copper, ${awgTxt(wd * 0.93)})`);
        vals.push(['Wire', si(wl + 0.04, 'm')], ['R dc', si(Rdc, 'Ω')], ['Max DC (3 A/mm²)', si(3e6 * Math.PI * (wd * 0.93) ** 2 / 4, 'A')]);
        if (l < 0.4 * d) warn.push(['warn', 'Short, fat coil: Wheeler is less accurate here (up to ~5 %). Measure it with an LCR meter.']);
      } else {
        const b = mm(depth.value) ?? 0.005, lm = l ?? 0.01, r = (d0 + b) / 2, Lh = F.airMultiL(r, lm, b, n);
        L.push(`Mean radius r = (former + depth) ÷ 2 = ${plain(r * 1000)} mm, length l = ${plain(lm * 1000)} mm, depth b = ${plain(b * 1000)} mm`,
          `L(µH) = 0.8 × r² × N² ÷ (25.4 × (6r + 9l + 10b))  [mm]`, `      = ${si(Lh, 'H')}`);
        const layers = Math.ceil(b / wd), perLayer = Math.floor(lm / wd);
        L.push(`Fits ≈ ${perLayer} turns × ${layers} layers = ${perLayer * layers} turns`);
        if (perLayer * layers < n) warn.push(['bad', `${plain(n)} turns don't fit in ${plain(lm * 1000)} × ${plain(b * 1000)} mm with this wire. Make it longer or deeper.`]);
        vals.push(['Inductance', si(Lh, 'H'), true], ['Wire', si(n * 2 * Math.PI * r + 0.04, 'm')]);
        if (len.value == null) warn.push(['warn', 'Multi-layer needs the coil length: using 10 mm.']);
      }
    }
    if (Lt.value > 0 && !multi) {
      const d = d0 + wd, nt = F.airSingleTurns(d, wd * 1.03, Lt.value);
      L.push('', `Turns for ${si(Lt.value, 'H')}: solve d²N² − 1016·p·L·N − 457.2·d·L = 0 → N = ${plain(nt, 3)} → wind ${Math.ceil(nt)} turns, length ${plain(Math.ceil(nt) * wd * 1.03 * 1000, 3)} mm`);
      vals.push([`Turns for ${si(Lt.value, 'H')}`, String(Math.ceil(nt)), true]);
    }
    res.show({ values: vals, lines: L, warn });
  }
  run();
}

// ---------- RF ----------
function rf(root) {
  const go = () => run();
  const L = numField('rf.L', 'Inductance', 'H', { def: '1u', onchange: go });
  const f = numField('rf.f', 'Frequency', 'Hz', { def: '7.1M', onchange: go });
  const C = numField('rf.C', 'Capacitor (optional)', 'F', { onchange: go, hint: 'Empty = calculates C to resonate at this frequency' });
  const wd = numField('rf.wd', 'Wire diameter', 'mm', { def: '1', onchange: go });
  const wl = numField('rf.wl', 'Wire length in the coil', 'm', { def: '0.5', onchange: go });
  const res = resultBox();
  root.append(card('High frequency: reactance, skin effect, Q, resonance', note('At high frequency current only flows in a thin skin of the wire, so resistance rises and Q drops.'), grid(L, f, C, wd, wl), res.el));
  function run() {
    const l = L.value, fv = f.value, c = C.value, d = mm(wd.value), len = wl.value;
    if (!(l > 0 && fv > 0)) { res.clear('Type inductance and frequency.'); return; }
    const XL = F.reactanceL(fv, l), Ls = [`XL = 2π f L = 2π × ${plain(fv)} × ${plain(l)} = ${si(XL, 'Ω')}`], vals = [['XL', si(XL, 'Ω'), true]], warn = [];
    if (c > 0) { const fr = F.resonance(l, c); Ls.push(`Resonance f = 1 ÷ (2π √(L C)) = 1 ÷ (2π √(${plain(l)} × ${plain(c)})) = ${si(fr, 'Hz')}`); vals.push(['Resonates at', si(fr, 'Hz'), true]); }
    else { const cr = 1 / ((2 * Math.PI * fv) ** 2 * l); Ls.push(`C for resonance = 1 ÷ ((2π f)² L) = ${si(cr, 'F')}`); vals.push(['C to resonate', si(cr, 'F'), true]); }
    const delta = F.skinDepth(fv);
    Ls.push(`Skin depth (copper) δ = √(ρ ÷ (π f µ0)) = ${si(delta, 'm')}   (≈ 66 mm ÷ √f)`);
    vals.push(['Skin depth', si(delta, 'm')]);
    if (d > 0 && len > 0) {
      const Rdc = F.wireR(len, d), k = F.acFactor(d, delta), Rac = Rdc * k, Q = XL / Rac;
      Ls.push(`R dc = ρ × length ÷ area = ${si(Rdc, 'Ω')}`, `R ac ≈ R dc × (d ÷ 4δ + ¼) = ${plain(Rdc)} × ${plain(k)} = ${si(Rac, 'Ω')}  (straight wire; a close-wound coil adds proximity loss, real Q is often 30–50 % lower)`,
        `Q = XL ÷ R ac = ${plain(XL)} ÷ ${plain(Rac)} = ${plain(Q, 3)}`);
      vals.push(['R ac', si(Rac, 'Ω')], ['Q (wire only)', plain(Q, 3), true]);
      const lambda = 3e8 / fv;
      Ls.push(`Wavelength λ = c ÷ f = ${si(lambda, 'm')} → keep the coil wire under λ/10 = ${si(lambda / 10, 'm')}`);
      if (len > lambda / 10) warn.push(['bad', 'Wire is longer than λ/10: the coil is near its self-resonance and acts like an antenna. Use fewer turns / a core.']);
      if (d > 4 * delta) warn.push(['ok', `Only the outer ${si(delta, 'm')} of the wire carries current. Silver-plated or Litz wire (below ~1 MHz) helps.`]);
    }
    res.show({ values: vals, lines: Ls, warn });
  }
  run();
}

// ---------- ferrite / iron powder ----------
function core(root) {
  const go = () => run();
  const opts = [['custom', 'Custom AL (type below)'], ...F.CORES.map(c => [c.name, `${c.name}  ·  AL ${c.AL}`])];
  const sel = select('core.sel', 'Core', opts, 'T-50-2', () => { const c = cur(); if (c) AL.set(String(c.AL)); go(); });
  const AL = numField('core.AL', 'AL value', 'nH/N²', { def: '4.9', onchange: () => { sel.set('custom'); go(); }, hint: 'Iron powder datasheets give µH/100 turns: same number' });
  const N = numField('core.N', 'Turns', '', { def: '20', onchange: go });
  const Lt = numField('core.Lt', 'Or target inductance', 'H', { def: '', onchange: go });
  const Ipk = numField('core.I', 'Peak current', 'A', { def: '1', onchange: go });
  const Bmax = numField('core.B', 'Max flux density', 'T', { def: '0.3', onchange: go, hint: 'Ferrite ≈ 0.3 T (power 0.2 T). Iron powder DC choke ≈ 0.5–1 T.' });
  const res = resultBox();
  const tN = numField('core.tN', 'Test winding turns', '', { def: '10', onchange: () => test() });
  const tL = numField('core.tL', 'Measured inductance', 'H', { onchange: () => test() });
  const tres = resultBox();
  let lastAL = null;
  const useBtn = el('button', { class: 'btn', type: 'button', text: 'Use this AL above', onclick: () => { if (lastAL) { sel.set('custom'); AL.set(plain(lastAL, 3)); run(); } } });
  root.append(card('Ferrite and iron powder cores (L = AL × N²)', note('Pick a core or type its AL. Values are typical datasheet numbers: check yours.'), grid(sel, AL, N, Lt, Ipk, Bmax), res.el),
    card('Unknown core? Find its AL', note('Wind 10 turns on it, measure with an LCR meter, type it here.'), grid(tN, tL), tres.el, el('div', { class: 'row' }, useBtn)));
  function cur() { return F.CORES.find(c => c.name === sel.value); }
  function run() {
    const al = AL.value, c = cur();
    if (!(al > 0)) { res.clear('Type the AL value.'); return; }
    const L = [], vals = [], warn = [];
    let n = N.value, Lh;
    if (Lt.value > 0) { n = F.alTurns(al, Lt.value); L.push(`N = √(L ÷ AL) = √(${plain(Lt.value)} ÷ ${plain(al)}n) = ${plain(n, 3)} → ${Math.ceil(n)} turns`); n = Math.ceil(n); vals.push(['Turns', String(n), true]); }
    if (!(n > 0)) { res.clear('Type turns or a target inductance.'); return; }
    Lh = F.alL(al, n);
    L.push(`L = AL × N² = ${plain(al)} nH × ${plain(n)}² = ${si(Lh, 'H')}`);
    vals.push(['Inductance', si(Lh, 'H'), true]);
    if (c) {
      const Ae = F.toroidAe(c.od, c.id, c.h), le = F.toroidLe(c.od, c.id);
      L.push(`${c.name}: ${c.mat}`, `Size OD ${plain(c.od * 1000, 3)} × ID ${plain(c.id * 1000, 3)} × H ${plain(c.h * 1000, 3)} mm,  Ae = ${plain(Ae * 1e6, 3)} mm²,  le = ${plain(le * 1000, 3)} mm`);
      const turnLen = 2 * c.h + (c.od - c.id) + 0.004;
      L.push(`Wire ≈ ${si(n * turnLen + 0.05, 'm')} (one turn ≈ ${plain(turnLen * 1000, 3)} mm + leads)`);
      const maxTurns = Math.floor(Math.PI * c.id * 0.9 / 0.0008);
      L.push(`About ${maxTurns} turns of 0.8 mm wire fit in one layer on the inside`);
      if (Ipk.value > 0) {
        const B = F.peakFlux(Lh, Ipk.value, n, Ae), bm = Bmax.value ?? 0.3;
        L.push(`B peak = L × I ÷ (N × Ae) = ${plain(Lh)} × ${plain(Ipk.value)} ÷ (${plain(n)} × ${plain(Ae)}) = ${si(B, 'T')}  (${pct(B / bm, 0)} of ${plain(bm)} T)`);
        vals.push(['Flux', si(B, 'T')]);
        warn.push([B < 0.7 * bm ? 'ok' : B < bm ? 'warn' : 'bad', B < 0.7 * bm ? 'Flux is safe: the core will not saturate.' : B < bm ? 'Close to saturation: inductance starts dropping. Use a bigger core.' : 'Core SATURATES: inductance collapses and current spikes. Bigger core, fewer turns + gap, or iron powder −26.']);
      }
    } else if (Ipk.value > 0) warn.push(['warn', 'Custom AL: pick a listed core (or know your core area) to check saturation.']);
    res.show({ values: vals, lines: L, warn });
  }
  function test() {
    const n = tN.value, l = tL.value;
    if (!(n > 0 && l > 0)) { lastAL = null; useBtn.disabled = true; tres.clear('Type turns and the measured inductance.'); return; }
    const al = F.alFromTest(l, n);
    const guess = al < 20 ? 'iron powder (−2 / −6 type, RF)' : al < 150 ? 'iron powder −26/−52 or ferrite 61' : al < 1000 ? 'ferrite 43 type' : 'high-µ ferrite (77, 31, J…): power / EMI';
    tres.show({ values: [['AL', `${plain(al, 3)} nH/N²`, true]], lines: [`AL = L ÷ N² = ${plain(l)} ÷ ${plain(n)}² = ${plain(al, 3)} nH/N²`, `Looks like: ${guess}`], warn: [] });
    lastAL = al; useBtn.disabled = false;
  }
  run(); test();
}

// ---------- laminated iron core ----------
function iron(root) {
  const go = () => run();
  const tw = numField('fe.tw', 'Center tongue width', 'mm', { def: '32', onchange: go });
  const st = numField('fe.st', 'Stack height', 'mm', { def: '40', onchange: go });
  const f = segmented('fe.f', [['60', '60 Hz'], ['50', '50 Hz']], '60', go);
  const B = numField('fe.B', 'Flux density', 'T', { def: '1.1', onchange: go, hint: 'Common silicon steel 1.0–1.2 T. Unknown/old core: 1.0 T (runs cooler).' });
  const Vp = numField('fe.Vp', 'Primary voltage', 'V', { def: '220', onchange: go });
  const Vs = numField('fe.Vs', 'Secondary voltage', 'V', { def: '12', onchange: go });
  const Is = numField('fe.Is', 'Secondary current', 'A', { def: '5', onchange: go });
  const J = numField('fe.J', 'Current density', 'A/mm²', { def: '2.5', onchange: go, hint: '2.5 cool, 3.5 hot but OK for small units' });
  const res = resultBox();
  root.append(card('Iron core transformer / choke (50/60 Hz)', note('Measure the middle leg of the E-I laminations. Core area A = tongue × stack × 0.9 (stacking factor).'), el('div', { class: 'row' }, f.el), grid(tw, st, B, Vp, Vs, Is, J), res.el));
  function run() {
    const a = mm(tw.value), b = mm(st.value);
    if (!(a > 0 && b > 0 && Vp.value > 0)) { res.clear('Type tongue width, stack height and primary voltage.'); return; }
    const A = a * b * 0.9, fv = +f.value, j = (J.value ?? 2.5) * 1e6;
    const t = F.ironTransformer({ A, f: fv, B: B.value ?? 1.1, Vp: Vp.value, Vs: Vs.value, Is: Is.value, J: j });
    const L = [`A = ${plain(a * 1000)} × ${plain(b * 1000)} × 0.9 = ${plain(t.Acm, 3)} cm²`,
      `Core power capacity ≈ A² = ${plain(t.Acm, 3)}² ≈ ${si(t.Pcore, 'W')}   (rule of thumb: A(cm²) ≈ √P)`,
      `Turns per volt = 1 ÷ (4.44 × f × B × A) = 1 ÷ (4.44 × ${fv} × ${plain(B.value ?? 1.1)} × ${plain(A)}) = ${plain(t.tpv, 3)}`,
      `Primary turns = ${plain(Vp.value)} × ${plain(t.tpv, 3)} = ${Math.round(t.Np)}`];
    const vals = [['Turns/volt', plain(t.tpv, 3), true], ['Primary', `${Math.round(t.Np)} t`, true], ['Core capacity', si(t.Pcore, 'W')]];
    const warn = [];
    if (t.Ns != null) { L.push(`Secondary turns = ${plain(Vs.value)} × ${plain(t.tpv, 3)} × 1.05 (winding loss) = ${Math.round(t.Ns)}`); vals.push(['Secondary', `${Math.round(t.Ns)} t`, true]); }
    if (t.Ps != null) {
      L.push(`Output power = ${plain(Vs.value)} × ${plain(Is.value)} = ${si(t.Ps, 'W')},  primary current ≈ P ÷ (0.9 × Vp) = ${si(t.Ip, 'A')}`,
        `Wire: d = √(4I ÷ (π J)) → primary ${plain(t.dp * 1000, 3)} mm (${awgTxt(t.dp)}), secondary ${plain(t.ds * 1000, 3)} mm (${awgTxt(t.ds)})`);
      vals.push(['Primary wire', awgTxt(t.dp)], ['Secondary wire', awgTxt(t.ds)]);
      warn.push([t.Ps <= t.Pcore ? 'ok' : t.Ps <= 1.3 * t.Pcore ? 'warn' : 'bad', t.Ps <= t.Pcore ? `Core is big enough for ${si(t.Ps, 'W')}.` : `Core is too small for ${si(t.Ps, 'W')}: it will overheat. Need about ${plain(Math.sqrt(t.Ps), 3)} cm².`]);
      warn.push(['warn', 'For a DC supply after a bridge + capacitor, the secondary RMS current is ≈ 1.6–1.8 × the DC load current. Size the wire for that.']);
    }
    warn.push(['bad', 'Primary is on mains: insulate between windings (2 layers of tape), fuse the primary, and test with a series lamp first.']);
    res.show({ values: vals, lines: L, warn });
  }
  run();
}

// ---------- general ----------
function gen(root) {
  // reactance, time constant, energy
  {
    const go = () => run();
    const L = numField('g.L', 'Inductance', 'H', { def: '100m', onchange: go });
    const f = numField('g.f', 'Frequency (optional)', 'Hz', { def: '60', onchange: go });
    const R = numField('g.R', 'Series resistance (optional)', 'Ω', { def: '10', onchange: go });
    const I = numField('g.I', 'Current (optional)', 'A', { def: '1', onchange: go });
    const res = resultBox();
    root.append(card('Reactance, time constant, energy', grid(L, f, R, I), res.el));
    function run() {
      const l = L.value; if (!(l > 0)) { res.clear('Type the inductance.'); return; }
      const Ls = [], vals = [];
      if (f.value > 0) { const x = F.reactanceL(f.value, l); Ls.push(`XL = 2π f L = 2π × ${plain(f.value)} × ${plain(l)} = ${si(x, 'Ω')}`); vals.push(['XL', si(x, 'Ω'), true]); if (R.value > 0) { const z = Math.hypot(x, R.value); Ls.push(`Z = √(R² + XL²) = ${si(z, 'Ω')}, phase ${plain(Math.atan2(x, R.value) * 180 / Math.PI, 3)}°`); vals.push(['Z', si(z, 'Ω')]); } }
      if (R.value > 0) { const t = l / R.value; Ls.push(`τ = L ÷ R = ${plain(l)} ÷ ${plain(R.value)} = ${si(t, 's')}  (current reaches 63 % in 1τ, 99 % in 5τ)`); vals.push(['τ', si(t, 's')]); }
      if (I.value != null) { const e = F.energyL(l, I.value); Ls.push(`E = ½ L I² = 0.5 × ${plain(l)} × ${plain(I.value)}² = ${si(e, 'J')}  → this is the spike when you switch it off: use a flyback diode`); vals.push(['Energy', si(e, 'J')]); }
      res.show({ values: vals, lines: Ls });
    }
    run();
  }
  // buck / boost
  {
    const go = () => run();
    const mode = segmented('g.mode', [['buck', 'Buck (step-down)'], ['boost', 'Boost (step-up)']], 'buck', go);
    const Vin = numField('g.Vin', 'Vin', 'V', { def: '12', onchange: go });
    const Vout = numField('g.Vout', 'Vout', 'V', { def: '5', onchange: go });
    const fs = numField('g.fs', 'Switching frequency', 'Hz', { def: '100k', onchange: go });
    const Io = numField('g.Io', 'Output current', 'A', { def: '2', onchange: go });
    const L = numField('g.Ls', 'Inductor (empty = suggest)', 'H', { def: '', onchange: go });
    const res = resultBox();
    root.append(card('Switching regulator inductor', mode.el, grid(Vin, Vout, fs, Io, L), res.el));
    function run() {
      const vi = Vin.value, vo = Vout.value, f = fs.value, io = Io.value, buck = mode.value === 'buck';
      if (!(vi > 0 && vo > 0 && f > 0)) { res.clear('Type Vin, Vout and frequency.'); return; }
      if (buck ? vo >= vi : vo <= vi) { res.clear(buck ? 'Buck needs Vout lower than Vin.' : 'Boost needs Vout higher than Vin.'); return; }
      const Ls = [], vals = [], warn = [];
      let l = L.value;
      const iref = buck ? io : (io != null ? io / (vi / vo) : null);
      if (!(l > 0) && iref > 0) {
        const dI = 0.3 * iref; l = buck ? F.buckL(vi, vo, f, dI) : F.boostL(vi, vo, f, dI);
        const n = nearest(l, E12);
        Ls.push(`Suggested L for 30 % ripple current: ${buck ? 'L = (Vin − Vout) × D ÷ (f × ΔI)' : 'L = Vin × D ÷ (f × ΔI)'} = ${si(l, 'H')} → use ${si(n.above, 'H')}`);
        l = n.above; vals.push(['Use L', si(l, 'H'), true]);
      }
      if (!(l > 0)) { res.clear('Type the inductor or the output current.'); return; }
      const o = buck ? F.buck({ Vin: vi, Vout: vo, f, L: l, Iout: io }) : F.boost({ Vin: vi, Vout: vo, f, L: l, Iout: io });
      Ls.push(`Duty D = ${buck ? 'Vout ÷ Vin' : '1 − Vin ÷ Vout'} = ${pct(o.D)}`, `Ripple ΔI = ${buck ? '(Vin − Vout) × D ÷ (f × L)' : 'Vin × D ÷ (f × L)'} = ${si(o.dI, 'A')} p-p`);
      if (o.Ipk != null) Ls.push(`Peak inductor current = ${buck ? 'Iout' : 'Iin'} + ΔI ÷ 2 = ${si(o.Ipk, 'A')}  → saturation current rating must be higher`);
      vals.push(['Duty', pct(o.D)], ['Ripple ΔI', si(o.dI, 'A')], ...(o.Ipk != null ? [['Peak current', si(o.Ipk, 'A'), true]] : []));
      if (iref > 0 && o.dI / 2 > iref) warn.push(['warn', 'Ripple is bigger than the load current: the converter runs in discontinuous mode at this load.']);
      res.show({ values: vals, lines: Ls, warn });
    }
    run();
  }
  // series / parallel
  {
    const inp = el('input', { id: 'ind-list', class: 'num wide', value: store.get('ind.list', '10u 22u 47u'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const res = resultBox();
    inp.addEventListener('input', () => { store.set('ind.list', inp.value); run(); });
    root.append(card('Inductors in series and parallel (no coupling)', inp, res.el));
    function run() {
      const v = inp.value.split(/[\s;,]+/).filter(Boolean).map(parse);
      if (!v.length || v.some(x => !(x > 0))) { res.clear('Type values like 10u 22u.'); return; }
      const s = v.reduce((a, b) => a + b, 0), p = 1 / v.reduce((a, b) => a + 1 / b, 0);
      res.show({ values: [['Series', si(s, 'H'), true], ['Parallel', si(p, 'H'), true]], lines: ['Series: L = L1 + L2 + …   Parallel: 1/L = 1/L1 + 1/L2 + …', 'Keep coils apart or at 90° so their fields don\'t couple.'] });
    }
    run();
  }
}

function coilSvg() {
  const turns = Array.from({ length: 9 }, (_, k) => `<ellipse class="part" cx="${40 + k * 14}" cy="40" rx="6" ry="20"/>`).join('');
  return el('div', { class: 'diagram wide', html: `<svg viewBox="0 0 220 80" role="img" aria-label="Single layer coil: d is diameter, l is length"><rect class="former" x="28" y="24" width="140" height="32" rx="3"/>${turns}<path class="dim" d="M20 20 V60 M16 20 H24 M16 60 H24 M34 72 H158 M34 68 V76 M158 68 V76"/><text x="6" y="44">d</text><text x="92" y="79">l</text></svg>` });
}
