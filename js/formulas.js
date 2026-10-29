// Pure electronics formulas (SI units in, SI units out). The tabs turn these into step-by-step text.
const { PI, sqrt, log, acos, cos, sin, abs, max, min, ceil, floor, round } = Math;
export const MU0 = 4e-7 * PI;
export const RHO_CU = 1.72e-8;     // copper resistivity at 20 °C, Ω·m

// ---------- Ohm's law: give any two of V, I, R, P ----------
export function ohm({ V, I, R, P }) {
  const k = [V, I, R, P].filter(x => x != null).length;
  if (k < 2) return null;
  if (V != null && I != null) return { V, I, R: V / I, P: V * I, from: 'VI' };
  if (V != null && R != null) return { V, R, I: V / R, P: V * V / R, from: 'VR' };
  if (V != null && P != null) return { V, P, I: P / V, R: V * V / P, from: 'VP' };
  if (I != null && R != null) return { I, R, V: I * R, P: I * I * R, from: 'IR' };
  if (I != null && P != null) return { I, P, V: P / I, R: P / (I * I), from: 'IP' };
  return { R, P, V: sqrt(P * R), I: sqrt(P / R), from: 'RP' };
}

// ---------- divider ----------
export const divOut = (Vin, R1, R2) => Vin * R2 / (R1 + R2);
export function divider({ Vin, R1, R2, Vout }) {
  if (Vin != null && R1 != null && R2 != null) return { Vin, R1, R2, Vout: divOut(Vin, R1, R2), solved: 'Vout' };
  if (Vout != null && R1 != null && R2 != null) return { Vout, R1, R2, Vin: Vout * (R1 + R2) / R2, solved: 'Vin' };
  if (Vin != null && Vout != null && R2 != null) return { Vin, Vout, R2, R1: R2 * (Vin - Vout) / Vout, solved: 'R1' };
  if (Vin != null && Vout != null && R1 != null) return { Vin, Vout, R1, R2: R1 * Vout / (Vin - Vout), solved: 'R2' };
  return null;
}

// ---------- power ratings ----------
export const RATINGS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 3, 5, 10, 25, 50];
export function ratingFor(P, margin = 2) { return RATINGS.find(r => r >= P * margin) ?? null; }

// ---------- rectifier + filter ----------
// type: 'bridge' | 'ct' (center-tap full wave) | 'half'
export function rectifier({ Vrms, f, type = 'bridge', Vf = 0.7, C, I, R, Rs = 0 }) {
  const Vpk = Vrms * sqrt(2);
  const drops = type === 'bridge' ? 2 : 1;
  const Vpo = max(Vpk - drops * Vf, 0);                       // peak on the capacitor
  const fr = type === 'half' ? f : 2 * f;                       // ripple frequency
  let Iload = I;
  if (Iload == null && R) {                                     // load resistor: solve Vdc = Vpo − Vr/2 with I = Vdc/R
    let Vdc = Vpo;
    for (let k = 0; k < 50; k++) { const i = Vdc / R; const vr = C ? i / (fr * C) : Vpo; Vdc = max(Vpo - vr / 2, 0); }
    Iload = Vdc / R;
  }
  Iload = Iload ?? 0;
  const Vr = C ? min(Iload / (fr * C), Vpo) : Vpo;             // peak-to-peak ripple
  const Vdc = C ? Vpo - Vr / 2 : Vpo * (type === 'half' ? 1 / PI : 2 / PI);
  const Vmin = Vpo - Vr;
  const Tr = 1 / fr;
  // diode conduction time per ripple cycle: from Vmin back up to the peak on the sine
  const tc = Vpo > 0 && C ? acos(max(-1, min(1, 1 - Vr / Vpo))) / (2 * PI * f) : Tr / 2;
  const IdAvg = type === 'bridge' || type === 'ct' ? Iload / 2 : Iload;
  const IdPk = tc > 0 ? 2 * Iload * Tr / tc : Iload;            // triangular pulse: average = Ipk·tc/(2Tr)
  const IcapRms = tc > 0 ? Iload * sqrt(max(Tr / tc * (4 / 3) - 1, 0)) : 0;
  const PIV = type === 'bridge' ? Vpk : 2 * Vpk;
  const Isurge = Rs > 0 ? Vpk / Rs : Infinity;
  return { Vpk, Vpo, fr, Iload, Vr, Vdc, Vmin, ripplePct: Vdc > 0 ? Vr / Vdc : 0, tc, Tr, IdAvg, IdPk, IcapRms, PIV, Isurge, drops };
}
export const capForRipple = (I, fr, Vr) => I / (fr * Vr);
export const CAP_VOLTS = [6.3, 10, 16, 25, 35, 50, 63, 80, 100, 160, 200, 250, 350, 400, 450, 500, 630];
export const capVoltRating = (Vpk, margin = 1.25) => CAP_VOLTS.find(v => v >= Vpk * margin) ?? null;

// waveform points for the graph: rectified sine and capacitor voltage over `cycles` mains cycles
export function rectWave({ Vpo, f, type, C, Iload, R }, cycles = 3, n = 600) {
  const T = cycles / f, dt = T / n, pts = [];
  let vc = 0;
  for (let k = 0; k <= n; k++) {
    const t = k * dt, s = sin(2 * PI * f * t);
    const rect = type === 'half' ? max(Vpo * s, 0) : Vpo * abs(s);
    if (C) {
      const i = R ? vc / R : Iload;
      vc = max(vc - i * dt / C, 0);
      if (rect > vc) vc = rect;
    } else vc = rect;
    pts.push([t, rect, vc]);
  }
  return pts;
}

// ---------- capacitor ----------
export const tau = (R, C) => R * C;
export const reactanceC = (f, C) => 1 / (2 * PI * f * C);
export const energyC = (C, V) => 0.5 * C * V * V;
export const chargeTime = (R, C, Vs, Vt) => -R * C * log(1 - Vt / Vs);           // 0 → Vt toward Vs
export const dischargeTime = (R, C, V0, Vt) => R * C * log(V0 / Vt);

// ---------- inductors ----------
export const reactanceL = (f, L) => 2 * PI * f * L;
export const energyL = (L, I) => 0.5 * L * I * I;
export const resonance = (L, C) => 1 / (2 * PI * sqrt(L * C));
export const awgDia = (n) => 0.127 * Math.pow(92, (36 - n) / 39) * 1e-3;            // metres
export const nearestAwg = (d) => { let best = 0; for (let n = 0; n <= 44; n++) if (abs(awgDia(n) - d) < abs(awgDia(best) - d)) best = n; return best; };
export const wireR = (len, d, rho = RHO_CU) => rho * len / (PI * d * d / 4);
export const skinDepth = (f, rho = RHO_CU, mur = 1) => sqrt(rho / (PI * f * MU0 * mur));
export const acFactor = (d, delta) => max(1, d / (4 * delta) + 0.25);                // Rac/Rdc, round wire, approx.

// Wheeler single layer: d = coil diameter to wire centres, l = coil length (metres) -> henry
export function airSingleL(d, l, n) {
  const dm = d * 1000, lm = l * 1000;
  return (dm * dm * n * n) / (457.2 * dm + 1016 * lm) * 1e-6;
}
// turns for a close-wound single layer of pitch p (wire diameter) to reach L
export function airSingleTurns(d, p, L) {
  const dm = d * 1000, pm = p * 1000, Lu = L * 1e6;
  const a = dm * dm, b = -1016 * pm * Lu, c = -457.2 * dm * Lu;
  return (-b + sqrt(b * b - 4 * a * c)) / (2 * a);
}
// Wheeler multi-layer: r = mean radius, l = length, b = winding depth (metres)
export function airMultiL(r, l, b, n) {
  const R = r * 1000, Lm = l * 1000, B = b * 1000;
  return 0.8 * R * R * n * n / (25.4 * (6 * R + 9 * Lm + 10 * B)) * 1e-6;
}
// AL in nH/turn²
export const alL = (AL, N) => AL * 1e-9 * N * N;
export const alTurns = (AL, L) => sqrt(L / (AL * 1e-9));
export const alFromTest = (L, N) => L / (N * N) * 1e9;
export const peakFlux = (L, Ipk, N, Ae) => L * Ipk / (N * Ae);                       // tesla

// toroid geometry from OD / ID / height (metres)
export const toroidAe = (od, id, h) => (od - id) / 2 * h;
export const toroidLe = (od, id) => PI * (od - id) / log(od / id);

// iron powder (Micrometals, AL nH/turn² = µH/100t ×100) and ferrite toroids, typical datasheet values
const IN = 0.0254;
export const CORES = [
  // name, material, AL nH/N², OD, ID, H (inches), Bmax suggestion (T)
  ['T-37-2', 'Iron powder −2 (red), 1–30 MHz', 4.0, .375, .205, .128],
  ['T-37-6', 'Iron powder −6 (yellow), 2–50 MHz', 3.0, .375, .205, .128],
  ['T-50-2', 'Iron powder −2 (red), 1–30 MHz', 4.9, .5, .303, .19],
  ['T-50-6', 'Iron powder −6 (yellow), 2–50 MHz', 4.0, .5, .303, .19],
  ['T-68-2', 'Iron powder −2 (red), 1–30 MHz', 5.7, .69, .37, .19],
  ['T-68-6', 'Iron powder −6 (yellow), 2–50 MHz', 4.7, .69, .37, .19],
  ['T-80-2', 'Iron powder −2 (red), 1–30 MHz', 5.5, .795, .495, .25],
  ['T-106-2', 'Iron powder −2 (red), 1–30 MHz', 13.5, 1.06, .57, .437],
  ['T-130-2', 'Iron powder −2 (red), 1–30 MHz', 11.0, 1.3, .78, .437],
  ['T-200-2', 'Iron powder −2 (red), 1–30 MHz', 12.0, 2.0, 1.25, .55],
  ['T-50-26', 'Iron powder −26 (yellow/white), DC chokes, SMPS', 33.0, .5, .303, .19],
  ['T-68-26', 'Iron powder −26 (yellow/white), DC chokes, SMPS', 43.0, .69, .37, .19],
  ['T-80-26', 'Iron powder −26 (yellow/white), DC chokes, SMPS', 46.0, .795, .495, .25],
  ['T-106-26', 'Iron powder −26 (yellow/white), DC chokes, SMPS', 93.0, 1.06, .57, .437],
  ['T-130-26', 'Iron powder −26 (yellow/white), DC chokes, SMPS', 81.0, 1.3, .78, .437],
  ['FT-37-43', 'Ferrite 43 (µ 800), EMI, broadband 1–50 MHz', 350, .375, .187, .125],
  ['FT-50-43', 'Ferrite 43 (µ 800), EMI, broadband 1–50 MHz', 523, .5, .281, .188],
  ['FT-82-43', 'Ferrite 43 (µ 800), EMI, broadband 1–50 MHz', 557, .825, .52, .25],
  ['FT-114-43', 'Ferrite 43 (µ 800), EMI, broadband 1–50 MHz', 603, 1.142, .75, .295],
  ['FT-37-61', 'Ferrite 61 (µ 125), 0.2–10 MHz tuned', 55.3, .375, .187, .125],
  ['FT-50-61', 'Ferrite 61 (µ 125), 0.2–10 MHz tuned', 68, .5, .281, .188],
  ['FT-82-61', 'Ferrite 61 (µ 125), 0.2–10 MHz tuned', 73.3, .825, .52, .25],
  ['FT-114-61', 'Ferrite 61 (µ 125), 0.2–10 MHz tuned', 79.3, 1.142, .75, .295],
  ['FT-37-77', 'Ferrite 77 (µ 2000), power < 1 MHz, SMPS', 884, .375, .187, .125],
  ['FT-50-77', 'Ferrite 77 (µ 2000), power < 1 MHz, SMPS', 1100, .5, .281, .188],
  ['FT-82-77', 'Ferrite 77 (µ 2000), power < 1 MHz, SMPS', 1170, .825, .52, .25],
  ['FT-114-77', 'Ferrite 77 (µ 2000), power < 1 MHz, SMPS', 1270, 1.142, .75, .295],
].map(([name, mat, AL, od, id, h]) => ({ name, mat, AL, od: od * IN, id: id * IN, h: h * IN, ferrite: name.startsWith('FT') }));

// laminated iron core transformer (50/60 Hz). A = core cross-section (m²), B = flux density (T)
export function ironTransformer({ A, f, B = 1.1, Vp, Vs, Is, eff = 0.9, J = 2.5e6, k = 1.0 }) {
  const Acm = A * 1e4;
  const Pcore = (Acm / k) ** 2;                         // empirical: A(cm²) ≈ k·√P  → P ≈ (A/k)²
  const tpv = 1 / (4.44 * f * B * A);                   // turns per volt
  const Np = Vp * tpv, Ns = Vs != null ? Vs * tpv * 1.05 : null;   // +5 % on the secondary for winding loss
  const Ps = Vs != null && Is != null ? Vs * Is : null;
  const Ip = Ps != null ? Ps / (eff * Vp) : null;
  const dia = (I) => (I == null ? null : sqrt(4 * I / (PI * J)));
  return { Acm, Pcore, tpv, Np, Ns, Ps, Ip, dp: dia(Ip), ds: dia(Is) };
}

// buck / boost inductor ripple
export function buck({ Vin, Vout, f, L, Iout }) {
  const D = Vout / Vin, dI = (Vin - Vout) * D / (f * L);
  return { D, dI, Ipk: Iout != null ? Iout + dI / 2 : null };
}
export const buckL = (Vin, Vout, f, dI) => (Vin - Vout) * (Vout / Vin) / (f * dI);
export function boost({ Vin, Vout, f, L, Iout }) {
  const D = 1 - Vin / Vout, dI = Vin * D / (f * L), Iin = Iout != null ? Iout / (1 - D) : null;
  return { D, dI, Iin, Ipk: Iin != null ? Iin + dI / 2 : null };
}
export const boostL = (Vin, Vout, f, dI) => Vin * (1 - Vin / Vout) / (f * dI);

// ---------- timers ----------
// f_out = f_clk / (psc · (top + 1)); find the best pair for a target frequency
export function timerSearch(fclk, target, bits, prescalers) {
  const maxTop = 2 ** bits - 1, out = [];
  for (const psc of prescalers) {
    const top = round(fclk / (psc * target)) - 1;
    if (top < 1 || top > maxTop) continue;
    const f = fclk / (psc * (top + 1));
    out.push({ psc, top, f, err: f / target - 1, steps: top + 1 });
  }
  out.sort((a, b) => abs(a.err) - abs(b.err) || b.steps - a.steps);
  return out;
}
export const AVR_PSC = [1, 8, 64, 256, 1024];
export const AVR_PSC_T2 = [1, 8, 32, 64, 128, 256, 1024];
export function stm32Search(fclk, target, bits = 16) {
  // PSC register 0..65535 (divider psc+1), ARR 0..2^bits−1: choose the smallest divider that fits for best resolution
  const maxTop = 2 ** bits - 1, total = fclk / target, out = [];
  const base = max(1, ceil(total / (maxTop + 1)));
  for (let div = base; div <= min(65536, base + 3); div++) {
    const top = round(total / div) - 1;
    if (top < 1 || top > maxTop) continue;
    const f = fclk / (div * (top + 1));
    out.push({ psc: div, top, f, err: f / target - 1, steps: top + 1 });
  }
  out.sort((a, b) => abs(a.err) - abs(b.err));
  return out;
}
// ESP32 LEDC: max duty resolution for a frequency (80 MHz APB clock)
export const ledcBits = (f, clk = 80e6) => min(20, floor(Math.log2(clk / f)));
// 555 astable
export const ne555 = (R1, R2, C) => {
  const th = 0.693 * (R1 + R2) * C, tl = 0.693 * R2 * C;
  return { th, tl, f: 1 / (th + tl), duty: th / (th + tl) };
};

// ---------- resistor colour code ----------
export const COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
export const MULT = { black: 1, brown: 10, red: 100, orange: 1e3, yellow: 1e4, green: 1e5, blue: 1e6, violet: 1e7, grey: 1e8, white: 1e9, gold: 0.1, silver: 0.01 };
export const TOL = { brown: '±1 %', red: '±2 %', green: '±0.5 %', blue: '±0.25 %', violet: '±0.1 %', grey: '±0.05 %', gold: '±5 %', silver: '±10 %' };
export const HEX = { black: '#1a1a1a', brown: '#7a4a1e', red: '#d32f2f', orange: '#f57c00', yellow: '#fbc02d', green: '#388e3c', blue: '#1976d2', violet: '#7b1fa2', grey: '#9e9e9e', white: '#f5f5f5', gold: '#c9a227', silver: '#b8bec6' };
export function bandsFor(R, digits = 2) {
  if (!(R > 0)) return null;
  let exp = floor(Math.log10(R)) - (digits - 1);
  let sig = round(R / 10 ** exp);
  if (sig >= 10 ** digits) { sig = round(sig / 10); exp++; }
  if (exp < -2 || exp > 9) return null;
  const ds = String(sig).padStart(digits, '0').split('').map(d => COLORS[+d]);
  const multName = exp === -1 ? 'gold' : exp === -2 ? 'silver' : COLORS[exp];
  return { bands: [...ds, multName], value: sig * 10 ** exp };
}
export function valueFromBands(digitColors, multColor) {
  const n = digitColors.reduce((s, c) => s * 10 + COLORS.indexOf(c), 0);
  return n * MULT[multColor];
}
// SMD resistor code: 103, 4R7, 1002, EIA-96 01C
const EIA96_MULT = { Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, H: 10, C: 100, D: 1e3, E: 1e4, F: 1e5 };
export function smdCode(code, E96list) {
  const c = code.trim().toUpperCase();
  if (/^\d*R\d*$/.test(c)) return parseFloat(c.replace('R', '.'));
  if (/^\d{3}$/.test(c)) return +c.slice(0, 2) * 10 ** +c[2];
  if (/^\d{4}$/.test(c)) return +c.slice(0, 3) * 10 ** +c[3];
  const m = /^(\d{2})([ZYRXSABHCDEF])$/.exec(c);
  if (m) { const i = +m[1]; if (i >= 1 && i <= 96) return E96list[i - 1] * 100 * EIA96_MULT[m[2]]; }
  return null;
}
