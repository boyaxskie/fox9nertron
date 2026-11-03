// Fox9nertron analysis tools: FFT, Bode (frequency sweep), tolerance test (Monte Carlo), heat over time, SPICE netlist import.
// Pure functions on the circuit model of sch-core.js, so they run the same in the browser and in tests.
// © 2026 Yaxboom (Fox9ner). All rights reserved.
import * as S from './sch-core.js';

const { PI, sin, cos, sqrt, log10, atan2, abs, exp, max, min, round, floor } = Math;
const tick = () => new Promise(r => setTimeout(r, 0));

// ================= FFT =================
// samples taken every dt seconds → one-sided amplitude spectrum (volts peak) with a Hann window
export function fft(samples, dt) {
  let n = 1; while (n * 2 <= samples.length) n *= 2;
  if (n < 16) return null;
  const x = samples.slice(samples.length - n);
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const re = new Float64Array(n), im = new Float64Array(n);
  let wsum = 0;
  for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * cos(2 * PI * i / (n - 1)); re[i] = (x[i] - mean) * w; wsum += w; }
  // bit reversal + iterative radix-2
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * PI / len, wr = cos(a), wi = sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const half = n / 2, df = 1 / (n * dt), mag = new Float64Array(half);
  for (let k = 0; k < half; k++) mag[k] = (k ? 2 : 1) * sqrt(re[k] * re[k] + im[k] * im[k]) / wsum;
  // peaks: local maxima, refined by parabolic interpolation, strongest first
  const peaks = [];
  const top = mag.reduce((a, b) => max(a, b), 0);
  for (let k = 2; k < half - 1; k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > top * 1e-3) {
      const a = mag[k - 1], b = mag[k], c = mag[k + 1], d = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
      // three bins of a Hann peak hold the energy: sum them back for the true amplitude
      peaks.push({ f: (k + d) * df, amp: b * (1 / (1 - 0.25 * d * d * 0.8)) });
    }
  }
  peaks.sort((p, q) => q.amp - p.amp);
  // THD from the strongest peak (the fundamental) and its harmonics 2..10
  let thd = null;
  if (peaks.length && peaks[0].f > 2 * df) {
    const f0 = peaks[0].f; let h2 = 0;
    for (let h = 2; h <= 10; h++) {
      const k = round(h * f0 / df); if (k >= half - 1) break;
      const m = max(mag[k - 1], mag[k], mag[k + 1]); h2 += m * m;
    }
    thd = sqrt(h2) / peaks[0].amp;
  }
  return { df, mag, mean, n, peaks: peaks.slice(0, 8), thd, fmax: half * df };
}

// ================= Bode: sweep a sine through the circuit =================
// The SIG part drives the input; the scope's CH1 must sit on the input, CH2 on the output.
// Each frequency runs the real (time) simulation until the output settles, then reads amplitude + phase of the
// fundamental (one DFT bin), so non-linear parts (transistors clipping) are handled like on the bench.
export const logFreqs = (f1, f2, n) => Array.from({ length: n }, (_, i) => f1 * Math.pow(f2 / f1, n > 1 ? i / (n - 1) : 0));

export function bodeCheck(c, sigId) {
  const sig = c.parts.find(p => p.type === 'SIG' && (sigId == null || p.id === sigId));
  const sc = c.parts.find(p => p.type === 'SCOPE');
  if (!sig) return 'Add a Signal generator (it becomes the sine input).';
  if (!sc) return 'Add a Scope part: CH1 on the input, CH2 on the output, COM on ground.';
  return null;
}

export function bodePoint(c0, sigId, f, { amp, spc = 200, maxCycles = 400, tol = 2e-3 } = {}) {
  const c = structuredClone(c0);
  const sig = c.parts.find(p => p.id === sigId), sc = c.parts.find(p => p.type === 'SCOPE');
  Object.assign(sig.props, { wave: 'sine', f, amp: amp ?? sig.props.amp });
  // other fast things in the circuit (PWM, SMPS chips) still need their own step size
  const others = S.fastestFreq({ ...c, parts: c.parts.filter(p => p !== sig) });
  const steps = others > f ? max(spc, Math.ceil(40 * others / f)) : spc;
  const dt = 1 / f / steps;
  let st; try { const r0 = S.solveCircuit(c, null, { sigOff: true }); st = r0.ok ? r0.next : new Map(); } catch { st = new Map(); }
  let t = 0, prevH = null, stable = 0, cyc = 0, H = null, A1 = 0, A2 = 0, dcOut = 0;
  const w = 2 * PI * f;
  for (; cyc < maxCycles; cyc++) {
    let i1 = 0, q1 = 0, i2 = 0, q2 = 0, s2 = 0;
    for (let k = 0; k < steps; k++) {
      t += dt;
      const r = S.solveCircuit(c, { t, dt, state: st });
      if (!r.ok) return { f, error: r.error ?? 'circuit cannot be solved' };
      st = r.next;
      const s = r.parts.get(sc.id), cw = cos(w * t), sw = sin(w * t);
      i1 += s.ch1 * cw; q1 += s.ch1 * sw; i2 += s.ch2 * cw; q2 += s.ch2 * sw; s2 += s.ch2;
    }
    // phasors (peak volts)
    const a1r = 2 * i1 / steps, a1i = 2 * q1 / steps, a2r = 2 * i2 / steps, a2i = 2 * q2 / steps;
    A1 = Math.hypot(a1r, a1i); A2 = Math.hypot(a2r, a2i); dcOut = s2 / steps;
    if (A1 < 1e-9) return { f, error: 'CH1 sees no signal: wire CH1 to the signal generator output.' };
    const d = a1r * a1r + a1i * a1i;
    H = [(a2r * a1r + a2i * a1i) / d, (a2i * a1r - a2r * a1i) / d];
    if (prevH) {
      const ch = Math.hypot(H[0] - prevH[0], H[1] - prevH[1]) / max(Math.hypot(...H), 1e-6);
      stable = ch < tol ? stable + 1 : 0;
      if (stable >= 2 && cyc >= 4) break;
    }
    prevH = H;
  }
  const mag = Math.hypot(...H);
  // the phase from sin/cos correlation is the lag of the sine; a sine leading = positive phase
  const ph = -atan2(H[1], H[0]) * 180 / PI;
  return { f, gain: mag, db: 20 * log10(max(mag, 1e-12)), phase: ph, vin: A1, vout: A2, dcOut, cycles: cyc + 1, settled: stable >= 2 };
}

// run a whole sweep; onPoint(pt, i, n) after each frequency; ctl.stop = true cancels
export async function bode(c, { sigId, f1 = 10, f2 = 100e3, n = 25, amp } = {}, onPoint = () => { }, ctl = {}) {
  const err = bodeCheck(c, sigId); if (err) return { error: err };
  const sig = c.parts.find(p => p.type === 'SIG' && (sigId == null || p.id === sigId));
  const out = [];
  let lastPh = null;
  for (const [i, f] of logFreqs(f1, f2, n).entries()) {
    if (ctl.stop) break;
    const pt = bodePoint(c, sig.id, f, { amp });
    if (pt.error) return { error: pt.error, points: out };
    // unwrap the phase so a curve going past −180° stays one smooth line
    if (lastPh != null) { while (pt.phase - lastPh > 180) pt.phase -= 360; while (pt.phase - lastPh < -180) pt.phase += 360; }
    lastPh = pt.phase;
    out.push(pt); onPoint(pt, i, n);
    await tick();
  }
  // sharpen the −3 dB points: a few extra frequencies between the two points around each crossing
  for (let pass = 0; pass < 3 && !ctl.stop && out.length > 2; pass++) {
    const sm = bodeSummary(out), add = [];
    for (const fc of [sm.f3lo, sm.f3hi]) {
      if (!fc) continue;
      const i = out.findIndex(p => p.f > fc); if (i <= 0) continue;
      if (out[i].f / out[i - 1].f < 1.02) continue;
      add.push(Math.sqrt(out[i].f * out[i - 1].f));
    }
    if (!add.length) break;
    for (const f of add) {
      const pt = bodePoint(c, sig.id, f, { amp }); if (pt.error) break;
      const j = out.findIndex(p => p.f > f), ref = out[j - 1].phase;
      while (pt.phase - ref > 180) pt.phase -= 360; while (pt.phase - ref < -180) pt.phase += 360;
      out.splice(j, 0, pt); onPoint(pt, out.length - 1, out.length);
      await tick();
    }
  }
  return { points: out, summary: bodeSummary(out) };
}

export function bodeSummary(pts) {
  if (!pts.length) return null;
  const peak = pts.reduce((a, b) => (b.db > a.db ? b : a));
  const cut = peak.db - 3;
  // −3 dB points: interpolate on log f where the curve crosses peak − 3 dB
  const cross = (i, j) => { const a = pts[i], b = pts[j], k = (cut - a.db) / (b.db - a.db); return a.f * Math.pow(b.f / a.f, k); };
  let lo = null, hi = null;
  const pi = pts.indexOf(peak);
  for (let i = pi; i > 0; i--) if (pts[i - 1].db < cut && pts[i].db >= cut) { lo = cross(i - 1, i); break; }
  for (let i = pi; i < pts.length - 1; i++) if (pts[i + 1].db < cut && pts[i].db >= cut) { hi = cross(i, i + 1); break; }
  const first = pts[0], last = pts[pts.length - 1];
  const kind = lo && hi ? 'band-pass' : hi ? 'low-pass' : lo ? 'high-pass' : abs(first.db - last.db) < 1 ? 'flat' : first.db > last.db ? 'low-pass (corner above the sweep)' : 'high-pass (corner below the sweep)';
  // slope of the last decade (dB / decade) tells the filter order: −20 = 1st order, −40 = 2nd…
  const tail = pts.filter(p => p.f >= last.f / 10), slope = tail.length > 2 ? (last.db - tail[0].db) / log10(last.f / tail[0].f) : null;
  return { peak, f3lo: lo, f3hi: hi, bw: lo && hi ? hi - lo : null, kind, slope };
}

// ================= tolerance test (Monte Carlo) =================
// Build the circuit `runs` times with every R / C / L / pot drawn at random inside its tolerance, and see how much each
// meter reading moves, and how many builds overheat or over-current a part.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TOL_KEYS = { R: ['r', 'tolR'], POT: ['r', 'tolR'], C: ['c', 'tolC'], L: ['l', 'tolL'], LDR: null };

// what a run reports: every meter, scope channel and LED current, plus "stress" checks
function readings(c, r, avg) {
  const out = [];
  for (const p of c.parts) {
    const x = (avg ?? r.parts).get(p.id); if (!x) continue;
    if (p.type === 'VM') out.push([p.name, 'V', x.v]);
    else if (p.type === 'AM') out.push([p.name, 'A', x.i]);
    else if (p.type === 'SCOPE') {
      out.push([p.name + ' CH1 avg', 'V', x.ch1]); if (x.pp1 != null) out.push([p.name + ' CH1 p-p', 'V', x.pp1]);
      out.push([p.name + ' CH2 avg', 'V', x.ch2]); if (x.pp2 != null) out.push([p.name + ' CH2 p-p', 'V', x.pp2]);
    }
    else if (p.type === 'LED') out.push([p.name + ' current', 'A', x.i]);
  }
  return out;
}
function stress(c, parts) {
  const bad = [];
  for (const p of c.parts) {
    const x = parts.get(p.id); if (!x) continue;
    if (p.type === 'R' && abs(x.p) > (p.props.rating ?? 0.25)) bad.push(`${p.name} over ${p.props.rating ?? 0.25} W`);
    if (p.type === 'LED' && abs(x.i) > (p.props.imax ?? 0.02) * 1.5) bad.push(`${p.name} over-current`);
    if (p.type === 'C' && abs(x.v ?? 0) > (p.props.vmax ?? 1e9)) bad.push(`${p.name} over ${p.props.vmax} V`);
    if ((p.type === 'NPN' || p.type === 'PNP') && abs(x.p) > (S.BJTS[p.props.model]?.pmax ?? 1e9)) bad.push(`${p.name} too hot`);
    if ((p.type === 'NMOS' || p.type === 'PMOS') && abs(x.p) > (S.FETS[p.props.model]?.pmax ?? 1e9)) bad.push(`${p.name} too hot`);
  }
  return bad;
}
// one build: DC operating point, or a time run averaged over its last 20 %
function runOnce(c, tEnd) {
  if (!S.isDynamic(c)) { const r = S.solveCircuit(c); return r.ok ? { parts: r.parts } : null; }
  const fs = S.fastestFreq(c);
  const dt = min(tEnd / 800, fs > 0 ? 1 / fs / 40 : tEnd / 800);
  let st; try { const r0 = S.solveCircuit(c, null, { sigOff: true }); st = r0.ok ? r0.next : new Map(); } catch { st = new Map(); }
  const acc = new Map(), worst = new Map(); let n = 0, r;
  for (let t = dt; t <= tEnd + 1e-12; t += dt) {
    r = S.solveCircuit(c, { t, dt, state: st }); if (!r.ok) return null; st = r.next;
    if (t >= tEnd * 0.8) {
      n++;
      for (const [id, x] of r.parts) {
        const a = acc.get(id) ?? acc.set(id, { v: 0, i: 0, p: 0, ch1: 0, ch2: 0 }).get(id);
        a.v += x.v ?? 0; a.i += x.i ?? 0; a.p += abs(x.p ?? 0); a.ch1 += x.ch1 ?? 0; a.ch2 += x.ch2 ?? 0;
        const w = worst.get(id) ?? worst.set(id, { v: 0, i: 0, p: 0, mn1: Infinity, mx1: -Infinity, mn2: Infinity, mx2: -Infinity }).get(id);
        if (abs(x.v ?? 0) > abs(w.v)) w.v = x.v; if (abs(x.i ?? 0) > abs(w.i)) w.i = x.i;
        if (x.ch1 != null) { w.mn1 = min(w.mn1, x.ch1); w.mx1 = max(w.mx1, x.ch1); w.mn2 = min(w.mn2, x.ch2); w.mx2 = max(w.mx2, x.ch2); }
      }
    }
  }
  for (const [id, a] of acc) { for (const k in a) a[k] /= max(n, 1); const w = worst.get(id); if (isFinite(w.mn1)) { a.pp1 = w.mx1 - w.mn1; a.pp2 = w.mx2 - w.mn2; } }
  const peak = new Map([...acc].map(([id, a]) => [id, { ...a, v: worst.get(id).v, i: worst.get(id).i }]));   // stress uses peaks, power uses average
  return { parts: acc, stress: peak };
}

// time to simulate each build: 5 periods of the slowest signal generator, at least 20 ms, at most 0.5 s
export function autoTolTime(c) {
  const fs = c.parts.filter(p => p.type === 'SIG').map(p => p.props.f).filter(f => f > 0);
  return fs.length ? max(0.02, min(0.5, 5 / min(...fs))) : 0.05;
}
export async function tolerance(c0, { runs = 100, tolR = 0.05, tolC = 0.2, tolL = 0.1, tEnd = 0.05, gauss = false, seed = 9 } = {}, onProgress = () => { }, ctl = {}) {
  const rand = rng(seed);
  const pick = () => { if (!gauss) return 2 * rand() - 1; let u = 0; for (let k = 0; k < 6; k++) u += rand(); return max(-1, min(1, (u - 3) / 1.5 * 1 / 1.73)); };   // ±1 = full tolerance (≈ 3σ)
  const varied = c0.parts.filter(p => TOL_KEYS[p.type]);
  const nom = runOnce(c0, tEnd);
  if (!nom) return { error: "The circuit can't be solved as it is. Fix it first (▶ Run shows the problem)." };
  const names = readings(c0, null, nom.parts);
  if (!names.length) return { error: 'Add a Voltmeter, Ammeter, Scope or LED: those are what the test measures.' };
  const data = names.map(() => []), devs = varied.map(() => []), burns = new Map();
  let failed = 0;
  for (let k = 0; k < runs; k++) {
    if (ctl.stop) break;
    const c = structuredClone(c0), dv = [];
    for (const [j, p0] of varied.entries()) {
      const [prop, tk] = TOL_KEYS[p0.type], q = c.parts.find(p => p.id === p0.id), tol = { tolR, tolC, tolL }[tk];
      const d = pick() * tol; q.props[prop] *= 1 + d; dv.push(d); devs[j].push(d);
    }
    const r = runOnce(c, tEnd);
    if (!r) { failed++; for (const d of data) d.push(NaN); continue; }
    readings(c, null, r.parts).forEach((x, i) => data[i].push(x[2]));
    for (const b of stress(c, r.stress ?? r.parts)) burns.set(b, (burns.get(b) ?? 0) + 1);
    if (k % 5 === 4) { onProgress(k + 1, runs); await tick(); }
  }
  onProgress(runs, runs);
  const nomStress = stress(c0, nom.stress ?? nom.parts);
  const rows = names.map(([name, unit, v0], i) => {
    const xs = data[i].filter(isFinite); if (!xs.length) return { name, unit, nominal: v0 };
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length, sd = sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    const lo = min(...xs), hi = max(...xs);
    // which part moves this reading most: correlation of its deviation with the reading
    let cause = null, best = 0;
    varied.forEach((p, j) => {
      const ds = devs[j].filter((_, k) => isFinite(data[i][k])), md = ds.reduce((a, b) => a + b, 0) / ds.length;
      let cxy = 0, cxx = 0, cyy = 0; ds.forEach((d, k) => { cxy += (d - md) * (xs[k] - mean); cxx += (d - md) ** 2; cyy += (xs[k] - mean) ** 2; });
      const rr = cxx && cyy ? cxy / sqrt(cxx * cyy) : 0;
      if (abs(rr) > abs(best)) { best = rr; cause = p.name; }
    });
    return { name, unit, nominal: v0, mean, sd, lo, hi, spread: abs(v0) > 1e-12 ? max(hi - v0, v0 - lo) / abs(v0) : null, cause: abs(best) > 0.3 && (hi - lo) > 1e-3 * max(abs(v0), 1e-9) ? cause : null, corr: best, xs };
  });
  return { rows, runs: data[0].length, failed, burns: [...burns].sort((a, b) => b[1] - a[1]), nomStress, varied: varied.length, dynamic: S.isDynamic(c0) };
}

// ================= heat over time =================
// Rjc = junction → case, Rja = junction → air with no heatsink, C = heat capacity of the package (J/°C), Tmax = max junction / body
export const PACKAGES = {
  'TO-92': { rjc: 83, rja: 200, cap: 0.25, tmax: 150, note: 'small transistor (2N2222, BC547)' },
  'SOT-23': { rjc: 90, rja: 250, cap: 0.03, tmax: 150, note: 'tiny SMD (AO3400) on small copper' },
  'SOT-223': { rjc: 15, rja: 90, cap: 0.2, tmax: 125, note: 'AMS1117 on its PCB tab' },
  'SO-8': { rjc: 40, rja: 120, cap: 0.08, tmax: 150, note: 'SMD chip on normal copper' },
  'DIP-8': { rjc: 45, rja: 100, cap: 0.4, tmax: 150, note: '555, op-amps' },
  'TO-220': { rjc: 1.5, rja: 62, cap: 2.2, tmax: 150, note: '7805, TIP120, IRLZ44N' },
  'TO-263': { rjc: 1.5, rja: 40, cap: 1.8, tmax: 150, note: 'D²PAK / LM2596 on 1 in² copper' },
  'TO-247': { rjc: 0.5, rja: 40, cap: 6, tmax: 150, note: 'big MOSFETs / IGBTs' },
  'DO-41': { rjc: 20, rja: 100, cap: 0.15, tmax: 150, note: '1N4007 / 1N5819, 10 mm leads' },
  'DO-201': { rjc: 10, rja: 50, cap: 0.6, tmax: 150, note: '1N5408 / 1N5822' },
  'DO-35': { rjc: 120, rja: 300, cap: 0.05, tmax: 150, note: '1N4148, small zeners' },
};
// heatsinks: Rcs = thermal pad / paste, Rsa = sink → air, C = sink heat capacity (aluminium ≈ 0.9 J/g°C)
export const HEATSINKS = {
  none: { label: 'No heatsink', rsa: null, cap: 0 },
  clip: { label: 'Small clip-on (≈ 20 °C/W)', rsa: 20, rcs: 0.5, cap: 4 },
  small: { label: 'Small finned 25 × 25 mm (≈ 12 °C/W)', rsa: 12, rcs: 0.5, cap: 9 },
  medium: { label: 'Medium 40 × 40 mm (≈ 6 °C/W)', rsa: 6, rcs: 0.5, cap: 30 },
  large: { label: 'Large 100 × 60 mm (≈ 2 °C/W)', rsa: 2, rcs: 0.5, cap: 140 },
  fan: { label: 'Large + fan (≈ 0.7 °C/W)', rsa: 0.7, rcs: 0.5, cap: 140 },
};
// best guess of the package from the part
export function packageOf(p) {
  const m = p.props?.model ?? '';
  switch (p.type) {
    case 'R': return 'resistor';
    case 'NPN': case 'PNP': return /^TIP/.test(m) ? 'TO-220' : 'TO-92';
    case 'NMOS': case 'PMOS': return /^AO/.test(m) ? 'SOT-23' : /^2N7000/.test(m) ? 'TO-92' : /4110/.test(m) ? 'TO-247' : 'TO-220';
    case 'REG': return /AMS1117/.test(m) ? 'SOT-223' : 'TO-220';
    case 'LM2596': return 'TO-263';
    case 'D': return /4148/.test(m) ? 'DO-35' : /5408|5822/.test(m) ? 'DO-201' : 'DO-41';
    case 'ZD': return 'DO-35';
    case 'OPAMP': case 'T555': case 'OPTO': return 'DIP-8';
    default: return 'TO-220';
  }
}
// resistor body: rated power at 70 °C ambient reaches 155 °C → Rth = 85 / rating
const resistorPkg = (rating) => ({ rjc: 0, rja: 85 / rating, cap: { 0.125: 0.08, 0.25: 0.15, 0.5: 0.3, 1: 0.6, 2: 1.2, 3: 2, 5: 4, 10: 9 }[rating] ?? rating * 0.6, tmax: 155, note: `${rating} W resistor body` });

// Two-step model: junction ↔ case fast (its own small mass), case / heatsink ↔ air slow. Returns curve + key numbers.
export function heat({ P, pkg, rating = 0.25, sink = 'none', rsa, ta = 32, tEnd }) {
  const k = pkg === 'resistor' ? resistorPkg(rating) : PACKAGES[pkg] ?? PACKAGES['TO-220'];
  const hs = HEATSINKS[sink] ?? HEATSINKS.none;
  const sinkRsa = rsa ?? hs.rsa;
  const withSink = sinkRsa != null && pkg !== 'resistor';
  const rCaseAir = withSink ? (hs.rcs ?? 0.5) + sinkRsa : max(k.rja - k.rjc, 0.1);
  const rTot = k.rjc + rCaseAir;
  const cj = max(k.cap * 0.15, 0.005), cc = k.cap * 0.85 + (withSink ? hs.cap : 0);
  const tauSlow = rCaseAir * cc;
  const T = tEnd ?? min(3600, max(60, 5 * tauSlow));
  const n = 400, dt = T / n / 20; let tj = ta, tc = ta;
  const pts = [[0, ta, ta]]; let tHit = null;
  for (let i = 1; i <= n; i++) {
    for (let s = 0; s < 20; s++) {
      // explicit steps small enough for the junction node (τj = Rjc·Cj can be ms)
      const q1 = k.rjc > 0 ? (tj - tc) / k.rjc : 0;
      if (k.rjc > 0) { const sub = max(1, Math.ceil(dt / (k.rjc * cj * 0.2))), h = dt / sub; for (let u = 0; u < sub; u++) { const qq = (tj - tc) / k.rjc; tj += h * (P - qq) / cj; } }
      const qin = k.rjc > 0 ? q1 : P, qout = (tc - ta) / rCaseAir;
      tc += dt * (qin - qout) / cc; if (k.rjc <= 0) tj = tc;
    }
    if (tHit == null && tj >= k.tmax) tHit = i * T / n;
    pts.push([i * T / n, tj, tc]);
  }
  const tjSteady = ta + P * rTot;
  // heatsink needed to stay at 80 % of the max (headroom for hot days / dust)
  const limit = ta + 0.8 * (k.tmax - ta);
  const needRsa = pkg === 'resistor' ? null : (limit - ta) / max(P, 1e-9) - k.rjc - 0.5;
  const verdict = tjSteady > k.tmax ? 'bad' : tjSteady > limit ? 'warn' : 'good';
  return { pts, T, tjSteady, tHit, tmax: k.tmax, rTot, tauSlow, needRsa, verdict, pkgInfo: k, withSink };
}

// ================= SPICE netlist import (LTspice, KiCad, ngspice…) =================
const SPICE_MULT = [['meg', 1e6], ['mil', 25.4e-6], ['t', 1e12], ['g', 1e9], ['k', 1e3], ['m', 1e-3], ['u', 1e-6], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15]];
export function spiceNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/^\{|\}$/g, '');
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zµ]*)/i.exec(t);
  if (!m) return null;
  let v = parseFloat(m[1]); const suf = m[2].toLowerCase();
  // 4k7 style (not SPICE, but people type it)
  const mid = /^(\d+)([kKrRM])(\d+)$/.exec(t);
  if (mid) return parseFloat(mid[1] + '.' + mid[3]) * { k: 1e3, K: 1e3, r: 1, R: 1, M: 1e6 }[mid[2]];
  for (const [p, mul] of SPICE_MULT) if (suf.startsWith(p)) { v *= mul; break; }
  return +v.toPrecision(12);
}
const isGnd = (n) => /^(0|gnd|gnd!|vss)$/i.test(n);
const fnArgs = (s) => { const m = /\(([^)]*)\)/.exec(s); return m ? m[1].trim().split(/[\s,]+/).map(spiceNum) : []; };

export function parseSpice(text) {
  const raw = String(text).replace(/\r/g, '').split('\n');
  const lines = [];
  for (const l of raw) { if (/^\s*\+/.test(l) && lines.length) lines[lines.length - 1] += ' ' + l.replace(/^\s*\+/, ''); else lines.push(l); }
  const models = {}, els = [], skipped = [];
  let title = null;
  lines.forEach((l0, idx) => {
    const l = l0.replace(/;.*$/, '').trim();
    if (!l) return;
    if (l.startsWith('*')) { if (idx === 0) title = l.slice(1).trim().split(/[\\/]/).pop().replace(/\.(asc|net|cir|sch)$/i, ''); return; }
    if (l.startsWith('.')) {
      const m = /^\.model\s+(\S+)\s+([a-z]+)/i.exec(l);
      if (m) models[m[1].toUpperCase()] = { type: m[2].toUpperCase(), pchan: /pchan/i.test(l), line: l };
      return;
    }
    const tk = l.split(/\s+/);
    const kind = tk[0][0].toUpperCase();
    if (idx === 0 && !/^[RCLVIDQMX]\S*\s+\S+\s+\S+/i.test(l)) { title = l; return; }   // SPICE: first line = title
    els.push({ kind, name: tk[0], tk, line: l });
  });
  return { title, models, els, skipped };
}

// build a Fox9nertron circuit: parts in a row, one horizontal bus wire per net underneath, ground bus at the bottom
export function importSpice(text) {
  const { title, models, els } = parseSpice(text);
  const c = S.newCircuit(); c.title = title || 'Imported netlist';
  const skipped = [], placed = [];
  const nameOk = (n) => String(n).replace(/[^A-Za-z0-9_+\-.]/g, '').slice(0, 12);
  for (const e of els) {
    const t = e.tk; let type = null, nets = null, props = {}, rot = 0;
    switch (e.kind) {
      case 'R': type = 'R'; nets = [t[1], t[2]]; props.r = spiceNum(t[3]) ?? 1000; { const v = /pwr\s*=\s*(\S+)/i.exec(e.line); props.rating = v ? spiceNum(v[1]) : 0.25; } break;
      case 'C': type = 'C'; nets = [t[1], t[2]]; props.c = spiceNum(t[3]) ?? 1e-6; props.polar = false; props.vmax = spiceNum((/v\s*=\s*(\S+)/i.exec(e.line) ?? [])[1]) ?? 50; break;
      case 'L': type = 'L'; nets = [t[1], t[2]]; props.l = spiceNum(t[3]) ?? 1e-3; props.r = spiceNum((/rser\s*=\s*(\S+)/i.exec(e.line) ?? [])[1]) ?? 0.1; break;
      case 'I': type = 'ISRC'; nets = [t[1], t[2]]; props.i = spiceNum(t[3] === 'DC' || t[3] === 'dc' ? t[4] : t[3]) ?? 0.001; break;
      case 'V': {
        nets = [t[1], t[2]];
        const rest = t.slice(3).join(' ');
        const sine = /\bsin(e)?\s*\(/i.test(rest), pulse = /\bpulse\s*\(/i.test(rest);
        if (sine) { const a = fnArgs(rest.slice(rest.search(/sin/i))); type = 'SIG'; props = { wave: 'sine', off: a[0] ?? 0, amp: a[1] ?? 1, f: a[2] || 1000, duty: 50 }; }
        else if (pulse) {
          const a = fnArgs(rest.slice(rest.search(/pulse/i))), v1 = a[0] ?? 0, v2 = a[1] ?? 5, per = a[6] || 1e-3, ton = a[5] ?? per / 2;
          type = 'SIG'; props = { wave: 'pwm', off: v1, amp: v2 - v1, f: 1 / per, duty: max(0, min(100, ton / per * 100)) };
        } else {
          const dc = /\bdc\s+(\S+)/i.exec(rest); let v = dc ? spiceNum(dc[1]) : spiceNum(t[3]);
          if (v == null) v = 0;
          type = 'BAT'; props = { v, rint: spiceNum((/rser\s*=\s*(\S+)/i.exec(rest) ?? [])[1]) ?? 0 };
        }
        break;
      }
      case 'D': {
        nets = [t[1], t[2]];
        const mn = (t[3] ?? '').toUpperCase(), md = models[mn];
        if (/LED|QTLP|NSPW|LXHL|W5AP/.test(mn) || /LED/i.test(md?.line ?? '')) { type = 'LED'; props.color = /BLUE|NSPB/.test(mn) ? 'blue' : /WHITE|NSPW/.test(mn) ? 'white' : /GREEN/.test(mn) ? 'green' : 'red'; }
        else if (/BZX|1N47|1N52|ZENER|ZD/.test(mn) || /bv\s*=/i.test(md?.line ?? '')) {
          type = 'ZD';
          const fromName = /(\d+)V(\d*)/.exec(mn), bv = /bv\s*=\s*(\S+)/i.exec(md?.line ?? '');
          props.vz = bv ? spiceNum(bv[1]) : fromName ? parseFloat(fromName[1] + '.' + (fromName[2] || '0')) : 5.1; props.pmax = 0.5;
        } else { type = 'D'; props.model = Object.keys(S.DIODES).find(k => mn.includes(k)) ?? (/5819|SS1|BAT|SCHOTT/.test(mn) ? '1N5819' : /5822|SS3/.test(mn) ? '1N5822' : /4148|914/.test(mn) ? '1N4148' : '1N4007'); }
        break;
      }
      case 'Q': {
        // Q c b e [sub] model → pins B, C, E
        const mn = (t.length >= 6 ? t[5] : t[4] ?? '').toUpperCase(), md = models[mn];
        const known = Object.keys(S.BJTS).find(k => mn.replace(/[^A-Z0-9]/g, '').includes(k));
        const pnp = known ? S.BJTS[known].pol === 'pnp' : md ? md.type === 'PNP' : /2907|557|558|8550|TIP12[5-7]|TIP3[02468]|PNP/.test(mn);
        type = pnp ? 'PNP' : 'NPN'; nets = [t[2], t[1], t[3]]; rot = 1;
        props.model = known && S.BJTS[known].pol === (pnp ? 'pnp' : 'npn') ? known : pnp ? '2N2907' : '2N2222';
        break;
      }
      case 'M': {
        // M d g s b model → pins G, D, S
        const mn = (t[5] ?? t[4] ?? '').toUpperCase(), md = models[mn];
        const known = Object.keys(S.FETS).find(k => mn.includes(k));
        const pch = known ? S.FETS[known].pol === 'p' : md ? md.type === 'PMOS' || md.pchan : /AO3401|9540|PMOS|SI2301|FQP27P/.test(mn);
        type = pch ? 'PMOS' : 'NMOS'; nets = [t[2], t[1], t[3]]; rot = 1;
        props.model = known && S.FETS[known].pol === (pch ? 'p' : 'n') ? known : pch ? 'AO3401' : 'IRLZ44N';
        break;
      }
      default: skipped.push(e.line); continue;
    }
    placed.push({ e, type, nets: nets.map(n => (isGnd(n) ? '0' : String(n))), props, rot });
  }
  if (!placed.length) return { error: 'No parts found. Paste a SPICE netlist (lines like "R1 N001 0 10k").', skipped };
  // place parts: one row, 8 grid units apart; every pin gets its own column so the drops never touch another pin
  const Y0 = 0;
  const pinsByNet = new Map();
  let cx = 0;
  placed.forEach((q) => {
    const p = S.addPart(c, q.type, cx, Y0, q.rot);
    cx += q.nets.length > 2 ? 12 : 8;      // transistors get room for their name label
    Object.assign(p.props, q.props);
    const want = nameOk(q.e.name); if (want && !c.parts.some(o => o !== p && o.name === want)) p.name = want;
    S.pinsOf(p).forEach(([x, y], k) => {
      const n = q.nets[k]; if (n == null) return;
      (pinsByNet.get(n) ?? pinsByNet.set(n, []).get(n)).push([x, y]);
    });
  });
  // buses: signal nets first (top), ground last so the GND symbol hangs below everything
  const order = [...pinsByNet.keys()].filter(n => pinsByNet.get(n).length > 1 || n === '0').sort((a, b) => (a === '0') - (b === '0'));
  const yMax = max(...c.parts.flatMap(p => S.pinsOf(p).map(([, y]) => y)));
  order.forEach((n, k) => {
    const pins = pinsByNet.get(n), by = yMax + 3 + 2 * k;
    const xs = pins.map(([x]) => x), x1 = min(...xs), x2 = max(...xs);
    if (x2 > x1) c.wires.push({ x1, y1: by, x2, y2: by });
    for (const [x, y] of pins) if (y !== by) c.wires.push({ x1: x, y1: y, x2: x, y2: by });
    if (n === '0') S.addPart(c, 'GND', x1, by);
  });
  c.wires = c.wires.filter(w => w.x1 !== w.x2 || w.y1 !== w.y2);
  const netNames = order.filter(n => n !== '0');
  return { circuit: c, parts: placed.length, nets: netNames.length, skipped, hasGround: pinsByNet.has('0') };
}
