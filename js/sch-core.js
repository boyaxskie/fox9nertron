// Schematic core: part library, circuit model, netlist from pins + wires, DC solver (MNA) with LEDs / diodes.
// Coordinates are grid units, y points DOWN (like paper). Parts sit on grid points and rotate in 90° steps.

export const LED_COLORS = {
  red: { vf: 1.8, rs: 12, hex: '#FF3B30' }, orange: { vf: 2.0, rs: 12, hex: '#FF9500' }, yellow: { vf: 2.1, rs: 12, hex: '#FFD60A' },
  green: { vf: 2.2, rs: 14, hex: '#34C759' }, blue: { vf: 3.0, rs: 16, hex: '#0A84FF' }, white: { vf: 3.0, rs: 16, hex: '#F2F2F7' },
};
export const DIODES = {
  '1N4007': { vf: 0.7, rs: 0.05, imax: 1, piv: 1000, note: 'general 1 A rectifier' },
  '1N5408': { vf: 0.75, rs: 0.02, imax: 3, piv: 1000, note: '3 A rectifier' },
  '1N4148': { vf: 0.65, rs: 0.5, imax: 0.2, piv: 75, note: 'small signal' },
  '1N5819': { vf: 0.35, rs: 0.05, imax: 1, piv: 40, note: 'Schottky, low drop (flyback diode)' },
  '1N5822': { vf: 0.4, rs: 0.03, imax: 3, piv: 40, note: 'Schottky 3 A (LM2596 / buck catch diode, also SS34)' },
};

export const BJTS = {
  '2N2222': { pol: 'npn', beta: 150, vbe: 0.65, rb: 2, vsat: 0.2, rsat: 0.3, imax: 0.6, vmax: 40, pmax: 0.5, note: 'NPN 600 mA, small switch' },
  'BC547': { pol: 'npn', beta: 200, vbe: 0.65, rb: 5, vsat: 0.2, rsat: 1, imax: 0.1, vmax: 45, pmax: 0.5, note: 'NPN 100 mA, small signal' },
  'S8050': { pol: 'npn', beta: 200, vbe: 0.65, rb: 2, vsat: 0.25, rsat: 0.4, imax: 0.5, vmax: 25, pmax: 0.6, note: 'NPN 500 mA' },
  '2N5551': { pol: 'npn', beta: 80, vbe: 0.65, rb: 2, vsat: 0.2, rsat: 1, imax: 0.6, vmax: 160, pmax: 0.6, note: 'NPN 160 V small signal (level shifters, 48 V gear)' },
  'TIP120': { pol: 'npn', beta: 1000, vbe: 1.3, rb: 2, vsat: 0.9, rsat: 0.1, imax: 5, vmax: 60, pmax: 2, note: 'NPN Darlington 5 A' },
  'TIP31C': { pol: 'npn', beta: 50, vbe: 0.8, rb: 1, vsat: 0.3, rsat: 0.1, imax: 3, vmax: 100, pmax: 2, note: 'NPN power 3 A' },
  '2N2907': { pol: 'pnp', beta: 150, vbe: 0.65, rb: 2, vsat: 0.2, rsat: 0.3, imax: 0.6, vmax: 60, pmax: 0.5, note: 'PNP 600 mA' },
  'BC557': { pol: 'pnp', beta: 200, vbe: 0.65, rb: 5, vsat: 0.2, rsat: 1, imax: 0.1, vmax: 45, pmax: 0.5, note: 'PNP 100 mA' },
  'S8550': { pol: 'pnp', beta: 200, vbe: 0.65, rb: 2, vsat: 0.25, rsat: 0.4, imax: 0.5, vmax: 25, pmax: 0.6, note: 'PNP 500 mA' },
  'TIP125': { pol: 'pnp', beta: 1000, vbe: 1.3, rb: 2, vsat: 0.9, rsat: 0.1, imax: 5, vmax: 60, pmax: 2, note: 'PNP Darlington 5 A' },
  'TIP32C': { pol: 'pnp', beta: 50, vbe: 0.8, rb: 1, vsat: 0.3, rsat: 0.1, imax: 3, vmax: 100, pmax: 2, note: 'PNP power 3 A' },
};
// rdson is at gate voltage vfull; logic = fully on from a 3.3–5 V pin
export const FETS = {
  'IRLZ44N': { pol: 'n', vth: 1.5, rdson: 0.025, vfull: 5, imax: 47, vmax: 55, pmax: 2, logic: true, note: 'N, logic level, 47 A' },
  'AO3400': { pol: 'n', vth: 1.05, rdson: 0.033, vfull: 4.5, imax: 5.7, vmax: 30, pmax: 1.4, logic: true, note: 'N, SOT-23, 3.3 V gate OK, 5.7 A' },
  'IRF540N': { pol: 'n', vth: 3, rdson: 0.044, vfull: 10, imax: 33, vmax: 100, pmax: 2, logic: false, note: 'N, needs 10 V gate, 33 A' },
  'IRFZ44N': { pol: 'n', vth: 3, rdson: 0.0175, vfull: 10, imax: 49, vmax: 55, pmax: 2, logic: false, note: 'N, needs 10 V gate, 49 A' },
  '2N7000': { pol: 'n', vth: 2.1, rdson: 1.8, vfull: 10, imax: 0.2, vmax: 60, pmax: 0.4, logic: false, note: 'N, small 200 mA' },
  'AO3401': { pol: 'p', vth: 0.9, rdson: 0.05, vfull: 4.5, imax: 4, vmax: 30, pmax: 1.4, logic: true, note: 'P, SOT-23, 4 A' },
  'IRFB4110': { pol: 'n', vth: 3, rdson: 0.0037, vfull: 10, imax: 120, vmax: 100, pmax: 3, logic: false, note: 'N, 100 V, 3.7 mΩ: 30 A+ bucks, inverters (heatsink)' },
  'IRFBC40': { pol: 'n', vth: 3, rdson: 1.2, vfull: 10, imax: 6.2, vmax: 600, pmax: 2, logic: false, note: 'N, 600 V, 6 A: off-line SMPS / flyback (220 V)' },
  'IRF840': { pol: 'n', vth: 3, rdson: 0.85, vfull: 10, imax: 8, vmax: 500, pmax: 2, logic: false, note: 'N, 500 V, 8 A: SMPS, inverters' },
  'IRF9540N': { pol: 'p', vth: 3, rdson: 0.117, vfull: 10, imax: 23, vmax: 100, pmax: 2, logic: false, note: 'P, needs 10 V gate, 23 A' },
};
// dh / dl = how close the output gets to the top / bottom supply
export const AMPS = {
  'LM358': { dh: 1.5, dl: 0.02, a: 1e5, iq: 0.0007, vmax: 32, iout: 0.03, note: 'single supply 3–32 V, output reaches 0 V but not the top' },
  'LM741': { dh: 2, dl: 2, a: 2e5, iq: 0.0017, vmax: 36, iout: 0.025, note: 'old, needs ± supply, 2 V from both rails' },
  'TL072': { dh: 1.5, dl: 1.5, a: 2e5, iq: 0.0014, vmax: 36, iout: 0.03, note: 'audio, JFET input' },
  'MCP6002': { dh: 0.025, dl: 0.025, a: 1e5, iq: 0.0001, vmax: 6, iout: 0.02, note: 'rail-to-rail, 1.8–6 V (3.3 V MCU)' },
};
export const REGS = {
  '7805': { vout: 5, drop: 2, ilim: 1.5, iq: 0.005, vinmax: 35, note: '5 V, 1.5 A, input 7–35 V' },
  '7809': { vout: 9, drop: 2, ilim: 1.5, iq: 0.005, vinmax: 35, note: '9 V, 1.5 A' },
  '7812': { vout: 12, drop: 2, ilim: 1.5, iq: 0.005, vinmax: 35, note: '12 V, 1.5 A, input 14–35 V' },
  'AMS1117-3.3': { vout: 3.3, drop: 1.1, ilim: 1, iq: 0.005, vinmax: 15, note: '3.3 V, 1 A low-drop (ESP32)' },
  'AMS1117-5.0': { vout: 5, drop: 1.1, ilim: 1, iq: 0.005, vinmax: 15, note: '5 V, 1 A low-drop' },
  'LM317': { vout: 1.25, drop: 2, ilim: 1.5, iq: 0, iadj: 50e-6, vinmax: 40, adj: true, note: 'adjustable: Vout = 1.25 × (1 + R2 ÷ R1)' },
};
// 555 timer: dh = how far the output HIGH sits below Vcc, iq = supply current
export const TIMERS = {
  NE555: { dh: 1.7, vmin: 4.5, vmax: 16, iq: 0.006, iout: 0.2, note: 'bipolar, 4.5–16 V, output 200 mA, HIGH ≈ Vcc − 1.7 V' },
  TLC555: { dh: 0.1, vmin: 2, vmax: 15, iq: 0.0002, iout: 0.1, note: 'CMOS, 2–15 V, rail-to-rail, low power (also 7555, LMC555)' },
};
// TL494 PWM controller (TI SLVS074): ramp 0 → 3 V on CT, charged by 3 V ÷ RT → f = 1 ÷ (RT × CT).
// dead-time comparator offset 0.11 V, PWM comparator offset 0.7 V, 5 V reference, 7–40 V supply, outputs 200 mA (Vce sat ≈ 1.1 V)
export const TL494 = { peak: 3, dtcOff: 0.11, pwmOff: 0.7, vmin: 7, vmax: 40, iout: 0.2, iref: 0.01, vsat: 1.1, rsat: 1, ea: { a: 56000, dh: 1.5, gbw: 800e3 } };
const TL_F = new Map();
// TL494 oscillator frequency measured by the solver (0 until it has run): the schematic averages its meters over a few cycles
export const tlFreq = (id) => TL_F.get(id) ?? 0;
// LM2596 3 A buck regulator (TI SNVS124): 150 kHz, feedback 1.23 V (ADJ) or fixed 3.3 / 5 / 12 V, input 4.5–40 V,
// switch drop ≈ 1.16 V at 3 A, current limit ≈ 4.5 A (cycle by cycle), ON/OFF pin HIGH (> 1.3 V) = off
export const LM2596 = { f: 150e3, vref: 1.23, vmin: 4.5, vmax: 40, ilim: 4.5, iout: 3, vsat: 0.6, rsat: 0.18, von: 1.3, fc: 100,
  models: { 'LM2596S-ADJ': 0, 'LM2596S-3.3': 3.3, 'LM2596S-5.0': 5, 'LM2596S-12': 12 } };          // TL494 id → oscillator frequency seen in the last run (sets the time step)
// IR2104 half-bridge driver: IN HIGH → HO on (high-side gate = VB), IN LOW → LO on; ≈ 0.5 µs dead time (one step here) between them.
// SD LOW = both off. VCC under 8.6 V or bootstrap (VB − VS) under 8 V → outputs off (UVLO). Peak drive ≈ 0.2 A (≈ 10 Ω here).
export const IR2104 = { uv: 8.6, uvb: 8, vih: 2.5, ron: 10, iq: 0.0016, vmax: 20 };
// motors
export const SERVOS = {
  SG90: { vmin: 4.0, vmax: 6.0, idle: 0.01, run: 0.25, stall: 0.65, speed: 600, note: 'micro servo 9 g, 1.8 kg·cm' },          // speed in °/s (0.1 s / 60°)
  MG996R: { vmin: 4.8, vmax: 7.2, idle: 0.01, run: 0.5, stall: 2.5, speed: 350, note: 'metal gear, 10 kg·cm, needs its own 5–6 V supply' },
};
export const RELAYS = { 5: { rcoil: 70, l: 0.02 }, 12: { rcoil: 400, l: 0.12 }, 24: { rcoil: 1600, l: 0.5 } };
export const ZENERS = [2.7, 3.3, 3.9, 4.7, 5.1, 5.6, 6.2, 6.8, 8.2, 9.1, 10, 12, 15, 18, 24];

// ---------- custom parts (typed in from a datasheet) ----------
// kind → which part types use it, and the fields the form asks for: [key, label, unit, default, hint, optional]
export const CUSTOM_KINDS = {
  BJT: { types: ['NPN', 'PNP'], title: 'Transistor', fields: [
    ['beta', 'Gain hFE (β)', '', 100, 'hFE / DC current gain, typical'], ['vbe', 'Vbe (on)', 'V', 0.7, 'base-emitter on voltage'], ['vsat', 'Vce(sat)', 'V', 0.3, 'collector-emitter saturation voltage'],
    ['imax', 'Max collector current Ic', 'A', 1, ''], ['vmax', 'Max Vce (Vceo)', 'V', 40, ''], ['pmax', 'Max power (no heatsink)', 'W', 0.6, 'Ptot / Pd at 25 °C ambient']] },
  FET: { types: ['NMOS', 'PMOS'], title: 'MOSFET', fields: [
    ['vth', 'Gate threshold Vgs(th)', 'V', 2, 'starts to turn on (use the typical value)'], ['rdson', 'Rds(on)', 'Ω', 0.05, 'on-resistance'], ['vfull', '…measured at gate voltage', 'V', 10, 'the Vgs written next to Rds(on)'],
    ['imax', 'Max drain current Id', 'A', 10, ''], ['vmax', 'Max Vds', 'V', 60, 'V(BR)DSS'], ['pmax', 'Max power (no heatsink)', 'W', 1, '≈ 2 W for TO-220, 1 W for SOT-23']] },
  DIODE: { types: ['D'], title: 'Diode', fields: [['vf', 'Forward voltage Vf', 'V', 0.7, ''], ['imax', 'Max forward current', 'A', 1, 'IF(AV)'], ['piv', 'Max reverse voltage', 'V', 100, 'VRRM']] },
  ZENER: { types: ['ZD'], title: 'Zener', fields: [['vz', 'Zener voltage Vz', 'V', 5.1, ''], ['pmax', 'Power rating', 'W', 0.5, 'Ptot']] },
  LED: { types: ['LED'], title: 'LED', fields: [['vf', 'Forward voltage Vf', 'V', 2, 'typical'], ['imax', 'Max current', 'A', 0.02, 'IF'], ['glow', 'Glow color', '', 'red', '']] },
  AMP: { types: ['OPAMP'], title: 'Op-amp', fields: [
    ['dh', 'Output stops below top supply by', 'V', 1.5, 'from "output swing" (0.02 for rail-to-rail)'], ['dl', 'Output stops above bottom supply by', 'V', 1.5, ''],
    ['vmax', 'Max supply (top to bottom)', 'V', 36, ''], ['iout', 'Max output current', 'A', 0.03, 'short-circuit current'],
    ['a', 'Open-loop gain', '', 100000, '100 dB = 100 000', true], ['iq', 'Supply current', 'A', 0.002, '', true]] },
  REG: { types: ['REG'], title: 'Regulator', fields: [
    ['adj', 'Adjustable (has ADJ pin)?', '', 0, ''], ['vout', 'Output voltage (adjustable: reference)', 'V', 5, 'adjustable: 1.25 V between OUT and ADJ'], ['drop', 'Dropout voltage', 'V', 2, ''],
    ['ilim', 'Current limit', 'A', 1.5, ''], ['vinmax', 'Max input (adjustable: max in − out)', 'V', 35, ''],
    ['iq', 'Quiescent current (fixed) / ADJ pin current', 'A', 0.005, 'ADJ pin: ≈ 0.00005', true]] },
  RELAY: { types: ['RELAY'], title: 'Relay', fields: [['vcoil', 'Coil voltage', 'V', 12, ''], ['rcoil', 'Coil resistance', 'Ω', 400, ''], ['l', 'Coil inductance', 'H', 0.1, 'rarely given: 0.02–0.5', true]] },
};
export const ZENER_PARTS = {};
export const kindOfType = (t) => Object.keys(CUSTOM_KINDS).find(k => CUSTOM_KINDS[k].types.includes(t));
const libOf = (kind) => ({ BJT: BJTS, FET: FETS, DIODE: DIODES, ZENER: ZENER_PARTS, LED: LED_COLORS, AMP: AMPS, REG: REGS, RELAY: RELAYS })[kind];
// turn the typed-in values into the model the solver uses
export function registerCustom(kind, name, d, pol) {
  const n = (k, def) => (Number.isFinite(+d[k]) && d[k] !== '' ? +d[k] : def);
  let m;
  switch (kind) {
    case 'BJT': m = { pol: d.pol ?? pol, beta: n('beta', 100), vbe: n('vbe', 0.7), rb: 2, vsat: n('vsat', 0.3), rsat: 0.2, imax: n('imax', 1), vmax: n('vmax', 40), pmax: n('pmax', 0.6) }; break;
    case 'FET': m = { pol: d.pol ?? pol, vth: n('vth', 2), rdson: n('rdson', 0.05), vfull: Math.max(n('vfull', 10), n('vth', 2) + 0.5), imax: n('imax', 10), vmax: n('vmax', 60), pmax: n('pmax', 1) }; m.logic = m.vfull <= 5; break;
    case 'DIODE': m = { vf: n('vf', 0.7), rs: 0.05, imax: n('imax', 1), piv: n('piv', 100) }; break;
    case 'ZENER': m = { vz: n('vz', 5.1), pmax: n('pmax', 0.5) }; break;
    case 'LED': m = { vf: n('vf', 2), rs: 12, imax: n('imax', 0.02), hex: (LED_COLORS[d.glow] ?? LED_COLORS.red).hex, glow: d.glow ?? 'red' }; break;
    case 'AMP': m = { dh: n('dh', 1.5), dl: n('dl', 1.5), a: n('a', 1e5), iq: n('iq', 0.002), vmax: n('vmax', 36), iout: n('iout', 0.03) }; break;
    case 'REG': { const adj = !!+d.adj; m = { vout: n('vout', adj ? 1.25 : 5), drop: n('drop', 2), ilim: n('ilim', 1.5), vinmax: n('vinmax', 35), adj }; if (adj) { m.iq = 0; m.iadj = n('iq', 50e-6); } else m.iq = n('iq', 0.005); break; }
    case 'RELAY': m = { vcoil: n('vcoil', 12), rcoil: Math.max(1, n('rcoil', 400)), l: n('l', 0.1) }; break;
  }
  m.custom = true; m.raw = { ...d }; m.note = '★ your part';
  libOf(kind)[name] = m;
  return m;
}
export function unregisterCustom(kind, name) { const L = libOf(kind); if (L[name]?.custom) delete L[name]; }
export const zenerOf = (pr) => ZENER_PARTS[pr.model] ?? pr;          // {vz, pmax}
export const relayOf = (pr) => (RELAYS[pr.relay]?.custom ? RELAYS[pr.relay] : pr);   // {vcoil, rcoil, l}
export const isBuiltIn = (kind, name) => !!libOf(kind)[name] && !libOf(kind)[name].custom;
export const getCustom = (kind, name) => (libOf(kind)[name]?.custom ? libOf(kind)[name] : null);
// which part on the circuit uses which custom model (saved with the project so it opens on another phone)
export function partModelKey(p) { return p.type === 'LED' ? p.props.color : p.type === 'RELAY' ? p.props.relay : p.props.model; }
export function usedCustom(c) {
  const lib = {};
  for (const p of c.parts) {
    const kind = kindOfType(p.type), nm = kind && partModelKey(p), m = nm && getCustom(kind, nm);
    if (m) (lib[kind] ??= {})[nm] = { ...m.raw, pol: m.pol };
  }
  return lib;
}

// ---------- microcontroller boards (pins set by hand: no program runs) ----------
// k: gpio | gnd | pwr (v = volts, r = source resistance) | en (reset, pulled up) | nc
const ESP_L = [['EN', 'en'], ['VP', 36], ['VN', 39], ['D34', 34], ['D35', 35], ['D32', 32], ['D33', 33], ['D25', 25], ['D26', 26], ['D27', 27], ['D14', 14], ['D12', 12], ['D13', 13], ['GND', 'gnd'], ['VIN', 'vin']];
const ESP_R = [['D23', 23], ['D22', 22], ['TX0', 1], ['RX0', 3], ['D21', 21], ['D19', 19], ['D18', 18], ['D5', 5], ['TX2', 17], ['RX2', 16], ['D4', 4], ['D2', 2], ['D15', 15], ['GND2', 'gnd'], ['3V3', '3v3']];
const espPin = ([n, g]) => {
  if (g === 'gnd') return { n, k: 'gnd' };
  if (g === 'en') return { n, k: 'en' };
  if (g === 'vin') return { n, k: 'pwr', v: 4.7, r: 0.5, imax: 0.5, note: 'USB 5 V through a diode' };
  if (g === '3v3') return { n, k: 'pwr', v: 3.3, r: 0.3, imax: 0.5, note: 'AMS1117 regulator (ESP32 itself uses ≈ 80–250 mA)' };
  const inOnly = g >= 34;
  return { n, k: 'gpio', g, label: `GPIO${g}`, inOnly, pwm: !inOnly, adc: g >= 32 ? 'ADC1' : [0, 2, 4, 12, 13, 14, 15, 25, 26, 27].includes(g) ? 'ADC2' : null,
    strap: [0, 2, 5, 12, 15].includes(g), serial: g === 1 || g === 3, pull: !inOnly };
};
const UNO_L = ['5V', '3V3', 'VIN', 'GND', 'GND2', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const unoPin = (n) => {
  if (n === '5V') return { n, k: 'pwr', v: 5, r: 0.3, imax: 0.5, note: 'from USB (≈ 500 mA max)' };
  if (n === '3V3') return { n, k: 'pwr', v: 3.3, r: 1, imax: 0.05, note: '3.3 V regulator, 50 mA max' };
  if (n === 'VIN') return { n, k: 'nc', note: 'input 7–12 V (not used on USB power)' };
  if (n.startsWith('GND')) return { n, k: 'gnd' };
  const d = n.startsWith('D') ? +n.slice(1) : null;
  return { n, k: 'gpio', label: n, pwm: d != null && [3, 5, 6, 9, 10, 11].includes(d), adc: n.startsWith('A') ? 'ADC' : null, serial: d === 0 || d === 1, pull: true, i2c: n === 'A4' ? 'SDA' : n === 'A5' ? 'SCL' : null };
};
export const BOARDS = {
  ESP32: { name: 'ESP32 DevKit', vcc: 3.3, rout: 30, pullR: 45000, adcBits: 12, adcRef: 3.3, vih: 2.48, vil: 0.83, imax: 40, irec: 20,
    pins: [...ESP_L.map(espPin), ...ESP_R.map(espPin)] },
  UNO: { name: 'Arduino UNO', vcc: 5, rout: 25, pullR: 35000, adcBits: 10, adcRef: 5, vih: 3.0, vil: 1.5, imax: 40, irec: 20,
    pins: [...UNO_L.map(unoPin), ...Array.from({ length: 14 }, (_, i) => unoPin('D' + i))] },
};
const boardPins = (b, nl) => b.pins.map((q, i) => (i < nl ? [-4, i - Math.floor((nl - 1) / 2)] : [4, i - nl - (b.pins.length - nl === 14 ? 7 : 7)]));
export const isBoard = (t) => t === 'ESP32' || t === 'UNO';
export const PIN_MODES = { in: 'INPUT (high impedance)', pu: 'INPUT_PULLUP', pd: 'INPUT_PULLDOWN', adc: 'analogRead (ADC)', high: 'OUTPUT HIGH', low: 'OUTPUT LOW', pwm: 'PWM (analogWrite / ledc)', dac: 'DAC output (dacWrite, set by code)' };
export function pinModesFor(board, q) {
  if (q.k !== 'gpio') return [];
  const m = ['in', 'pu'];
  if (board === 'ESP32' && !q.inOnly) m.push('pd');
  if (q.inOnly) return board === 'ESP32' ? ['in', ...(q.adc ? ['adc'] : [])] : m;
  if (q.adc) m.push('adc');
  m.push('high', 'low');
  m.push('pwm');      // UNO: real PWM only on ~ pins; other pins = pulses made by code / Servo library
  return m;
}

// pins: local coords; first pin is "a" (+ / anode / start), second "b"
export const TYPES = {
  R: { label: 'Resistor', prefix: 'R', pins: [[-2, 0], [2, 0]], box: [-2, -0.7, 2, 0.7], props: { r: 1000, rating: 0.25 } },
  POT: { label: 'Potentiometer', prefix: 'RV', pins: [[-2, 0], [2, 0], [0, -2]], box: [-2, -2, 2, 0.8], props: { r: 10000, pos: 50 } },
  BAT: { label: 'Battery / DC supply', prefix: 'B', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { v: 9, rint: 0 } },
  ISRC: { label: 'Current source', prefix: 'I', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { i: 0.01 } },
  SW: { label: 'Switch', prefix: 'S', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 0.6], props: { on: false } },
  SPDT: { label: 'SPDT switch (1 pole, 2 ways)', prefix: 'S', pins: [[-2, 0], [2, -1], [2, 1]], box: [-2, -1.6, 2, 1.6], props: { on: false } },
  DPDT: { label: 'DPDT switch (2 poles, 2 ways)', prefix: 'S', pins: [[-2, -2], [2, -3], [2, -1], [-2, 2], [2, 1], [2, 3]], box: [-2, -3.6, 2, 3.6], props: { on: false } },
  PB: { label: 'Push button', prefix: 'PB', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 0.6], props: { on: false } },
  LED: { label: 'LED', prefix: 'LED', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 0.8], props: { color: 'red', imax: 0.02 } },
  D: { label: 'Diode', prefix: 'D', pins: [[-2, 0], [2, 0]], box: [-2, -0.8, 2, 0.8], props: { model: '1N4007' } },
  LAMP: { label: 'Lamp / bulb', prefix: 'LP', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { vr: 12, wr: 5 } },
  C: { label: 'Capacitor', prefix: 'C', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { c: 100e-6, vmax: 25, polar: true } },
  L: { label: 'Inductor / coil', prefix: 'L', pins: [[-2, 0], [2, 0]], box: [-2, -0.8, 2, 0.6], props: { l: 0.01, r: 1 } },
  SIG: { label: 'Signal generator', prefix: 'G', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: { wave: 'sine', f: 50, amp: 5, off: 0, duty: 50 } },
  SCOPE: { label: 'Oscilloscope probes', prefix: 'SC', pins: [[-3, -1], [-3, 1], [0, 2]], box: [-3, -1.8, 2.2, 2], props: {} },
  OPTO: { label: 'Optocoupler PC817', prefix: 'U', pins: [[-2, -1], [-2, 1], [2, -1], [2, 1]], box: [-2, -1.9, 2, 1.9], props: { ctr: 100 } },
  ZD: { label: 'Zener diode', prefix: 'ZD', pins: [[-2, 0], [2, 0]], box: [-2, -0.8, 2, 0.8], props: { vz: 5.1, pmax: 0.5 } },
  NPN: { label: 'NPN transistor', prefix: 'Q', pins: [[-2, 0], [1, -2], [1, 2]], box: [-2, -2, 1.6, 2], props: { model: '2N2222' } },
  PNP: { label: 'PNP transistor', prefix: 'Q', pins: [[-2, 0], [1, 2], [1, -2]], box: [-2, -2, 1.6, 2], props: { model: '2N2907' } },
  NMOS: { label: 'N-channel MOSFET', prefix: 'Q', pins: [[-2, 0], [1, -2], [1, 2]], box: [-2, -2, 1.8, 2], props: { model: 'IRLZ44N' } },
  PMOS: { label: 'P-channel MOSFET', prefix: 'Q', pins: [[-2, 0], [1, 2], [1, -2]], box: [-2, -2, 1.8, 2], props: { model: 'AO3401' } },
  OPAMP: { label: 'Op-amp', prefix: 'U', pins: [[-3, 1], [-3, -1], [3, 0], [0, -2], [0, 2]], box: [-3, -2, 3, 2], props: { model: 'LM358' } },
  REG: { label: 'Voltage regulator', prefix: 'U', pins: [[-3, 0], [3, 0], [0, 2]], box: [-3, -1.2, 3, 2], props: { model: '7805' } },
  ESP32: { label: 'ESP32 DevKit (30 pin)', prefix: 'MCU', pins: boardPins(BOARDS.ESP32, 15), box: [-4, -8.6, 4, 8.6], props: { pins: {} } },
  UNO: { label: 'Arduino UNO', prefix: 'MCU', pins: boardPins(BOARDS.UNO, 11), box: [-4, -8.6, 4, 8.6], props: { pins: {} } },
  SERVO: { label: 'Servo motor', prefix: 'M', pins: [[-3, -1], [-3, 0], [-3, 1]], box: [-3, -2.2, 3.2, 2.2], props: { model: 'SG90' } },
  // 28BYJ-48 5 V geared stepper on its ULN2003 board: IN1–IN4, + (5–12 V), − (GND)
  BYJ: { label: '28BYJ-48 stepper + ULN2003 board', prefix: 'M', pins: [[-4, -2], [-4, -1], [-4, 0], [-4, 1], [-4, 2], [-4, 3]], box: [-4, -3, 5, 3.8], props: {} },
  // ACS712 Hall current sensor module: header VCC, OUT, GND (left), current terminals IP+ / IP− (right)
  ACS712: { label: 'ACS712 current sensor (5 / 20 / 30 A)', prefix: 'U', pins: [[-3, -1], [-3, 0], [-3, 1], [3, -1], [3, 1]], box: [-3, -2, 3, 2], props: { model: '30A' } },
  // INA219 I2C current + voltage monitor: header VCC, GND, SCL, SDA, VIN+, VIN− (0.1 Ω shunt between VIN+ and VIN−)
  INA219: { label: 'INA219 current + voltage (I2C, ≤ 26 V)', prefix: 'U', pins: [[-4, 1], [-4, 2], [-4, -2], [-4, -1], [4, -1], [4, 1]], box: [-4, -2.7, 4, 2.7], props: { addr: 0x40 } },
  // DS3231 real-time clock (ZS-042 module): header 32K, SQW, SCL, SDA, VCC, GND
  DS3231: { label: 'DS3231 real-time clock (I2C)', prefix: 'U', pins: [[-4, -2], [-4, -1], [-4, 0], [-4, 1], [-4, 2], [-4, 3]], box: [-4, -3, 4, 3.6], props: { start: '', speed: 1 } },
  // solar panel: + / − (like a battery), sunlight 0–120 %
  PV: { label: 'Solar panel (PV)', prefix: 'PV', pins: [[-3, 0], [3, 0]], box: [-3, -2.2, 3, 1.2], props: { model: '100W', sun: 100 } },
  // solar charge controller, common negative: PV+, GND (left) · BAT+, LOAD+ (right)
  SCC: { label: 'Solar charge controller (PWM / MPPT)', prefix: 'U', pins: [[-4, -1], [-4, 1], [4, -1], [4, 1]], box: [-4, -2.4, 4, 2.4], props: { mode: 'mppt', bat: 'lfp12', imax: 20 } },
  STEPPER: { label: 'Stepper motor + driver (A4988 / DRV8825 / TMC2209)', prefix: 'M', pins: [[-4, -2], [-4, -1], [-4, 0], [-4, 1], [-4, 2], [-4, 3]], box: [-4, -3.4, 5.6, 3.8], props: { micro: 1, ilim: 1.0, steps: 200 } },
  T555: { label: '555 timer', prefix: 'U', pins: [[0, 4], [-4, 2], [4, 0], [1, -4], [2, 4], [-4, 0], [-4, -2], [-1, -4]], box: [-4, -4, 4, 4], props: { model: 'NE555' } },
  RELAY: { label: 'Relay (coil + changeover)', prefix: 'K', pins: [[-3, -2], [-3, 2], [0, 2], [0, -2], [2, -2]], box: [-3.7, -2.4, 2.4, 2.4], props: { vcoil: 5, rcoil: 70, l: 0.02 } },
  XFMR: { label: 'Transformer (center tap)', prefix: 'TR', pins: [[-3, -2], [-3, 0], [-3, 2], [3, -2], [3, 2]], box: [-3, -2.6, 3, 2.6], props: { n1: 10, n2: 10, ns: 190, lm: 0.3, r1: 0.02, r2: 0.02, rs: 2 } },
  // LCD 16×2 with I2C backpack. Schematic pin order (top→bottom) SCL, SDA, VCC, GND; index order GND, VCC, SDA, SCL like the real header
  // OLED 0.96" SSD1306 128×64 I2C. Schematic pin order (top→bottom) SCL, SDA, VCC, GND; index order GND, VCC, SCL, SDA like the real header
  OLED: { label: 'OLED 0.96" 128×64 (SSD1306 I2C)', prefix: 'OLED', pins: [[-5, 2], [-5, 1], [-5, -1], [-5, 0]], box: [-5, -2.3, 5, 3.3], props: { addr: 0x3C, color: 'white' } },
  // KY-040 rotary encoder module: header CLK, DT, SW, +, GND on the right. CLK / DT have 10 kΩ pull-ups to +, contacts pull them to GND
  ENC: { label: 'Rotary encoder (KY-040)', prefix: 'ENC', pins: [[3, -2], [3, -1], [3, 0], [3, 1], [3, 2]], box: [-3.4, -2.6, 3, 2.6], props: {} },
  // 74HC595 shift register, index = DIP pin − 1: 1 QB … 7 QH, 8 GND, 9 QH', 10 SRCLR, 11 SRCLK, 12 RCLK, 13 OE, 14 SER, 15 QA, 16 VCC
  SR595: { label: '74HC595 shift register (8 outputs)', prefix: 'U', pins: [[4, -3], [4, -2], [4, -1], [4, 0], [4, 1], [4, 2], [4, 3], [0, 7], [4, 5], [2, -6], [-4, -3], [-4, -2], [2, 7], [-4, -4], [4, -4], [0, -6]], box: [-4, -6, 4, 7], props: { model: '74HC595' } },
  // TL494 PWM controller, index = DIP pin − 1: 1 1IN+, 2 1IN−, 3 FEEDBACK, 4 DTC, 5 CT, 6 RT, 7 GND, 8 C1, 9 E1, 10 E2, 11 C2, 12 VCC, 13 OUTPUT CTRL, 14 REF, 15 2IN−, 16 2IN+
  TL494: { label: 'TL494 PWM controller (SMPS, inverters)', prefix: 'U', pins: [[-5, -4], [-5, -5], [-5, -2], [-5, 4], [-3, 7], [-1, 7], [1, 7], [5, -5], [5, -2], [5, 0], [5, -4], [2, -7], [3, 7], [-2, -7], [-5, 2], [-5, 0]], box: [-5, -7, 5, 7], props: { model: 'TL494C' } },
  // LM2596 buck regulator, index = pin − 1: 1 VIN, 2 OUTPUT (switch), 3 GND, 4 FEEDBACK, 5 ON/OFF
  LM2596: { label: 'LM2596 buck regulator 3 A (150 kHz)', prefix: 'U', pins: [[-4, -1], [4, -1], [0, 3], [4, 1], [-4, 1]], box: [-4, -2.2, 4, 3], props: { model: 'LM2596S-ADJ' } },
  // IR2104 half-bridge gate driver, index = pin − 1: 1 VCC, 2 IN, 3 SD, 4 COM, 5 LO, 6 VS, 7 HO, 8 VB
  IR2104: { label: 'IR2104 half-bridge MOSFET driver', prefix: 'U', pins: [[-4, -3], [-4, -1], [-4, 1], [-4, 3], [4, 4], [4, 0], [4, -2], [2, -5]], box: [-4, -5, 4, 5], props: { model: 'IR2104' } },
  // 1-channel 5 V relay module (opto / transistor + LED on board): VCC, GND, IN | COM, NO, NC
  RMOD: { label: 'Relay module 5 V (1 channel)', prefix: 'K', pins: [[-3, -1], [-3, 0], [-3, 1], [3, 0], [3, -1], [3, 1]], box: [-3, -2, 3, 2], props: { trig: 'low' } },
  // ADS1115 16-bit ADC module, index = header order VDD, GND, SCL, SDA, ADDR, ALRT, A0, A1, A2, A3 (drawn: bus pins top, power bottom, inputs right)
  ADS1115: { label: 'ADS1115 16-bit ADC (I2C, 4 inputs)', prefix: 'U', pins: [[-4, 1], [-4, 2], [-4, -3], [-4, -2], [-4, 0], [-4, -1], [4, -2], [4, -1], [4, 0], [4, 1]], box: [-4, -3.7, 4, 2.7], props: {} },
  // micro SD card module (the common blue one: AMS1117 3.3 V regulator + level shifter, 5 V in). Header GND, VCC, MISO, MOSI, SCK, CS.
  SDCARD: { label: 'Micro SD card module (SPI)', prefix: 'SD', pins: [[-4, 3], [-4, 2], [-4, -2], [-4, -1], [-4, 0], [-4, 1]], box: [-4, -3, 4, 3.8], props: { card: true } },   // drawn: SPI pins top, power bottom
  // WeMos D1 mini "Datalogger shield": micro SD (3.3 V, no regulator) + DS1307 RTC (5 V, CR1220). Two 8-pin rows 0.9" (22.86 mm) apart, D1 mini pin names.
  D1SD: { label: 'D1 mini Datalogger shield (micro SD + DS1307)', prefix: 'SD', pins: [[-5, -3], [-5, -2], [-5, -1], [-5, 0], [-5, 1], [-5, 2], [-5, 3], [-5, 4], [5, -3], [5, -2], [5, -1], [5, 0], [5, 1], [5, 2], [5, 3], [5, 4]], box: [-5, -4, 5, 5], props: { card: true, start: '', speed: 1 } },
  // single in-line pin header: a row of 2–40 holes to plug any module in (props.n, props.pitch, props.names "VCC,GND,…")
  SIL: { label: 'Pin header SIL (1 row, 2–40 pins)', prefix: 'J', pins: [[-1, 0], [-1, 1]], box: [-1, -0.6, 0.8, 1.6], props: { n: 8, pitch: '2.54', names: '' } },
  LCD: { label: 'LCD 16×2 (I2C backpack)', prefix: 'LCD', pins: [[-7, 2], [-7, 1], [-7, 0], [-7, -1]], box: [-7, -2.3, 7, 2.8], props: { addr: 0x27 } },
  SEG7: { label: '7-segment display', prefix: 'DS', pins: [[-3, -4], [-3, -3], [-3, -2], [-3, -1], [-3, 0], [-3, 1], [-3, 2], [-3, 3], [-3, 4]], box: [-3, -4.7, 2.6, 4.7], props: { common: 'cathode', color: 'red' } },
  // sensors: a slider in the panel sets what they "feel"; sketches read them (DHT library, pulseIn) or the voltage does the job (LDR, PIR)
  DHT: { label: 'DHT22 / DHT11 temp + humidity', prefix: 'U', pins: [[-3, -1], [-3, 0], [-3, 1]], box: [-3, -2.2, 2.6, 2.2], props: { model: 'DHT22', temp: 25, hum: 60 } },
  HCSR04: { label: 'HC-SR04 ultrasonic distance', prefix: 'U', pins: [[-4, -1], [-4, 0], [-4, 1], [-4, 2]], box: [-4, -2.3, 4, 2.8], props: { cm: 50 } },
  LDR: { label: 'LDR light sensor', prefix: 'LDR', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 1.1], props: { lux: 100 } },
  PIR: { label: 'PIR motion sensor (HC-SR501)', prefix: 'U', pins: [[-3, -1], [-3, 0], [-3, 1]], box: [-3, -2, 2.8, 2.2], props: { motion: false } },
  KEYPAD: { label: 'Keypad 4×4 (tap the keys)', prefix: 'KP', pins: [[-5, -3], [-5, -2], [-5, -1], [-5, 0], [-5, 1], [-5, 2], [-5, 3], [-5, 4]], box: [-5, -4, 4, 5.2], props: {} },
  BUZZER: { label: 'Buzzer (active, 3–5 V)', prefix: 'BZ', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 1.3], props: {} },
  LOCK: { label: 'Solenoid door lock (12 V)', prefix: 'LK', pins: [[-2, 0], [2, 0]], box: [-2, -1.6, 2, 1.4], props: { v: 12, r: 24, l: 0.05 } },
  TB: { label: 'Terminal block (screw, 2–12 ways)', prefix: 'J', pins: [[-2, 0], [2, 0], [-2, 1], [2, 1]], box: [-1.2, -0.7, 1.2, 1.7], props: { n: 2, pitch: '5.08' } },
  GND: { label: 'Ground', prefix: 'GND', pins: [[0, 0]], box: [-0.8, 0, 0.8, 1.6], props: {} },
  VM: { label: 'Voltmeter', prefix: 'VM', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: {} },
  AM: { label: 'Ammeter', prefix: 'AM', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: {} },
};
export const PALETTE = ['R', 'POT', 'C', 'L', 'BAT', 'SIG', 'LED', 'D', 'ZD', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP', 'T555', 'TL494', 'LM2596', 'IR2104', 'SR595', 'ESP32', 'UNO', 'LCD', 'OLED', 'ADS1115', 'INA219', 'DS3231', 'SDCARD', 'D1SD', 'SEG7', 'DHT', 'HCSR04', 'LDR', 'PIR', 'KEYPAD', 'ENC', 'BUZZER', 'LOCK', 'SERVO', 'STEPPER', 'BYJ', 'ACS712', 'PV', 'SCC', 'REG', 'RELAY', 'RMOD', 'OPTO', 'SW', 'SPDT', 'DPDT', 'PB', 'LAMP', 'XFMR', 'TB', 'SIL', 'ISRC', 'VM', 'AM', 'SCOPE', 'GND'];
export const DYNAMIC = new Set(['C', 'L', 'XFMR', 'LOCK', 'SIG', 'SCOPE', 'RELAY', 'SERVO', 'STEPPER', 'BYJ', 'SCC', 'ENC', 'TL494', 'LM2596']);
// stepper drivers (StepStick modules, same pins). micro = MS pin settings it offers
export const DRIVERS = {
  A4988: { vmin: 8, vmax: 35, imax: 2, cool: 1.2, micro: [1, 2, 4, 8, 16], note: 'A4988: MS1–MS3 set the microstep. Vref = I × 8 × Rsense (0.1 Ω → Vref = 0.8 × I).' },
  DRV8825: { vmin: 8.2, vmax: 45, imax: 2.2, cool: 1.5, micro: [1, 2, 4, 8, 16, 32], note: 'DRV8825: up to 1/32 step, 45 V. Vref = I ÷ 2 (Rsense 0.1 Ω).' },
  TMC2209: { vmin: 4.75, vmax: 29, imax: 2, cool: 1.4, micro: [8, 16, 32, 64], silent: true, note: 'TMC2209 (standalone): MS1 / MS2 LOW-LOW = 1/8, HIGH-HIGH = 1/16, HIGH-LOW = 1/32, LOW-HIGH = 1/64. StealthChop: almost silent. Vref ≈ I_rms × 1.41 (Vref 1.41 V ≈ 1 A rms). Needs a heatsink above 1 A.' },
};
export const ACS = { '5A': { s: 0.185, max: 5 }, '20A': { s: 0.100, max: 20 }, '30A': { s: 0.066, max: 30 } };
// solar panels at 1000 W/m² (25 °C): Voc, Isc, Vmp, Imp
export const PANELS = {
  '10W': { voc: 21.6, isc: 0.61, vmp: 18, imp: 0.56 }, '50W': { voc: 22, isc: 3.0, vmp: 18, imp: 2.78 }, '100W': { voc: 22.5, isc: 5.9, vmp: 18.2, imp: 5.5 },
  '200W': { voc: 24.3, isc: 10.4, vmp: 20.3, imp: 9.85 }, '400W': { voc: 49.5, isc: 10.3, vmp: 41.5, imp: 9.65 },
};
// charge controller battery settings: absorption, float, low-voltage disconnect / reconnect of the LOAD output
export const SCC_BATS = {
  lfp12: { name: 'LiFePO4 12.8 V (4S)', abs: 14.2, flt: 13.6, lvd: 11.6, lvr: 12.8 }, lfp24: { name: 'LiFePO4 25.6 V (8S)', abs: 28.4, flt: 27.2, lvd: 23.2, lvr: 25.6 },
  lfp48: { name: 'LiFePO4 51.2 V (16S)', abs: 56.8, flt: 54.4, lvd: 46.4, lvr: 51.2 }, lead12: { name: 'Lead-acid 12 V', abs: 14.4, flt: 13.8, lvd: 11.1, lvr: 12.6 },
};
// 28BYJ-48 half-step coil patterns (IN1 = 1, IN2 = 2, IN3 = 4, IN4 = 8) → position in the 8-step cycle
const BYJ_SEQ = { 1: 0, 3: 1, 2: 2, 6: 3, 4: 4, 12: 5, 8: 6, 9: 7 };
export const isDynamic = (c) => c.parts.some(p => DYNAMIC.has(p.type) || (isBoard(p.type) && ((p.props.run && p.props.code) || Object.values(p.props.pins ?? {}).some(x => x.mode === 'pwm'))));

// signal generator value at time t
export function sigValue(q, t) {
  const ph = ((t * q.f) % 1 + 1) % 1, A = q.amp, o = q.off;
  switch (q.wave) {
    case 'square': return o + (ph < 0.5 ? A : -A);
    case 'triangle': return o + A * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
    case 'pwm': return o + (ph < q.duty / 100 ? A : 0);
    case 'saw': return o + A * (2 * ph - 1);
    default: return o + A * Math.sin(2 * Math.PI * ph);
  }
}

// average of a PWM wave over [t0, t1] (exact, so pulse widths stay exact even with big time steps)
export function pwmAvg(f, duty, amp, t0, t1) {
  const T = 1 / f, D = Math.min(1, Math.max(0, duty / 100)) * T;
  const I = (t) => { const n = Math.floor(t / T), ph = t - n * T; return n * D + Math.min(ph, D); };
  return t1 > t0 ? amp * (I(t1) - I(t0)) / (t1 - t0) : (((t0 / T) % 1) * T < D ? amp : 0);
}
// fastest repeating signal in the circuit (Hz): the simulation time step follows it
export function fastestFreq(c) {
  let f = 0;
  for (const p of c.parts) {
    if (p.type === 'SIG') f = Math.max(f, p.props.f);
    if (p.type === 'TL494') f = Math.max(f, TL_F.get(p.id) ?? 0);      // its own oscillator: at least 40 steps per cycle
    if (p.type === 'LM2596') f = Math.max(f, LM2596.f / 2);           // 20 steps per switching cycle (the ON time is dithered exactly)
    if (isBoard(p.type)) for (const q of Object.values(p.props.pins ?? {})) if (q.mode === 'pwm') f = Math.max(f, Math.min(500, q.f ?? 1000));   // pwmAvg keeps faster PWM exact on average
  }
  return f;
}
const R_WIRE = 1e-4, R_OPEN = 1e12, G_MIN = 1e-12;

export const rotPt = ([x, y], rot) => { for (let k = 0; k < (rot & 3); k++) [x, y] = [-y, x]; return [x, y]; };
// screw terminal blocks: standard PCB pitches (rating ≈ the usual datasheet values; check yours)
export const TB_PITCH = {
  '3.5': { label: '3.5 mm (DG350 / KF350)', a: 8, v: 250, drill: 1.0, pad: 2.0, depth: 7.0 },
  '3.81': { label: '3.81 mm (15EDG plug-in)', a: 8, v: 300, drill: 1.1, pad: 2.0, depth: 8.0 },
  '5.0': { label: '5.0 mm (DG128 / KF128)', a: 10, v: 300, drill: 1.2, pad: 2.4, depth: 7.5 },
  '5.08': { label: '5.08 mm (KF301 / DG301, the common blue one)', a: 16, v: 300, drill: 1.3, pad: 2.6, depth: 7.6 },
  '7.62': { label: '7.62 mm (KF7.62, high current)', a: 30, v: 300, drill: 1.6, pad: 3.2, depth: 10 },
};
export const TB_RC = 0.003;            // contact resistance per terminal, Ω
// terminal block: way k = pin 2k (wire / screw side, left) + pin 2k+1 (PCB side, right), 1 grid step apart, way 1 on top:
// adding ways grows it downward, so wires already on way 1, 2… stay put
const tbN = (p) => Math.max(1, Math.min(12, Math.round(p.props?.n ?? 2)));
export const silN = (p) => Math.max(1, Math.min(40, Math.round(p.props?.n ?? 8)));
export const D1SD_PINS = ['TX', 'RX', 'D1', 'D2', 'D3', 'D4', 'GND', '5V', 'RST', 'A0', 'D0', 'D5', 'D6', 'D7', 'D8', '3V3'];
export const silRows = (p) => (p.props?.rows === 2 ? 2 : 1);
// SIL 2 rows (2×N box header): pin 1, 3, 5 … left column, 2, 4, 6 … right column (standard IDC numbering)
export const pinDefs = (p) => p.type === 'TB' ? Array.from({ length: tbN(p) }, (_, k) => [[-2, k], [2, k]]).flat() : p.type === 'SIL' ? (silRows(p) === 2 ? Array.from({ length: 2 * silN(p) }, (_, i) => [i % 2 ? 5 : -1, Math.floor(i / 2)]) : Array.from({ length: silN(p) }, (_, k) => [-1, k])) : TYPES[p.type].pins;
export const boxOf = (p) => { if (p.type === 'SIL') return silRows(p) === 2 ? [-1, -0.6, 5, silN(p) - 1 + 0.6] : [-1, -0.6, 2.4, silN(p) - 1 + 0.6]; if (p.type !== 'TB') return TYPES[p.type].box; return [-1.2, -0.7, 1.2, tbN(p) - 1 + 0.7]; };
export const pinsOf = (p) => pinDefs(p).map(q => { const [x, y] = rotPt(q, p.rot); return [p.x + x, p.y + y]; });
export const key = (x, y) => `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`;

export function newCircuit() { return { v: 1, nextId: 1, parts: [], wires: [] }; }
export function addPart(c, type, x, y, rot = 0) {
  const t = TYPES[type];
  const n = c.parts.filter(p => p.type === type).length;
  let k = n + 1; const names = new Set(c.parts.map(p => p.name));
  while (names.has(t.prefix + k)) k++;
  const p = { id: c.nextId++, type, name: type === 'GND' ? 'GND' : t.prefix + k, x, y, rot, props: structuredClone(t.props) };
  c.parts.push(p);
  return p;
}
// does point (px,py) lie on segment (strictly inside)?
function onSeg(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return false;
  const cross = (px - w.x1) * dy - (py - w.y1) * dx;
  if (Math.abs(cross) > 1e-6 * Math.sqrt(l2)) return false;
  const t = ((px - w.x1) * dx + (py - w.y1) * dy) / l2;
  return t > 1e-6 && t < 1 - 1e-6;
}

// split wires at every pin / wire end lying on them (T junctions)
export function wirePieces(c) {
  const pts = [];
  for (const p of c.parts) for (const q of pinsOf(p)) pts.push(q);
  for (const w of c.wires) { pts.push([w.x1, w.y1]); pts.push([w.x2, w.y2]); }
  const out = [];
  c.wires.forEach((w, wi) => {
    const inner = pts.filter(([x, y]) => onSeg(x, y, w));
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
    const ts = [...new Set(inner.map(([x, y]) => ((x - w.x1) * dx + (y - w.y1) * dy) / l2).map(t => +t.toFixed(9)))].sort((a, b) => a - b);
    const cuts = [0, ...ts, 1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1];
      out.push({ wi, x1: w.x1 + dx * a, y1: w.y1 + dy * a, x2: w.x1 + dx * b, y2: w.y1 + dy * b });
    }
  });
  return out;
}

// how many things meet at each point (for junction dots)
export function junctions(c) {
  const count = new Map();
  const add = (x, y) => { const k = key(x, y); count.set(k, (count.get(k) ?? 0) + 1); };
  for (const w of wirePieces(c)) { add(w.x1, w.y1); add(w.x2, w.y2); }
  for (const p of c.parts) for (const [x, y] of pinsOf(p)) add(x, y);
  return [...count.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
}

// LDR (GL5528 style): ≈ 10 kΩ at 10 lux, ≈ 1 kΩ in daylight, 1 MΩ dark
export const ldrOhms = (lux) => Math.max(100, Math.min(1e6, 15000 * Math.pow(Math.max(lux, 0.01) / 10, -0.75)));

// ---------- faults (Troubleshoot mode): break a part on purpose and measure it like on the bench ----------
// open = no connection between any pins · short = the two pins below welded together (others float) · weak = drifted value
export const FAULT_SHORT = { NPN: [1, 2], PNP: [1, 2], NMOS: [1, 2], PMOS: [1, 2], OPAMP: [3, 4], T555: [7, 0], TL494: [11, 6], LM2596: [0, 1], IR2104: [0, 3], REG: [0, 1], RELAY: [2, 4], OPTO: [2, 3], XFMR: [0, 1] };
const FAULTABLE = new Set(['R', 'POT', 'C', 'L', 'D', 'LED', 'ZD', 'LAMP', 'SW', 'PB', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP', 'REG', 'T555', 'TL494', 'LM2596', 'IR2104', 'RELAY', 'OPTO', 'XFMR', 'BAT']);
export function faultOptions(type) {
  if (!FAULTABLE.has(type)) return [];
  const shortTxt = { NPN: 'shorted C–E (blown)', PNP: 'shorted C–E (blown)', NMOS: 'shorted D–S (blown)', PMOS: 'shorted D–S (blown)', OPAMP: 'shorted supply (dead chip)', T555: 'shorted VCC–GND (dead chip)', TL494: 'shorted VCC–GND (dead chip)', LM2596: 'shorted VIN–OUT (switch blown: VIN goes straight out)', IR2104: 'shorted VCC–COM (dead chip)', REG: 'shorted IN–OUT (blown)',
    RELAY: 'contacts welded (always ON)', OPTO: 'shorted output (always ON)', XFMR: 'shorted primary turns', SW: 'stuck closed', PB: 'stuck pressed', BAT: 'shorted cell' }[type] ?? 'shorted';
  const openTxt = { R: 'open (burnt)', C: 'open (broken lead)', L: 'open (broken wire)', LAMP: 'open (filament gone)', SW: 'stuck open', PB: 'never closes', BAT: 'dead / disconnected', XFMR: 'open winding', RELAY: 'dead (coil + contacts open)', POT: 'open (worn track)' }[type] ?? 'open (dead)';
  const o = [['ok', 'OK (working)'], ['open', openTxt], ['short', shortTxt]];
  const weak = { R: 'drifted high (×5)', C: 'dried out (10 % left)', BAT: 'low / weak' }[type];
  if (weak) o.push(['weak', weak]);
  return o;
}
export const faultOf = (p) => (FAULTABLE.has(p.type) && p.props.fault && p.props.fault !== 'ok' ? p.props.fault : null);
const deadFault = (p) => { const f = faultOf(p); return f === 'open' || f === 'short' ? f : null; };
function propsWithFault(p) {
  if (faultOf(p) !== 'weak') return p.props;
  const q = { ...p.props };
  if (p.type === 'R') q.r *= 5;
  if (p.type === 'C') q.c *= 0.1;
  if (p.type === 'BAT') { q.v *= 0.7; q.rint = (q.rint || 0) + 2; }
  return q;
}

// MOSFET: on-resistance falls as the gate voltage rises; saturation current k·(Vgs − Vth)²
export const fetRds = (m, vc) => m.rdson * Math.max(0.7, (m.vfull - m.vth) / Math.max(1e-3, vc - m.vth));
export const fetK = (m) => 3 * m.imax / (m.vfull - m.vth) ** 2;

// ---------- solver ----------
// sim = null → DC (capacitors open, inductors shorted). sim = { t, dt, state } → one time step (backward Euler).
// opts.sigOff: signal generators sit at their DC offset (used to start a time simulation from the DC operating point)
export function solveCircuit(c, sim = null, opts = {}) {
  const st = sim?.state ?? new Map();
  const grounds = c.parts.filter(p => p.type === 'GND');
  const nodeOf = new Map();       // point key -> node index (0 = ground)
  let nextNode = 1;
  const gkeys = new Set(grounds.map(g => key(...pinsOf(g)[0])));
  const node = (x, y) => {
    const k = key(x, y);
    if (gkeys.has(k)) return 0;
    if (!nodeOf.has(k)) nodeOf.set(k, nextNode++);
    return nodeOf.get(k);
  };
  const notes = [];
  const pieces = wirePieces(c);
  const els = [];       // {kind:'R'|'V'|'I', a, b, val, owner, role}
  const R = (a, b, val, owner, role) => els.push({ kind: 'R', a, b, val, owner, role });
  const V = (a, b, val, owner, role) => els.push({ kind: 'V', a, b, val, owner, role });
  const I = (a, b, val, owner, role) => els.push({ kind: 'I', a, b, val, owner, role });
  const inner = () => nextNode++;

  // auto ground if none: the − side of the first battery
  let autoGround = null;
  if (!grounds.length) {
    const b = c.parts.find(p => p.type === 'BAT'), mc = !b && c.parts.find(p => isBoard(p.type));
    if (b) { const [x, y] = pinsOf(b)[1]; gkeys.add(key(x, y)); autoGround = b.name; }
    else if (mc) { const gi = BOARDS[mc.type].pins.findIndex(q => q.k === 'gnd'); const [x, y] = pinsOf(mc)[gi]; gkeys.add(key(x, y)); autoGround = mc.name + ' GND'; }
  }
  pieces.forEach((w, k) => R(node(w.x1, w.y1), node(w.x2, w.y2), R_WIRE, null, 'wire' + k));
  const diodes = [], trans = [], fets = [], zeners = [], amps = [], regs = [], relays = [], timers = [], tls = [], lms = [], drv = [];
  for (const p of c.parts) {
    if (p.type === 'GND') continue;
    const pins = pinsOf(p).map(([x, y]) => node(x, y));
    const [a, b] = pins, pr = propsWithFault(p), dead = deadFault(p);
    if (dead === 'open') { for (let k = 1; k < pins.length; k++) R(pins[0], pins[k], R_OPEN, p, k === 1 ? 'main' : 'open' + k); continue; }
    if (dead === 'short') { const [i, j] = FAULT_SHORT[p.type] ?? [0, 1]; R(pins[i], pins[j], 0.01, p, 'main'); continue; }
    switch (p.type) {
      case 'R': R(a, b, Math.max(pr.r, 1e-6), p, 'main'); break;
      case 'POT': {
        const f = Math.min(1, Math.max(0, pr.pos / 100));
        R(a, pins[2], Math.max(pr.r * f, 1e-3), p, 'aw'); R(pins[2], b, Math.max(pr.r * (1 - f), 1e-3), p, 'wb'); break;
      }
      case 'BAT':
        if (pr.rint > 0) { const n = inner(); V(a, n, pr.v, p, 'main'); R(n, b, pr.rint, p, 'rint'); } else V(a, b, pr.v, p, 'main');
        break;
      case 'ISRC': I(a, b, pr.i, p, 'main'); break;
      case 'SW': case 'PB': R(a, b, pr.on ? R_WIRE : R_OPEN, p, 'main'); break;
      case 'TB': for (let k = 0; k * 2 + 1 < pins.length; k++) R(pins[2 * k], pins[2 * k + 1], TB_RC, p, k ? 'w' + k : 'main'); break;
      case 'SPDT': R(a, b, pr.on ? R_OPEN : R_WIRE, p, 'p1a'); R(a, pins[2], pr.on ? R_WIRE : R_OPEN, p, 'p1b'); break;
      case 'DPDT':
        R(a, b, pr.on ? R_OPEN : R_WIRE, p, 'p1a'); R(a, pins[2], pr.on ? R_WIRE : R_OPEN, p, 'p1b');
        R(pins[3], pins[4], pr.on ? R_OPEN : R_WIRE, p, 'p2a'); R(pins[3], pins[5], pr.on ? R_WIRE : R_OPEN, p, 'p2b');
        break;
      case 'LAMP': R(a, b, pr.vr * pr.vr / Math.max(pr.wr, 1e-6), p, 'main'); break;
      case 'VM': R(a, b, 10e6, p, 'main'); break;
      case 'AM': R(a, b, R_WIRE, p, 'main'); break;
      case 'C': {
        const s0 = st.get(p.id) ?? { v: 0 };
        if (sim) { const g = pr.c / sim.dt; R(a, b, 1 / g, p, 'main'); I(b, a, g * s0.v, p, 'hist'); } else R(a, b, R_OPEN, p, 'main');
        break;
      }
      case 'L': {
        const s0 = st.get(p.id) ?? { i: 0 }, n = inner();
        if (sim) { R(a, n, pr.l / sim.dt, p, 'main'); I(a, n, s0.i, p, 'hist'); } else R(a, n, R_WIRE, p, 'main');
        R(n, b, Math.max(pr.r, 1e-4), p, 'dcr');
        break;
      }
      case 'XFMR': {
        // ideal transformer + magnetizing inductance on winding A (P1–CT). Winding B (CT–P2) and the secondary (S1–S2) copy A's voltage × turns ratio,
        // and their currents are reflected back into A (power in = power out). Dots at P1 and S1.
        const [P1, CT, P2, S1, S2] = pins, s0 = st.get(p.id) ?? { im: 0 }, nA = inner(), nB = inner(), nS = inner(), n1 = Math.max(pr.n1, 1e-6);
        R(P1, nA, Math.max(pr.r1, 1e-4), p, 'r1');
        if (sim) { R(nA, CT, Math.max(pr.lm, 1e-9) / sim.dt, p, 'lm'); I(nA, CT, s0.im, p, 'hist'); } else R(nA, CT, R_OPEN, p, 'lm');   // DC: a transformer passes no DC (start with zero magnetizing current)
        R(CT, nB, Math.max(pr.r2, 1e-4), p, 'r2');
        const vb = { kind: 'V', a: nB, b: P2, val: 0, gp: nA, gn: CT, gain: pr.n2 / n1, owner: p, role: 'wb' }; els.push(vb);
        els.push({ kind: 'F', a: nA, b: CT, ctrl: vb, val: -pr.n2 / n1, owner: p, role: 'fb' });
        R(S1, nS, Math.max(pr.rs, 1e-4), p, 'rs');
        const vsx = { kind: 'V', a: nS, b: S2, val: 0, gp: nA, gn: CT, gain: pr.ns / n1, owner: p, role: 'ws' }; els.push(vsx);
        els.push({ kind: 'F', a: nA, b: CT, ctrl: vsx, val: -pr.ns / n1, owner: p, role: 'fs' });
        break;
      }
      case 'KEYPAD': for (let k = 1; k < 8; k++) R(pins[0], pins[k], R_OPEN, p, k === 1 ? 'main' : 'k' + k); break;   // key presses go to the sketch (Keypad library)
      case 'BUZZER': R(a, b, 3.3 / 0.012, p, 'main'); break;     // ≈ 12 mA at 3.3 V, 20 mA at 5 V
      case 'LOCK': {
        const s0 = st.get(p.id) ?? { i: 0 }, n = inner();
        if (sim) { R(a, n, Math.max(pr.l, 1e-6) / sim.dt, p, 'main'); I(a, n, s0.i, p, 'hist'); } else R(a, n, R_WIRE, p, 'main');
        R(n, b, Math.max(pr.r, 0.1), p, 'dcr');
        break;
      }
      case 'DHT': R(pins[0], pins[2], 3.3 / 0.0015, p, 'main'); R(pins[1], pins[0], 10000, p, 'pull'); break;       // VCC, DATA (10 kΩ pull-up on the module), GND
      case 'HCSR04': R(pins[0], pins[3], 5 / 0.015, p, 'main'); R(pins[1], pins[3], 100000, p, 'trig'); R(pins[2], pins[3], 1000, p, 'echo'); break;   // VCC, TRIG, ECHO (low between pulses), GND
      case 'LDR': R(a, b, ldrOhms(pr.lux), p, 'main'); break;
      case 'PIR': {
        // VCC, OUT, GND: OUT is 3.3 V while it sees motion (even on a 5 V supply), 0 V otherwise
        R(pins[0], pins[2], 5 / 0.00006, p, 'main'); const n2 = inner();
        V(n2, pins[2], pr.motion ? 3.3 : 0, p, 'src'); R(n2, pins[1], 1000, p, 'out');
        break;
      }
      case 'SR595': {
        // outputs push-pull (≈ 50 Ω to VCC or GND) from the storage register of the last step; inputs are CMOS (almost no current)
        const prev = st.get(p.id) ?? {}, [QB, QC, QD, QE, QF, QG, QH, Gp, QHs, MR, SH, ST, OE, SER, QA, Vp] = pins;
        R(Vp, Gp, 50000, p, 'main');
        [SER, SH, ST, MR, OE].forEach((n, k) => R(n, Gp, 1e8, p, 'in' + k));
        const outs = [QA, QB, QC, QD, QE, QF, QG, QH], q = prev.q ?? 0, sr = prev.sr ?? 0, pw = prev.pw ?? false;
        outs.forEach((n, k) => { if (pw && prev.en) R((q >> k) & 1 ? Vp : Gp, n, 50, p, 'q' + k); else R(n, Gp, R_OPEN, p, 'q' + k); });
        if (pw) R((sr >> 7) & 1 ? Vp : Gp, QHs, 50, p, 'qhs'); else R(QHs, Gp, R_OPEN, p, 'qhs');
        break;
      }
      case 'RMOD': {
        // IN pulls ≈ 3 mA through the opto LED (to VCC for LOW trigger, to GND for HIGH trigger); coil ≈ 70 Ω when on
        const prev = st.get(p.id), [Vp, Gp, IN, COM, NO, NC] = pins, on = !!prev?.on;
        if (pr.trig === 'high') R(IN, Gp, 1500, p, 'in'); else R(Vp, IN, 1500, p, 'in');
        R(Vp, Gp, on ? 70 : 100000, p, 'main');
        R(COM, NO, on ? R_WIRE : R_OPEN, p, 'no'); R(COM, NC, on ? R_OPEN : R_WIRE, p, 'nc');
        break;
      }
      case 'ENC': {
        // pins CLK, DT, SW, +, GND. _a / _b / _sw = contact closed right now (set by the schematic as the knob turns)
        const [A, Bp, SWp, Vp, Gp] = pins;
        R(A, Vp, 10000, p, 'main'); R(Bp, Vp, 10000, p, 'pb');
        R(A, Gp, pr._a ? 1 : R_OPEN, p, 'ca'); R(Bp, Gp, pr._b ? 1 : R_OPEN, p, 'cb'); R(SWp, Gp, pr._sw ? 1 : R_OPEN, p, 'csw');
        break;
      }
      case 'OLED': {
        // pins GND, VCC, SCL, SDA. ≈ 20 mA (3.3 V regulator on the module), 10 kΩ I2C pull-ups to VCC
        const [Gp, Vp, SCL, SDA] = pins;
        R(Vp, Gp, 220, p, 'main'); R(SDA, Vp, 10000, p, 'sda'); R(SCL, Vp, 10000, p, 'scl');
        break;
      }
      case 'ADS1115': {
        // ≈ 150 µA supply, 10 kΩ pull-ups on SDA / SCL / ALRT and a 10 kΩ pull-down on ADDR (module), inputs ≈ 10 MΩ
        const [Vp, Gp, SCL, SDA, ADDR, ALRT] = pins;
        R(Vp, Gp, 22000, p, 'main'); R(SDA, Vp, 10000, p, 'sda'); R(SCL, Vp, 10000, p, 'scl'); R(ALRT, Vp, 10000, p, 'alrt'); R(ADDR, Gp, 10000, p, 'addr');
        for (let k = 0; k < 4; k++) R(pins[6 + k], Gp, 10e6, p, 'a' + k);
        break;
      }
      case 'D1SD': {
        // 3V3 → SD card ≈ 1 mA idle, 10 kΩ pull-up on CS (D8); 5V → DS1307 ≈ 0.1 mA; SPI lines weakly held so a bare shield still solves
        const g = pins[6], v3 = pins[15], v5 = pins[7];
        R(v3, g, 3300, p, 'main'); R(v5, g, 50000, p, 'rtc'); R(pins[14], v3, 10000, p, 'cs');
        for (const k of [11, 12, 13, 2, 3]) R(pins[k], g, 1e6, p, 'h' + k);
        break;
      }
      case 'SDCARD': {
        // ≈ 1 mA idle on the regulator (a card writing pulls up to 100 mA in short bursts), 10 kΩ pull-up on CS (module)
        const [Gp, Vp, MISO, MOSI, SCK, CS] = pins;
        R(Vp, Gp, 5000, p, 'main'); R(CS, Vp, 10000, p, 'cs'); R(MISO, Gp, 1e6, p, 'miso'); R(MOSI, Gp, 1e6, p, 'mosi'); R(SCK, Gp, 1e6, p, 'sck');
        break;
      }
      case 'LCD': {
        // pins GND, VCC, SDA, SCL. ≈ 25 mA (backlight + controller), 4.7 kΩ I2C pull-ups to VCC on the backpack
        const [Gp, Vp, SDA, SCL] = pins;
        R(Vp, Gp, 200, p, 'main'); R(SDA, Vp, 4700, p, 'sda'); R(SCL, Vp, 4700, p, 'scl');
        break;
      }
      case 'SEG7': {
        // 8 LEDs (a–g, dp) sharing one common pin: cathode (CC) or anode (CA)
        const m = LED_COLORS[pr.color] ?? LED_COLORS.red, cc = pr.common !== 'anode', prev = st.get(p.id)?.segOn ?? [];
        for (let k = 0; k < 8; k++) diodes.push({ p, a: cc ? pins[k] : pins[8], b: cc ? pins[8] : pins[k], vf: m.vf, rs: m.rs, on: !!prev[k], n: inner(), role: 'seg' + k });
        break;
      }
      case 'SIG': V(a, b, opts.sigOff ? pr.off : sigValue(pr, sim ? sim.t : 0), p, 'main'); break;
      case 'SCOPE': R(pins[0], pins[2], 10e6, p, 'ch1'); R(pins[1], pins[2], 10e6, p, 'ch2'); break;
      case 'OPTO': {
        const prev = st.get(p.id);
        const d = { p, a: pins[0], b: pins[1], vf: 1.2, rs: 5, on: prev?.on ?? false, n: inner(), role: 'led' };
        diodes.push(d);
        trans.push({ p, d, c: pins[2], e: pins[3], gain: pr.ctr / 100, vsat: 0.1, rsat: 4, vbr: Infinity, state: prev?.ts ?? 'off', n: inner() });
        break;
      }
      case 'NPN': case 'PNP': {
        const npn = p.type === 'NPN', m = BJTS[pr.model] ?? BJTS[npn ? '2N2222' : '2N2907'], prev = st.get(p.id), [B, Cc, E] = pins;
        // base-emitter junction: real diode curve (Newton steps), so small-signal gain comes out right in amplifiers
        const nj = m.vbe > 1 ? 2 : 1;
        const d = { p, a: npn ? B : E, b: npn ? E : B, vf: m.vbe - 0.15 * nj, rs: m.rb, on: prev?.on ?? false, n: inner(), role: 'be',
          exp: { vbe0: m.vbe, ib0: 1e-3 / m.beta, nvt: nj * 0.025852, rb: m.rb }, ib: prev?.ib ?? 1e-3 / m.beta };
        diodes.push(d);
        trans.push({ p, d, c: npn ? Cc : E, e: npn ? E : Cc, gain: m.beta, vsat: m.vsat, rsat: m.rsat, vbr: m.vmax * 1.3, state: prev?.ts ?? 'off', n: inner() });
        break;
      }
      case 'NMOS': case 'PMOS': {
        const nch = p.type === 'NMOS', m = FETS[pr.model] ?? FETS[nch ? 'IRLZ44N' : 'AO3401'], prev = st.get(p.id), [G, Dn, Sn] = pins;
        diodes.push({ p, a: nch ? Sn : Dn, b: nch ? Dn : Sn, vf: 0.8, rs: 0.02, on: prev?.bon ?? false, n: inner(), role: 'body' });
        fets.push({ p, m, g: G, s: Sn, hi: nch ? Dn : Sn, lo: nch ? Sn : Dn, sign: nch ? 1 : -1, vc: prev?.vc ?? 0, state: prev?.ts ?? 'off', vbr: m.vmax * 1.3, n: inner() });
        break;
      }
      case 'ZD': {
        const prev = st.get(p.id);
        const zm = zenerOf(pr);
        zeners.push({ p, a, b, vz: Math.max(0.5, zm.vz), rz: 2 + zm.vz, state: prev?.zs ?? 'off', n: inner() });
        break;
      }
      case 'OPAMP': {
        const m = AMPS[pr.model] ?? AMPS.LM358, prev = st.get(p.id), n = inner();
        I(pins[3], pins[4], m.iq, p, 'iq');
        R(n, pins[2], 20, p, 'rout');
        amps.push({ p, m, ip: pins[0], in: pins[1], out: pins[2], vp: pins[3], vn: pins[4], n, state: prev?.os ?? 'lin' });
        break;
      }
      case 'REG': {
        const m = REGS[pr.model] ?? REGS['7805'], prev = st.get(p.id), [IN, OUT, REF] = pins;
        if (m.iq) I(IN, REF, m.iq, p, 'iq');
        if (m.adj) I(IN, REF, m.iadj, p, 'iadj'); else R(OUT, REF, 100e3, p, 'int');
        regs.push({ p, m, i: IN, o: OUT, r: REF, state: prev?.rs ?? 'reg' });
        break;
      }
      case 'SERVO': {
        // pins: SIG, VCC, GND. Signal input ≈ 20 kΩ. Supply current: idle, or running while the arm moves.
        const m = SERVOS[pr.model] ?? SERVOS.SG90, prev = st.get(p.id);
        R(pins[0], pins[2], 20000, p, 'sig');
        R(pins[1], pins[2], 5 / (prev?.moving ? m.run : m.idle), p, 'load');
        break;
      }
      case 'BYJ': {
        // ULN2003 inputs ≈ 10 kΩ; each coil ON pulls ≈ 50 Ω from + (5 V motor: ≈ 100 mA per coil)
        const prev = st.get(p.id), k = prev?.k ?? 0;
        for (let i = 0; i < 4; i++) R(pins[i], pins[5], 10000, p, 'in' + i);
        R(pins[4], pins[5], k ? 50 / k : 1e6, p, 'main');
        break;
      }
      case 'ACS712': {
        // OUT = VCC / 2 + sensitivity × current (IP+ → IP−). Hall sensor: the current path is isolated from the electronics
        const [Vp, OUT, Gp, IPp, IPm] = pins, m = ACS[pr.model] ?? ACS['30A'], n1 = inner(), nm = inner();
        R(Vp, Gp, 500, p, 'main');
        const sense = { kind: 'V', a: IPp, b: n1, val: 0, owner: p, role: 'sense' }; els.push(sense);
        R(n1, IPm, 0.0012, p, 'rs');
        els.push({ kind: 'V', a: nm, b: Gp, val: 0, gp: Vp, gn: Gp, gain: 0.5, owner: p, role: 'mid' });
        R(nm, OUT, 10, p, 'rout');
        els.push({ kind: 'F', a: Gp, b: OUT, ctrl: sense, val: m.s / 10, owner: p, role: 'gain' });
        break;
      }
      case 'INA219': {
        // ≈ 1 mA, 10 kΩ I2C pull-ups, 0.1 Ω shunt VIN+ → VIN−, bus voltage measured on VIN− (≈ 800 kΩ to GND)
        const [Vp, Gp, SCL, SDA, VP, VN] = pins;
        R(Vp, Gp, 3300, p, 'main'); R(SDA, Vp, 10000, p, 'sda'); R(SCL, Vp, 10000, p, 'scl');
        R(VP, VN, 0.1, p, 'shunt'); R(VN, Gp, 800e3, p, 'bus');
        break;
      }
      case 'DS3231': {
        // ≈ 0.2 mA, 4.7 kΩ pull-ups on SDA / SCL (ZS-042 module), SQW / 32K open drain
        const [K32, SQW, SCL, SDA, Vp, Gp] = pins;
        R(Vp, Gp, 16500, p, 'main'); R(SDA, Vp, 4700, p, 'sda'); R(SCL, Vp, 4700, p, 'scl'); R(SQW, Gp, R_OPEN, p, 'sqw'); R(K32, Gp, R_OPEN, p, 'k32');
        break;
      }
      case 'PV': {
        // photo current (∝ sunlight) + shunt slope + a knee at Vmp → a realistic I-V curve: Isc at 0 V, Imp at Vmp, 0 A at Voc
        const m = PANELS[pr.model] ?? PANELS['100W'], G = Math.max(0, Math.min(1.2, (pr.sun ?? 100) / 100)), [P, N] = pins;
        if (G > 0.002) {
          const k = 1 + 0.06 * Math.log(G), voc = m.voc * k, vmp = m.vmp * k, isc = m.isc * G, imp = m.imp * G;
          const rsh = vmp / Math.max(1e-6, isc - imp), rd = (voc - vmp) / Math.max(1e-6, isc - voc / rsh);
          I(N, P, isc, p, 'ph'); R(P, N, rsh, p, 'sh');
          diodes.push({ p, a: P, b: N, vf: vmp, rs: rd, on: st.get(p.id)?.on ?? false, n: inner(), role: 'knee' });
        } else { I(N, P, 0, p, 'ph'); R(P, N, 1e7, p, 'sh'); }
        break;
      }
      case 'SCC': {
        // behaviour model: PWM = a switch PV+ → BAT+ (panel pulled down to the battery), MPPT = holds the panel at its best voltage
        // (perturb & observe, one step per time step) and pushes that power × 96 % into the battery. Sleeps when the panel is too low.
        const [PVp, Gp, BATp, LDp] = pins, prev = st.get(p.id) ?? {}, stg = prev.stage ?? 'sleep';
        R(PVp, Gp, 1e6, p, 'self');
        R(BATp, Gp, Math.max(10, (prev.vbat || 12) / 0.012), p, 'main');            // ≈ 12 mA own consumption from the battery
        if (stg === 'sleep' || stg === 'nobat') I(PVp, BATp, 0, p, 'chg');
        else if (pr.mode === 'pwm') { if (stg === 'bulk') R(PVp, BATp, 0.03, p, 'chg'); else I(PVp, BATp, prev.iout ?? 0, p, 'chg'); }
        else { els.push({ kind: 'V', a: PVp, b: Gp, val: prev.vref ?? 18, owner: p, role: 'pvin' }); I(Gp, BATp, prev.iout ?? 0, p, 'chg'); }
        R(BATp, LDp, prev.load === false ? R_OPEN : 0.02, p, 'load');
        break;
      }
      case 'STEPPER': {
        // A4988: pins STEP, DIR, EN (LOW = on, pulled down inside), VDD (logic 3–5.5 V), GND, VMOT (8–35 V)
        const prev = st.get(p.id), on = prev ? prev.en : true;
        R(pins[0], pins[4], 100000, p, 'step'); R(pins[1], pins[4], 100000, p, 'dir'); R(pins[2], pins[4], 100000, p, 'en');
        R(pins[3], pins[4], 1000, p, 'vdd');
        R(pins[5], pins[4], on ? 12 / Math.max(0.05, pr.ilim * ((DRIVERS[pr.drv] ?? DRIVERS.A4988).silent ? 0.5 : 0.65)) : 1e6, p, 'vmot');
        break;
      }
      case 'ESP32': case 'UNO': {
        // powered from USB. Every pin is what you set: OUTPUT = source with ≈ 25–30 Ω, inputs = high impedance (+ optional pull resistor)
        const B = BOARDS[p.type], cfg = pr.pins ?? {}, gi = B.pins.findIndex(q => q.k === 'gnd'), G = pins[gi], vccN = inner();
        V(vccN, G, B.vcc, p, 'vcc');
        B.pins.forEach((q, i) => {
          const nd = pins[i];
          if (q.k === 'gnd') { if (i !== gi) R(nd, G, R_WIRE, p, 'gndj'); return; }
          if (q.k === 'nc') { R(G, nd, 1e9, p, 'pin:' + q.n); return; }
          if (q.k === 'en') { R(vccN, nd, 10000, p, 'pin:' + q.n); return; }
          if (q.k === 'pwr') {
            if (q.v === B.vcc) R(vccN, nd, q.r, p, 'pin:' + q.n);
            else { const n2 = inner(); V(n2, G, q.v, p, 'src:' + q.n); R(n2, nd, q.r, p, 'pin:' + q.n); }
            return;
          }
          const m = cfg[q.n]?.mode ?? 'in';
          if (m === 'high') R(vccN, nd, B.rout, p, 'pin:' + q.n);
          else if (m === 'low') R(G, nd, B.rout, p, 'pin:' + q.n);
          else if (m === 'dac') { const n2 = inner(); V(n2, G, B.vcc * Math.max(0, Math.min(255, cfg[q.n].val ?? 0)) / 255, p, 'src:' + q.n); R(n2, nd, 1000, p, 'pin:' + q.n); }   // ESP32 DAC: 8 bit, weak output (≈ 1 kΩ)
          else if (m === 'pwm') {
            const c0 = cfg[q.n], n2 = inner();
            const val = sim ? pwmAvg(c0.f ?? 1000, c0.duty ?? 50, B.vcc, sim.t - sim.dt, sim.t) : B.vcc * (c0.duty ?? 50) / 100;
            V(n2, G, val, p, 'src:' + q.n); R(n2, nd, B.rout, p, 'pin:' + q.n);
          }
          else if (m === 'pu') R(vccN, nd, B.pullR, p, 'pin:' + q.n);
          else if (m === 'pd') R(G, nd, B.pullR, p, 'pin:' + q.n);
          else R(G, nd, 1e9, p, 'pin:' + q.n);
        });
        break;
      }
      case 'T555': {
        // pins: 1 GND, 2 TRIG, 3 OUT, 4 RESET, 5 CTRL, 6 THR, 7 DIS, 8 VCC. Inside: 3 × 5 kΩ divider (2/3 and 1/3 Vcc), two comparators, a latch.
        const m = TIMERS[pr.model] ?? TIMERS.NE555, prev = st.get(p.id), [G, TR, OUT, RST, CV, TH, DIS, VCC] = pins, n13 = inner(), no = inner();
        R(VCC, CV, 5000, p, 'div1'); R(CV, n13, 5000, p, 'div2'); R(n13, G, 5000, p, 'div3');
        R(VCC, G, 12 / m.iq, p, 'iq');           // supply current (≈ iq at 12 V), a resistor so an unpowered chip draws nothing
        R(no, OUT, m === TIMERS.NE555 ? 10 : 25, p, 'rout');
        timers.push({ p, m, G, TR, OUT, RST, CV, TH, DIS, VCC, n13, no, q: prev?.q ?? 0 });
        break;
      }
      case 'TL494': {
        // pins: 1IN+, 1IN−, FB, DTC, CT, RT, GND, C1, E1, E2, C2, VCC, OC, REF, 2IN−, 2IN+ (index = DIP pin − 1)
        const T = TL494, prev = st.get(p.id) ?? {}, [I1p, I1n, FB, DTC, CT, RT, G, C1, E1, E2, C2, VCC, OC, REF, I2n, I2p] = pins;
        R(VCC, G, 1700, p, 'main');                                   // ≈ 7 mA supply current at 12 V
        const nref = inner(), nrt = inner(), ref0 = prev.vref ?? 5;
        const vref = { kind: 'V', a: nref, b: G, val: ref0, owner: p, role: 'ref' }; els.push(vref); R(nref, REF, 1, p, 'rref');      // 5 V reference
        const vrt = { kind: 'V', a: nrt, b: G, val: ref0 * T.peak / 5, owner: p, role: 'rt' }; els.push(vrt); R(nrt, RT, 1, p, 'rrt');   // RT pin held at 3 V
        if (sim) els.push({ kind: 'F', a: VCC, b: CT, ctrl: vrt, val: -1, owner: p, role: 'ich' });   // CT charged with the same current that flows out of RT
        if (sim && prev.dis) { const nd = inner(); V(nd, G, prev.v0 ?? 0, p, 'disv'); R(nd, CT, 1e-3, p, 'dis'); }   // reset step: CT jumps back to the start of the ramp
        R(DTC, G, 1e8, p, 'dtc'); R(OC, G, 1e8, p, 'oc'); R(FB, G, 10000, p, 'fbpd');                 // FB: pulled down inside (≈ 0.3 mA at 3 V)
        // error amps: real ones have ≈ 0.8 MHz bandwidth, so each output moves at most a little per step: integrate it from the inputs
        // of the last step (no on/off states that could ping-pong). The two outputs are OR-ed onto FB (the higher one drives it).
        const ev = prev.ev ?? [0, 0], efb = Math.max(ev[0], ev[1]), ea = [[I1p, I1n], [I2p, I2n]].map(([ip, inn]) => ({ ip, in: inn }));
        if (efb > 0.05) { const nf = inner(); V(nf, G, efb, p, 'eav'); R(nf, FB, 20, p, 'ear'); }
        tls.push({ p, G, VCC, CT, DTC, FB, OC, REF, vref, vrt, ea, ev, dis: !!prev.dis, ff: prev.ff ?? 0, pp: false, en: false,
          outs: [{ c: C1, e: E1, n: inner(), on: !!prev.o?.[0] }, { c: C2, e: E2, n: inner(), on: !!prev.o?.[1] }] });
        break;
      }
      case 'LM2596': {
        // pins VIN, OUT, GND, FB, ON/OFF. The switch (VIN → OUT) is ON for the first `duty` part of every 150 kHz cycle; an integrator
        // moves `duty` until FEEDBACK = 1.23 V. Cycle-by-cycle current limit 4.5 A.
        const L = LM2596, prev = st.get(p.id) ?? {}, [VI, VO, G, FB, ON] = pins, fixed = L.models[pr.model] ?? 0;
        R(VI, G, prev.en === false ? 300000 : 2400, p, 'main');               // ≈ 5 mA running at 12 V, ≈ 80 µA when switched off (ON/OFF HIGH)
        R(FB, G, fixed ? 10000 : 1e8, p, 'fb'); R(ON, G, 1e8, p, 'on');
        // a step can't be cut in half, so each cycle gets a whole number of ON steps and the leftover is carried to the next cycle
        // (sigma-delta): the average duty comes out exact, as with the real chip's continuous pulse width
        let want = false, cyc = 0, nOn = prev.nOn ?? 0, acc = prev.acc ?? 0;
        if (sim) {
          const tm = sim.t - sim.dt / 2, N = 1 / (L.f * sim.dt), ph = ((tm * L.f) % 1 + 1) % 1; cyc = Math.floor(tm * L.f);
          if (cyc !== prev.cyc) { const x = (prev.en ? prev.duty ?? 0 : 0) * N + acc; nOn = Math.floor(x); acc = Math.min(1, x - nOn); }
          want = !!prev.en && Math.floor(ph * N) < nOn && prev.oc !== cyc;
        }
        lms.push({ p, VI, VO, G, FB, ON, n: inner(), on: want && !!prev.on, want, cyc, nOn, acc, fixed });
        break;
      }
      case 'IR2104': {
        const prev = st.get(p.id) ?? {}, [VC, IN, SD, COM, LO, VS, HO, VB] = pins;
        R(VC, COM, 12 / IR2104.iq, p, 'main'); R(VB, VS, 300000, p, 'vbs');
        R(IN, COM, 1e6, p, 'in'); R(SD, COM, 1e6, p, 'sd');
        // the driver reacts to what its inputs were at the end of the previous step (≈ 0.5 µs propagation delay); right after IN
        // changes both outputs stay off for that one step (dead time). Deciding before the step keeps the power stage from ping-ponging.
        const dead = sim ? !!prev.in !== !!prev.in2 : false, ok = !!prev.sd && !!prev.vcok && !dead;
        drv.push({ p, VC, IN, SD, COM, LO, VS, HO, VB, inn: !!prev.in, dead, ho: ok && !!prev.in && !!prev.vbok, lo: ok && !prev.in, prev });
        break;
      }
      case 'RELAY': {
        const prev = st.get(p.id), n = inner(), rm = relayOf(pr);
        if (sim) { R(pins[0], n, Math.max(rm.l, 1e-9) / sim.dt, p, 'coil'); I(pins[0], n, prev?.i ?? 0, p, 'hist'); } else R(pins[0], n, R_WIRE, p, 'coil');
        R(n, pins[1], Math.max(rm.rcoil, 1e-3), p, 'rc');
        relays.push({ p, com: pins[2], nc: pins[3], no: pins[4], on: prev?.on ?? false });
        break;
      }
      case 'LED': case 'D': {
        const m = p.type === 'LED' ? LED_COLORS[pr.color] ?? LED_COLORS.red : DIODES[pr.model] ?? DIODES['1N4007'];
        diodes.push({ p, a, b, vf: m.vf, rs: m.rs, on: st.get(p.id)?.on ?? false, n: inner(), role: 'main' });
        break;
      }
    }
  }
  if (!c.parts.some(p => p.type !== 'GND')) return { ok: false, error: 'Add some parts.' };
  if (!grounds.length && !autoGround) notes.push('No ground and no battery: voltages are measured from an arbitrary point.');
  if (autoGround) notes.push(`No ground symbol: the − side of ${autoGround} is used as 0 V.`);

  let res = null;
  const findEl = (list, owner, role, kind) => list.find(x => x.owner === owner && x.role === role && (!kind || x.kind === kind));
  for (let it = 0; it < 250; it++) {
    const all = [...els];
    for (const d of diodes) {
      d.was = d.on;
      if (d.on && d.exp) {
        // tangent of Vbe = vbe0 + n·Vt·ln(Ib / Ib0) at the last base current
        const X = d.exp, ib = Math.max(d.ib, 1e-12), rd = Math.min(1e8, X.nvt / ib), vj = X.vbe0 + X.nvt * Math.log(ib / X.ib0);
        all.push({ kind: 'V', a: d.a, b: d.n, val: vj - rd * ib, owner: d.p, role: d.role }); all.push({ kind: 'R', a: d.n, b: d.b, val: rd + X.rb, owner: d.p, role: d.role + 'rs' });
      } else if (d.on) { all.push({ kind: 'V', a: d.a, b: d.n, val: d.vf, owner: d.p, role: d.role }); all.push({ kind: 'R', a: d.n, b: d.b, val: d.rs, owner: d.p, role: d.role + 'rs' }); }
      else all.push({ kind: 'R', a: d.a, b: d.b, val: 1e10, owner: d.p, role: d.role });
    }
    for (const o of trans) {
      const st2 = o.d.was ? o.state : (o.state === 'brk' ? 'brk' : 'off');
      if (st2 === 'act') all.push({ kind: 'F', a: o.c, b: o.e, ctrl: findEl(all, o.p, o.d.role, 'V'), val: o.gain, owner: o.p, role: 'ce' });
      else if (st2 === 'sat') { all.push({ kind: 'V', a: o.c, b: o.n, val: o.vsat, owner: o.p, role: 'ce' }); all.push({ kind: 'R', a: o.n, b: o.e, val: o.rsat, owner: o.p, role: 'sat' }); }
      else if (st2 === 'brk') { all.push({ kind: 'V', a: o.c, b: o.n, val: o.vbr, owner: o.p, role: 'ce' }); all.push({ kind: 'R', a: o.n, b: o.e, val: 2, owner: o.p, role: 'sat' }); }
      else all.push({ kind: 'R', a: o.c, b: o.e, val: R_OPEN, owner: o.p, role: 'ce' });
    }
    for (const f of fets) {
      const m = f.m;
      if (f.state === 'ohm') all.push({ kind: 'R', a: f.hi, b: f.lo, val: fetRds(m, f.vc), owner: f.p, role: 'ch' });
      else if (f.state === 'sat') {
        const k = fetK(m), ov = Math.max(0, f.vc - m.vth), gm = 2 * k * ov, id0 = k * ov * ov;
        all.push({ kind: 'G', a: f.hi, b: f.lo, gp: f.g, gn: f.s, gain: gm * f.sign, val: id0 - gm * f.vc, owner: f.p, role: 'ch' });
      } else if (f.state === 'brk') { all.push({ kind: 'V', a: f.hi, b: f.n, val: f.vbr, owner: f.p, role: 'ch' }); all.push({ kind: 'R', a: f.n, b: f.lo, val: 2, owner: f.p, role: 'brkr' }); }
      else all.push({ kind: 'R', a: f.hi, b: f.lo, val: R_OPEN, owner: f.p, role: 'ch' });
    }
    for (const z of zeners) {
      if (z.state === 'fwd') { all.push({ kind: 'V', a: z.a, b: z.n, val: 0.7, owner: z.p, role: 'main' }); all.push({ kind: 'R', a: z.n, b: z.b, val: 0.1, owner: z.p, role: 'rs' }); }
      else if (z.state === 'rev') { all.push({ kind: 'V', a: z.b, b: z.n, val: z.vz, owner: z.p, role: 'main' }); all.push({ kind: 'R', a: z.n, b: z.a, val: z.rz, owner: z.p, role: 'rs' }); }
      else all.push({ kind: 'R', a: z.a, b: z.b, val: 1e10, owner: z.p, role: 'main' });
    }
    for (const o of amps) {
      if (o.state === 'high') all.push({ kind: 'V', a: o.vp, b: o.n, val: o.m.dh, owner: o.p, role: 'o' });
      else if (o.state === 'low') all.push({ kind: 'V', a: o.n, b: o.vn, val: o.m.dl, owner: o.p, role: 'o' });
      else all.push({ kind: 'V', a: o.n, b: 0, val: 0, gp: o.ip, gn: o.in, gain: o.m.a, owner: o.p, role: 'o' });
    }
    for (const g of regs) {
      const m = g.m;
      if (g.state === 'reg') all.push({ kind: 'V', a: g.o, b: g.r, ca: g.i, cb: g.o, val: m.vout, owner: g.p, role: 'pass' });
      else if (g.state === 'drop') all.push({ kind: 'V', a: g.i, b: g.o, val: m.drop, owner: g.p, role: 'pass' });
      else if (g.state === 'lim') all.push({ kind: 'I', a: g.i, b: g.o, val: m.ilim, owner: g.p, role: 'pass' });
      else all.push({ kind: 'R', a: g.i, b: g.o, val: R_OPEN, owner: g.p, role: 'pass' });
    }
    for (const t of timers) {
      if (t.q) all.push({ kind: 'V', a: t.VCC, b: t.no, val: t.m.dh, owner: t.p, role: 'o' }); else all.push({ kind: 'V', a: t.no, b: t.G, val: 0.1, owner: t.p, role: 'o' });
      all.push({ kind: 'R', a: t.DIS, b: t.G, val: t.q ? R_OPEN : 10, owner: t.p, role: 'dis' });
    }
    for (const d of drv) {
      const r0 = IR2104.ron;
      all.push(d.ho ? { kind: 'R', a: d.VB, b: d.HO, val: r0, owner: d.p, role: 'ho' } : { kind: 'R', a: d.HO, b: d.VS, val: r0, owner: d.p, role: 'ho' });
      all.push(d.lo ? { kind: 'R', a: d.VC, b: d.LO, val: r0, owner: d.p, role: 'lo' } : { kind: 'R', a: d.LO, b: d.COM, val: r0, owner: d.p, role: 'lo' });
    }
    for (const u of lms) {
      if (u.on) { all.push({ kind: 'V', a: u.VI, b: u.n, val: LM2596.vsat, owner: u.p, role: 'sw' }); all.push({ kind: 'R', a: u.n, b: u.VO, val: LM2596.rsat, owner: u.p, role: 'swr' }); }
      else all.push({ kind: 'R', a: u.VI, b: u.VO, val: 1e9, owner: u.p, role: 'sw' });
    }
    for (const t of tls) {
      t.outs.forEach((o, k) => {
        if (o.on) { all.push({ kind: 'V', a: o.c, b: o.n, val: TL494.vsat, owner: t.p, role: 'q' + k }); all.push({ kind: 'R', a: o.n, b: o.e, val: TL494.rsat, owner: t.p, role: 'qr' + k }); }
        else all.push({ kind: 'R', a: o.c, b: o.e, val: R_OPEN, owner: t.p, role: 'q' + k });
      });
    }
    for (const k of relays) {
      all.push({ kind: 'R', a: k.com, b: k.nc, val: k.on ? R_OPEN : R_WIRE, owner: k.p, role: 'nc' });
      all.push({ kind: 'R', a: k.com, b: k.no, val: k.on ? R_WIRE : R_OPEN, owner: k.p, role: 'no' });
    }
    res = mna(all, nextNode);
    if (!res) return { ok: false, error: 'Two voltage sources (batteries) are connected directly in parallel or shorted by a wire. Add a resistor.' };
    const V_ = res.v;
    let changed = false;
    for (const d of diodes) {
      const vd = V_[d.a] - V_[d.b];
      if (d.on) {
        const e = findEl(res.els, d.p, d.role);
        if (e.i < -1e-12) { d.on = false; changed = true; }
        else if (d.exp && d.was) {
          // Newton update of the base current (limit the step so it can't run away)
          const ni = Math.min(Math.max(e.i, d.ib * 1e-3, 1e-12), d.ib * 1e3 + 1e-9);
          if (Math.abs(ni - d.ib) > 1e-4 * d.ib + 1e-13) { d.ib = ni; changed = true; }
        }
      }
      else if (vd > d.vf + 1e-9) { d.on = true; changed = true; }
    }
    for (const o of trans) {
      const ce = findEl(res.els, o.p, 'ce'), vce = V_[o.c] - V_[o.e];
      const ib = o.d.was ? Math.max(0, findEl(res.els, o.p, o.d.role, 'V').i) : 0;
      let ns = o.state;
      if (o.state === 'brk') { if (ce.i < 0) ns = 'off'; }
      else if (!o.d.was || ib < 1e-12) ns = vce > o.vbr ? 'brk' : 'off';
      else if (o.state === 'off') ns = 'act';
      else if (o.state === 'act' && vce < o.vsat) ns = 'sat';
      else if (o.state === 'sat' && (ce.i > o.gain * ib * (1 + 1e-9) || ce.i < 0)) ns = 'act';
      if (ns !== o.state) { o.state = ns; changed = true; }
    }
    for (const f of fets) {
      const vc = f.sign * (V_[f.g] - V_[f.s]), vds = V_[f.hi] - V_[f.lo], m = f.m, ch = findEl(res.els, f.p, 'ch');
      if (Math.abs(vc - f.vc) > 1e-7 * Math.max(1, Math.abs(vc))) { f.vc = vc; changed = true; }
      const isat = fetK(m) * Math.max(0, f.vc - m.vth) ** 2;
      // fresh = switched on in the previous iteration: other parts (e.g. a body diode still "on") get one iteration to follow
      // before a huge momentary current may push it into saturation; avalanche only once the rest has had time to settle
      let ns = f.state;
      if (f.state === 'brk') { if (ch.i < 0) ns = 'off'; }
      else if (f.vc <= m.vth) ns = vds > f.vbr && it > 40 ? 'brk' : 'off';
      else if (f.state === 'off') { ns = 'ohm'; f.fresh = true; }
      else if (f.state === 'ohm' && ch.i > isat && !f.fresh) ns = 'sat';
      else if (f.state === 'sat' && vds < isat * fetRds(m, f.vc)) ns = 'ohm';
      if (ns === f.state && f.state === 'ohm') f.fresh = false;
      if (ns !== f.state) { f.state = ns; changed = true; }
    }
    for (const z of zeners) {
      const vd = V_[z.a] - V_[z.b], e = findEl(res.els, z.p, 'main');
      let ns = z.state;
      if (z.state === 'off') { if (vd > 0.7 + 1e-9) ns = 'fwd'; else if (vd < -z.vz - 1e-9) ns = 'rev'; }
      else if (e.i < -1e-12) ns = 'off';
      if (ns !== z.state) { z.state = ns; changed = true; }
    }
    for (const o of amps) {
      const hi = V_[o.vp] - o.m.dh, lo = V_[o.vn] + o.m.dl, vo = V_[o.n], want = o.m.a * (V_[o.ip] - V_[o.in]);
      let ns = o.state;
      if (hi <= lo) ns = 'low';
      else if (o.state === 'lin') { if (vo > hi + 1e-9) ns = 'high'; else if (vo < lo - 1e-9) ns = 'low'; }
      else if (o.state === 'high') { if (want < hi) ns = want < lo ? 'low' : 'lin'; }
      else if (want > lo) ns = want > hi ? 'high' : 'lin';
      if (ns !== o.state) { o.state = ns; changed = true; }
    }
    for (const g of regs) {
      const m = g.m, j = findEl(res.els, g.p, 'pass').i, vin = V_[g.i], vo = V_[g.o], vr = V_[g.r];
      let ns = g.state;
      if (g.state === 'reg') { if (vin - vo < m.drop - 1e-9) ns = 'drop'; else if (j > m.ilim) ns = 'lim'; else if (j < -1e-6) ns = 'off'; }
      else if (g.state === 'drop') { if (vo - vr > m.vout + 1e-9) ns = 'reg'; else if (j < -1e-9) ns = 'off'; }
      else if (g.state === 'lim') { if (vo - vr > m.vout + 1e-9) ns = 'reg'; else if (vin - vo < m.drop - 1e-9) ns = 'drop'; }
      else if (vo - vr < m.vout - 1e-3 && vin - vo > 1e-3) ns = vin - vo >= m.drop ? 'reg' : 'drop';
      if (ns !== g.state) { g.state = ns; changed = true; }
    }
    // relays only switch once everything else has settled (avoids pull-in from a half-solved step)
    // 555 latch: RESET low → 0; TRIG below 1/3 → 1 (wins); THR above 2/3 → 0; otherwise keep
    for (const t of timers) {
      const vg = V_[t.G], vcc = V_[t.VCC] - vg, lo = V_[t.n13], hi = V_[t.CV];
      let q = t.q;
      if (vcc < 1 || V_[t.RST] - vg < 0.7) q = 0;
      else if (V_[t.TR] < lo) q = 1;
      else if (V_[t.TH] > hi) q = 0;
      if (q !== t.q) { t.q = q; changed = true; }
    }
    // LM2596 switch: conducts VIN → OUT only (like its built-in transistor)
    for (const u of lms) {
      let on = u.on;
      if (!u.want) on = false;
      else if (!u.on) on = V_[u.VI] - V_[u.VO] > LM2596.vsat + 1e-9;
      else if ((findEl(res.els, u.p, 'sw', 'V')?.i ?? 0) < -1e-12) on = false;
      if (on !== u.on) { u.on = on; changed = true; }
    }
    // TL494: reference follows the supply below 7 V; outputs ON while the ramp on CT is above both DTC + 0.11 V and FB − 0.7 V.
    // OUTPUT CTRL (pin 13) HIGH = push-pull (the flip-flop gives alternate cycles to Q1 / Q2), LOW = both outputs together.
    for (const t of tls) {
      const T = TL494, vg = V_[t.G], vcc = V_[t.VCC] - vg, ref = Math.min(5, Math.max(0, vcc - 2));
      if (Math.abs(ref - t.vref.val) > 1e-6) { t.vref.val = ref; t.vrt.val = ref * T.peak / 5; changed = true; }
      const vct = V_[t.CT] - vg;
      t.en = vcc >= T.vmin && !t.dis && vct > V_[t.DTC] - vg + T.dtcOff && vct > V_[t.FB] - vg - T.pwmOff;
      t.pp = V_[t.OC] - vg > 2;
      const want = t.pp ? [t.en && t.ff === 0, t.en && t.ff === 1] : [t.en, t.en];
      t.outs.forEach((o, k) => {
        let on = o.on;
        if (!want[k]) on = false;
        else if (!o.on) on = V_[o.c] - V_[o.e] > T.vsat + 1e-9;
        else if ((findEl(res.els, t.p, 'q' + k, 'V')?.i ?? 0) < -1e-12) on = false;
        if (on !== o.on) { o.on = on; changed = true; }
      });
    }
    if (!changed) for (const k of relays) {
      const rm = relayOf(k.p.props), ic = Math.abs(findEl(res.els, k.p, 'rc').i), inom = rm.vcoil / Math.max(rm.rcoil, 1e-3);
      const on = k.on ? ic >= 0.3 * inom : ic >= 0.75 * inom;
      if (on !== k.on) { k.on = on; changed = true; }
    }
    if (!changed) break;
    if (it === 249) notes.push('Some parts did not settle (diodes / transistors / op-amps flip-flopping); results are approximate.');
  }
  // per-part results
  const parts = new Map();
  for (const p of c.parts) {
    if (p.type === 'GND') continue;
    const pins = pinsOf(p).map(([x, y]) => node(x, y));
    const va = res.v[pins[0]], vb = res.v[pins[1]];
    const mine = res.els.filter(e => e.owner === p);
    let i = 0, pw = 0;
    const dead = deadFault(p);
    if (dead) {
      const m = mine.find(e => e.role === 'main'), [si2, sj] = dead === 'short' ? (FAULT_SHORT[p.type] ?? [0, 1]) : [0, 1];
      const v = res.v[pins[si2]] - res.v[pins[sj]];
      parts.set(p.id, { va, vb, v, i: m ? m.i : 0, p: m ? m.i * m.i * m.val : 0, fault: dead, dots: dead === 'short' ? [[si2, sj, m ? m.i : 0]] : [] });
      continue;
    }
    const main = mine.find(e => e.role === 'main');
    if (p.type === 'POT') {
      const aw = mine.find(e => e.role === 'aw'), wb = mine.find(e => e.role === 'wb');
      parts.set(p.id, { va, vb, vw: res.v[pins[2]], v: va - vb, iaw: aw.i, iwb: wb.i, i: aw.i, p: aw.i * aw.i * aw.val + wb.i * wb.i * wb.val });
      continue;
    }
    if (p.type === 'TB') {
      const ii = [], dots = []; let pw = 0;
      for (let k = 0; k * 2 + 1 < pins.length; k++) { const e = mine.find(x => x.role === (k ? 'w' + k : 'main')); const iv = e?.i ?? 0; ii.push(iv); pw += iv * iv * TB_RC; dots.push([2 * k, 2 * k + 1, iv]); }
      parts.set(p.id, { va, vb, v: va - vb, i: ii[0] ?? 0, ii, vw: ii.map((_, k) => res.v[pins[2 * k]]), p: pw, dots });
      continue;
    }
    if (p.type === 'SPDT' || p.type === 'DPDT') {
      const cur = (role) => mine.find(e => e.role === role)?.i ?? 0;
      const i1 = p.props.on ? cur('p1b') : cur('p1a'), i2 = p.type === 'DPDT' ? (p.props.on ? cur('p2b') : cur('p2a')) : 0;
      parts.set(p.id, { va, vb, v: 0, i: i1, i1, i2, p: 0 });
      continue;
    }
    if (p.type === 'C') {
      const s0 = st.get(p.id) ?? { v: 0 }, v = va - vb;
      const ic = sim ? (propsWithFault(p).c / sim.dt) * (v - s0.v) : 0;
      parts.set(p.id, { va, vb, v, i: ic, p: v * ic, energy: 0.5 * propsWithFault(p).c * v * v });
      continue;
    }
    if (p.type === 'L') {
      const s0 = st.get(p.id) ?? { i: 0 }, m = mine.find(e => e.role === 'main');
      const il = sim ? m.i + s0.i : m.i;
      parts.set(p.id, { va, vb, v: va - vb, i: il, p: (va - vb) * il, energy: 0.5 * p.props.l * il * il });
      continue;
    }
    if (p.type === 'XFMR') {
      const s0 = st.get(p.id) ?? { im: 0 }, g = (role) => mine.find(e => e.role === role), lm = g('lm');
      const im = sim ? lm.i + s0.im : lm.i, i1 = g('r1').i, i2 = g('r2').i, is = g('rs').i;
      const v1 = res.v[pins[0]] - res.v[pins[1]], v2 = res.v[pins[1]] - res.v[pins[2]], vs = res.v[pins[3]] - res.v[pins[4]];
      const pin = v1 * i1 + v2 * i2, pout = -vs * is;
      parts.set(p.id, { va, vb, v1, v2, vs, i1, i2, is, im, v: v1, i: i1, pin, pout, p: pin - pout, dots: [[0, 1, i1], [1, 2, i2], [3, 4, is]] });
      continue;
    }
    if (p.type === 'LOCK') {
      const s0 = st.get(p.id) ?? { i: 0 }, m = mine.find(e => e.role === 'main'), il = sim ? m.i + s0.i : m.i, inom = p.props.v / Math.max(p.props.r, 0.1);
      parts.set(p.id, { va, vb, v: va - vb, i: il, p: (va - vb) * il, open: Math.abs(il) > 0.5 * inom, inom });
      continue;
    }
    if (p.type === 'DHT' || p.type === 'HCSR04' || p.type === 'PIR') {
      const m = mine.find(e => e.role === 'main'), gi = p.type === 'HCSR04' ? 3 : 2, v = res.v[pins[0]] - res.v[pins[gi]];
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, vout: res.v[pins[1 + (p.type === 'HCSR04' ? 1 : 0)]] - res.v[pins[gi]], dots: [] });
      continue;
    }
    if (p.type === 'SR595') {
      const [, , , , , , , Gp, , MR, SH, ST, OE, SER, , Vp] = pins, g = res.v[Gp], vcc = res.v[Vp] - g, prev = st.get(p.id) ?? {};
      const hct = p.props.model === '74HCT595', hi = hct ? 2.0 : 0.7 * vcc, lo = hct ? 0.8 : 0.3 * vcc, bad = [];
      const lvl = (n, last, name) => { const v = res.v[n] - g; if (v >= hi) return 1; if (v <= lo) return 0; bad.push(name); return last; };
      const pw = vcc > 1.8, sh = lvl(SH, prev.sh ?? 0, 'SRCLK'), stc = lvl(ST, prev.stc ?? 0, 'RCLK'), mr = lvl(MR, 1, 'SRCLR'), oe = lvl(OE, 0, 'OE'), ser = lvl(SER, prev.ser ?? 0, 'SER');
      let sr = prev.sr ?? 0, q = prev.q ?? 0;
      if (!pw) { sr = 0; q = 0; }
      else {
        if (stc && !prev.stc) q = sr;                         // storage clock: copies the shift register as it was before this edge
        if (!mr) sr = 0; else if (sh && !prev.sh) sr = ((sr << 1) | ser) & 0xFF;   // shift clock: QA ← SER, QB ← QA … QH' ← QH
      }
      const m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, v: vcc, i: m.i, p: vcc * m.i, sr, q, sh, stc, ser, en: pw && !oe, pw, mr, bad: pw && vcc > 2 ? bad : [], hi, lo, dots: [] });
      continue;
    }
    if (p.type === 'RMOD') {
      const [Vp, Gp, IN] = pins, g = res.v[Gp], vcc = res.v[Vp] - g, vin = res.v[IN] - g, prev = st.get(p.id);
      const drive = p.props.trig === 'high' ? vin : vcc - vin, on = vcc > 3.5 && drive > (prev?.on ? 1.6 : 2.0);   // opto LED + transistor need ≈ 2 V on IN
      const m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, v: vcc, i: m.i, p: vcc * m.i, on, vin, drive, dots: [] });
      continue;
    }
    if (p.type === 'ENC') {
      const g = res.v[pins[4]];
      parts.set(p.id, { va, vb, v: res.v[pins[3]] - g, vclk: res.v[pins[0]] - g, vdt: res.v[pins[1]] - g, vsw: res.v[pins[2]] - g, i: 0, p: 0, dots: [] });
      continue;
    }
    if (p.type === 'OLED') {
      const m = mine.find(e => e.role === 'main'), v = res.v[pins[1]] - res.v[pins[0]];
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, vsda: res.v[pins[3]] - res.v[pins[0]], vscl: res.v[pins[2]] - res.v[pins[0]], dots: [[1, 0, m.i]] });
      continue;
    }
    if (p.type === 'ADS1115') {
      // address from what ADDR is tied to: GND 0x48 (or open: pull-down), VDD 0x49, SDA 0x4A, SCL 0x4B
      const m = mine.find(e => e.role === 'main'), g = res.v[pins[1]], v = res.v[pins[0]] - g, ad = pins[4];
      const addr = ad === pins[0] ? 0x49 : ad === pins[3] ? 0x4A : ad === pins[2] ? 0x4B : 0x48;
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, addr, ain: [0, 1, 2, 3].map(k => res.v[pins[6 + k]] - g), vsda: res.v[pins[3]] - g, vscl: res.v[pins[2]] - g, dots: [[0, 1, m.i]] });
      continue;
    }
    if (p.type === 'D1SD') {
      const m = mine.find(e => e.role === 'main'), v = res.v[pins[15]] - res.v[pins[6]], v5 = res.v[pins[7]] - res.v[pins[6]];
      parts.set(p.id, { va, vb, v, v5, i: m.i, p: v * m.i, dots: [] });
      continue;
    }
    if (p.type === 'SDCARD') {
      const m = mine.find(e => e.role === 'main'), v = res.v[pins[1]] - res.v[pins[0]];
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, dots: [[1, 0, m.i]] });
      continue;
    }
    if (p.type === 'LCD') {
      const m = mine.find(e => e.role === 'main'), v = res.v[pins[1]] - res.v[pins[0]];
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, vsda: res.v[pins[2]] - res.v[pins[0]], vscl: res.v[pins[3]] - res.v[pins[0]], dots: [[1, 0, m.i]] });
      continue;
    }
    if (p.type === 'SEG7') {
      const ds = diodes.filter(d => d.p === p), segs = ds.map((d, k) => (d.on ? (mine.find(e => e.role === 'seg' + k && e.kind === 'V')?.i ?? 0) : 0));
      const vf = (LED_COLORS[p.props.color] ?? LED_COLORS.red).vf, tot = segs.reduce((x, y) => x + y, 0);
      parts.set(p.id, { va, vb, v: 0, i: tot, segs, segOn: ds.map(d => d.on), p: segs.reduce((x, y) => x + y * vf, 0), dots: [] });
      continue;
    }
    if (p.type === 'SCOPE') { parts.set(p.id, { ch1: res.v[pins[0]] - res.v[pins[2]], ch2: res.v[pins[1]] - res.v[pins[2]], v: 0, i: 0, p: 0 }); continue; }
    if (p.type === 'OPTO' || p.type === 'NPN' || p.type === 'PNP') {
      const o = trans.find(x => x.p === p), d = o.d, inV = d.on ? mine.find(e => e.role === d.role && e.kind === 'V') : null, ce = mine.find(e => e.role === 'ce');
      const iin = inV ? inV.i : 0, ic = ce.kind === 'F' ? ce.i : ce.i, state = d.on || o.state === 'brk' ? o.state : 'off';
      if (p.type === 'OPTO') {
        const vce = res.v[pins[2]] - res.v[pins[3]];
        parts.set(p.id, { va, vb, v: va - vb, i: iin, ifw: iin, ic, vce, state, on: d.on, p: (va - vb) * iin + vce * ic, dots: [[0, 1, iin], [2, 3, ic]] });
      } else {
        const npn = p.type === 'NPN', sg = npn ? 1 : -1, vbe = sg * (res.v[pins[0]] - res.v[pins[2]]), vce = sg * (res.v[pins[1]] - res.v[pins[2]]);   // PNP: Veb, Vec
        // ib: into the base (NPN) / out of the base (PNP); ic: into collector (NPN) / out of collector (PNP), both shown positive when working normally
        parts.set(p.id, { va, vb, vbe, vce, ib: iin, ic, ie: iin + ic, state, on: d.on, v: vce, i: ic, p: Math.abs(vbe * iin) + Math.abs(vce * ic),
          dots: npn ? [[0, 2, iin], [1, 2, ic]] : [[2, 0, iin], [2, 1, ic]] });
      }
      continue;
    }
    if (p.type === 'NMOS' || p.type === 'PMOS') {
      const f = fets.find(x => x.p === p), ch = mine.find(e => e.role === 'ch'), body = diodes.find(x => x.p === p), bel = mine.find(e => e.role === 'body');
      const ich = ch.kind === 'G' ? ch.val + ch.gain * (res.v[ch.gp] - res.v[ch.gn]) : ch.i;
      const ib = body.on ? bel.i : 0, id = ich - ib;             // channel current (D→S for N, S→D for P), minus body diode
      const vgs = f.sign * (res.v[pins[0]] - res.v[pins[2]]), vds = f.sign * (res.v[pins[1]] - res.v[pins[2]]);   // PMOS: Vsg, Vsd
      const rds = f.state === 'ohm' ? fetRds(f.m, f.vc) : null;
      parts.set(p.id, { va, vb, vgs, vds, id, state: f.state, body: body.on, rds, v: vds, i: id, p: Math.abs((res.v[f.hi] - res.v[f.lo]) * id),
        dots: p.type === 'NMOS' ? [[1, 2, id]] : [[2, 1, id]] });
      continue;
    }
    if (p.type === 'ZD') {
      const z = zeners.find(x => x.p === p), e = mine.find(x => x.role === 'main');
      const iz = z.state === 'fwd' ? e.i : z.state === 'rev' ? -e.i : e.i;
      parts.set(p.id, { va, vb, v: va - vb, i: iz, p: Math.abs((va - vb) * iz), state: z.state, on: z.state !== 'off' });
      continue;
    }
    if (p.type === 'OPAMP') {
      const o = amps.find(x => x.p === p), ro = mine.find(e => e.role === 'rout');
      const vout = res.v[pins[2]], iout = ro.i, vsup = res.v[pins[3]] - res.v[pins[4]];
      parts.set(p.id, { va, vb, vout, vdiff: va - vb, iout, vsup, state: o.state, v: vout, i: iout, p: o.m.iq * vsup + Math.abs(iout) * (iout > 0 ? res.v[pins[3]] - vout : vout - res.v[pins[4]]), dots: [] });
      continue;
    }
    if (p.type === 'REG') {
      const g = regs.find(x => x.p === p), e = mine.find(x => x.role === 'pass');
      const j = e.kind === 'I' ? e.val : e.i, vin = res.v[pins[0]], vout = res.v[pins[1]], vref = res.v[pins[2]], iq = (g.m.iq ?? 0) + (g.m.iadj ?? 0);
      const gr = g.m.adj ? 0 : vref;
      parts.set(p.id, { va, vb, vin: vin - gr, vout: vout - gr, vadj: vout - vref, vio: vin - vout, iin: j + iq, iout: j, state: g.state, v: vout - gr, i: j, p: (vin - vout) * j + (vin - vref) * iq, dots: [] });
      continue;
    }
    if (p.type === 'SERVO') {
      // pulse width = time the signal is high, added up step by step (a step that is partly high counts partly)
      const m = SERVOS[p.props.model] ?? SERVOS.SG90, prev = st.get(p.id) ?? { ang: 90, tgt: 90, acc: 0, hi: 0, vh: 0, w: null };
      const vg = res.v[pins[2]], vs = res.v[pins[0]] - vg, vcc = res.v[pins[1]] - vg, load = mine.find(e => e.role === 'load');
      let { ang, tgt, acc, hi, vh, w } = prev;
      if (sim) {
        vh = Math.max(vh * 0.9999, vs);
        const fr = vh > 1.2 ? Math.max(0, Math.min(1, vs / vh)) : 0, now = fr > 0.02 ? 1 : 0;
        if (now) acc += fr * sim.dt;
        if (!now && hi) { const pw = acc; if (pw > 0.3e-3 && pw < 3e-3) { w = pw; tgt = Math.max(0, Math.min(180, (pw - 0.5e-3) / 2e-3 * 180)); } acc = 0; }
        if (!now) acc = 0;
        hi = now;
        if (vcc >= m.vmin * 0.9) { const stp = m.speed * sim.dt; ang = Math.abs(tgt - ang) <= stp ? tgt : ang + Math.sign(tgt - ang) * stp; }
      }
      parts.set(p.id, { va, vb, vsig: vs, vcc, icc: load.i, ang, tgt, w, moving: Math.abs(tgt - ang) > 0.5, v: vcc, i: load.i, p: vcc * load.i, acc, hi, vh, dots: [] });
      continue;
    }
    if (p.type === 'BYJ') {
      const prev = st.get(p.id) ?? { idx: -1, hs: 0, last: null, rate: 0, k: 0, dir: 0, w0: null, h0: 0 }, g = res.v[pins[5]], vcc = res.v[pins[4]] - g;
      const bits = [0, 1, 2, 3].reduce((s, i) => s | (res.v[pins[i]] - g > 1.8 ? 1 << i : 0), 0), k = [0, 1, 2, 3].filter(i => bits & (1 << i)).length;
      let { idx, hs, last, rate, dir, w0, h0 } = prev; const t = sim ? sim.t : 0, now = vcc > 4 ? (BYJ_SEQ[bits] ?? -1) : -1;
      if (sim && now >= 0 && idx >= 0 && now !== idx) {
        const d = (now - idx + 8) % 8, mv = d <= 3 ? d : d >= 5 ? d - 8 : 0;     // 4 half-steps away: can't tell the direction, the real motor just shakes
        if (mv) {   // speed = half-steps counted over ≥ 0.25 s (single steps land on circuit time steps, so one gap alone is jumpy)
          if (Math.sign(mv) !== dir || last == null || t - last > 0.5) { w0 = t; h0 = hs; }
          hs += mv; dir = Math.sign(mv); last = t;
          if (t - w0 >= 0.25) { rate = Math.abs(hs - h0) / (t - w0); w0 = t; h0 = hs; }
        }
      }
      if (now >= 0) idx = now;
      if (sim && last != null && t - last > 0.5) rate = 0;
      const m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, idx, hs, last, rate, dir, w0, h0, k: vcc > 4 ? k : 0, bits, vcc, ang: ((hs * 360 / 4096) % 360 + 360) % 360, rpm: rate * 60 / 4096 * dir, v: vcc, i: m.i, p: vcc * m.i, dots: [] });
      continue;
    }
    if (p.type === 'ACS712') {
      const g = res.v[pins[2]], s = mine.find(e => e.role === 'sense'), vcc = res.v[pins[0]] - g, vout = res.v[pins[1]] - g, m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, i: s.i, isens: s.i, vcc, vout, v: vcc, p: vcc * m.i + s.i * s.i * 0.0012, icc: m.i, dots: [[3, 4, s.i]] });
      continue;
    }
    if (p.type === 'INA219') {
      const g = res.v[pins[1]], vcc = res.v[pins[0]] - g, sh = mine.find(e => e.role === 'shunt'), m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, v: vcc, i: m.i, p: vcc * m.i, vbus: res.v[pins[5]] - g, vshunt: res.v[pins[4]] - res.v[pins[5]], ishunt: sh.i, addr: p.props.addr ?? 0x40, dots: [[4, 5, sh.i]] });
      continue;
    }
    if (p.type === 'DS3231') {
      const g = res.v[pins[5]], vcc = res.v[pins[4]] - g, m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, v: vcc, i: m.i, p: vcc * m.i, dots: [] });
      continue;
    }
    if (p.type === 'PV') {
      const v = res.v[pins[0]] - res.v[pins[1]], ph = mine.find(e => e.role === 'ph'), sh = mine.find(e => e.role === 'sh'), kn = mine.find(e => e.role === 'knee');
      const iout = ph.i - sh.i - (kn ? Math.max(0, kn.i) : 0), m = PANELS[p.props.model] ?? PANELS['100W'], G = Math.max(0, (p.props.sun ?? 100) / 100);
      parts.set(p.id, { va, vb, v, i: iout, p: v * iout, pmax: m.vmp * m.imp * G, on: diodes.find(x => x.p === p)?.on ?? false, dots: [[1, 0, iout]] });
      continue;
    }
    if (p.type === 'SCC') {
      const q = p.props, b = SCC_BATS[q.bat] ?? SCC_BATS.lfp12, prev = st.get(p.id) ?? {}, g = res.v[pins[1]];
      const vpv = res.v[pins[0]] - g, vbat = res.v[pins[2]] - g, chg = mine.find(e => e.role === 'chg'), pvin = mine.find(e => e.role === 'pvin'), ld = mine.find(e => e.role === 'load');
      const ipv = q.mode === 'mppt' ? (pvin ? Math.max(0, pvin.i) : 0) : Math.max(0, chg.i), ppv = vpv * ipv;
      let stage = prev.stage ?? 'sleep', vref = prev.vref ?? vpv * 0.8, dir = prev.dir ?? -1, iout = prev.iout ?? 0, load = prev.load ?? true, tAbs = prev.tAbs ?? 0, vopen = prev.vopen ?? 0;
      const ichg = q.mode === 'mppt' ? (stage === 'sleep' || stage === 'nobat' ? 0 : iout) : chg.i;
      if (sim) {
        if (vbat < 0.6 * b.lvd) stage = 'nobat';
        else if (stage === 'sleep' || stage === 'nobat') { vopen = vpv; if (vpv > vbat + 1) { stage = 'bulk'; vref = Math.max(vbat + 1, vpv * 0.8); iout = 0; } }
        else if (q.mode === 'pwm') {
          if (chg.i < -0.01 || (stage === 'bulk' && vpv < vbat + 0.05 && chg.i < 0.02)) stage = 'sleep';
          else if (vbat >= b.abs && stage === 'bulk') { stage = 'absorb'; iout = Math.max(0, chg.i); }
          else if (stage !== 'bulk') { iout = Math.max(0.02 * q.imax, iout * 0.995); if (vbat < b.flt - 0.2) stage = 'bulk'; }
        } else {
          if (pvin && pvin.i < -0.02) { vref += 0.4; dir = 1; }                        // above the panel's open voltage: back off
          else { if (ppv < (prev.ppv ?? 0) - 1e-3) dir = -dir; vref += dir * Math.max(0.05, 0.004 * vref); }
          vref = Math.max(vbat + 1, Math.min(vref, 1.2 * (prev.vopen || vref + 5)));
          if (ppv < 0.2 && ipv < 0.01 && (prev.lowN ?? 0) > 50) { stage = 'sleep'; iout = 0; }
          let want = Math.min(q.imax, 0.96 * Math.max(0, ppv) / Math.max(vbat, 1));
          if (vbat >= b.abs) { stage = 'absorb'; tAbs += sim.dt; want = Math.min(want, Math.max(0.02 * q.imax, iout * 0.995)); }
          else if (stage === 'absorb' && vbat < b.flt - 0.2) stage = 'bulk';
          iout = want;
        }
        if (load && vbat < b.lvd) load = false; else if (!load && vbat > b.lvr) load = true;
      }
      const lowN = ppv < 0.2 ? (prev.lowN ?? 0) + 1 : 0;
      parts.set(p.id, { va, vb, vpv, ipv, ppv, vbat, ichg, pchg: vbat * ichg, stage, vref, dir, iout, load, tAbs, vopen, lowN, iload: ld.i, mode: q.mode,
        v: vbat, i: ichg, p: Math.max(0, ppv - vbat * ichg), dots: [] });
      continue;
    }
    if (p.type === 'STEPPER') {
      const pr2 = p.props, prev = st.get(p.id) ?? { ang: 0, lvl: 0, n: 0, en: true, last: null, rate: 0 };
      const vg = res.v[pins[4]], vdd = res.v[pins[3]] - vg, vmot = res.v[pins[5]] - vg, thr = 0.7 * Math.max(vdd, 1);
      const stepHi = res.v[pins[0]] - vg > thr ? 1 : 0, dirHi = res.v[pins[1]] - vg > thr, en = !(res.v[pins[2]] - vg > thr) && vdd > 3 && vmot > (DRIVERS[pr2.drv] ?? DRIVERS.A4988).vmin;
      let { ang, lvl, n, last, rate } = prev; const t = sim ? sim.t : 0;
      if (sim && en && stepHi && !lvl) {
        const d = (dirHi ? 1 : -1) * 360 / pr2.steps / pr2.micro; ang = ((ang + d) % 360 + 360) % 360; n += dirHi ? 1 : -1;
        if (last != null) rate = 1 / Math.max(1e-6, t - last); last = t;
      }
      if (sim && last != null && t - last > 0.5) rate = 0;
      const im = mine.find(e => e.role === 'vmot');
      parts.set(p.id, { va, vb, ang, lvl: stepHi, n, last, rate, en, dir: dirHi, vdd, vmot, imot: im.i, rpm: rate * 60 / pr2.steps / pr2.micro * (dirHi ? 1 : -1), v: vmot, i: im.i, p: vmot * im.i, dots: [] });
      continue;
    }
    if (isBoard(p.type)) {
      const B = BOARDS[p.type], gi = B.pins.findIndex(q => q.k === 'gnd'), vg = res.v[pins[gi]], out = {};
      let pw = 0;
      B.pins.forEach((q, i) => {
        if (q.k === 'gnd') return;
        const e = mine.find(x => x.role === 'pin:' + q.n), v = res.v[pins[i]] - vg, cur = e ? e.i : 0;
        out[q.n] = { v, i: cur, mode: q.k === 'gpio' ? (p.props.pins?.[q.n]?.mode ?? 'in') : q.k };
        if (q.k === 'pwr' || (q.k === 'gpio' && /high|pwm/.test(out[q.n].mode))) pw += Math.max(0, cur) * Math.max(0, v);
      });
      const vcc = mine.find(x => x.role === 'vcc');
      parts.set(p.id, { va, vb, pins: out, v: 0, i: 0, p: pw, isrc: vcc ? -vcc.i : 0, dots: [] });
      continue;
    }
    if (p.type === 'T555') {
      const t = timers.find(x => x.p === p), ro = mine.find(e => e.role === 'rout'), dis = mine.find(e => e.role === 'dis'), o = mine.find(e => e.role === 'o');
      const vg = res.v[t.G], vcc = res.v[t.VCC] - vg;
      const pw = Math.abs(o.i * o.val) + vcc * vcc / (12 / t.m.iq) + Math.abs(ro.i) * Math.abs(ro.i) * ro.val + (t.q ? 0 : dis.i * dis.i * dis.val);
      parts.set(p.id, { va, vb, q: t.q, vcc, vout: res.v[t.OUT] - vg, iout: ro.i, vtrig: res.v[t.TR] - vg, vthr: res.v[t.TH] - vg, vlo: res.v[t.n13] - vg, vhi: res.v[t.CV] - vg, idis: t.q ? 0 : dis.i, v: res.v[t.OUT] - vg, i: ro.i, p: pw, dots: [] });
      continue;
    }
    if (p.type === 'IR2104') {
      const d = drv.find(x => x.p === p), vg = res.v[d.COM], g = (role) => mine.find(e => e.role === role);
      const vcc = res.v[d.VC] - vg, vbs = res.v[d.VB] - res.v[d.VS], vin = res.v[d.IN] - vg, vsd = res.v[d.SD] - vg, D = IR2104;
      parts.set(p.id, { va, vb, v: vcc, i: g('main').i, p: vcc * g('main').i, vcc, vbs, vin, vsd, ho: d.ho, lo: d.lo, dead: d.dead, iho: g('ho').i, ilo: g('lo').i,
        nin: vin > D.vih, in2: d.inn, sd: vsd > D.vih, vcok: vcc >= D.uv, vbok: vbs >= D.uvb, dots: [] });
      continue;
    }
    if (p.type === 'LM2596') {
      const L = LM2596, u = lms.find(x => x.p === p), prev = st.get(p.id) ?? {}, g = (role) => mine.find(e => e.role === role);
      const vg = res.v[u.G], vin = res.v[u.VI] - vg, vsw = res.v[u.VO] - vg, vfb = res.v[u.FB] - vg, von = res.v[u.ON] - vg;
      const isw = u.on ? g('sw').i : 0, en = vin >= L.vmin && von < L.von, nom = L.models[p.props.model] ?? 0;
      const vfbE = nom ? vfb * L.vref / nom : vfb;                       // fixed versions divide the output inside
      let duty = prev.duty ?? 0, swA = prev.swA ?? 0, fbA = prev.fbA ?? 0, inA = prev.inA ?? 0, lossA = prev.lossA ?? 0, oc = prev.oc ?? null, ocN = prev.ocN ?? 0;
      if (sim) {
        const a = Math.min(1, sim.dt * L.f / 3);                         // ≈ 3-cycle averages
        swA += a * (vsw - swA); fbA += a * (vfbE - fbA); inA += a * (isw - inA); lossA += a * (Math.max(0, vin - vsw) * isw - lossA);
        if (isw > L.ilim) { oc = u.cyc; ocN = 1; } else ocN = Math.max(0, ocN - a / 3);
        if (!en) duty = 0;
        else {
          // integrator: crossover ≈ 100 Hz whatever Vin / Vout are (k = how much of the output reaches FB)
          const k = Math.min(1, Math.max(0.03, fbA / Math.max(swA, 0.5))), ki = 2 * Math.PI * L.fc / (Math.max(vin, 1) * k);
          duty = Math.min(1, Math.max(0, duty + ki * (L.vref - vfbE) * sim.dt));
        }
      }
      parts.set(p.id, { va, vb, v: vin, i: g('main').i, p: lossA + vin * g('main').i, vin, vsw, vfb, von, en, duty, on: u.on, isw, iavg: inA, swA, fbA, inA, lossA, oc, ocN, ocl: ocN > 0.05, nom, cyc: u.cyc, nOn: u.nOn, acc: u.acc, dots: [] });
      continue;
    }
    if (p.type === 'TL494') {
      const T = TL494, t = tls.find(x => x.p === p), vg = res.v[t.G], vcc = res.v[t.VCC] - vg, g = (role) => mine.find(e => e.role === role);
      const prev = st.get(p.id) ?? {}, vct = res.v[t.CT] - vg, peak = t.vrt.val, irt = -(g('rt')?.i ?? 0), iref = -(g('ref')?.i ?? 0);
      const ic = t.outs.map((o, k) => (o.on ? g('q' + k).i : 0));
      // oscillator: start discharging at the peak (the flip-flop toggles), back to charging near 0 V. Pulse widths are added up per cycle.
      let dis = t.dis, ff = t.ff, tl = prev.tl ?? null, per = prev.per ?? null, v0 = 0, acc = prev.acc ? [...prev.acc] : [0, 0], w = prev.w ? prev.w.map(x => [...x]) : [[0, 0], [0, 0]];
      if (sim) {
        t.outs.forEach((o, k) => { if (o.on) acc[k] += sim.dt; });
        if (dis) dis = false;                                       // the reset takes one step (outputs off: part of the dead time)
        else if (vcc >= T.vmin && peak > 0.5 && vct >= peak) {
          // the ramp crossed the peak inside this step: find when (straight line), so the period comes out exact
          const slope = prev.vct != null && vct > prev.vct ? (vct - prev.vct) / sim.dt : 0, tc = slope ? sim.t - (vct - peak) / slope : sim.t;
          dis = true; ff ^= 1; v0 = Math.min(peak, Math.max(0, (sim.t + sim.dt - tc) * slope));
          if (tl != null) per = tc - tl;
          tl = tc; w = [[acc[0], w[0][0]], [acc[1], w[1][0]]]; acc = [0, 0];
        }
        const est = per ? 1 / per : (prev.vct != null && vct > prev.vct && peak > 0.5 ? (vct - prev.vct) / sim.dt / peak : 0);
        if (est) TL_F.set(p.id, est);
      }
      const duty = per ? w.map(x => Math.min(1, t.pp ? (x[0] + x[1]) / (2 * per) : x[0] / per)) : null;
      const pw = vcc * g('main').i + ic.reduce((s2, x) => s2 + Math.abs(x) * (T.vsat + Math.abs(x) * T.rsat), 0) + Math.max(0, iref) * Math.max(0, vcc - 5);
      parts.set(p.id, { va, vb, v: vcc, i: g('main').i, p: pw, vcc, vref: res.v[t.REF] - vg, iref, vct, peak, vdtc: res.v[t.DTC] - vg, vfb: res.v[t.FB] - vg, irt,
        q: t.outs.map(o => o.on), ic, pp: t.pp, f: per ? 1 / per : null, per, duty, dis, v0, ff, tl, acc, w, ev: t.ea.map((x, k) => {
          const d = res.v[x.ip] - res.v[x.in], top = Math.max(0, vcc - T.ea.dh), w = 2 * Math.PI * T.ea.gbw;
          const v = sim ? t.ev[k] + sim.dt * w * (d - t.ev[k] / T.ea.a) : T.ea.a * d;
          return Math.min(top, Math.max(0, v));
        }), on: vcc >= T.vmin, dots: [] });
      continue;
    }
    if (p.type === 'RELAY') {
      const k = relays.find(x => x.p === p), rc = mine.find(e => e.role === 'rc'), nc = mine.find(e => e.role === 'nc'), no = mine.find(e => e.role === 'no');
      const ic = rc.i, icon = k.on ? no.i : nc.i;
      parts.set(p.id, { va, vb, v: va - vb, i: ic, icoil: ic, on: k.on, icon, p: ic * ic * rc.val, dots: [[0, 1, ic], k.on ? [2, 4, no.i] : [2, 3, nc.i]] });
      continue;
    }
    i = main ? main.i : 0;
    pw = mine.reduce((s, e) => s + (e.kind === 'R' ? e.i * e.i * e.val : e.kind === 'V' ? e.val * e.i : e.val * (res.v[e.a] - res.v[e.b])), 0);
    const d = diodes.find(x => x.p === p);
    parts.set(p.id, { va, vb, v: va - vb, i, p: pw, on: d ? d.on : undefined });
  }
  for (const p of c.parts) if (p.type === 'BAT' && Math.abs(parts.get(p.id).i) > 50) notes.push(`SHORT CIRCUIT: ${p.name} is shorted (${Math.abs(parts.get(p.id).i).toFixed(0)} A). Real batteries get hot, wires melt, fuses blow.`);
  const wires = pieces.map((w, k) => ({ ...w, i: res.els.find(e => e.role === 'wire' + k).i, va: res.v[node(w.x1, w.y1)], vb: res.v[node(w.x2, w.y2)] }));
  const vAt = (x, y) => { const k = key(x, y); if (gkeys.has(k)) return 0; const n = nodeOf.get(k); return n == null ? null : res.v[n]; };
  const sources = c.parts.filter(p => p.type === 'BAT' || p.type === 'ISRC' || p.type === 'SIG');
  const delivered = sources.reduce((s, p) => s - parts.get(p.id).p, 0) + c.parts.filter(p => isBoard(p.type)).reduce((s, p) => s + parts.get(p.id).p, 0);
  // state to carry into the next time step
  const next = new Map();
  for (const p of c.parts) {
    const r = parts.get(p.id); if (!r || r.fault) continue;
    if (p.type === 'C') next.set(p.id, { v: r.v });
    else if (p.type === 'L') next.set(p.id, { i: r.i });
    else if (p.type === 'XFMR') next.set(p.id, { im: r.im });
    else if (p.type === 'LOCK') next.set(p.id, { i: r.i });
    else if (p.type === 'LED' || p.type === 'D') next.set(p.id, { on: r.on });
    else if (p.type === 'OPTO' || p.type === 'NPN' || p.type === 'PNP') { const o = trans.find(x => x.p === p); next.set(p.id, { on: o.d.on, ts: o.state, ib: o.d.ib }); }
    else if (p.type === 'NMOS' || p.type === 'PMOS') { const f = fets.find(x => x.p === p); next.set(p.id, { ts: f.state, vc: f.vc, bon: diodes.find(x => x.p === p).on }); }
    else if (p.type === 'ZD') next.set(p.id, { zs: r.state });
    else if (p.type === 'OPAMP') next.set(p.id, { os: r.state });
    else if (p.type === 'REG') next.set(p.id, { rs: r.state });
    else if (p.type === 'RELAY') next.set(p.id, { i: r.icoil, on: r.on });
    else if (p.type === 'T555') next.set(p.id, { q: r.q });
    else if (p.type === 'IR2104') next.set(p.id, { in: r.nin, in2: r.in2, sd: r.sd, vcok: r.vcok, vbok: r.vbok });
    else if (p.type === 'LM2596') next.set(p.id, { duty: r.duty, on: r.on, en: r.en, swA: r.swA, fbA: r.fbA, inA: r.inA, lossA: r.lossA, oc: r.oc, ocN: r.ocN, cyc: r.cyc, nOn: r.nOn, acc: r.acc });
    else if (p.type === 'TL494') next.set(p.id, { vref: tls.find(x => x.p === p).vref.val, dis: r.dis, v0: r.v0, ff: r.ff, tl: r.tl, per: r.per, acc: r.acc, w: r.w, o: r.q, ev: r.ev, vct: r.vct });
    else if (p.type === 'SR595') next.set(p.id, { sr: r.sr, q: r.q, sh: r.sh, stc: r.stc, ser: r.ser, en: r.en, pw: r.pw });
    else if (p.type === 'RMOD') next.set(p.id, { on: r.on });
    else if (p.type === 'SEG7') next.set(p.id, { segOn: r.segOn });
    else if (p.type === 'SERVO') next.set(p.id, { ang: r.ang, tgt: r.tgt, acc: r.acc, hi: r.hi, vh: r.vh, w: r.w, moving: r.moving });
    else if (p.type === 'BYJ') next.set(p.id, { idx: r.idx, hs: r.hs, last: r.last, rate: r.rate, k: r.k, dir: r.dir, w0: r.w0, h0: r.h0 });
    else if (p.type === 'PV') next.set(p.id, { on: r.on });
    else if (p.type === 'SCC') next.set(p.id, { stage: r.stage, vref: r.vref, dir: r.dir, iout: r.iout, load: r.load, tAbs: r.tAbs, vopen: r.vopen, vbat: r.vbat, ppv: r.ppv, lowN: r.lowN });
    else if (p.type === 'STEPPER') next.set(p.id, { ang: r.ang, lvl: r.lvl, n: r.n, en: r.en, last: r.last, rate: r.rate });
  }
  return { ok: true, parts, wires, vAt, notes, delivered, nodes: nextNode, next, t: sim?.t ?? 0 };
}

// Modified Nodal Analysis with a tiny conductance to ground on every node (so open parts never make it unsolvable)
function mna(els, nNodes) {
  // R: resistor · I: current a→b · V: v(a) − v(b) − gain·(v(gp) − v(gn)) = val, its current flows ca→cb (default a→b)
  // F: current val × (current of V element ctrl), a→b · G: current val + gain·(v(gp) − v(gn)), a→b
  const vs = els.filter(e => e.kind === 'V');
  const vIdx = new Map(vs.map((e, k) => [e, k]));
  const N = nNodes - 1, M = N + vs.length;
  const A = Array.from({ length: M }, () => new Float64Array(M)), z = new Float64Array(M);
  const r = n => n - 1;
  for (let k = 0; k < N; k++) A[k][k] += G_MIN;
  for (const e of els) {
    const ia = r(e.a), ib = r(e.b);
    if (e.kind === 'R') {
      const g = 1 / e.val;
      if (ia >= 0) A[ia][ia] += g; if (ib >= 0) A[ib][ib] += g;
      if (ia >= 0 && ib >= 0) { A[ia][ib] -= g; A[ib][ia] -= g; }
    } else if (e.kind === 'I') { if (ia >= 0) z[ia] -= e.val; if (ib >= 0) z[ib] += e.val; }
    else if (e.kind === 'G') {
      const ip = r(e.gp), im = r(e.gn);
      for (const [row, sg] of [[ia, 1], [ib, -1]]) { if (row < 0) continue; if (ip >= 0) A[row][ip] += sg * e.gain; if (im >= 0) A[row][im] -= sg * e.gain; }
      if (ia >= 0) z[ia] -= e.val; if (ib >= 0) z[ib] += e.val;
    } else if (e.kind === 'F') {
      const col = N + vIdx.get(e.ctrl);
      if (ia >= 0) A[ia][col] += e.val; if (ib >= 0) A[ib][col] -= e.val;
    }
  }
  vs.forEach((e, k) => {
    const c = N + k, ia = r(e.a), ib = r(e.b), ca = r(e.ca ?? e.a), cb = r(e.cb ?? e.b);
    if (ca >= 0) A[ca][c] += 1; if (cb >= 0) A[cb][c] -= 1;
    if (ia >= 0) A[c][ia] += 1; if (ib >= 0) A[c][ib] -= 1;
    if (e.gain) { const ip = r(e.gp), im = r(e.gn); if (ip >= 0) A[c][ip] -= e.gain; if (im >= 0) A[c][im] += e.gain; }
    z[c] = e.val;
  });
  const x = gauss(A, z);
  if (!x) return null;
  const v = new Float64Array(nNodes); for (let k = 0; k < N; k++) v[k + 1] = x[k];
  const out = els.map(e => {
    let i;
    if (e.kind === 'R') i = (v[e.a] - v[e.b]) / e.val;
    else if (e.kind === 'I') i = e.val;
    else if (e.kind === 'V') i = x[N + vIdx.get(e)];
    else if (e.kind === 'F') i = e.val * x[N + vIdx.get(e.ctrl)];
    else i = e.val + e.gain * (v[e.gp] - v[e.gn]);
    return { ...e, i };
  });
  return { v, els: out };
}
function gauss(A0, z0) {
  const n = z0.length, A = A0.map(r => Float64Array.from(r)), z = Float64Array.from(z0);
  for (let c = 0; c < n; c++) {
    let p = c; for (let k = c + 1; k < n; k++) if (Math.abs(A[k][c]) > Math.abs(A[p][c])) p = k;
    if (Math.abs(A[p][c]) < 1e-18) return null;
    [A[c], A[p]] = [A[p], A[c]]; [z[c], z[p]] = [z[p], z[c]];
    for (let k = c + 1; k < n; k++) { const f = A[k][c] / A[c][c]; if (!f) continue; for (let j = c; j < n; j++) A[k][j] -= f * A[c][j]; z[k] -= f * z[c]; }
  }
  const x = new Float64Array(n);
  for (let c = n - 1; c >= 0; c--) { let s = z[c]; for (let j = c + 1; j < n; j++) s -= A[c][j] * x[j]; x[c] = s / A[c][c]; }
  return x;
}

// ---------- examples ----------
// Learn → Arduino code lessons: each runs on the same lab circuit (example('lesson1') … example('lesson9'))
export const CODE_LESSONS = {
 "lesson1": "// Lesson 1: the shape of every Arduino program + printing to the console\nint count = 0;             // whole number (global: kept from one loop() to the next)\nfloat volts = 3.3;         // number with decimals\nbool ready = true;         // true / false\nString name = \"Fox9ner\";   // text\n\nvoid setup() {             // runs ONE time, at power-up or reset\n  Serial.begin(115200);    // open the console: Serial Monitor at 115200 baud\n  Serial.println(\"Hello from \" + name);\n  Serial.print(\"volts = \");\n  Serial.println(volts, 2);          // 2 decimals -> 3.30\n  float half = volts / 2;            // math: + - * /\n  Serial.print(\"half  = \");\n  Serial.println(half, 3);           // 1.650\n  if (ready) Serial.println(\"ready is true\");\n}\n\nvoid loop() {              // runs again and again, forever\n  count = count + 1;       // same as count++\n  Serial.print(\"loop #\");\n  Serial.print(count);\n  if (count % 2 == 0) {    // % = remainder: even numbers leave 0\n    Serial.println(\"  even\");\n  } else {\n    Serial.println(\"  odd\");\n  }\n  if (count == 5) {\n    Serial.print(\"squares: \");\n    for (int i = 1; i <= 5; i++) {   // start ; keep going while true ; step\n      Serial.print(i * i);\n      Serial.print(\" \");\n    }\n    Serial.println();\n  }\n  delay(1000);             // wait 1000 ms = 1 s\n}\n",
 "lesson2": "// Lesson 2: digital OUTPUT (pin = 0 V or 3.3 V)\nconst int LED1 = 23;       // red LED (through 330 ohm)\nconst int LED2 = 22;       // green LED\nbool redOn = false;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED1, OUTPUT);   // OUTPUT: the pin drives something\n  pinMode(LED2, OUTPUT);\n  digitalWrite(LED2, LOW); // start with green off\n}\n\nvoid loop() {\n  redOn = !redOn;                        // ! = NOT: flips true <-> false\n  digitalWrite(LED1, redOn ? HIGH : LOW);\n  digitalWrite(LED2, redOn ? LOW : HIGH);  // green is always the opposite\n  Serial.print(\"D23 = \");\n  Serial.print(redOn ? \"HIGH (3.3 V)\" : \"LOW (0 V)\");\n  Serial.print(\"   D22 = \");\n  Serial.println(redOn ? \"LOW (0 V)\" : \"HIGH (3.3 V)\");\n  delay(1000);\n}\n",
 "lesson3": "// Lesson 3: digital INPUT with the internal pull-up (button to GND)\nconst int BTN = 15;\nconst int LED1 = 23;\nint lastState = HIGH;      // not pressed = HIGH (the pull-up holds it at 3.3 V)\nint presses = 0;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(BTN, INPUT_PULLUP);  // input + ~45 k resistor to 3.3 V inside the chip\n  pinMode(LED1, OUTPUT);\n  delay(50);                   // let the pull-up settle before the first read\n  lastState = digitalRead(BTN);\n  Serial.println(\"Hold BTN (on the drawing or in its panel)\");\n}\n\nvoid loop() {\n  int state = digitalRead(BTN);     // HIGH (1) or LOW (0)\n  bool pressed = (state == LOW);    // button to GND: pressed = LOW\n  digitalWrite(LED1, pressed ? HIGH : LOW);\n\n  if (state != lastState) {         // it changed: an \"edge\"\n    if (pressed) {\n      presses++;\n      Serial.print(\"pressed!  total = \");\n      Serial.println(presses);\n    } else {\n      Serial.println(\"released\");\n    }\n    lastState = state;\n    delay(30);                      // debounce: real contacts bounce for a few ms\n  }\n  delay(5);\n}\n",
 "lesson4": "// Lesson 4: analog INPUT (read a voltage 0 ... 3.3 V)\nconst int POT = 34;        // ADC1 pin: works while WiFi is on (ADC2 pins don't)\n\nvoid setup() {\n  Serial.begin(115200);\n  analogReadResolution(12);         // 12 bits -> 0 ... 4095 (ESP32 default)\n}\n\nvoid loop() {\n  int raw = analogRead(POT);                 // 0 ... 4095\n  float volts = raw * 3.3 / 4095;            // scale the number to volts\n  int percent = map(raw, 0, 4095, 0, 100);   // map(value, fromLow, fromHigh, toLow, toHigh)\n  int mv = analogReadMilliVolts(POT);        // ESP32 only: already in mV\n\n  Serial.print(\"raw \");  Serial.print(raw);\n  Serial.print(\"  = \");  Serial.print(volts, 2);  Serial.print(\" V\");\n  Serial.print(\"  = \");  Serial.print(percent);   Serial.print(\" %\");\n  Serial.print(\"  (\");   Serial.print(mv);        Serial.println(\" mV)\");\n\n  if (volts > 2.5) {\n    Serial.println(\"   -> HIGH zone (over 2.5 V)\");\n  } else if (volts < 0.8) {\n    Serial.println(\"   -> LOW zone (under 0.8 V)\");\n  }\n  delay(500);\n}\n",
 "lesson5": "// Lesson 5: PWM = \"analog write\" (fast on/off, the AVERAGE is the analog value)\nconst int LED2 = 22;       // green LED\nconst int POT = 34;\n\nvoid setup() {\n  Serial.begin(115200);\n  ledcAttach(LED2, 1000, 8);   // ESP32 core 3.x: pin, 1000 Hz, 8 bits -> duty 0 ... 255\n  // (core 2.x: ledcSetup(0, 1000, 8); ledcAttachPin(LED2, 0); ledcWrite(0, duty);)\n  Serial.println(\"fade up:\");\n  for (int duty = 0; duty <= 255; duty += 51) {\n    ledcWrite(LED2, duty);\n    Serial.print(\"  duty \"); Serial.print(duty);\n    Serial.print(\" = \");     Serial.print(duty * 100.0 / 255, 0);\n    Serial.println(\" % ON time\");\n    delay(400);\n  }\n  Serial.println(\"now turn the pot:\");\n}\n\nvoid loop() {\n  int raw = analogRead(POT);              // 0 ... 4095 (12 bit)\n  int duty = map(raw, 0, 4095, 0, 255);   // squeeze 12 bit into 8 bit\n  ledcWrite(LED2, duty);\n  float avg = duty * 3.3 / 255;           // average voltage of the pin\n  Serial.print(\"pot \");     Serial.print(raw);\n  Serial.print(\" -> duty \"); Serial.print(duty);\n  Serial.print(\" -> avg \");  Serial.print(avg, 2);\n  Serial.println(\" V\");\n  delay(500);\n}\n",
 "lesson6": "// Lesson 6: real analog OUTPUT with the DAC (ESP32 GPIO25 / GPIO26 only)\nconst int DAC = 25;        // dacWrite 0 ... 255 -> 0 ... 3.3 V (a steady voltage, not PWM)\nconst int BACK = 35;       // wired to D25: read the DAC back with the ADC\nint levels[] = {0, 64, 128, 192, 255};   // an array: 5 numbers in one name\n\nvoid setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  for (int i = 0; i < 5; i++) {          // levels[0] ... levels[4]\n    int v = levels[i];\n    dacWrite(DAC, v);\n    delay(300);\n    float expect = v * 3.3 / 255;\n    float got = analogRead(BACK) * 3.3 / 4095;\n    // printf = print with a template: %d whole number, %.2f number with 2 decimals, \\n new line\n    Serial.printf(\"dacWrite(25, %d)  expect %.2f V   read back %.2f V\\n\", v, expect, got);\n  }\n  Serial.println(\"---\");\n  delay(1000);\n}\n",
 "lesson7": "// Lesson 7: your own functions (with and without a return value)\nconst int LED1 = 23;\nconst int POT = 34;\n\n// a function that DOES something: blink a pin n times\nvoid blinkTimes(int pin, int n) {\n  for (int i = 0; i < n; i++) {\n    digitalWrite(pin, HIGH); delay(150);\n    digitalWrite(pin, LOW);  delay(150);\n  }\n}\n\n// a function that RETURNS a value: the pot in volts\nfloat readVolts(int pin) {\n  return analogRead(pin) * 3.3 / 4095;\n}\n\n// returns true / false\nbool isHigh(float v) {\n  return v > 1.65;          // above half of 3.3 V\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED1, OUTPUT);\n}\n\nvoid loop() {\n  float v = readVolts(POT);\n  int blinks = int(v);      // int() drops the decimals: 2.7 V -> 2\n  Serial.print(\"pot = \"); Serial.print(v, 2); Serial.print(\" V -> \");\n  Serial.print(blinks + 1); Serial.print(\" blinks, \");\n  Serial.println(isHigh(v) ? \"upper half\" : \"lower half\");\n  blinkTimes(LED1, blinks + 1);\n  delay(1000);\n}\n",
 "lesson8": "// Lesson 8: doing many things at once with millis() (no long delay)\nconst int LED1 = 23, LED2 = 22, BTN = 15, POT = 34;\nunsigned long lastBlink = 0, lastPrint = 0;\nbool redOn = false;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED1, OUTPUT);\n  pinMode(LED2, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);\n}\n\nvoid loop() {\n  unsigned long now = millis();          // ms since power-up\n\n  // job 1: blink the red LED every 500 ms\n  if (now - lastBlink >= 500) {\n    lastBlink = now;\n    redOn = !redOn;\n    digitalWrite(LED1, redOn);\n  }\n\n  // job 2: green LED follows the button, at once (never waits for job 1)\n  digitalWrite(LED2, digitalRead(BTN) == LOW ? HIGH : LOW);\n\n  // job 3: print the pot every 1000 ms\n  if (now - lastPrint >= 1000) {\n    lastPrint = now;\n    Serial.print(now / 1000.0, 1); Serial.print(\" s   pot \");\n    Serial.print(analogRead(POT));\n    Serial.print(\"   button \");\n    Serial.println(digitalRead(BTN) == LOW ? \"PRESSED\" : \"up\");\n  }\n}\n",
 "lesson9": "// Lesson 9: commands from the console (type in the Serial box, press Enter)\nconst int LED1 = 23, LED2 = 22, POT = 34;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED1, OUTPUT);\n  pinMode(LED2, OUTPUT);\n  Serial.println(\"Commands: red on | red off | green on | green off | read | help\");\n}\n\nvoid loop() {\n  if (Serial.available() > 0) {               // something was typed\n    String cmd = Serial.readStringUntil('\\n');  // read one line\n    cmd.trim();                               // drop spaces / Enter\n    cmd.toLowerCase();\n    Serial.print(\"> \"); Serial.println(cmd);\n\n    if (cmd == \"red on\")         { digitalWrite(LED1, HIGH); Serial.println(\"red is ON\"); }\n    else if (cmd == \"red off\")   { digitalWrite(LED1, LOW);  Serial.println(\"red is OFF\"); }\n    else if (cmd == \"green on\")  { digitalWrite(LED2, HIGH); Serial.println(\"green is ON\"); }\n    else if (cmd == \"green off\") { digitalWrite(LED2, LOW);  Serial.println(\"green is OFF\"); }\n    else if (cmd == \"read\") {\n      int raw = analogRead(POT);\n      Serial.print(\"pot raw \"); Serial.print(raw);\n      Serial.print(\" = \");      Serial.print(raw * 3.3 / 4095, 2); Serial.println(\" V\");\n    }\n    else if (cmd == \"help\") Serial.println(\"red on | red off | green on | green off | read\");\n    else { Serial.print(\"unknown: \"); Serial.println(cmd); }\n  }\n  delay(10);\n}\n"
};
const SKETCH_EX = {
  nova: "// Fox9ner Nova wiring test: ESP32 + D1 mini Datalogger shield (SD) + Lunyee: J1 = Offline socket (5V + GND only), J2 = CH340G tap (RX / TX / GND)\n// Same pins as the real Nova firmware: Serial2 RX = GPIO16, TX = GPIO17 (to the Lunyee's CH340G tap, J2), SD CS = GPIO5 (shield D8).\n// Every 2 s it asks GRBL for its status ('?') and logs the answer on the SD card in /nova.log.\n// In the simulator a pretend GRBL 1.1f board (the Lunyee) answers on Serial2.\n#include <SPI.h>\n#include <SD.h>\n\nconst int SD_CS = 5;\nconst int GRBL_RX = 16;                    // <- J2-2 = CH340G pin 3 (Lunyee TX)\nconst int GRBL_TX = 17;                    // -> J2-1 = CH340G pad 2 (Lunyee RX)\nunsigned long last = 0;\nbool sdOk = false;\n\nvoid logLine(String s) {\n  Serial.print(\"GRBL: \");\n  Serial.println(s);\n  if (!sdOk) return;\n  File f = SD.open(\"/nova.log\", FILE_APPEND);\n  if (f) {\n    f.print(millis() / 1000);\n    f.print(\"s \");\n    f.println(s);\n    f.close();\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  Serial2.begin(115200, SERIAL_8N1, GRBL_RX, GRBL_TX);\n  sdOk = SD.begin(SD_CS);\n  Serial.println(sdOk ? \"SD card OK\" : \"SD card failed: 3V3, D5-D8 wires, FAT32 card\");\n  delay(500);\n  Serial2.print(\"$I\\n\");                   // ask the board its version\n}\n\nvoid loop() {\n  while (Serial2.available()) {\n    String line = Serial2.readStringUntil('\\n');\n    line.trim();\n    if (line.length() > 0) logLine(line);\n  }\n  if (millis() - last >= 2000) {\n    last = millis();\n    Serial2.print(\"?\");                    // status request: no Enter needed\n  }\n}\n",
  d1sd: "// D1 mini Datalogger shield on an ESP32: DHT22 + the shield's DS1307 date/time, one line every 5 s in /log.csv\n// Shield pins have D1 mini names: D8 (CS) -> GPIO5, D7 (MOSI) -> 23, D6 (MISO) -> 19, D5 (SCK) -> 18,\n// 3V3 -> 3V3 (never 5 V: the card has no regulator), D2 (SDA) -> 21, D1 (SCL) -> 22, 5V -> VIN (clock), GND -> GND.\n#include <SPI.h>\n#include <SD.h>\n#include <Wire.h>\n#include <RTClib.h>\n#include <DHT.h>\n\nconst int SD_CS = 5;\nRTC_DS1307 rtc;                            // 0x68 on the shield\nDHT dht(27, DHT22);                        // DATA on GPIO27\nchar line[48];\nunsigned long last = 0;\n\nvoid setup() {\n  Serial.begin(115200);\n  dht.begin();\n  if (!rtc.begin()) Serial.println(\"DS1307 not found: check D1 / D2 and 5V\");\n  if (!rtc.isrunning()) rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));   // first time: set it from the PC clock\n  if (!SD.begin(SD_CS)) {\n    Serial.println(\"SD card failed! 3V3 (not 5 V), D5-D8 wires, FAT32 card\");\n    while (true) delay(1000);\n  }\n  if (!SD.exists(\"/log.csv\")) {\n    File f = SD.open(\"/log.csv\", FILE_WRITE);\n    f.println(\"date,time,temp_C,humidity_pct\");\n    f.close();\n  }\n  Serial.println(\"Logging to /log.csv every 5 s\");\n}\n\nvoid loop() {\n  if (millis() - last < 5000) return;\n  last = millis();\n  DateTime now = rtc.now();\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  snprintf(line, 48, \"%04d-%02d-%02d,%02d:%02d:%02d,%.1f,%.1f\", now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second(), t, h);\n  File f = SD.open(\"/log.csv\", FILE_APPEND);\n  if (f) {\n    f.println(line);\n    f.close();\n    Serial.println(line);\n  } else {\n    Serial.println(\"Can't open /log.csv (card pulled out?)\");\n  }\n}\n",
  sdlog: "// DHT22 data logger: the ESP32 adds temperature + humidity to /log.csv on the SD card every 2 s.\n// In the simulator: tap the SD module -> 📂 Files on the card to open or download log.csv.\n#include <SPI.h>\n#include <SD.h>\n#include <DHT.h>\n\nconst int SD_CS = 5;                       // SCK 18, MISO 19, MOSI 23 (VSPI), CS 5\nDHT dht(4, DHT22);                         // DATA on GPIO4\nunsigned long lastLog = 0;\nint lines = 0;\n\nvoid listFiles() {\n  File root = SD.open(\"/\");\n  File f = root.openNextFile();\n  while (f) {\n    Serial.print(\"  \");\n    Serial.print(f.name());\n    Serial.print(\"  \");\n    Serial.print(f.size());\n    Serial.println(\" bytes\");\n    f = root.openNextFile();\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  dht.begin();\n  if (!SD.begin(SD_CS)) {\n    Serial.println(\"SD card failed! Check: card in, VCC = 5 V, SCK 18, MISO 19, MOSI 23, CS 5\");\n    while (true) delay(1000);\n  }\n  Serial.print(\"SD card OK, \");\n  Serial.print(SD.cardSize() / (1024 * 1024));\n  Serial.println(\" MB\");\n  if (!SD.exists(\"/log.csv\")) {\n    File f = SD.open(\"/log.csv\", FILE_WRITE);   // new file + the header line\n    f.println(\"seconds,temp_C,humidity_pct\");\n    f.close();\n  }\n  Serial.println(\"Files:\");\n  listFiles();\n}\n\nvoid loop() {\n  if (millis() - lastLog >= 2000) {\n    lastLog = millis();\n    float t = dht.readTemperature();\n    float h = dht.readHumidity();\n    if (isnan(t)) {\n      Serial.println(\"DHT22 read failed\");\n      return;\n    }\n    File f = SD.open(\"/log.csv\", FILE_APPEND);  // FILE_APPEND adds a line (FILE_WRITE starts the file over on the ESP32)\n    if (!f) {\n      Serial.println(\"Can't open /log.csv (card pulled out?)\");\n      return;\n    }\n    f.print(millis() / 1000);\n    f.print(\",\");\n    f.print(t, 1);\n    f.print(\",\");\n    f.println(h, 1);\n    f.close();                                  // close() saves it: without it the line is lost at power off\n    lines++;\n    Serial.printf(\"logged #%d  %.1f C  %.1f %%\\n\", lines, t, h);\n  }\n}\n",
  mqtt: "// ESP32 MQTT: 2 relays + DHT22 by topics (Mosquitto / Home Assistant / an MQTT phone app)\n// In the simulator: open the \"📡 MQTT\" box under the code to see the broker and send messages.\n#include <WiFi.h>\n#include <PubSubClient.h>\n#include <DHT.h>\n\nconst char* WIFI_SSID = \"YourWiFi\";\nconst char* WIFI_PASS = \"YourPassword\";\nconst char* BROKER = \"192.168.254.10\";    // IP of the PC / Pi running Mosquitto\n\nconst int RELAY1 = 19;                     // relay modules: LOW = ON\nconst int RELAY2 = 18;\nDHT dht(4, DHT22);                         // DATA on GPIO4\nWiFiClient espClient;\nPubSubClient client(espClient);\nunsigned long lastSend = 0;\nchar buf[16];\n\nvoid setRelay(int pin, const char* stateTopic, bool on) {\n  digitalWrite(pin, on ? LOW : HIGH);\n  client.publish(stateTopic, on ? \"ON\" : \"OFF\", true);   // retained: a new app sees the last state\n}\n\n// runs when a message arrives on a topic we subscribed to\nvoid callback(char* topic, byte* payload, unsigned int length) {\n  String msg = \"\";\n  for (int i = 0; i < length; i++) msg += (char)payload[i];\n  Serial.print(\"got \");\n  Serial.print(topic);\n  Serial.print(\" = \");\n  Serial.println(msg);\n  bool on = (msg == \"ON\" || msg == \"1\");\n  if (strcmp(topic, \"home/relay1/set\") == 0) setRelay(RELAY1, \"home/relay1/state\", on);\n  if (strcmp(topic, \"home/relay2/set\") == 0) setRelay(RELAY2, \"home/relay2/state\", on);\n}\n\nvoid connectMqtt() {\n  while (!client.connected()) {\n    Serial.print(\"MQTT connect... \");\n    if (client.connect(\"fox9-esp32\")) {\n      Serial.println(\"OK\");\n      client.subscribe(\"home/+/set\");      // + = any one word: relay1, relay2\n      client.publish(\"home/status\", \"online\", true);\n    } else {\n      Serial.print(\"failed, state \");\n      Serial.println(client.state());\n      delay(2000);\n    }\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(RELAY1, OUTPUT);\n  pinMode(RELAY2, OUTPUT);\n  digitalWrite(RELAY1, HIGH);              // both OFF at boot\n  digitalWrite(RELAY2, HIGH);\n  dht.begin();\n  WiFi.begin(WIFI_SSID, WIFI_PASS);\n  Serial.print(\"WiFi\");\n  while (WiFi.status() != WL_CONNECTED) {\n    delay(500);\n    Serial.print(\".\");\n  }\n  Serial.println();\n  Serial.print(\"IP \");\n  Serial.println(WiFi.localIP());\n  client.setServer(BROKER, 1883);\n  client.setCallback(callback);\n}\n\nvoid loop() {\n  if (!client.connected()) connectMqtt();\n  client.loop();                           // must run often: it delivers the messages\n\n  if (millis() - lastSend > 5000) {        // every 5 s\n    lastSend = millis();\n    float t = dht.readTemperature();\n    float h = dht.readHumidity();\n    if (!isnan(t)) {\n      dtostrf(t, 4, 1, buf);\n      client.publish(\"home/temp\", buf);\n      dtostrf(h, 4, 1, buf);\n      client.publish(\"home/hum\", buf);\n      Serial.print(\"sent temp \");\n      Serial.print(t, 1);\n      Serial.print(\" C  hum \");\n      Serial.print(h, 1);\n      Serial.println(\" %\");\n    }\n  }\n}\n",
  bank48: "// 48 V LiFePO4 bank monitor (16S, 51.2 V): ESP32 + ADS1115 + ACS712-30A + LCD 16x2\n// A0 = bank voltage through R1 200k / R2 10k (divide by 21: 60 V -> 2.86 V)\n// A1 = ACS712 OUT through R3 10k / R4 20k (x 2/3: keeps it under 3.3 V)\n#include <Wire.h>\n#include <Adafruit_ADS1X15.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_ADS1115 ads;                     // 0x48\nLiquidCrystal_I2C lcd(0x27, 16, 2);\n\nconst float VDIV = (200000.0 + 10000.0) / 10000.0;   // 21\nconst float IDIV = (10000.0 + 20000.0) / 20000.0;    // 1.5\nconst float SENS = 0.066;                            // ACS712-30A: 66 mV per amp\nfloat zeroV = 2.5;                                   // ACS712 output at 0 A (measured at boot)\nfloat ah = 0;                                        // amp-hours taken since boot\nunsigned long lastMs = 0;\n\n// resting voltage -> % for a 16S LiFePO4 bank (under load it reads a little lower)\nconst float VT[] = {40.0, 48.0, 51.2, 52.0, 52.4, 52.8, 53.2, 53.6, 54.4};\nconst int PT[] = {0, 10, 20, 30, 40, 70, 80, 90, 100};\n\nint soc(float v) {\n  if (v <= VT[0]) return 0;\n  for (int i = 1; i < 9; i++) {\n    if (v < VT[i]) return PT[i - 1] + (PT[i] - PT[i - 1]) * (v - VT[i - 1]) / (VT[i] - VT[i - 1]);\n  }\n  return 100;\n}\n\nfloat readV(int ch) {                      // average of 8 readings, in volts on the pin\n  long sum = 0;\n  for (int i = 0; i < 8; i++) sum += ads.readADC_SingleEnded(ch);\n  return ads.computeVolts(sum / 8);\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  lcd.init();\n  lcd.backlight();\n  if (!ads.begin(0x48)) {\n    Serial.println(\"ADS1115 not found!\");\n    lcd.print(\"ADS1115 missing\");\n    while (true) delay(100);\n  }\n  ads.setGain(GAIN_ONE);                   // +-4.096 V\n  lcd.print(\"Zero current...\");\n  zeroV = readV(1) * IDIV;                 // the LOAD must be OFF at boot\n  Serial.print(\"ACS712 zero = \");\n  Serial.print(zeroV, 3);\n  Serial.println(\" V\");\n  lastMs = millis();\n  delay(500);\n  lcd.clear();\n}\n\nvoid loop() {\n  float v = readV(0) * VDIV;\n  float amps = (readV(1) * IDIV - zeroV) / SENS;\n  if (fabs(amps) < 0.15) amps = 0;         // noise floor of the ACS712\n  float watts = v * amps;\n  unsigned long now = millis();\n  ah += amps * (now - lastMs) / 3600000.0;\n  lastMs = now;\n  int pct = soc(v);\n\n  lcd.setCursor(0, 0);                     // \"52.8V  5.2A  70%\"\n  lcd.print(v, 1);\n  lcd.print(\"V \");\n  lcd.print(amps, 1);\n  lcd.print(\"A \");\n  lcd.print(pct);\n  lcd.print(\"%   \");\n  lcd.setCursor(0, 1);                     // \"275W  0.012Ah\"\n  lcd.print(watts, 0);\n  lcd.print(\"W \");\n  lcd.print(ah, 3);\n  lcd.print(\"Ah\");\n  if (v < 48.0) lcd.print(\" LOW!\");\n  else lcd.print(\"     \");\n\n  Serial.print(v, 2);\n  Serial.print(\" V  \");\n  Serial.print(amps, 2);\n  Serial.print(\" A  \");\n  Serial.print(watts, 0);\n  Serial.print(\" W  \");\n  Serial.print(pct);\n  Serial.println(\" %\");\n  delay(500);\n}\n",
  ina219: "// INA219: current + voltage of a 12 V load, shown on the LCD 16x2 (both on SDA = GPIO21, SCL = GPIO22)\n#include <Wire.h>\n#include <Adafruit_INA219.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_INA219 ina219;                    // A0, A1 open = 0x40\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nfloat wh = 0;                              // energy used since boot\nunsigned long lastMs = 0;\n\nvoid setup() {\n  Serial.begin(115200);\n  lcd.init();\n  lcd.backlight();\n  if (!ina219.begin()) {\n    Serial.println(\"INA219 not found! Check VCC, GND, SDA, SCL.\");\n    lcd.print(\"INA219 missing\");\n    while (true) delay(100);\n  }\n  ina219.setCalibration_32V_2A();          // up to 26 V, 3.2 A with the 0.1 ohm shunt\n  lastMs = millis();\n}\n\nvoid loop() {\n  float busV = ina219.getBusVoltage_V();          // VIN- to GND (the load side)\n  float shuntmV = ina219.getShuntVoltage_mV();    // across the 0.1 ohm shunt\n  float mA = ina219.getCurrent_mA();\n  float loadV = busV + shuntmV / 1000.0;          // supply side\n  float watts = busV * mA / 1000.0;\n  unsigned long now = millis();\n  wh += watts * (now - lastMs) / 3600000.0;\n  lastMs = now;\n\n  lcd.setCursor(0, 0);                            // \"12.00V  1.583A\"\n  lcd.print(loadV, 2);\n  lcd.print(\"V  \");\n  lcd.print(mA / 1000.0, 3);\n  lcd.print(\"A  \");\n  lcd.setCursor(0, 1);                            // \"19.0W  0.005Wh\"\n  lcd.print(watts, 1);\n  lcd.print(\"W  \");\n  lcd.print(wh, 3);\n  lcd.print(\"Wh  \");\n\n  Serial.print(\"bus \");\n  Serial.print(busV, 3);\n  Serial.print(\" V  shunt \");\n  Serial.print(shuntmV, 2);\n  Serial.print(\" mV  \");\n  Serial.print(mA, 1);\n  Serial.print(\" mA  \");\n  Serial.print(watts, 2);\n  Serial.println(\" W\");\n  delay(500);\n}\n",
  rtc: "// DS3231 clock: the lights relay is ON from 18:00 to 06:00, the LCD shows the time\n// In the simulator the clock runs x60 (1 s = 1 min, set in the DS3231 panel) so you see it switch.\n#include <Wire.h>\n#include <RTClib.h>\n#include <LiquidCrystal_I2C.h>\n\nRTC_DS3231 rtc;                            // 0x68, SDA = GPIO21, SCL = GPIO22\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nconst int RELAY = 26;                      // relay module: LOW = ON\nconst int ON_HOUR = 18;                    // lights ON at 18:00\nconst int OFF_HOUR = 6;                    // lights OFF at 06:00\nchar line[17];\nint lastMin = -1;\n\nbool lightsOn(int h) {\n  if (ON_HOUR > OFF_HOUR) return h >= ON_HOUR || h < OFF_HOUR;   // over midnight\n  return h >= ON_HOUR && h < OFF_HOUR;\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(RELAY, OUTPUT);\n  digitalWrite(RELAY, HIGH);               // OFF at boot\n  lcd.init();\n  lcd.backlight();\n  if (!rtc.begin()) {\n    Serial.println(\"DS3231 not found!\");\n    lcd.print(\"RTC missing\");\n    while (true) delay(100);\n  }\n  if (rtc.lostPower()) {                   // new coin cell: set it once from the PC time\n    Serial.println(\"RTC lost power, setting the time\");\n    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));\n  }\n}\n\nvoid loop() {\n  DateTime now = rtc.now();\n  bool on = lightsOn(now.hour());\n  digitalWrite(RELAY, on ? LOW : HIGH);\n\n  snprintf(line, 17, \"%02d:%02d:%02d  %s\", now.hour(), now.minute(), now.second(), on ? \"ON \" : \"OFF\");\n  lcd.setCursor(0, 0);\n  lcd.print(line);\n  snprintf(line, 17, \"%04d-%02d-%02d\", now.year(), now.month(), now.day());\n  lcd.setCursor(0, 1);\n  lcd.print(line);\n\n  if (now.minute() != lastMin) {           // log once a minute\n    lastMin = now.minute();\n    Serial.print(now.timestamp());\n    Serial.println(on ? \"  lights ON\" : \"  lights OFF\");\n  }\n  delay(200);\n}\n",
  byj: "// 28BYJ-48 5 V stepper on a ULN2003 board: one turn forward, one turn back\n// Stepper.h wants the pins in the order IN1, IN3, IN2, IN4 for this motor.\n#include <Stepper.h>\n\nconst int STEPS = 2048;                    // steps per turn (32 x 64 gearbox)\nStepper motor(STEPS, 19, 5, 18, 17);       // IN1 = 19, IN2 = 18, IN3 = 5, IN4 = 17\n\nvoid setup() {\n  Serial.begin(115200);\n  motor.setSpeed(10);                      // rpm, 28BYJ-48 tops out near 15\n}\n\nvoid loop() {\n  Serial.println(\"forward 1 turn\");\n  motor.step(STEPS);\n  delay(1000);\n  Serial.println(\"back 1 turn\");\n  motor.step(-STEPS);\n  delay(1000);\n}\n",
  ads1115: '// 0-25 V voltage sensor: divider R1 68k / R2 10k -> ADS1115 A0 (16-bit), ESP32 reads it over I2C, LCD shows it\n#include <Wire.h>\n#include <Adafruit_ADS1X15.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_ADS1115 ads;                 // ADDR open = 0x48 (pull-down on the module)\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // both on SDA = GPIO21, SCL = GPIO22\n\nconst float R1 = 68000.0;             // top resistor: from the voltage you measure to A0\nconst float R2 = 10000.0;             // bottom resistor: A0 to GND\nconst float RATIO = (R1 + R2) / R2;   // 7.8: 25 V in -> 3.2 V on A0 (below VDD 3.3 V)\nconst float CAL = 1.000;              // fine trim: real volts / shown volts (measure once with a good meter)\n\nvoid setup() {\n  Serial.begin(115200);\n  lcd.init();\n  lcd.backlight();\n  if (!ads.begin(0x48)) {\n    Serial.println(\"ADS1115 not found! Check VDD, GND, SDA, SCL.\");\n    lcd.print(\"ADS1115 missing\");\n    while (true) {\n      delay(100);\n    }\n  }\n  ads.setGain(GAIN_ONE);              // +-4.096 V full scale, 1 bit = 0.125 mV on A0\n  lcd.print(\"Voltage sensor\");\n}\n\nvoid loop() {\n  // average 8 readings: less noise on a real board\n  long sum = 0;\n  for (int i = 0; i < 8; i++) sum += ads.readADC_SingleEnded(0);\n  int16_t raw = sum / 8;\n\n  float vA0 = ads.computeVolts(raw);    // volts on the A0 pin\n  float vin = vA0 * RATIO * CAL;        // volts before the divider\n\n  Serial.print(\"raw \");\n  Serial.print(raw);\n  Serial.print(\"  A0 \");\n  Serial.print(vA0, 4);\n  Serial.print(\" V  input \");\n  Serial.print(vin, 3);\n  Serial.println(\" V\");\n\n  lcd.setCursor(0, 0);\n  lcd.print(\"A0  \");\n  lcd.print(vA0, 4);\n  lcd.print(\" V     \");\n  lcd.setCursor(0, 1);\n  lcd.print(\"VIN \");\n  lcd.print(vin, 2);\n  lcd.print(\" V     \");\n  delay(250);\n}\n',
  relay10: '// 10 relay modules on 3 wires: two 74HC595 shift registers in a chain (cascade)\n// Serial Monitor commands (type below, press Send):\n//   3          toggle relay 3\n//   on 3 / off 3\n//   on 1,3,5   off 2,4   (pick several)\n//   all on / all off\n//   1000000001 binary, one digit per relay (relay 1 first), 1 = ON\n//   time 5     reset time: each relay switches itself OFF 5 s after it went ON (time 0 = stays ON)\n\nconst int DATA  = 19;   // 74HC595 pin 14 SER   (only to the 1st chip)\nconst int CLOCK = 18;   // 74HC595 pin 11 SRCLK (both chips)\nconst int LATCH = 5;    // 74HC595 pin 12 RCLK  (both chips)\nconst int OE    = 4;    // 74HC595 pin 13 OE    (both chips): HIGH = all outputs off\nconst int NRELAYS = 10;\nconst bool ACTIVE_LOW = true;   // most relay modules switch ON when IN is LOW\n\nunsigned int relays = 0;     // bit 0 = relay 1 ... bit 9 = relay 10\nunsigned int before = 0;     // what writeRelays() sent last time\nunsigned long onSince[10];   // millis() when each relay went ON\nunsigned long resetMs = 0;   // reset time in ms (0 = relays stay ON)\n\nvoid writeRelays() {\n  for (int i = 0; i < NRELAYS; i++)\n    if (((relays >> i) & 1) && !((before >> i) & 1)) onSince[i] = millis();   // just went ON: start its timer\n  before = relays;\n  unsigned int out = relays;\n  if (ACTIVE_LOW) out = ~relays;              // flip: ON = LOW\n  digitalWrite(LATCH, LOW);\n  shiftOut(DATA, CLOCK, MSBFIRST, (out >> 8) & 0xFF);   // the LAST chip\'s byte goes first\n  shiftOut(DATA, CLOCK, MSBFIRST, out & 0xFF);          // the 1st chip\'s byte\n  digitalWrite(LATCH, HIGH);                             // all outputs change at the same moment\n}\n\n// "1,3,5" → switch those relays on or off\nvoid setList(String list, bool on) {\n  list += ",";\n  int start = 0;\n  for (int i = 0; i < list.length(); i++) {\n    if (list.charAt(i) == \',\') {\n      int n = list.substring(start, i).toInt();\n      if (n >= 1 && n <= NRELAYS) {\n        if (on) relays |= (1 << (n - 1));\n        else relays &= ~(1 << (n - 1));\n      }\n      start = i + 1;\n    }\n  }\n}\n\nvoid printRelays() {\n  Serial.print("Relays 1-10: ");\n  for (int i = 0; i < NRELAYS; i++) Serial.print((relays >> i) & 1);\n  Serial.println();\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(DATA, OUTPUT);\n  pinMode(CLOCK, OUTPUT);\n  pinMode(LATCH, OUTPUT);\n  pinMode(OE, OUTPUT);\n  digitalWrite(OE, HIGH);           // outputs off while we load "all OFF"\n  writeRelays();                    // all OFF first\n  digitalWrite(OE, LOW);            // now the chips drive the relays\n\n  // test: click each relay once, 1 to 10\n  for (int i = 0; i < NRELAYS; i++) {\n    relays = 1 << i;\n    writeRelays();\n    delay(250);\n  }\n  relays = 0;\n  writeRelays();\n  Serial.println("Ready. Type 3, on 1,3,5, off 2, all on, all off, 1000000001 or time 5");\n}\n\nvoid loop() {\n  if (Serial.available()) {\n    String cmd = Serial.readStringUntil(\'\\n\');\n    cmd.trim();\n    cmd.toLowerCase();\n\n    if (cmd == "all on") relays = (1 << NRELAYS) - 1;\n    else if (cmd == "all off") relays = 0;\n    else if (cmd.startsWith("time ")) {\n      resetMs = cmd.substring(5).toFloat() * 1000;\n      Serial.print("Reset time: ");\n      if (resetMs == 0) Serial.println("off");\n      else {\n        Serial.print(resetMs / 1000.0, 1);\n        Serial.println(" s");\n      }\n    }\n    else if (cmd.startsWith("on ")) setList(cmd.substring(3), true);\n    else if (cmd.startsWith("off ")) setList(cmd.substring(4), false);\n    else if (cmd.length() == NRELAYS && cmd.indexOf(\'2\') < 0) {   // binary\n      relays = 0;\n      for (int i = 0; i < NRELAYS; i++) if (cmd.charAt(i) == \'1\') relays |= (1 << i);\n    } else {\n      int n = cmd.toInt();\n      if (n >= 1 && n <= NRELAYS) relays ^= (1 << (n - 1));   // toggle\n      else Serial.println("?? " + cmd);\n    }\n    writeRelays();\n    printRelays();\n  }\n\n  // reset time: switch OFF every relay that has been ON long enough\n  if (resetMs > 0) {\n    unsigned int was = relays;\n    for (int i = 0; i < NRELAYS; i++)\n      if (((relays >> i) & 1) && millis() - onSince[i] >= resetMs) relays &= ~(1 << i);\n    if (relays != was) {\n      writeRelays();\n      printRelays();\n    }\n  }\n}\n',
  encoder: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n\nAdafruit_SSD1306 display(128, 64, &Wire, -1);   // SDA = GPIO21, SCL = GPIO22\n\nconst int CLK = 32;   // encoder CLK (A)\nconst int DT  = 33;   // encoder DT (B)\nconst int SW  = 25;   // encoder push button\nconst int LED = 23;\n\nvolatile int steps = 0;   // changed by the interrupt, read by loop()\n\n// runs by itself the instant CLK falls (one click of the knob)\nvoid IRAM_ATTR readEncoder() {\n  if (digitalRead(DT) == HIGH) steps++;   // CLK fell first: clockwise\n  else steps--;                           // DT fell first: counter-clockwise\n}\n\nconst String items[4] = {"LED", "Blink", "Speed", "About"};\nint sel = 0;            // selected line\nbool editing = false;   // pushed on Speed: the knob changes the number\nbool ledOn = true;\nbool blinking = false;\nint speed = 2;          // blinks per second\nbool about = false;\nbool wasPressed = false;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(CLK, INPUT);          // the KY-040 has its own 10k pull-ups on CLK and DT\n  pinMode(DT, INPUT);\n  pinMode(SW, INPUT_PULLUP);    // SW has none: use the internal one\n  pinMode(LED, OUTPUT);\n  attachInterrupt(digitalPinToInterrupt(CLK), readEncoder, FALLING);\n  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);\n  delay(100);                   // let the pull-ups settle before the first read\n}\n\nvoid loop() {\n  // 1. knob turns since last time (stop interrupts for a moment while we copy)\n  noInterrupts();\n  int s = steps;\n  steps = 0;\n  interrupts();\n  if (s != 0) {\n    if (editing) speed = constrain(speed + s, 1, 10);\n    else sel = (sel + s + 40) % 4;\n    Serial.print("turn ");\n    Serial.println(s);\n  }\n\n  // 2. push button: act once per press\n  bool pressed = digitalRead(SW) == LOW;\n  if (pressed && !wasPressed) {\n    if (about) about = false;\n    else if (editing) editing = false;\n    else if (sel == 0) ledOn = !ledOn;\n    else if (sel == 1) blinking = !blinking;\n    else if (sel == 2) editing = true;\n    else about = true;\n    Serial.println("push");\n  }\n  wasPressed = pressed;\n\n  // 3. the LED\n  bool on = ledOn && (!blinking || int(millis() * speed / 500) % 2 == 0);\n  digitalWrite(LED, on ? HIGH : LOW);\n\n  // 4. the screen\n  display.clearDisplay();\n  display.setTextColor(SSD1306_WHITE);\n  if (about) {\n    display.setTextSize(2);\n    display.setCursor(0, 0);\n    display.println("Fox9ner");\n    display.setTextSize(1);\n    display.setCursor(0, 24);\n    display.println("Rotary encoder menu");\n    display.println("with interrupts.");\n    display.println("");\n    display.println("Push to go back.");\n  } else {\n    display.setTextSize(1);\n    display.setCursor(0, 0);\n    display.print(editing ? "Turn: speed, push: OK" : "MENU  turn + push");\n    for (int i = 0; i < 4; i++) {\n      int y = 18 + i * 11;\n      if (i == sel) {\n        display.fillRect(0, y - 2, 128, 11, SSD1306_WHITE);\n        display.setTextColor(SSD1306_BLACK);\n      } else {\n        display.setTextColor(SSD1306_WHITE);\n      }\n      display.setCursor(4, y);\n      display.print(items[i]);\n      display.setCursor(84, y);\n      if (i == 0) display.print(ledOn ? "ON" : "OFF");\n      if (i == 1) display.print(blinking ? "ON" : "OFF");\n      if (i == 2) {\n        display.print(speed);\n        display.print(editing ? " /s <" : " /s");\n      }\n    }\n  }\n  display.display();\n  delay(20);\n}\n',
  oled: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n\n#define SCREEN_WIDTH 128\n#define SCREEN_HEIGHT 64\nAdafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);   // SDA = GPIO21, SCL = GPIO22\n\nint graph[128];   // last 128 readings for the moving graph\n\nvoid setup() {\n  Serial.begin(115200);\n  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n    Serial.println("OLED not found");\n    for (;;);\n  }\n  for (int i = 0; i < 128; i++) graph[i] = 63;\n  display.clearDisplay();\n  display.setTextSize(2);\n  display.setTextColor(SSD1306_WHITE);\n  display.setCursor(4, 24);\n  display.println("Hello migo");\n  display.display();\n  delay(1500);\n}\n\nvoid loop() {\n  float v = analogRead(34) * 3.3 / 4095;\n\n  for (int i = 0; i < 127; i++) graph[i] = graph[i + 1];\n  graph[127] = 63 - int(v / 3.3 * 28);\n\n  display.clearDisplay();\n  display.setTextSize(1);\n  display.setCursor(0, 0);\n  display.print("Pot voltage");\n  display.setTextSize(2);\n  display.setCursor(0, 14);\n  display.print(v, 2);\n  display.print(" V");\n  display.drawRect(84, 16, 44, 10, SSD1306_WHITE);\n  display.fillRect(86, 18, int(v / 3.3 * 40), 6, SSD1306_WHITE);\n  display.drawFastHLine(0, 34, 128, SSD1306_WHITE);\n  for (int x = 1; x < 128; x++) display.drawLine(x - 1, graph[x - 1], x, graph[x], SSD1306_WHITE);\n  display.display();\n  delay(100);\n}\n',
  doorlock: '#include <Keypad.h>\n#include <LiquidCrystal_I2C.h>\n\nconst byte ROWS = 4, COLS = 4;\nchar keys[ROWS][COLS] = {\n  {\'1\', \'2\', \'3\', \'A\'},\n  {\'4\', \'5\', \'6\', \'B\'},\n  {\'7\', \'8\', \'9\', \'C\'},\n  {\'*\', \'0\', \'#\', \'D\'}\n};\nbyte rowPins[ROWS] = {19, 18, 5, 17};\nbyte colPins[COLS] = {16, 4, 2, 15};\nKeypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);\nLiquidCrystal_I2C lcd(0x27, 16, 2);\n\nconst int LOCK = 13;      // MOSFET gate\nconst int BUZZ = 23;\nString code = "1234";     // change your PIN here\nString typed = "";\n\nvoid beep(int ms) {\n  digitalWrite(BUZZ, HIGH);\n  delay(ms);\n  digitalWrite(BUZZ, LOW);\n}\n\nvoid askPin() {\n  lcd.clear();\n  lcd.print("Enter PIN, #=OK");\n  lcd.setCursor(0, 1);\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LOCK, OUTPUT);\n  pinMode(BUZZ, OUTPUT);\n  lcd.init();\n  lcd.backlight();\n  askPin();\n}\n\nvoid loop() {\n  char key = keypad.getKey();\n  if (!key) return;\n  Serial.println(key);\n  beep(40);\n  if (key == \'#\') {\n    if (typed == code) {\n      lcd.clear();\n      lcd.print("OPEN - welcome!");\n      digitalWrite(LOCK, HIGH);   // solenoid pulls the bolt\n      beep(200);\n      delay(3000);\n      digitalWrite(LOCK, LOW);\n    } else {\n      lcd.clear();\n      lcd.print("WRONG PIN");\n      beep(800);\n      delay(1000);\n    }\n    typed = "";\n    askPin();\n  } else if (key == \'*\') {\n    typed = "";\n    askPin();\n  } else if (typed.length() < 8) {\n    typed += key;\n    lcd.print(\'*\');\n  }\n}\n',
  thermo: '#include <DHT.h>\n\nDHT dht(4, DHT22);        // DATA on GPIO4\nconst int FAN = 23;\n\nvoid setup() {\n  Serial.begin(115200);\n  dht.begin();\n  pinMode(FAN, OUTPUT);\n}\n\nvoid loop() {\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  if (isnan(t)) {\n    Serial.println("DHT not found!");\n    delay(1000);\n    return;\n  }\n  digitalWrite(FAN, t > 30 ? HIGH : LOW);   // fan above 30 C\n  Serial.printf("%.1f C  %.0f %%  fan %s\\n", t, h, t > 30 ? "ON" : "OFF");\n  delay(1000);\n}\n',
  parking: 'const int TRIG = 9, ECHO = 10, LED = 13;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH);              // 10 us pulse starts a measurement\n  delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  long us = pulseIn(ECHO, HIGH, 30000);   // echo time in microseconds\n  float cm = us / 58.0;\n  digitalWrite(LED, cm > 0 && cm < 20 ? HIGH : LOW);\n  Serial.print("Distance: ");\n  Serial.print(cm, 1);\n  Serial.println(" cm");\n  delay(200);\n}\n',
  autolight: 'const int LED = 9;   // PWM pin\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int light = analogRead(A0);              // dark = low, bright = high\n  int pwm = map(light, 0, 1023, 255, 0);   // darker = brighter LED\n  analogWrite(LED, constrain(pwm, 0, 255));\n  Serial.print("light ");\n  Serial.print(light);\n  Serial.print("   LED ");\n  Serial.println(pwm);\n  delay(200);\n}\n',
};
export function example(name) {
  const c = newCircuit();
  const W = (x1, y1, x2, y2) => c.wires.push({ x1, y1, x2, y2 });
  if (name === 'led') {
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 9;                   // vertical, + on top
    const r = addPart(c, 'R', 4, 0); r.props.r = 470;
    const l = addPart(c, 'LED', 10, 0); l.props.color = 'red';
    addPart(c, 'GND', 0, 10);
    const s = addPart(c, 'SW', 14, 4, 1); s.props.on = true;
    W(0, 4, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(12, 0, 14, 0); W(14, 0, 14, 2); W(14, 6, 14, 10); W(14, 10, 0, 10); W(0, 8, 0, 10);
  } else if (name === 'divider') {
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const r1 = addPart(c, 'R', 6, 2, 1); r1.props.r = 10000;
    const r2 = addPart(c, 'R', 6, 8, 1); r2.props.r = 4700;
    addPart(c, 'VM', 12, 8, 1);
    addPart(c, 'GND', 0, 12);
    W(0, 4, 0, 0); W(0, 0, 6, 0); W(6, 4, 6, 6); W(6, 10, 6, 12); W(0, 8, 0, 12); W(0, 12, 12, 12); W(6, 5, 12, 5); W(12, 5, 12, 6); W(12, 10, 12, 12);
  } else if (name === 'esp32') {
    // 12 V solenoid coil (lamp as the coil load) switched by a push button, with flyback diode across it
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const coil = addPart(c, 'LAMP', 8, 4, 1); coil.name = 'COIL'; coil.props.vr = 12; coil.props.wr = 6;
    const d = addPart(c, 'D', 12, 4, 3); d.props.model = '1N5819';
    const pb = addPart(c, 'PB', 8, 10, 1);
    const am = addPart(c, 'AM', 4, 0);
    addPart(c, 'GND', 0, 14);
    W(0, 4, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(8, 0, 8, 2); W(8, 0, 12, 0); W(12, 0, 12, 2); W(8, 6, 8, 8); W(12, 6, 12, 7); W(12, 7, 8, 7);
    W(8, 12, 8, 14); W(8, 14, 0, 14); W(0, 8, 0, 14);
  } else if (name === 'dpdt') {
    // DPDT reversing a DC motor: battery on the two commons, throws cross-wired to the motor. Flip = motor reverses.
    const b = addPart(c, 'BAT', 0, 8, 1); b.props.v = 12;
    addPart(c, 'DPDT', 8, 8);                      // commons (6,6) (6,10) · throws A1 (10,5) B1 (10,7) A2 (10,9) B2 (10,11)
    const m = addPart(c, 'R', 16, 8, 1); m.name = 'MOTOR'; m.props.r = 24; m.props.rating = 10;
    addPart(c, 'GND', 0, 12);
    W(0, 6, 6, 6); W(0, 10, 6, 10); W(0, 10, 0, 12);
    W(10, 5, 16, 5);                                // A1 -> motor top
    W(10, 7, 13, 7); W(13, 7, 13, 9); W(10, 9, 13, 9); W(13, 9, 13, 10); W(13, 10, 16, 10);   // B1 + A2 -> motor bottom
    W(10, 11, 10, 13); W(10, 13, 18, 13); W(18, 13, 18, 4); W(18, 4, 16, 4); W(16, 4, 16, 6);   // B2 -> motor top (around)
  } else if (name === 'rc') {
    // square wave into an RC low-pass: watch the capacitor charge and discharge (τ = R × C = 1 ms)
    const g = addPart(c, 'SIG', 0, 6, 1); Object.assign(g.props, { wave: 'pwm', f: 100, amp: 5, off: 0, duty: 50 });
    addPart(c, 'R', 4, 2).props.r = 1000;
    addPart(c, 'C', 8, 6, 1).props.c = 1e-6;
    addPart(c, 'SCOPE', 16, 6);
    addPart(c, 'GND', 0, 10);
    W(0, 4, 0, 2); W(0, 2, 2, 2); W(6, 2, 8, 2); W(8, 2, 8, 4); W(8, 8, 8, 10); W(8, 10, 0, 10); W(0, 8, 0, 10);
    W(13, 5, 13, 0); W(13, 0, 0, 0); W(0, 0, 0, 2);            // CH1 = input
    W(13, 7, 11, 7); W(11, 7, 11, 3); W(11, 3, 8, 3);           // CH2 = capacitor
    W(16, 8, 16, 10); W(16, 10, 8, 10);
  } else if (name === 'pwmled') {
    const g = addPart(c, 'SIG', 0, 6, 1); Object.assign(g.props, { wave: 'pwm', f: 1000, amp: 5, off: 0, duty: 30 });
    addPart(c, 'R', 4, 2).props.r = 150;
    addPart(c, 'LED', 10, 2).props.color = 'green';
    addPart(c, 'SCOPE', 22, 6);
    addPart(c, 'GND', 0, 10);
    W(0, 4, 0, 2); W(0, 2, 2, 2); W(6, 2, 8, 2); W(12, 2, 14, 2); W(14, 2, 14, 10); W(14, 10, 0, 10); W(0, 8, 0, 10);
    W(19, 5, 17, 5); W(17, 5, 17, 0); W(17, 0, 7, 0); W(7, 0, 7, 2);
    W(22, 8, 22, 10); W(22, 10, 14, 10);
  } else if (name === 'flyback') {
    // hold the button, then let go: the coil's current must go somewhere. The diode catches it.
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const l = addPart(c, 'L', 8, 4, 1); l.name = 'COIL'; Object.assign(l.props, { l: 0.05, r: 24 });
    addPart(c, 'D', 18, 4, 3).props.model = '1N5819';
    addPart(c, 'PB', 8, 10, 1);
    addPart(c, 'SCOPE', 28, 8);
    addPart(c, 'GND', 0, 14);
    W(0, 4, 0, 0); W(0, 0, 8, 0); W(8, 0, 8, 2); W(8, 0, 18, 0); W(18, 0, 18, 2); W(18, 6, 18, 7); W(18, 7, 8, 7); W(8, 6, 8, 8);
    W(8, 12, 8, 14); W(8, 14, 0, 14); W(0, 8, 0, 14);
    W(25, 7, 18, 7); W(28, 10, 28, 14); W(28, 14, 8, 14);
  } else if (name === 'rectifier') {
    // 12 V AC (17 V peak, 60 Hz) → bridge → 1000 µF → 100 Ω load. The scope shows the ripple.
    const g = addPart(c, 'SIG', 0, 8, 1); g.name = 'AC'; Object.assign(g.props, { wave: 'sine', f: 60, amp: 17, off: 0 });
    for (const [x, y] of [[6, 4], [6, 8], [14, 4], [14, 8]]) addPart(c, 'D', x, y, 3);
    addPart(c, 'C', 20, 6, 1).props.c = 1000e-6;
    const rl = addPart(c, 'R', 26, 6, 1); rl.props.r = 100; rl.props.rating = 5;
    addPart(c, 'SCOPE', 32, 6);
    addPart(c, 'GND', 20, 10);
    W(6, 2, 14, 2); W(6, 10, 14, 10); W(0, 6, 6, 6);
    W(0, 10, 0, 12); W(0, 12, 16, 12); W(16, 12, 16, 6); W(16, 6, 14, 6);
    W(14, 2, 20, 2); W(20, 2, 20, 4); W(20, 2, 26, 2); W(26, 2, 26, 4);
    W(14, 10, 20, 10); W(20, 8, 20, 10); W(20, 10, 26, 10); W(26, 8, 26, 10);
    W(29, 5, 29, 2); W(29, 2, 26, 2); W(32, 8, 32, 10); W(32, 10, 26, 10);
  } else if (name === 'opto') {
    // ESP32 pin (3.3 V PWM) → 220 Ω → PC817 LED. The transistor side pulls a 12 V line low.
    const g = addPart(c, 'SIG', 0, 6, 1); g.name = 'ESP32'; Object.assign(g.props, { wave: 'pwm', f: 50, amp: 3.3, off: 0, duty: 50 });
    addPart(c, 'R', 4, 2).props.r = 220;
    addPart(c, 'OPTO', 10, 4);
    const r2 = addPart(c, 'R', 16, 1); r2.props.r = 4700;
    const b = addPart(c, 'BAT', 22, 6, 1); b.props.v = 12;
    addPart(c, 'SCOPE', 30, 6);
    addPart(c, 'GND', 0, 10);
    W(0, 4, 0, 2); W(0, 2, 2, 2); W(6, 2, 8, 2); W(8, 2, 8, 3); W(8, 5, 8, 10); W(8, 10, 0, 10); W(0, 8, 0, 10);
    W(12, 3, 12, 1); W(12, 1, 14, 1); W(18, 1, 22, 1); W(22, 1, 22, 4);
    W(12, 5, 12, 10); W(12, 10, 8, 10); W(22, 8, 22, 10); W(22, 10, 12, 10);
    W(27, 5, 26, 5); W(26, 5, 26, -1); W(26, -1, 0, -1); W(0, -1, 0, 2);
    W(27, 7, 24, 7); W(24, 7, 24, 2); W(24, 2, 12, 2);
    W(30, 8, 30, 10); W(30, 10, 22, 10);
  } else if (name === 'relay') {
    // ESP32 pin (3.3 V) → 1 kΩ → 2N2222 switches a 12 V relay coil. The relay contact turns on a 12 V lamp. 1N4148 catches the coil spike.
    const e = addPart(c, 'BAT', -6, 8, 1); e.name = 'ESP32'; e.props.v = 3.3;
    const sw = addPart(c, 'SW', 4, 6); sw.name = 'GPIO'; sw.props.on = true;
    addPart(c, 'R', 10, 6).props.r = 1000;
    addPart(c, 'NPN', 14, 6).props.model = '2N2222';
    const k = addPart(c, 'RELAY', 18, 0); Object.assign(k.props, { vcoil: 12, rcoil: 400, l: 0.12 });
    addPart(c, 'D', 10, 0, 3).props.model = '1N4148';
    const lp = addPart(c, 'LAMP', 18, 6, 1); Object.assign(lp.props, { vr: 12, wr: 5 });
    const b = addPart(c, 'BAT', 26, 4, 1); b.props.v = 12;
    addPart(c, 'GND', -6, 12);
    W(-6, 6, 2, 6); W(6, 6, 8, 6); W(15, 8, 15, 12); W(15, 2, 15, 4);
    W(10, -2, 15, -2); W(10, 2, 15, 2); W(15, -2, 15, -4); W(15, -4, 26, -4); W(26, -4, 26, 2); W(20, -2, 20, -4);
    W(18, 2, 18, 4); W(18, 8, 18, 12); W(-6, 10, -6, 12); W(-6, 12, 26, 12); W(26, 6, 26, 12);
  } else if (name === 'mosfet') {
    // ESP32 PWM (3.3 V) drives an IRLZ44N that switches a 12 V solenoid. 10 kΩ keeps the gate off at boot, diode eats the spike.
    const b = addPart(c, 'BAT', -4, 4, 1); b.props.v = 12;
    const g = addPart(c, 'SIG', 0, 10, 1); g.name = 'ESP32'; Object.assign(g.props, { wave: 'pwm', f: 50, amp: 3.3, off: 0, duty: 50 });
    addPart(c, 'R', 4, 6).props.r = 100;
    addPart(c, 'R', 9, 8, 1).props.r = 10000;
    addPart(c, 'NMOS', 16, 6).props.model = 'IRLZ44N';
    const l = addPart(c, 'L', 17, 0, 1); l.name = 'SOLENOID'; Object.assign(l.props, { l: 0.05, r: 24 });
    addPart(c, 'D', 26, 0, 3).props.model = '1N5819';
    addPart(c, 'SCOPE', 35, 4);
    addPart(c, 'GND', -4, 12); addPart(c, 'GND', 35, 6);
    W(-4, 2, -4, -4); W(-4, -4, 26, -4); W(-4, 6, -4, 12); W(-4, 12, 17, 12);
    W(0, 8, 0, 6); W(0, 6, 2, 6); W(6, 6, 14, 6); W(9, 10, 9, 12); W(17, 8, 17, 12);
    W(17, -2, 17, -4); W(17, 2, 17, 4); W(17, 2, 26, 2); W(26, -2, 26, -4);
    W(11, 6, 11, -6); W(11, -6, 32, -6); W(32, -6, 32, 3);
    W(17, 3, 29, 3); W(29, 3, 29, 5); W(29, 5, 32, 5);
  } else if (name === 'reg7805') {
    // 12 V → 7805 → 5 V. The 7 V difference turns into heat in the regulator.
    const b = addPart(c, 'BAT', 0, 4, 1); b.props.v = 12;
    addPart(c, 'REG', 6, 2).props.model = '7805';
    const r = addPart(c, 'R', 12, 4, 1); r.name = 'LOAD'; r.props.r = 20; r.props.rating = 2;
    addPart(c, 'VM', 19, 4, 1);
    addPart(c, 'GND', 0, 8);
    W(0, 2, 3, 2); W(6, 4, 6, 8); W(9, 2, 12, 2); W(12, 6, 12, 8); W(12, 2, 19, 2); W(19, 6, 19, 8); W(0, 6, 0, 8); W(0, 8, 19, 8);
  } else if (name === 'lm317') {
    // LM317: Vout = 1.25 × (1 + R2 ÷ R1) = 1.25 × (1 + 720 ÷ 240) = 5 V. Change R2 to set the voltage.
    const b = addPart(c, 'BAT', 0, 4, 1); b.props.v = 12;
    addPart(c, 'REG', 6, 2).props.model = 'LM317';
    addPart(c, 'R', 11, 4, 1).props.r = 240;
    addPart(c, 'R', 6, 8, 1).props.r = 720;
    const r = addPart(c, 'R', 17, 4, 1); r.name = 'LOAD'; r.props.r = 100; r.props.rating = 1;
    addPart(c, 'VM', 23, 4, 1);
    addPart(c, 'GND', 0, 12);
    W(0, 2, 3, 2); W(9, 2, 11, 2); W(6, 4, 6, 6); W(6, 6, 11, 6); W(6, 10, 6, 12); W(11, 2, 17, 2); W(17, 6, 17, 12); W(17, 2, 23, 2); W(23, 6, 23, 12);
    W(0, 6, 0, 12); W(0, 12, 23, 12);
  } else if (name === 'zener') {
    // 12 V → 1 kΩ → 5.1 V zener: the zener holds 5.1 V and the resistor takes the rest.
    const b = addPart(c, 'BAT', 0, 4, 1); b.props.v = 12;
    addPart(c, 'R', 4, 0).props.r = 1000;
    addPart(c, 'ZD', 8, 3, 3).props.vz = 5.1;
    addPart(c, 'VM', 14, 3, 1);
    addPart(c, 'GND', 0, 6);
    W(0, 2, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(8, 0, 8, 1); W(8, 0, 14, 0); W(14, 0, 14, 1); W(8, 5, 8, 6); W(14, 5, 14, 6); W(0, 6, 14, 6);
  } else if (name === 'comparator') {
    // op-amp as a comparator: triangle wave vs the pot voltage → PWM out. Turn the pot to change the duty.
    const g = addPart(c, 'SIG', -4, 9, 1); Object.assign(g.props, { wave: 'triangle', f: 100, amp: 2.5, off: 2.5 });
    addPart(c, 'OPAMP', 10, 6).props.model = 'MCP6002';
    const pot = addPart(c, 'POT', 4, 1, 1); pot.props.pos = 70;
    const b = addPart(c, 'BAT', 18, -1, 1); b.props.v = 5;
    addPart(c, 'SCOPE', 19, 8);
    for (const [x, y] of [[-4, 11], [4, 3], [10, 8], [18, 1], [19, 10]]) addPart(c, 'GND', x, y);
    W(-4, 7, 7, 7); W(6, 1, 6, 5); W(6, 5, 7, 5); W(4, -1, 4, -3); W(4, -3, 18, -3); W(10, 4, 10, -3);
    W(13, 6, 15, 6); W(15, 6, 15, 7); W(15, 7, 16, 7);
    W(6, 7, 6, 11); W(6, 11, 16, 11); W(16, 11, 16, 9);
  } else if (name === 'preamp') {
    // classic 1-transistor audio preamp (common emitter): 10 mV mic signal in, about 1 V out (gain ≈ 100)
    const g = addPart(c, 'SIG', 0, 14, 1); g.name = 'MIC'; Object.assign(g.props, { wave: 'sine', f: 1000, amp: 0.01, off: 0 });
    const cin = addPart(c, 'C', 5, 10, 2); cin.name = 'CIN'; Object.assign(cin.props, { c: 10e-6, vmax: 16 });
    addPart(c, 'R', 10, 5, 1).props.r = 47000;
    addPart(c, 'R', 10, 15, 1).props.r = 10000;
    addPart(c, 'NPN', 14, 10).props.model = 'BC547';
    const rc = addPart(c, 'R', 15, 5, 1); rc.name = 'RC'; rc.props.r = 4700;
    const re = addPart(c, 'R', 15, 15, 1); re.name = 'RE'; re.props.r = 1000;
    const ce = addPart(c, 'C', 19, 15, 1); ce.name = 'CE'; Object.assign(ce.props, { c: 100e-6, vmax: 16 });
    const co = addPart(c, 'C', 20, 7); co.name = 'COUT'; Object.assign(co.props, { c: 10e-6, vmax: 16 });
    const rl = addPart(c, 'R', 24, 11, 1); rl.name = 'LOAD'; rl.props.r = 10000;
    const b = addPart(c, 'BAT', 36, 10, 1); b.props.v = 9;
    addPart(c, 'SCOPE', 14, 25);
    addPart(c, 'GND', 0, 20); addPart(c, 'GND', 14, 27);
    W(0, 12, 0, 10); W(0, 10, 3, 10); W(7, 10, 12, 10); W(10, 7, 10, 10); W(10, 13, 10, 10);
    W(10, 3, 10, 1); W(10, 1, 36, 1); W(15, 1, 15, 3); W(36, 1, 36, 8);
    W(15, 7, 15, 8); W(15, 12, 15, 13); W(15, 12, 19, 12); W(19, 12, 19, 13); W(15, 7, 18, 7);
    W(22, 7, 24, 7); W(24, 7, 24, 9);
    W(0, 16, 0, 20); W(0, 20, 36, 20); W(10, 17, 10, 20); W(15, 17, 15, 20); W(19, 17, 19, 20); W(24, 13, 24, 20); W(36, 12, 36, 20);
    W(24, 8, 27, 8); W(27, 8, 27, 24); W(27, 24, 11, 24);
    W(0, 10, -2, 10); W(-2, 10, -2, 26); W(-2, 26, 11, 26);
  } else if (name === 'tl494pwm') {
    // TL494 PWM lamp dimmer, 12 V. RT 10 kΩ + CT 10 nF → f = 1 ÷ (10 kΩ × 10 nF) = 10 kHz. Error amps switched off (IN+ to GND, IN− to REF),
    // the DUTY pot on DTC sets the pulse width. OUTPUT CTRL to GND = both outputs together (single-ended), emitters drive the MOSFET gate.
    c.tdiv = 5e-5;
    const u = addPart(c, 'TL494', 0, 0); u.name = 'U1';
    const b = addPart(c, 'BAT', -16, -5, 1); b.name = 'B1'; b.props.v = 12;
    const pot = addPart(c, 'POT', -8, 4, 1); pot.name = 'DUTY'; Object.assign(pot.props, { r: 10000, pos: 70 }); pot.lbl = [-14.7, 0];
    const ct = addPart(c, 'C', -3, 10, 1); ct.name = 'CT'; Object.assign(ct.props, { c: 10e-9, vmax: 50, polar: false }); ct.lbl = [-9.4, 0];
    const rt = addPart(c, 'R', -1, 10, 1); rt.name = 'RT'; rt.props.r = 10000; rt.lbl = [0, 1];
    const rg = addPart(c, 'R', 13, 0); rg.name = 'RG'; rg.props.r = 22;
    const rpd = addPart(c, 'R', 9, 3, 1); rpd.name = 'RPD'; rpd.props.r = 1000; rpd.lbl = [-3.6, 4.4];
    const q = addPart(c, 'NMOS', 17, 0); q.name = 'Q1'; q.props.model = 'IRLZ44N';
    const lp = addPart(c, 'LAMP', 18, -6, 1); lp.name = 'LAMP'; Object.assign(lp.props, { vr: 12, wr: 5 });
    addPart(c, 'SCOPE', 24, 13);
    for (const [x, y] of [[-16, -2], [-6, -4], [-6, 0], [-8, 6], [-3, 12], [-1, 12], [2, 8], [9, 5], [18, 3], [24, 16]]) addPart(c, 'GND', x, y);
    // +12 V rail: battery, VCC, C1 + C2, lamp
    W(-16, -7, -16, -11); W(-16, -11, 18, -11); W(-16, -3, -16, -2);
    W(2, -7, 2, -11); W(5, -5, 7, -5); W(5, -4, 7, -4); W(7, -4, 7, -11); W(18, -8, 18, -11);
    // 5 V REF → 1IN−, 2IN−, top of the DUTY pot. 1IN+ and 2IN+ to ground: both error amps stay LOW (off)
    W(-2, -7, -2, -9); W(-2, -9, -12, -9); W(-12, -9, -12, 2); W(-5, -5, -7, -5); W(-7, -5, -7, -9); W(-5, 2, -12, 2);
    W(-5, -4, -6, -4); W(-5, 0, -6, 0);
    // DUTY wiper → DTC, CT + RT to ground, chip GND, OUTPUT CTRL to ground
    W(-6, 4, -5, 4); W(-3, 7, -3, 8); W(-1, 7, -1, 8); W(1, 7, 1, 8); W(3, 7, 3, 8); W(1, 8, 3, 8);
    // E1 + E2 → 22 Ω → MOSFET gate, 1 kΩ pull-down; lamp in the drain
    W(5, -2, 9, -2); W(5, 0, 9, 0); W(9, -2, 9, 1); W(9, 0, 11, 0); W(18, -4, 18, -2); W(18, 2, 18, 3);
    // scope: CH1 = gate, CH2 = the CT ramp
    W(15, 0, 15, 12); W(15, 12, 21, 12); W(-3, 8, -4, 8); W(-4, 8, -4, 15); W(-4, 15, 20, 15); W(20, 15, 20, 14); W(20, 14, 21, 14); W(24, 15, 24, 16);
  } else if (name === 'tl494inv') {
    // TL494 push-pull inverter 12 V DC → 220 V AC 50 Hz. RT 100 kΩ + CT 100 nF → oscillator 1 ÷ (100 kΩ × 100 nF) = 100 Hz;
    // OUTPUT CTRL to REF = push-pull: Q1 and Q2 take turns, each gets every 2nd cycle → 100 ÷ 2 = 50 Hz. POWER pot on DTC = dead time.
    c.tdiv = 0.01;
    const u = addPart(c, 'TL494', 0, 0); u.name = 'U1';
    const b = addPart(c, 'BAT', -16, -5, 1); b.name = 'BATT'; b.props.v = 12;
    const pot = addPart(c, 'POT', -8, 4, 1); pot.name = 'POWER'; Object.assign(pot.props, { r: 10000, pos: 90 }); pot.lbl = [-14.7, 0];
    const ct = addPart(c, 'C', -3, 10, 1); ct.name = 'CT'; Object.assign(ct.props, { c: 100e-9, vmax: 50, polar: false }); ct.lbl = [-9.4, 0];
    const rt = addPart(c, 'R', -1, 10, 1); rt.name = 'RT'; rt.props.r = 100000; rt.lbl = [0, 1];
    const r1 = addPart(c, 'R', 11, -2); r1.name = 'R1'; r1.props.r = 1000; r1.lbl = [0.8, -4.6];
    const r2 = addPart(c, 'R', 11, 0); r2.name = 'R2'; r2.props.r = 1000; r2.lbl = [5, 0.4];
    const q1 = addPart(c, 'NMOS', 15, -6); q1.name = 'Q1'; q1.props.model = 'IRFZ44N';
    const q2 = addPart(c, 'NMOS', 15, 6); q2.name = 'Q2'; q2.props.model = 'IRFZ44N';
    const t = addPart(c, 'XFMR', 22, 0); t.name = 'TR1'; Object.assign(t.props, { n1: 10, n2: 10, ns: 190, lm: 0.3, r1: 0.02, r2: 0.02, rs: 2 });
    const lp = addPart(c, 'LAMP', 29, 0, 1); lp.name = 'LOAD'; Object.assign(lp.props, { vr: 220, wr: 60 });
    addPart(c, 'SCOPE', 36, 10);
    for (const [x, y] of [[-16, -2], [-6, -4], [-6, 0], [-8, 6], [-3, 12], [-1, 12], [1, 8], [13, -2], [13, 0], [16, -3], [16, 9], [29, 3], [36, 13]]) addPart(c, 'GND', x, y);
    // +12 V rail: battery, VCC, C1 + C2, transformer center tap
    W(-16, -7, -16, -11); W(-16, -11, 18, -11); W(-16, -3, -16, -2);
    W(2, -7, 2, -11); W(5, -5, 7, -5); W(5, -4, 7, -4); W(7, -4, 7, -11); W(19, 0, 18, 0); W(18, 0, 18, -11);
    // 5 V REF → 1IN−, 2IN−, POWER pot, and down + across to OUTPUT CTRL (push-pull). 1IN+ / 2IN+ to ground: error amps off
    W(-2, -7, -2, -9); W(-2, -9, -12, -9); W(-12, -9, -12, 15); W(-5, -5, -7, -5); W(-7, -5, -7, -9); W(-5, 2, -12, 2);
    W(-5, -4, -6, -4); W(-5, 0, -6, 0); W(-12, 15, 7, 15); W(7, 15, 7, 8); W(7, 8, 3, 8); W(3, 8, 3, 7);
    // POWER wiper → DTC, CT + RT + GND
    W(-6, 4, -5, 4); W(-3, 7, -3, 8); W(-1, 7, -1, 8); W(1, 7, 1, 8);
    // E1 → Q1 gate, E2 → Q2 gate, 1 kΩ pull-downs; drains → the two ends of the primary
    W(5, -2, 9, -2); W(9, -2, 9, -6); W(9, -6, 13, -6); W(5, 0, 9, 0); W(9, 0, 9, 6); W(9, 6, 13, 6);
    W(16, -4, 16, -3); W(16, 8, 16, 9);
    W(16, -8, 19, -8); W(19, -8, 19, -2); W(16, 4, 19, 4); W(19, 4, 19, 2);
    // secondary → 220 V lamp (bottom end grounded so the scope can see it)
    W(25, -2, 29, -2); W(25, 2, 29, 2); W(29, 2, 29, 3);
    // scope: CH1 = the 220 V output, CH2 = Q2 gate
    W(29, -2, 32, -2); W(32, -2, 32, 9); W(32, 9, 33, 9); W(9, 6, 9, 13); W(9, 13, 33, 13); W(33, 13, 33, 11); W(36, 12, 36, 13);
  } else if (name === 'bms48') {
    // Pack-level protector for 2 × 24 V LiFePO4 in series (48 V). One divider watches the whole pack: U1 HIGH = "not too low" (> 44 V),
    // U2 HIGH = "not too high" (< 58 V). Q1 and Q2 are in series (AND): both HIGH → coil current → K1 connects P− to the pack. Load + charger sit on P+ / P−.
    const b1 = addPart(c, 'BAT', 0, -4, 1); b1.name = 'BATT1'; b1.lbl = [-9, 0]; Object.assign(b1.props, { v: 25.6, rint: 0.02 });
    const b2 = addPart(c, 'BAT', 0, 4, 1); b2.name = 'BATT2'; b2.lbl = [-9, 0]; Object.assign(b2.props, { v: 25.6, rint: 0.02 });
    const r1 = addPart(c, 'R', 5, -12, 1); r1.name = 'R1'; r1.props.r = 100000;
    const r2 = addPart(c, 'R', 5, -8, 1); r2.name = 'R2'; r2.props.r = 3090;
    const r3 = addPart(c, 'R', 5, -4, 1); r3.name = 'R3'; r3.props.r = 10000;
    const rs = addPart(c, 'R', 14, -12, 1); rs.name = 'RS'; Object.assign(rs.props, { r: 3300, rating: 1 });
    const z12 = addPart(c, 'ZD', 14, -8, 3); z12.name = 'ZD1';  Object.assign(z12.props, { vz: 12, pmax: 0.5 });
    const rr = addPart(c, 'R', 21, -8, 1); rr.name = 'RR'; rr.props.r = 2200;
    const z5 = addPart(c, 'ZD', 21, -4, 3); z5.name = 'ZD2'; Object.assign(z5.props, { vz: 5.1, pmax: 0.5 });
    const u1 = addPart(c, 'OPAMP', 28, 6); u1.name = 'U1'; u1.lbl = [3, -1]; u1.props.model = 'LM358';
    const u2 = addPart(c, 'OPAMP', 38, 6); u2.name = 'U2'; u2.lbl = [3, -1]; u2.props.model = 'LM358';
    const q1 = addPart(c, 'NMOS', 56, 1); q1.name = 'Q1'; q1.lbl = [6, -2.9]; q1.props.model = '2N7000';
    const q2 = addPart(c, 'NMOS', 56, 5); q2.name = 'Q2'; q2.lbl = [6, -2.9]; q2.props.model = '2N7000';
    const rc = addPart(c, 'R', 57, -12, 1); rc.name = 'RC'; Object.assign(rc.props, { r: 1500, rating: 0.5 });
    const k = addPart(c, 'RELAY', 60, -6); k.name = 'K1'; Object.assign(k.props, { vcoil: 24, rcoil: 1600, l: 0.5 });
    const df = addPart(c, 'D', 55, -6, 3); df.name = 'D1'; df.lbl = [-7, 0]; df.props.model = '1N4007';
    const lp = addPart(c, 'LAMP', 66, -12, 1); lp.name = 'LAMP'; Object.assign(lp.props, { vr: 48, wr: 100 });
    const sl = addPart(c, 'SW', 66, -8, 1); sl.name = 'LOAD'; sl.props.on = true;
    const ch = addPart(c, 'BAT', 76, -12, 1); ch.name = 'CHG 58.4V'; Object.assign(ch.props, { v: 58.4, rint: 2 });
    const sc = addPart(c, 'SW', 76, -8, 1); sc.name = 'CHARGER'; sc.props.on = false;
    for (const [x, y] of [[0, 6], [5, -2], [14, -6], [21, -2], [28, 8], [38, 8], [57, 7], [60, -4]]) addPart(c, 'GND', x, y);
    // batteries in series → PACK+ rail
    W(0, -2, 0, 2); W(0, -6, 0, -14); W(0, -14, 76, -14);
    // R1 / R2 / R3: tap A (R1–R2) → U1 IN+, tap B (R2–R3) → U2 IN−
    W(5, -10, 2, -10); W(2, -10, 2, 3); W(2, 3, 23, 3); W(23, 3, 23, 7); W(23, 7, 25, 7);
    W(5, -6, 3, -6); W(3, -6, 3, 2); W(3, 2, 33, 2); W(33, 2, 33, 5); W(33, 5, 35, 5);
    // 12 V rail (RS + 12 V zener) → op-amps; 5.1 V reference (RR + 5.1 V zener) → U1 IN−, U2 IN+
    W(14, -10, 38, -10); W(28, 4, 28, -10); W(38, 4, 38, -10);
    W(21, -6, 24, -6); W(24, -6, 24, 5); W(24, 5, 25, 5); W(24, 5, 24, 10); W(24, 10, 34, 10); W(34, 10, 34, 7); W(34, 7, 35, 7);
    // U2 → Q1 gate, U1 → Q2 gate (Q1 + Q2 in series = AND)
    W(41, 6, 42, 6); W(42, 6, 42, 1); W(42, 1, 54, 1);
    W(31, 6, 32, 6); W(32, 6, 32, 12); W(32, 12, 50, 12); W(50, 12, 50, 5); W(50, 5, 54, 5);
    // relay coil: PACK+ → RC → coil → Q1 → Q2 → GND, D1 across the coil
    W(57, -10, 57, -8); W(57, -4, 57, -1); W(55, -8, 57, -8); W(55, -4, 57, -4);
    // contact COM = GND (pack −), NO = P− : the load and the charger return through K1
    W(62, -8, 63, -8); W(63, -8, 63, -4); W(63, -4, 76, -4); W(66, -6, 66, -4); W(76, -6, 76, -4);
  } else if (name === 'bms48b') {
    // Per-battery BMS for 2 × 24 V LiFePO4 in series. Each battery is measured on its own (÷ 6): BATT2 by RD1 / RD2, BATT1 by U1, a difference amp
    // (PACK+ − middle point). Six comparators against a reference ladder: BAL (> 28.2 V → bleed that battery), UV (< 22.0 V → stop discharge),
    // OV (> 28.8 V → stop charge). Discharge: Q5 (IRF540N) in the load return. Charge: relay K1 in the charger return (separate charge port).
    const P = (t, x, y, rot, name, props, lbl) => { const p = addPart(c, t, x, y, rot); p.name = name; Object.assign(p.props, props); if (lbl) p.lbl = lbl; return p; };
    P('BAT', 0, -4, 1, 'BATT1', { v: 25.6, rint: 0.02 }); P('BAT', 0, 4, 1, 'BATT2', { v: 25.6, rint: 0.02 });
    // bleeders: BATT1 through Q1 (P-MOSFET) switched by Q2 (level shift), BATT2 through Q3
    P('PMOS', -13, -10, 0, 'Q1', { model: 'IRF9540N' }, [-8, -2.9]); P('R', -12, -6, 1, 'RB1', { r: 220, rating: 5 });
    P('R', -15, -15, 1, 'RG1', { r: 10000 }, [-8.6, 0]); P('R', -15, -6, 1, 'RG2', { r: 33000 }, [-8.6, 0]);
    P('NPN', -16, -1, 0, 'Q2', { model: '2N5551' }, [-6, -2.9]); P('R', -18, 3, 1, 'RBQ', { r: 10000 }, [-7.6, 0]);
    P('R', -12, 3, 1, 'RB2', { r: 220, rating: 5 }); P('NMOS', -13, 8, 0, 'Q3', { model: 'IRLZ44N' }, [6, -2.9]);
    // measuring: BATT2 ÷ 6 = RD1 / RD2; BATT1 ÷ 6 = U1 with RA / RB / RC / RF
    P('R', 10, 2, 1, 'RD1', { r: 100000 }); P('R', 10, 8, 1, 'RD2', { r: 20000 });
    P('OPAMP', 28, -8, 0, 'U1', { model: 'LM358' }, [-5, -6.4]);
    P('R', 20, -18, 1, 'RA', { r: 120000 }); P('R', 20, -3, 1, 'RB', { r: 20000 }); P('R', 16, -4, 1, 'RC', { r: 120000 }, [-6.6, 0]); P('R', 32, -11, 1, 'RF', { r: 20000 });
    // 12 V rail, 5.1 V reference, ladder L1–L4 → OV / BAL / UV reference voltages
    P('R', 40, -18, 1, 'RS', { r: 2200, rating: 2 }); P('ZD', 40, -14, 3, 'ZD1', { vz: 12, pmax: 0.5 }, [-7.1, 0]);
    P('R', 44, -14, 1, 'RR', { r: 2200 }); P('ZD', 44, -10, 3, 'ZD2', { vz: 5.1, pmax: 0.5 });
    P('R', 52, -10, 1, 'L1', { r: 3010 }); P('R', 52, -6, 1, 'L2', { r: 1000 }); P('R', 52, -2, 1, 'L3', { r: 10200 }); P('R', 52, 4, 1, 'L4', { r: 36500 });
    // comparators: HIGH = act (bleed / stop)
    [['BAL1', 70], ['BAL2', 80], ['UV1', 90], ['UV2', 100], ['OV1', 110], ['OV2', 120]].forEach(([n, x]) => P('OPAMP', x, -4, 0, n, { model: 'LM358' }, [3.5, -5.9]));
    // discharge: UV1 / UV2 → Q4a / Q4b pull the DSG line LOW (RGD pulls it up) → Q5 IRF540N in the load return
    P('NMOS', 97, 20, 0, 'Q4a', { model: '2N7000' }, [1, 1.6]); P('NMOS', 107, 20, 0, 'Q4b', { model: '2N7000' }, [1, 1.6]);
    P('R', 132, 14, 1, 'RGD', { r: 10000 }, [-7.4, 0]); P('NMOS', 138, 16, 0, 'Q5', { model: 'IRF540N' }, [-8, -0.4]);
    // charge: OV1 / OV2 → Q6a / Q6b pull the CHG line LOW (RGC pulls it up) → Q7 → relay K1 in the charger return
    P('NMOS', 117, 24, 0, 'Q6a', { model: '2N7000' }, [1, 1.6]); P('NMOS', 127, 24, 0, 'Q6b', { model: '2N7000' }, [1, 1.6]);
    P('R', 141, 18, 1, 'RGC', { r: 10000 }, [-7.6, -0.4]); P('NMOS', 148, 20, 0, 'Q7', { model: '2N7000' }, [0, 0.3]);
    P('RELAY', 152, 16, 0, 'K1', { vcoil: 24, rcoil: 1600, l: 0.5 }); P('R', 149, 10, 1, 'RK', { r: 1500, rating: 0.5 }); P('D', 147, 16, 3, 'D1', { model: '1N4007' }, [-6.5, -3]);
    // load and charger
    P('LAMP', 144, -16, 1, 'LAMP', { vr: 48, wr: 100 }); P('SW', 144, -10, 1, 'LOAD', { on: true });
    P('BAT', 158, -12, 1, 'CHG 58.4V', { v: 58.4, rint: 2 }); P('SW', 158, -6, 1, 'CHARGER', { on: false });
    for (const [x, y] of [[0, 6], [-15, 1], [-12, 10], [10, 10], [20, -1], [28, -6], [40, -12], [44, -8], [52, 6], [70, -2], [80, -2], [90, -2], [100, -2], [110, -2], [120, -2],
      [98, 22], [108, 22], [118, 26], [128, 26], [139, 18], [149, 22], [152, 18]]) addPart(c, 'GND', x, y);
    // batteries, PACK+ rail, middle point (BATT1 − = BATT2 +)
    W(0, -2, 0, 2); W(0, -6, 0, -20); W(-15, -20, 158, -20); W(-12, 0, 0, 0); W(0, 0, 16, 0);
    // bleeders
    W(-12, -12, -12, -20); W(-12, -4, -12, 0); W(-15, -17, -15, -20); W(-15, -13, -15, -10); W(-15, -10, -15, -8); W(-15, -4, -15, -3); W(-18, -1, -18, 1);
    W(-12, 0, -12, 1); W(-12, 5, -12, 6); W(-18, 5, -18, 28); W(-15, 8, -16, 8); W(-16, 8, -16, 27);
    // BATT2 ÷ 6 → Vb2; U1: RA / RB from PACK+, RC from the middle point, RF feedback; U1 out = BATT1 ÷ 6 → Vb1
    W(10, 4, 10, 6); W(10, 6, 12, 6); W(12, 6, 12, 14); W(12, 14, 61, 14);
    W(20, -16, 20, -5); W(20, -7, 25, -7); W(16, 0, 16, -2); W(16, -6, 16, -9); W(16, -9, 25, -9);
    W(28, -16, 28, -10); W(31, -8, 32, -8); W(32, -8, 32, -9); W(32, -13, 26, -13); W(26, -13, 26, -9); W(26, -9, 25, -9);
    W(32, -8, 34, -8); W(34, -8, 34, 12); W(34, 12, 60, 12);
    // 12 V rail, reference, ladder taps
    W(28, -16, 141, -16); W(44, -12, 52, -12); W(52, 0, 52, 2);
    // buses: UVref (y 1), Vb1 (y 2 and −11), Vb2 (y 3 and −12), OVref (y −9), BALref (y −10)
    W(60, 12, 60, -11); W(61, 14, 61, -12);
    W(52, 1, 97, 1); W(60, 2, 107, 2); W(61, 3, 117, 3);
    W(52, -8, 56, -8); W(56, -8, 56, -9); W(56, -9, 117, -9); W(52, -4, 58, -4); W(58, -4, 58, -10); W(58, -10, 77, -10);
    W(60, -11, 87, -11); W(61, -12, 97, -12);
    // comparator inputs (IN+ from below, IN− from above) and supplies
    W(67, 2, 67, -3); W(67, -10, 67, -5); W(77, 3, 77, -3); W(77, -10, 77, -5);
    W(87, 1, 87, -3); W(87, -11, 87, -5); W(97, 1, 97, -3); W(97, -12, 97, -5);
    W(107, 2, 107, -3); W(107, -9, 107, -5); W(117, 3, 117, -3); W(117, -9, 117, -5);
    for (const x of [70, 80, 90, 100, 110, 120]) W(x, -16, x, -6);
    // outputs: BAL1 / BAL2 back to the bleeders, UV → Q4a / Q4b, OV → Q6a / Q6b
    W(73, -4, 75, -4); W(75, -4, 75, 28); W(75, 28, -18, 28);
    W(83, -4, 85, -4); W(85, -4, 85, 27); W(85, 27, -16, 27);
    W(93, -4, 95, -4); W(95, -4, 95, 20); W(103, -4, 105, -4); W(105, -4, 105, 20);
    W(113, -4, 115, -4); W(115, -4, 115, 24); W(123, -4, 125, -4); W(125, -4, 125, 24);
    // DSG line → Q5 gate, CHG line → Q7 gate
    W(98, 18, 98, 16); W(108, 18, 108, 16); W(98, 16, 136, 16); W(132, 12, 132, -16);
    W(118, 22, 118, 20); W(128, 22, 128, 20); W(118, 20, 146, 20); W(141, 16, 141, -16);
    // relay coil: PACK+ → RK → coil → Q7, D1 across it; contact COM = GND, NO = charger −
    W(149, 8, 149, -20); W(149, 12, 149, 14); W(147, 14, 149, 14); W(147, 18, 149, 18);
    W(158, -14, 158, -20); W(158, -10, 158, -8); W(158, -4, 158, 14); W(158, 14, 154, 14);
    // load: PACK+ → LAMP → LOAD → Q5 drain
    W(144, -18, 144, -20); W(144, -14, 144, -12); W(144, -8, 144, 12); W(139, 14, 139, 12); W(139, 12, 144, 12);
  } else if (name === 'lm2596') {
    // LM2596S-ADJ buck module: 24 V → 5 V, up to 3 A. Vout = 1.23 V × (1 + R2 ÷ R1). SET (10 kΩ trimmer, used as a variable resistor) = R2,
    // R1 = 1 kΩ: at 31 % R2 = 3.1 kΩ → 1.23 × (1 + 3.1) = 5.04 V. L1 33 µH, D1 Schottky 3 A, CIN / COUT 220 µF. RUN closed = ON/OFF pin LOW = running.
    c.tdiv = 1e-5; c.speed = 0.001;            // 150 kHz: 1 ms of circuit time per second (start-up ≈ 6 ms)
    const P = (t, x, y, rot, name, props, lbl) => { const p = addPart(c, t, x, y, rot); p.name = name; Object.assign(p.props, props); if (lbl) p.lbl = lbl; return p; };
    P('BAT', 0, 4, 1, 'VIN', { v: 24, rint: 0.05 });
    P('C', 4, 0, 1, 'CIN', { c: 220e-6, vmax: 50 }, [-1, 4.5]);
    P('R', 8, -2, 1, 'RON', { r: 47000 }, [-1, -3.2]);
    P('SW', 10, 4, 1, 'RUN', { on: true }, [0, 3]);
    P('LM2596', 14, 0, 0, 'U1', { model: 'LM2596S-ADJ' }, [0, -7.2]);
    P('D', 21, 1, 3, 'D1', { model: '1N5822' }, [1.4, 0]);
    P('L', 25, -1, 0, 'L1', { l: 33e-6, r: 0.03 }, [0, -2.8]);
    P('C', 29, 1, 1, 'COUT', { c: 220e-6, vmax: 35 }, [0, 3.7]);
    P('VM', 32, 1, 1, 'VOUT', {});
    P('POT', 41, 3, 1, 'SET', { r: 10000, pos: 31 }, [-7.6, 0]);
    P('R', 41, 9, 1, 'R1', { r: 1000 });
    P('R', 45, 1, 1, 'LOAD', { r: 10, rating: 5 });
    P('SW', 53, 1, 1, 'BIG LOAD', { on: false });
    P('R', 53, 6, 1, 'R3', { r: 2, rating: 25 });
    addPart(c, 'SCOPE', 61, 4);
    for (const [x, y] of [[0, 6], [4, 2], [10, 6], [14, 3], [21, 3], [29, 3], [32, 3], [41, 11], [45, 3], [53, 8], [61, 6]]) addPart(c, 'GND', x, y);
    // input: VIN → CIN → U1 VIN; RON pulls ON/OFF up, RUN shorts it to GND (= on)
    W(0, 2, 0, -4); W(0, -4, 10, -4); W(4, -4, 4, -2); W(10, -4, 10, -1); W(8, 0, 8, 1); W(8, 1, 10, 1); W(10, 1, 10, 2);
    // switch node → D1 (catch diode) + L1 → output
    W(18, -1, 21, -1); W(21, -1, 23, -1); W(27, -1, 57, -1);
    // feedback: OUT → SET (R2) → FB node → R1 → GND; FB node → U1 FB
    W(41, -1, 41, 1); W(43, 3, 43, 5); W(43, 5, 41, 5); W(41, 5, 41, 7); W(18, 1, 19, 1); W(19, 1, 19, 6); W(19, 6, 41, 6);
    // big load switch, scope (CH1 = Vout, CH2 = switch node)
    W(53, 3, 53, 4); W(57, -1, 57, 3); W(57, 3, 58, 3); W(23, -1, 23, 13); W(23, 13, 56, 13); W(56, 13, 56, 5); W(56, 5, 58, 5);
  } else if (name === 'buck30') {
    // 30 A synchronous buck 24 V → 12 V: TL494 (50 kHz PWM) → IR2104 half-bridge driver → 2× IRFB4110 (high side + low side) → L1 15 µH → COUT.
    // f = 1 ÷ (RT × CT) = 1 ÷ (9.1 kΩ × 2.2 nF) = 49.95 kHz. Vout = 2.5 V × (1 + 38.3 k ÷ 10 k) = 12.08 V. Current limit = 40 mV ÷ 1 mΩ = 40 A.
    // Start: POWER on (CIN charges through RPRE 0.68 Ω, peak 24 ÷ 0.7 ≈ 35 A), wait for V IN ≥ 23.3 V, then MAIN on (bypasses RPRE). Then BIG LOAD (30 A) or SHORT.
    c.tdiv = 2e-5; c.speed = 0.001;            // 50 kHz: 1 ms of circuit time per second
    const P = (t, x, y, rot, name, props, lbl) => { const p = addPart(c, t, x, y, rot); p.name = name; Object.assign(p.props, props); if (lbl) p.lbl = lbl; return p; };
    // input: battery, precharge, bulk cap, 12 V rail
    P('BAT', -30, -18, 1, 'VIN', { v: 24, rint: 0.02 }, [-8, 0]);
    P('SW', -25, -20, 0, 'POWER', { on: false });
    P('R', -17, -20, 0, 'RPRE', { r: 0.68, rating: 10 });
    P('SW', -21, -24, 0, 'MAIN', { on: false });
    P('C', -8, -18, 1, 'CIN', { c: 2200e-6, vmax: 35 });
    P('VM', 44, -18, 1, 'V IN', {});
    P('REG', 13, -11, 0, 'U3', { model: '7812' }, [-2.6, -5.4]);
    P('C', 20, -13, 1, 'C12', { c: 47e-6, vmax: 25 });
    P('R', 30, -13, 1, 'RB', { r: 10 }, [-3.65, -3]);
    P('D', 30, -9, 1, 'DB', { model: '1N4148' }, [-9, 0]);
    // controller
    P('TL494', 8, 1, 0, 'U1', {});
    P('C', 5, 10, 1, 'CT', { c: 2.2e-9, vmax: 50, polar: false }, [-3.5, 4.5]);
    P('R', 7, 10, 1, 'RT', { r: 9100 });
    P('R', -4, -10, 1, 'RD1', { r: 1000 });
    P('R', -8, -8, 0, 'RD2', { r: 1000 }, [0, -2.9]);
    P('R', -4, -6, 1, 'RIN', { r: 2700 });
    P('C', -12, -1, 0, 'CF', { c: 22e-9, vmax: 16, polar: false }, [0, -0.9]);
    P('R', -18, -1, 0, 'RF', { r: 47000 }, [0, -0.6]);
    P('R', -8, 7, 1, 'RCL', { r: 47000 }, [-9, 0]);
    P('C', -4, 9, 0, 'CCL', { c: 10e-9, vmax: 16, polar: false }, [-1.5, 0]);
    P('R', -8, 15, 1, 'ROC1', { r: 124000 }, [-9, 0]);
    P('R', -2, 15, 1, 'ROC2', { r: 1000 }, [-7, 3.5]);
    P('R', 2, 18, 1, 'RSS', { r: 47000 });
    P('C', 10, 18, 1, 'CSS', { c: 47e-9, vmax: 16, polar: false });
    P('R', 20, 18, 1, 'RDT', { r: 470000 });
    P('R', -26, 3, 1, 'ROCF', { r: 1000 });
    P('C', -16, 3, 1, 'COCF', { c: 10e-9, vmax: 16, polar: false });
    // driver + power stage
    P('IR2104', 22, 0, 0, 'U2', {});
    P('R', 14, 1, 1, 'RPD', { r: 10000 }, [-1.9, 4.6]);
    P('C', 39, -3, 1, 'CB', { c: 1e-6, vmax: 25, polar: false });
    P('NMOS', 35, -2, 0, 'Q1', { model: 'IRFB4110' });
    P('NMOS', 35, 6, 0, 'Q2', { model: 'IRFB4110' }, [0, 1.5]);
    P('L', 42, 2, 0, 'L1', { l: 15e-6, r: 0.002 });
    // output, loads, current sense
    P('R', 48, 4, 1, 'RESR', { r: 0.01 });
    P('C', 48, 8, 1, 'COUT', { c: 2000e-6, vmax: 25 });
    P('VM', 58, 4, 1, 'VOUT', {});
    P('AM', 66, 2, 0, 'IOUT', {});
    P('R', 72, 4, 1, 'LOAD', { r: 12, rating: 25 });
    P('SW', 80, 4, 1, 'BIG LOAD', { on: false });
    P('R', 80, 8, 1, 'R30', { r: 0.4, rating: 400 });
    P('SW', 90, 4, 1, 'SHORT', { on: false });
    P('R', 90, 8, 1, 'RSC', { r: 0.05, rating: 100 });
    P('R', 98, 14, 1, 'RSENSE', { r: 0.001, rating: 3 });
    P('R', 104, 4, 1, 'RS1', { r: 38300 });
    P('R', 104, 8, 1, 'RS2', { r: 10000 });
    for (const [x, y] of [[-30, -16], [-8, -16], [44, -16], [13, -9], [20, -11], [-10, -8], [5, 12], [7, 12], [9, 8], [11, 8], [-2, 17], [2, 20], [-16, 5], [14, 3], [16, 3], [36, 8], [48, 10], [58, 6], [98, 16], [104, 10]]) addPart(c, 'GND', x, y);
    // power in: VIN → POWER → RPRE → VIN rail; MAIN bypasses RPRE
    W(-30, -20, -27, -20); W(-23, -20, -19, -20); W(-30, -20, -30, -24); W(-30, -24, -23, -24); W(-19, -24, -12, -24); W(-12, -24, -12, -20); W(-15, -20, -12, -20); W(-12, -20, 44, -20);
    W(10, -20, 10, -11); W(10, -11, 10, -6); W(36, -20, 36, -4);
    // 12 V rail: U3 → C12, RB → DB (bootstrap), U2 VCC + SD, U1 C1
    W(16, -11, 16, -15); W(16, -15, 30, -15); W(16, -11, 16, -4); W(16, -4, 16, -3); W(16, -3, 16, 1); W(16, 1, 18, 1); W(16, -3, 18, -3); W(13, -4, 16, -4); W(18, 3, 16, 3);
    // PWM: U1 E1 → U2 IN (RPD pulls it low between pulses)
    W(13, -1, 18, -1);
    // gate drive + bootstrap
    W(26, -2, 33, -2); W(26, 4, 28, 4); W(28, 4, 28, 6); W(28, 6, 33, 6);
    W(26, 0, 27, 0); W(27, 0, 27, 2); W(27, 2, 36, 2); W(36, 0, 36, 2); W(36, 2, 36, 4); W(36, 2, 40, 2);
    W(24, -7, 24, -5); W(24, -7, 39, -7); W(39, -7, 39, -5); W(39, -1, 39, 2);
    // output rail + loads; RET → RSENSE → GND
    W(44, 2, 64, 2); W(68, 2, 104, 2); W(72, 6, 72, 12); W(80, 10, 80, 12); W(90, 10, 90, 12); W(72, 12, 98, 12);
    // REF: U1 REF → divider RD1/RD2 (2.5 V); down the far left to the current-limit divider and the soft start
    W(6, -6, 6, -12); W(6, -12, -36, -12); W(-36, -12, -36, 28); W(-36, 28, 20, 28); W(-8, 17, -8, 28); W(10, 20, 10, 28); W(20, 20, 20, 28); W(-6, -8, -4, -8);
    // voltage loop: INM, RF + CF from FB, SEN from RS1/RS2
    W(3, -4, -20, -4); W(-20, -4, -20, -1); W(3, -1, -10, -1); W(-14, -1, -16, -1);
    W(3, -3, -30, -3); W(-30, -3, -30, 32); W(-30, 32, 112, 32); W(112, 32, 112, 6); W(112, 6, 104, 6);
    // current loop: CSF filter, RCL + CCL from FB to OCR, ROC1/ROC2 divider
    W(3, 1, -26, 1); W(-8, -1, -8, 5); W(-8, 9, -6, 9); W(3, 3, -2, 3); W(-2, 3, -2, 13); W(-2, 13, -8, 13);
    W(-26, 5, -26, 30); W(-26, 30, 72, 30); W(72, 30, 72, 12);
    // soft start: DTC ← CSS ∥ RDT from REF, RSS to GND
    W(3, 5, 2, 5); W(2, 5, 2, 16); W(2, 16, 20, 16);
  } else if (/^lesson\d+$/.test(name) && CODE_LESSONS[name]) {
    // code lab: ESP32 · D23 → 330 Ω → red LED · D22 → 330 Ω → green LED (PWM) · D15 INPUT_PULLUP + BTN to GND
    // D34 ← pot wiper (3.3 V / GND) · D25 DAC → voltmeter, and wired back into D35 (read the DAC with the ADC)
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = CODE_LESSONS[name]; m.props.run = true;
    const P = (t, x, y, rot, nm, props, lbl) => { const p = addPart(c, t, x, y, rot); p.name = nm; Object.assign(p.props, props); if (lbl) p.lbl = lbl; return p; };
    P('R', 8, -7, 0, 'R1', { r: 330 }); P('LED', 16, -7, 0, 'LED1', { color: 'red' });
    P('R', 8, -3, 0, 'R2', { r: 330 }); P('LED', 16, -3, 0, 'LED2', { color: 'green' });
    P('PB', 11, 5, 0, 'BTN', {});
    P('POT', -14, 0, 1, 'POT', { r: 10000, pos: 50 }, [-3.9, -3.6]);
    P('VM', -5, 4, 1, 'DAC', {}, [-8.5, 0]);
    addPart(c, 'GND', 20, 10);
    W(4, -7, 6, -7); W(10, -7, 14, -7); W(18, -7, 20, -7); W(20, -7, 20, 10);
    W(4, -6, 5, -6); W(5, -6, 5, -3); W(5, -3, 6, -3); W(10, -3, 14, -3); W(18, -3, 20, -3);
    W(4, 5, 9, 5); W(13, 5, 20, 5); W(4, 6, 5, 6); W(5, 6, 5, 10); W(5, 10, 20, 10);
    W(-12, 0, -7, 0); W(-7, 0, -7, -4); W(-7, -4, -4, -4);
    W(-4, 0, -5, 0); W(-5, 0, -5, -3); W(-5, -3, -4, -3); W(-5, 0, -5, 2);
    // pot: wiper % counts from the 3.3 V end (90 % ≈ 2.97 V). Top → GND, bottom → 3V3
    W(-14, -2, -16, -2); W(-16, -2, -16, 1); addPart(c, 'GND', -16, 1);
    W(-14, 2, -14, 9); W(-14, 9, 4, 9); W(4, 9, 4, 7);
    W(-4, 6, -6, 6); addPart(c, 'GND', -6, 6);
  } else if (name === 'tblock') {
    // screw terminals: 12 V battery (outside) → J1 → switch on the PCB → J2 → 21 W lamp (outside)
    const P = (t, x, y, rot, nm, props, lbl) => { const p = addPart(c, t, x, y, rot); p.name = nm; Object.assign(p.props, props); if (lbl) p.lbl = lbl; return p; };
    P('BAT', -12, 1, 1, 'BAT 12V', { v: 12, offboard: true }, [-9, 0]);
    P('TB', -6, 0, 0, 'J1 IN', { n: 2, pitch: '5.08' });
    P('SW', 0, 0, 0, 'S1', { on: true });
    P('TB', 8, 1, 2, 'J2 OUT', { n: 2, pitch: '5.08' });
    P('LAMP', 13, 1, 1, 'LAMP', { vr: 12, wr: 21, offboard: true });
    addPart(c, 'GND', -12, 3);
    W(-12, -1, -9, -1); W(-9, -1, -9, 0); W(-9, 0, -8, 0); W(-12, 3, -9, 3); W(-9, 3, -9, 1); W(-9, 1, -8, 1);
    W(-4, 0, -2, 0); W(2, 0, 6, 0); W(-4, 1, 6, 1);
    W(10, 0, 11, 0); W(11, 0, 11, -1); W(11, -1, 13, -1); W(10, 1, 12, 1); W(12, 1, 12, 3); W(12, 3, 13, 3);
  } else if (name === 'delay555') {
    // power-on delay: flip POWER on → C1 pulls TRIG/THR high (output LOW), R1 drains it → below 1/3 Vcc the output goes HIGH. t ≈ 1.1 × R1 × C1 ≈ 1.1 s
    c.tdiv = 0.2;
    const b = addPart(c, 'BAT', 0, 10, 1); b.props.v = 12;
    const sw = addPart(c, 'SW', 3, 2); sw.name = 'POWER'; sw.props.on = false;
    addPart(c, 'T555', 16, 10).props.model = 'NE555';
    const c1 = addPart(c, 'C', 9, 6, 1); c1.name = 'C1'; Object.assign(c1.props, { c: 10e-6, vmax: 25 });
    const r1 = addPart(c, 'R', 9, 14, 1); r1.name = 'R1'; r1.props.r = 100000;
    const c2 = addPart(c, 'C', 18, 16, 1); c2.name = 'C2'; Object.assign(c2.props, { c: 10e-9, vmax: 50, polar: false });
    const r2 = addPart(c, 'R', 24, 10); r2.name = 'R2'; r2.props.r = 1000;
    const l = addPart(c, 'LED', 29, 10); l.name = 'ON'; l.props.color = 'green';
    addPart(c, 'SCOPE', 36, 14);
    addPart(c, 'GND', 0, 18);
    W(0, 8, 0, 2); W(0, 2, 1, 2); W(5, 2, 17, 2); W(15, 6, 15, 2); W(17, 6, 17, 2);
    W(9, 4, 9, 2); W(9, 8, 9, 10); W(9, 10, 12, 10); W(12, 10, 12, 12); W(9, 12, 12, 12); W(9, 16, 9, 18);
    W(16, 14, 16, 18);
    W(20, 10, 22, 10); W(26, 10, 27, 10); W(31, 10, 31, 18);
    W(0, 12, 0, 18); W(0, 18, 36, 18); W(36, 16, 36, 18);
    W(21, 10, 21, 8); W(21, 8, 33, 8); W(33, 8, 33, 13);
    W(10, 10, 10, 0); W(10, 0, 34, 0); W(34, 0, 34, 15); W(34, 15, 33, 15);
  } else if (name === 'fridge') {
    // fridge / aircon guard: after power comes back the compressor waits ≈ 4 min (1.1 × 1 MΩ × 220 µF), so the gas pressure equalizes first.
    // D1 empties C1 at once when power drops, so even a 2-second brownout restarts the full wait.
    c.tdiv = 30; c.speed = 10;
    const b = addPart(c, 'BAT', 0, 10, 1); b.name = 'SUPPLY'; b.props.v = 12;
    const sw = addPart(c, 'SW', 3, 2); sw.name = 'MAINS'; sw.props.on = false;
    addPart(c, 'T555', 16, 10).props.model = 'NE555';
    const c1 = addPart(c, 'C', 9, 6, 1); c1.name = 'C1'; Object.assign(c1.props, { c: 220e-6, vmax: 25 });
    const r1 = addPart(c, 'R', 9, 14, 1); r1.name = 'R1'; r1.props.r = 1e6;
    const d1 = addPart(c, 'D', 6, 14, 3); d1.name = 'D1'; d1.props.model = '1N4148';
    const c2 = addPart(c, 'C', 18, 16, 1); c2.name = 'C2'; Object.assign(c2.props, { c: 10e-9, vmax: 50, polar: false });
    const r2 = addPart(c, 'R', 24, 10); r2.name = 'R2'; r2.props.r = 1000;
    addPart(c, 'NPN', 28, 10).props.model = '2N2222';
    const k = addPart(c, 'RELAY', 32, 4); Object.assign(k.props, { vcoil: 12, rcoil: 400, l: 0.12 });
    const d2 = addPart(c, 'D', 24, 4, 3); d2.name = 'D2'; d2.props.model = '1N4007';
    const lp = addPart(c, 'LAMP', 32, 10, 1); lp.name = 'FRIDGE'; Object.assign(lp.props, { vr: 12, wr: 5 });
    addPart(c, 'SCOPE', 44, 14);
    addPart(c, 'GND', 0, 18);
    W(0, 8, 0, 2); W(0, 2, 1, 2); W(5, 2, 17, 2); W(15, 6, 15, 2); W(17, 6, 17, 2);
    W(17, 2, 24, 2); W(24, 2, 29, 2); W(29, 2, 29, 0); W(29, 0, 34, 0); W(34, 0, 34, 2);
    W(9, 4, 9, 2); W(9, 8, 9, 10); W(9, 10, 12, 10); W(12, 10, 12, 12); W(9, 12, 12, 12); W(9, 16, 9, 18);
    W(6, 12, 6, 10); W(6, 10, 9, 10); W(6, 16, 6, 18);
    W(16, 14, 16, 18);
    W(20, 10, 22, 10);
    W(24, 6, 29, 6); W(29, 6, 29, 8); W(29, 12, 29, 18);
    W(32, 6, 32, 8); W(32, 12, 32, 18);
    W(0, 12, 0, 18); W(0, 18, 44, 18); W(44, 16, 44, 18);
    W(10, 10, 10, -4); W(10, -4, 41, -4); W(41, -4, 41, 13);
    W(32, 8, 39, 8); W(39, 8, 39, 15); W(39, 15, 41, 15);
  } else if (name === 'buck') {
    // DC-DC buck: 30 V in, IRLZ44N high-side switch at 50 kHz, gate driven by a floating PWM (like a bootstrap driver), 1N5819 freewheel diode,
    // 330 µH + 47 µF filter. No feedback: Vout ≈ duty × Vin (40 % → ≈ 11.8 V). Real modules (LM2596 / XL4015) add the feedback loop.
    c.tdiv = 0.002;
    const b = addPart(c, 'BAT', 0, 6, 1); b.name = 'VIN'; b.props.v = 30;
    const ci = addPart(c, 'C', 4, 6, 1); ci.name = 'CIN'; Object.assign(ci.props, { c: 100e-6, vmax: 50 });
    addPart(c, 'NMOS', 10, 2).props.model = 'IRLZ44N';
    const g = addPart(c, 'SIG', 8, 8, 1); g.name = 'PWM'; Object.assign(g.props, { wave: 'pwm', f: 50000, amp: 10, off: 0, duty: 40 });
    const rg = addPart(c, 'R', 8, 4, 1); rg.name = 'RG'; rg.props.r = 10;
    const d = addPart(c, 'D', 14, 8, 3); d.name = 'D1'; d.props.model = '1N5819';
    const l = addPart(c, 'L', 18, 6); l.name = 'L1'; Object.assign(l.props, { l: 330e-6, r: 0.05 });
    const co = addPart(c, 'C', 24, 8, 1); co.name = 'COUT'; Object.assign(co.props, { c: 47e-6, vmax: 35 });
    const rl = addPart(c, 'R', 28, 8, 1); rl.name = 'LOAD'; rl.props.r = 22;
    addPart(c, 'VM', 32, 8, 1).name = 'VOUT';
    addPart(c, 'SCOPE', 40, 10);
    addPart(c, 'GND', 0, 12);
    W(0, 4, 0, -2); W(0, -2, 11, -2); W(11, -2, 11, 0); W(4, 4, 4, -2);
    W(0, 8, 0, 12); W(4, 8, 4, 12); W(0, 12, 40, 12);
    W(11, 4, 11, 6); W(11, 6, 16, 6); W(8, 12 - 2, 11, 10); W(11, 10, 11, 6);
    W(14, 10, 14, 12);
    W(20, 6, 24, 6); W(24, 10, 24, 12); W(24, 6, 28, 6); W(28, 10, 28, 12); W(28, 6, 32, 6); W(32, 10, 32, 12);
    W(32, 6, 35, 6); W(35, 6, 35, 11); W(35, 11, 37, 11);
    W(13, 6, 13, -4); W(13, -4, 37, -4); W(37, -4, 37, 9);
  } else if (name === 'inverter') {
    // 12 V DC → 220 V AC push-pull inverter (square wave, "modified sine" style). Q1 / Q2 take turns pulling each half of the
    // center-tapped primary to ground at 50 Hz; Q3 makes Q2's gate the opposite of Q1's. Transformer 10 + 10 : 190 turns.
    c.tdiv = 0.01;
    const b = addPart(c, 'BAT', 4, 8, 1); b.name = 'BATT'; b.props.v = 12;
    const g = addPart(c, 'SIG', 2, 0, 1); g.name = 'OSC'; Object.assign(g.props, { wave: 'pwm', f: 50, amp: 10, off: 0, duty: 50 });
    const q1 = addPart(c, 'NMOS', 13, -2); q1.name = 'Q1'; q1.props.model = 'IRFZ44N';
    const q2 = addPart(c, 'NMOS', 13, 12); q2.name = 'Q2'; q2.props.model = 'IRFZ44N';
    const q3 = addPart(c, 'NPN', 6, 16); q3.name = 'Q3'; q3.props.model = '2N2222';
    const r1 = addPart(c, 'R', 8, -2); r1.name = 'R1'; r1.props.r = 100;
    const r3 = addPart(c, 'R', 0, 12, 1); r3.name = 'R3'; r3.props.r = 10000;
    const r4 = addPart(c, 'R', 9, 8, 1); r4.name = 'R4'; r4.props.r = 1000;
    const t = addPart(c, 'XFMR', 20, 6); t.name = 'TR1'; Object.assign(t.props, { n1: 10, n2: 10, ns: 190, lm: 0.3, r1: 0.02, r2: 0.02, rs: 2 });
    const lp = addPart(c, 'LAMP', 28, 6, 1); lp.name = 'LOAD'; Object.assign(lp.props, { vr: 220, wr: 60 });
    addPart(c, 'SCOPE', 36, 8);
    for (const [x, y] of [[2, 4], [4, 12], [14, 2], [14, 16], [7, 20], [28, 12], [36, 12]]) addPart(c, 'GND', x, y);
    W(2, 2, 2, 4); W(4, 10, 4, 12); W(4, 6, 9, 6); W(9, 6, 17, 6);
    W(2, -2, 6, -2); W(10, -2, 11, -2); W(14, 0, 14, 2);
    W(14, -4, 17, -4); W(17, -4, 17, 4); W(14, 10, 17, 10); W(17, 10, 17, 8); W(14, 14, 14, 16);
    W(2, -2, 0, -2); W(0, -2, 0, 10); W(0, 14, 0, 16); W(0, 16, 4, 16); W(7, 18, 7, 20);
    W(7, 14, 9, 14); W(9, 14, 9, 12); W(9, 12, 11, 12); W(9, 10, 9, 12);
    W(23, 4, 28, 4); W(23, 8, 28, 8); W(28, 8, 28, 12); W(36, 10, 36, 12);
    W(28, 4, 33, 4); W(33, 4, 33, 7); W(17, -4, 31, -4); W(31, -4, 31, 9); W(31, 9, 33, 9);
  } else if (name === 'smps') {
    // 220 V AC → 5 V DC flyback (how phone chargers work). Bridge + C1 make ≈ 310 V DC. Q1 switches the primary at 20 kHz:
    // ON stores energy in the transformer, OFF dumps it through D5 into the 5 V side. U1 + RAMP = the PWM controller (what a UC3842 does inside).
    // Feedback: above ≈ 5 V the opto LED lights (ZD1 3.3 V + LED 1.2 V + R7), its transistor pulls CTRL down → shorter pulses.
    c.tdiv = 0.005;
    const g = addPart(c, 'SIG', 6, 7); g.name = 'AC 220V'; Object.assign(g.props, { wave: 'sine', f: 50, amp: 311, off: 0, duty: 50 }); g.lbl = [-7, 3];
    [[4, 4, 'D1', -5], [4, 10, 'D2', -5], [8, 4, 'D3', 0], [8, 10, 'D4', 0]].forEach(([x, y, n, lx]) => { const d = addPart(c, 'D', x, y, 3); d.name = n; d.props.model = '1N4007'; if (lx) d.lbl = [lx, 0]; });
    const c1 = addPart(c, 'C', 10, 7, 1); c1.name = 'C1'; Object.assign(c1.props, { c: 47e-6, vmax: 400 });
    const t = addPart(c, 'XFMR', 20, 4); t.name = 'TR1'; Object.assign(t.props, { n1: 100, n2: 100, ns: 5, lm: 0.01, r1: 0.5, r2: 0.5, rs: 0.01 });
    const q = addPart(c, 'NMOS', 15, 8); q.name = 'Q1'; q.props.model = 'IRFBC40'; q.lbl = [3, 1];
    const r5 = addPart(c, 'R', 13, 14, 1); r5.name = 'R5'; r5.props.r = 10;
    const u = addPart(c, 'OPAMP', 10, 18); u.name = 'U1'; u.props.model = 'LM358';
    const vcc = addPart(c, 'BAT', 0, 20, 1); vcc.name = 'VCC 12V'; vcc.props.v = 12;
    const rp = addPart(c, 'SIG', 5, 19, 1); rp.name = 'RAMP'; Object.assign(rp.props, { wave: 'saw', f: 20000, amp: 5, off: 5, duty: 50 });
    const r6 = addPart(c, 'R', 2, 22, 1); r6.name = 'R6'; r6.props.r = 10000;
    const r8 = addPart(c, 'R', 16, 28, 1); r8.name = 'R8'; r8.props.r = 4700;
    const c4 = addPart(c, 'C', 12, 28, 1); c4.name = 'C4'; Object.assign(c4.props, { c: 10e-9, vmax: 50, polar: false });
    const d5 = addPart(c, 'D', 26, 6); d5.name = 'D5'; d5.props.model = '1N5819';
    const co = addPart(c, 'C', 30, 8, 1); co.name = 'C2'; Object.assign(co.props, { c: 470e-6, vmax: 16 });
    const rl = addPart(c, 'R', 34, 8, 1); rl.name = 'LOAD'; rl.props.r = 5;
    addPart(c, 'VM', 38, 8, 1).name = 'VOUT';
    const r7 = addPart(c, 'R', 29, 14, 1); r7.name = 'R7'; r7.props.r = 680;
    const o = addPart(c, 'OPTO', 28, 20, 1); o.name = 'U2';
    const z = addPart(c, 'ZD', 24, 18); z.name = 'ZD1'; z.props.vz = 3.3;
    addPart(c, 'SCOPE', 46, 14);
    for (const [x, y] of [[10, 12], [16, 12], [0, 22], [5, 22], [10, 22], [12, 30], [16, 30], [25, 2], [30, 10], [34, 10], [38, 10], [22, 18], [27, 24], [46, 16]]) addPart(c, 'GND', x, y);
    W(4, 6, 4, 8); W(8, 6, 8, 8); W(4, 2, 8, 2); W(8, 2, 10, 2); W(10, 2, 17, 2); W(4, 12, 8, 12); W(8, 12, 10, 12);
    W(10, 2, 10, 5); W(10, 9, 10, 12);
    W(16, 6, 16, 4); W(16, 4, 17, 4); W(16, 10, 16, 12);
    W(13, 8, 13, 12); W(13, 16, 13, 18);
    W(0, 18, 0, 15); W(0, 15, 10, 15); W(10, 15, 10, 16); W(10, 20, 10, 22); W(5, 17, 7, 17); W(5, 21, 5, 22);
    W(2, 20, 2, 15); W(2, 24, 2, 26); W(2, 26, 7, 26); W(7, 26, 7, 19);
    W(7, 26, 12, 26); W(12, 26, 16, 26); W(16, 26, 29, 26); W(29, 26, 29, 22);
    W(23, 2, 25, 2); W(23, 6, 24, 6); W(28, 6, 30, 6); W(30, 6, 34, 6); W(34, 6, 38, 6);
    W(32, 6, 32, 12); W(32, 12, 29, 12); W(29, 16, 29, 18); W(26, 18, 27, 18); W(27, 22, 27, 24);
    W(38, 6, 41, 6); W(41, 6, 41, 15); W(41, 15, 43, 15);
    W(16, 4, 16, -2); W(16, -2, 43, -2); W(43, -2, 43, 13);
  } else if (name === 'buckreg') {
    // regulated buck like an XL4015 / LM2596 module: 0–30 V in, 0–20 V out set by RV1. U1 compares the output (divided by ≈ 4.3, plus a small
    // ramp) with the RV1 reference: below → Q2 pulls Q1's gate down → Q1 (P-MOSFET) on. ZD1 keeps Q1's gate within 12 V.
    c.tdiv = 0.001;
    const b = addPart(c, 'BAT', -8, 6, 1); b.name = 'VIN'; Object.assign(b.props, { v: 24, rint: 0.5 });
    const pw = addPart(c, 'SW', -6, 0); pw.name = 'POWER'; pw.props.on = false;
    addPart(c, 'GND', -8, 14);
    const ci = addPart(c, 'C', 3, 4, 1); ci.name = 'CIN'; Object.assign(ci.props, { c: 100e-6, vmax: 50 });
    const q1 = addPart(c, 'PMOS', 12, 2); q1.name = 'Q1'; q1.props.model = 'IRF9540N';
    const rpu = addPart(c, 'R', 8, 2, 1); rpu.name = 'R1'; rpu.props.r = 2200;
    const z1 = addPart(c, 'ZD', 6, 2, 3); z1.name = 'ZD1'; z1.props.vz = 12;
    const rc = addPart(c, 'R', 10, 6, 1); rc.name = 'R2'; rc.props.r = 470;
    const q2 = addPart(c, 'NPN', 9, 10); q2.name = 'Q2'; q2.props.model = '2N2222';
    const d1 = addPart(c, 'D', 13, 8, 3); d1.name = 'D1'; d1.props.model = '1N5819';
    const l = addPart(c, 'L', 17, 4); l.name = 'L1'; Object.assign(l.props, { l: 100e-6, r: 0.05 });
    const co = addPart(c, 'C', 21, 8, 1); co.name = 'COUT'; Object.assign(co.props, { c: 220e-6, vmax: 35 });
    addPart(c, 'VM', 24, 8, 1).name = 'VOUT';
    const rl = addPart(c, 'R', 27, 8, 1); rl.name = 'LOAD'; rl.props.r = 22;
    const sw = addPart(c, 'SW', 31, 4); sw.name = 'LOAD2 ON'; sw.props.on = false;
    const rl2 = addPart(c, 'R', 35, 8, 1); rl2.name = 'LOAD2'; rl2.props.r = 10;
    const u = addPart(c, 'OPAMP', 12, 22, 2); u.name = 'U1'; u.props.model = 'LM358';
    const rb = addPart(c, 'R', 9, 17, 1); rb.name = 'R3'; rb.props.r = 4700;
    const rf1 = addPart(c, 'R', 22, 15, 1); rf1.name = 'RF1'; rf1.props.r = 30000;
    const rf2 = addPart(c, 'R', 22, 25, 1); rf2.name = 'RF2'; rf2.props.r = 10000;
    const ri = addPart(c, 'R', 24, 23); ri.name = 'R4'; ri.props.r = 100000;
    const rp = addPart(c, 'SIG', 26, 27, 1); rp.name = 'RAMP'; Object.assign(rp.props, { wave: 'saw', f: 50000, amp: 2.5, off: 0, duty: 50 });
    const rz = addPart(c, 'R', 35, 16); rz.name = 'R5'; rz.props.r = 2200;
    const z2 = addPart(c, 'ZD', 31, 14, 1); z2.name = 'ZD2'; z2.props.vz = 5.1;
    const pot = addPart(c, 'POT', 27, 16, 2); pot.name = 'RV1 SET'; Object.assign(pot.props, { r: 10000, pos: 45 });
    const css = addPart(c, 'C', 30, 20, 1); css.name = 'CSS'; Object.assign(css.props, { c: 1e-6, vmax: 16, polar: false });
    z1.lbl = [-5, -1]; rpu.lbl = [-1, -4]; q1.lbl = [3, -5]; co.lbl = [-5.5, 1.5]; rl.lbl = [0, 5.5]; rf1.lbl = [1, 1]; pot.lbl = [-2, 3.5]; z2.lbl = [1, -1.5]; rz.lbl = [0, 2]; ri.lbl = [0, -1.5]; rf2.lbl = [-5, 0]; d1.lbl = [0, 3.5];
    addPart(c, 'SCOPE', 30, -4);
    for (const [x, y] of [[22, 27], [26, 29], [30, -2], [30, 22]]) addPart(c, 'GND', x, y);
    W(-8, 4, -8, 0); W(-8, 8, -8, 14); W(-4, 0, 3, 0); W(3, 0, 6, 0); W(6, 0, 8, 0); W(8, 0, 13, 0); W(13, 0, 38, 0);
    W(3, 0, 3, 2); W(3, 6, 3, 12);
    W(-8, 12, 3, 12); W(3, 12, 35, 12);
    W(6, 4, 8, 4); W(8, 4, 10, 4); W(10, 4, 10, 2);
    W(13, 4, 13, 6); W(13, 10, 13, 12); W(13, 4, 15, 4);
    W(19, 4, 21, 4); W(21, 4, 21, 6); W(21, 10, 21, 12); W(21, 4, 22, 4); W(22, 4, 24, 4); W(24, 4, 24, 6); W(24, 10, 24, 12);
    W(24, 4, 27, 4); W(27, 4, 27, 6); W(27, 10, 27, 12); W(27, 4, 29, 4); W(33, 4, 35, 4); W(35, 4, 35, 6); W(35, 10, 35, 12);
    W(9, 22, 9, 19); W(9, 15, 9, 14); W(9, 14, 7, 14); W(7, 14, 7, 10);
    W(12, 20, 12, 12); W(-4, 0, -4, 28); W(-4, 28, 12, 28); W(12, 28, 12, 24);
    W(22, 4, 22, 13); W(22, 17, 22, 23); W(22, 23, 15, 23); W(26, 23, 26, 25);
    W(38, 0, 38, 16); W(37, 16, 38, 16); W(31, 16, 33, 16); W(29, 16, 31, 16); W(25, 16, 25, 12);
    W(27, 18, 27, 21); W(27, 21, 15, 21); W(27, 18, 30, 18);
    W(24, 4, 24, -3); W(24, -3, 27, -3); W(15, 4, 15, -5); W(15, -5, 27, -5);
  } else if (name === 'lcd') {
    // ESP32 + LCD 16×2 I2C (SDA = GPIO21, SCL = GPIO22) shows the pot voltage. The code runs by itself (💻 Code in the ESP32 panel).
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.code = '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\n\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // address 0x27, 16 x 2\n\nvoid setup() {\n  lcd.init();\n  lcd.backlight();\n  lcd.setCursor(0, 0);\n  lcd.print("Fox9nertron");\n}\n\nvoid loop() {\n  int raw = analogRead(34);           // pot on GPIO34\n  float v = raw * 3.3 / 4095;\n  lcd.setCursor(0, 1);\n  lcd.print("Pot: ");\n  lcd.print(v, 2);\n  lcd.print(" V   ");\n  delay(200);\n}\n';
    m.props.run = true;
    const d = addPart(c, 'LCD', 17, -5); d.name = 'LCD1';
    const pot = addPart(c, 'POT', -10, -2); pot.name = 'RV1'; pot.props.pos = 60;
    addPart(c, 'GND', 9, -3); addPart(c, 'GND', -6, 6); addPart(c, 'GND', -12, -2);
    W(4, -6, 10, -6); W(4, -3, 7, -3); W(7, -3, 7, -5); W(7, -5, 10, -5);
    W(10, -3, 9, -3); W(10, -4, 8, -4); W(8, -4, 8, 9); W(8, 9, -4, 9); W(-4, 9, -4, 7); W(-4, 6, -6, 6);
    W(-10, -4, -4, -4); W(4, 7, 6, 7); W(6, 7, 6, 11); W(6, 11, -14, 11); W(-14, 11, -14, 0); W(-14, 0, -8, 0); W(-8, 0, -8, -2);
  } else if (name === 'ads1115') {
    // 0–25 V voltage sensor: VIN + SET pot make the voltage to measure, R1 68 k / R2 10 k divide it into ADS1115 A0, C1 filters.
    // The ESP32 reads the ADS1115 over I2C and shows it on the LCD (both on GPIO21 / 22). VM1 shows the real voltage to compare.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.ads1115; m.props.run = true;
    const d = addPart(c, 'LCD', 21, -8); d.name = 'LCD1';
    const u = addPart(c, 'ADS1115', 19, 4); u.name = 'ADS1';
    addPart(c, 'GND', 13, -6); addPart(c, 'GND', -6, 6); addPart(c, 'GND', 14, 6);
    // SCL bus (x = 6) and SDA bus (x = 8)
    W(4, -6, 6, -6); W(6, -9, 6, 1); W(6, -9, 14, -9); W(6, 1, 15, 1);
    W(4, -3, 8, -3); W(8, -8, 8, 2); W(8, -8, 14, -8); W(8, 2, 15, 2);
    // LCD: GND, 5 V from VIN around the top
    W(14, -6, 13, -6);
    W(14, -7, 11, -7); W(11, -7, 11, -11); W(11, -11, -8, -11); W(-8, -11, -8, 9); W(-8, 9, -4, 9); W(-4, 9, -4, 7);
    W(-4, 6, -6, 6);
    // ADS1115: VDD from 3V3, GND
    W(4, 7, 12, 7); W(12, 7, 12, 5); W(12, 5, 15, 5); W(15, 6, 14, 6);
    // A0 node: R1 from the pot wiper, R2 + C1 to GND
    const r1 = addPart(c, 'R', 33, 2); r1.name = 'R1'; r1.props.r = 68000;
    const r2 = addPart(c, 'R', 24, 5, 1); r2.name = 'R2'; r2.props.r = 10000;
    const c1 = addPart(c, 'C', 29, 5, 1); c1.name = 'C1'; Object.assign(c1.props, { c: 100e-9, vmax: 50, polar: false });
    W(23, 2, 31, 2); W(24, 2, 24, 3); W(29, 2, 29, 3); W(24, 7, 24, 9); W(29, 7, 29, 9); W(24, 9, 29, 9); addPart(c, 'GND', 26, 9);
    // the voltage to measure: 24 V supply + SET pot (wiper = 0…24 V), VM1 shows it
    const pot = addPart(c, 'POT', 40, 2, 3); pot.name = 'SET'; pot.props.pos = 50;
    const b = addPart(c, 'BAT', 50, 2, 1); b.name = 'VIN'; b.props.v = 24;
    const vm = addPart(c, 'VM', 38, 7, 1); vm.name = 'VM1';
    W(35, 2, 38, 2); W(40, 0, 50, 0); W(40, 4, 50, 4); addPart(c, 'GND', 46, 4); W(38, 2, 38, 5); W(38, 9, 38, 10); addPart(c, 'GND', 38, 10);
  } else if (name === 'mqtt') {
    // ESP32 on WiFi + MQTT: relay modules on GPIO19 / 18 switch two 12 V lamps, DHT22 on GPIO4 sends temperature. 📡 box = the broker.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.mqtt; m.props.run = true;
    const d = addPart(c, 'DHT', 12, 3); d.name = 'DHT1'; d.props.temp = 29;
    addPart(c, 'GND', 9, 4); addPart(c, 'GND', -6, 6); W(-4, 6, -6, 6);
    W(4, 3, 9, 3); W(4, 7, 16, 7); W(16, 7, 16, 1); W(16, 1, 9, 1); W(9, 1, 9, 2);
    const k1 = addPart(c, 'RMOD', 24, -8); k1.name = 'RLY1';
    const k2 = addPart(c, 'RMOD', 24, -2); k2.name = 'RLY2';
    const ps = addPart(c, 'BAT', 20, -13); ps.name = 'PSU'; ps.props.v = 5; addPart(c, 'GND', 22, -13);
    W(18, -13, 18, -3); W(18, -9, 21, -9); W(18, -3, 21, -3);                 // 5 V rail
    W(19, -8, 19, 0); W(19, -8, 21, -8); W(19, -2, 21, -2); addPart(c, 'GND', 19, 0);   // GND rail
    W(4, -2, 8, -2); W(8, -2, 8, -7); W(8, -7, 21, -7);                        // GPIO19 → RLY1 IN
    W(4, -1, 21, -1);                                                           // GPIO18 → RLY2 IN
    const b = addPart(c, 'BAT', 33, -12); b.name = 'B12'; b.props.v = 12; addPart(c, 'GND', 35, -12);
    W(31, -12, 29, -12); W(29, -12, 29, -2); W(27, -8, 29, -8); W(27, -2, 29, -2);   // 12 V → both COM
    const l1 = addPart(c, 'LAMP', 34, -9); l1.name = 'LAMP1'; const l2 = addPart(c, 'LAMP', 34, -3); l2.name = 'LAMP2';
    W(27, -9, 32, -9); W(27, -3, 32, -3); addPart(c, 'GND', 36, -9); addPart(c, 'GND', 36, -3);
  } else if (name === 'bank48' || name === 'ina219') {
    // ESP32 + LCD 16×2 (same I2C wiring as the ADS1115 example): SCL bus x = 6, SDA bus x = 8, LCD 5 V from VIN
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX[name]; m.props.run = true;
    addPart(c, 'LCD', 21, -8).name = 'LCD1';
    addPart(c, 'GND', 13, -6); addPart(c, 'GND', -6, 6);
    W(4, -6, 6, -6); W(6, -9, 6, 1); W(6, -9, 14, -9); W(6, 1, 15, 1);
    W(4, -3, 8, -3); W(8, -8, 8, 2); W(8, -8, 14, -8); W(8, 2, 15, 2);
    W(14, -6, 13, -6);
    W(14, -7, 11, -7); W(11, -7, 11, -11); W(11, -11, -8, -11); W(-8, -11, -8, 9); W(-8, 9, -4, 9); W(-4, 9, -4, 7);
    W(-4, 6, -6, 6);
    if (name === 'bank48') {
      // 48 V LiFePO4 bank (16S) + ACS712-30A on the + line + 10 Ω load. ADS1115: A0 = bank ÷ 21, A1 = ACS712 OUT × 2/3.
      const u = addPart(c, 'ADS1115', 19, 4); u.name = 'ADS1';
      W(4, 7, 12, 7); W(12, 7, 12, 5); W(12, 5, 15, 5); W(15, 6, 14, 6); addPart(c, 'GND', 14, 6);
      const r1 = addPart(c, 'R', 28, 2); r1.name = 'R1'; r1.props.r = 200000; r1.lbl = [0, -2.6];
      const r2 = addPart(c, 'R', 26, 4, 1); r2.name = 'R2'; r2.props.r = 10000; addPart(c, 'GND', 26, 6);
      W(23, 2, 26, 2);
      const r3 = addPart(c, 'R', 32, 8); r3.name = 'R3'; r3.props.r = 10000; r3.lbl = [0, -2.6];
      const r4 = addPart(c, 'R', 30, 10, 1); r4.name = 'R4'; r4.props.r = 20000; addPart(c, 'GND', 30, 12);
      W(23, 3, 24, 3); W(24, 3, 24, 8); W(24, 8, 30, 8);
      const a = addPart(c, 'ACS712', 40, 8); a.name = 'ACS1'; a.props.model = '30A'; addPart(c, 'GND', 37, 9);
      W(34, 8, 37, 8); W(11, -11, 36, -11); W(36, -11, 36, 7); W(36, 7, 37, 7);   // ACS712 VCC = 5 V
      const b = addPart(c, 'BAT', 47, 9, 1); b.name = 'BANK'; b.props.v = 53; b.props.rint = 0.05; addPart(c, 'GND', 47, 11);
      W(43, 7, 47, 7); W(30, 2, 45, 2); W(45, 2, 45, 7);
      const sw = addPart(c, 'SW', 43, 13, 1); sw.name = 'LOAD'; sw.props.on = false;
      const rl = addPart(c, 'R', 43, 19, 1); rl.name = 'RLOAD'; rl.props.r = 10; rl.props.rating = 300; addPart(c, 'GND', 43, 21);
      W(43, 9, 43, 11); W(43, 15, 43, 17);
    } else {
      // INA219 high-side on a 12 V supply: lamp 10 W always on, lamp 21 W by switch S1
      const u = addPart(c, 'INA219', 19, 3); u.name = 'INA1';
      W(4, 7, 12, 7); W(12, 7, 12, 4); W(12, 4, 15, 4); W(15, 5, 14, 5); addPart(c, 'GND', 14, 5);
      const b = addPart(c, 'BAT', 34, 4, 1); b.name = 'B12'; b.props.v = 12; b.props.rint = 0.05; addPart(c, 'GND', 34, 6);
      W(23, 2, 34, 2);
      const l1 = addPart(c, 'LAMP', 23, 7, 1); l1.name = 'LAMP1'; l1.props.wr = 10; l1.lbl = [-6, 1.8]; addPart(c, 'GND', 23, 9); W(23, 4, 23, 5);
      const sw = addPart(c, 'SW', 27, 6, 1); sw.name = 'S1'; sw.props.on = false; W(23, 4, 27, 4);
      const l2 = addPart(c, 'LAMP', 27, 12, 1); l2.name = 'LAMP2'; l2.props.wr = 21; addPart(c, 'GND', 27, 14); W(27, 8, 27, 10);
    }
  } else if (name === 'solar') {
    // two 100 W panels in the same sun: top one on a PWM controller, bottom one on an MPPT controller, each charging a 12 V LiFePO4
    for (const [k, y, mode] of [[1, 0, 'pwm'], [2, 13, 'mppt']]) {
      const pv = addPart(c, 'PV', 0, y, 1); pv.name = 'PV' + k; pv.props.model = '100W'; pv.props.sun = 100; pv.lbl = [-1, 5.2];
      const u = addPart(c, 'SCC', 10, y); u.name = 'SCC' + k; u.props.mode = mode; u.props.bat = 'lfp12'; u.props.imax = 20;
      W(0, y - 3, 6, y - 3); W(6, y - 3, 6, y - 1); W(0, y + 3, 6, y + 3); W(6, y + 3, 6, y + 1); addPart(c, 'GND', 6, y + 3);
      const b = addPart(c, 'BAT', 25, y + 1, 1); b.name = 'BAT' + k; b.props.v = 13.2; b.props.rint = 0.02; addPart(c, 'GND', 25, y + 3);
      W(14, y - 1, 25, y - 1);
      const l = addPart(c, 'LAMP', 16, y + 4, 1); l.name = 'LOAD' + k; l.props.wr = 10; addPart(c, 'GND', 16, y + 6);
      W(14, y + 1, 16, y + 1); W(16, y + 1, 16, y + 2);
    }
  } else if (name === 'rtc') {
    // ESP32 + DS3231 + LCD: relay module on GPIO26 turns a 12 V lamp ON 18:00–06:00. The clock starts at 17:55 and runs ×60.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.rtc; m.props.run = true;
    addPart(c, 'LCD', 21, -8).name = 'LCD1'; addPart(c, 'GND', 13, -6);
    W(4, -6, 6, -6); W(6, -9, 6, 1); W(6, -9, 14, -9); W(6, 1, 15, 1);
    W(4, -3, 8, -3); W(8, -8, 8, 2); W(8, -8, 14, -8); W(8, 2, 15, 2);
    W(14, -6, 13, -6); W(14, -7, 11, -7); W(11, -7, 11, -11); W(11, -11, -7, -11); W(-7, -11, -7, 9);
    const r = addPart(c, 'DS3231', 19, 1); r.name = 'RTC1'; r.props.start = '2026-11-07T17:55:00'; r.props.speed = 60;
    W(4, 7, 12, 7); W(12, 7, 12, 3); W(12, 3, 15, 3); W(15, 4, 14, 4); addPart(c, 'GND', 14, 4);
    const k = addPart(c, 'RMOD', -13, 2, 2); k.name = 'RLY1';
    W(-4, 1, -10, 1); W(-10, 2, -8, 2); addPart(c, 'GND', -8, 2);
    W(-10, 3, -10, 9); W(-10, 9, -4, 9); W(-4, 9, -4, 7);                     // relay 5 V from VIN
    W(-4, 6, -6, 6); addPart(c, 'GND', -6, 6);
    const b = addPart(c, 'BAT', -22, 4, 1); b.name = 'B12'; b.props.v = 12; addPart(c, 'GND', -22, 6);
    W(-16, 2, -22, 2);
    const l = addPart(c, 'LAMP', -16, 7, 1); l.name = 'LIGHTS'; addPart(c, 'GND', -16, 9); W(-16, 3, -16, 5);
  } else if (name === 'byj') {
    // ESP32 → ULN2003 board → 28BYJ-48: IN1–IN4 on GPIO19, 18, 5, 17. Motor 5 V from its own supply, grounds joined.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.byj; m.props.run = true;
    addPart(c, 'BYJ', 14, 0).name = 'M1';
    W(4, -2, 10, -2); W(4, -1, 10, -1); W(4, 0, 10, 0); W(4, 1, 10, 1);
    W(10, 2, 7, 2); W(7, 2, 7, 5);
    const ps = addPart(c, 'BAT', 7, 7, 1); ps.name = 'PSU'; ps.props.v = 5; addPart(c, 'GND', 7, 9);
    W(10, 3, 9, 3); addPart(c, 'GND', 9, 3);
    W(-4, 6, -6, 6); addPart(c, 'GND', -6, 6);
  } else if (name === 'nova') {
    // Fox9ner Nova bridge, real pins: ESP32 + D1 mini Datalogger shield (SD on VSPI) + J1 = 2×4 header to the Lunyee Offline socket (power) + J2 = CH340G tap (data)
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.nova; m.props.run = true;
    const sd = addPart(c, 'D1SD', 20, -1, 2); sd.name = 'SD1'; sd.props.files = {};
    W(4, -1, 15, -1);                                            // GPIO18 → shield D5 (SCK)
    W(4, -2, 15, -2);                                            // GPIO19 ← shield D6 (MISO)
    W(4, -7, 13, -7); W(13, -7, 13, -3); W(13, -3, 15, -3);      // GPIO23 → shield D7 (MOSI)
    W(4, 0, 10, 0); W(10, 0, 10, -4); W(10, -4, 15, -4);         // GPIO5 → shield D8 (CS)
    W(25, -4, 27, -4); addPart(c, 'GND', 27, -4);                // shield GND
    W(4, 7, 5, 7); W(5, 7, 5, 17); W(5, 17, 14, 17); W(14, 17, 14, -5); W(14, -5, 15, -5);   // 3V3 → shield 3V3 (never 5 V)
    // J1: Lunyee Offline socket, ONLY for power: 5V + GND. Its data pins can't be used (the steady pin restarts the board).
    const j = addPart(c, 'SIL', 12, 8, 1); j.name = 'J1 LUNYEE'; j.props.n = 4; j.props.rows = 2; j.props.names = '5V*,0V,nc,nc,GND,GND,5V,5V';
    // J2: 3 wires to the Lunyee's CH340G (pin 2 leg lifted + 1 kΩ leg↔pad): 1 = pad 2 (Lunyee RX), 2 = pin 3 (Lunyee TX), 3 = GND
    const j2 = addPart(c, 'SIL', 12, 3, 0); j2.name = 'J2 CH340'; j2.props.n = 3; j2.props.rows = 1; j2.props.names = 'RXpad2,TXpin3,GND';
    W(4, 1, 9, 1); W(9, 1, 9, 3); W(9, 3, 11, 3);                // GPIO17 (TX2) → J2-1 → CH340G pad 2 = Lunyee RX (direct, no resistor)
    W(4, 2, 8, 2); W(8, 2, 8, 4); W(8, 4, 11, 4);                // J2-2 ← CH340G pin 3 = Lunyee TX → GPIO16 (RX2)
    W(11, 5, 10, 5); addPart(c, 'GND', 10, 5);                   // J2-3 GND
    W(10, 13, 10, 14); addPart(c, 'GND', 10, 14);                // J1-6 GND
    W(9, 13, 9, 16); W(9, 16, -4, 16); W(-4, 16, -4, 7);         // J1-8 5V → VIN
    // noise protection (the router sparks): 10 µF + 100 nF on VIN, 1 nF on GPIO16
    const c1 = addPart(c, 'C', -2, 18, 1); c1.name = 'C1'; c1.lbl = [-5.4, 0]; Object.assign(c1.props, { c: 10e-6, vmax: 16, polar: true }); addPart(c, 'GND', -2, 20);
    const c2 = addPart(c, 'C', 1, 18, 1); c2.name = 'C2'; Object.assign(c2.props, { c: 100e-9, vmax: 50, polar: false }); addPart(c, 'GND', 1, 20);
    const c3 = addPart(c, 'C', 6, 4, 1); c3.name = 'C3'; Object.assign(c3.props, { c: 1e-9, vmax: 50, polar: false }); addPart(c, 'GND', 6, 6);
    W(-4, 6, -6, 6); addPart(c, 'GND', -6, 6);
  } else if (name === 'd1sd') {
    // ESP32 + WeMos D1 mini Datalogger shield (micro SD on SPI + DS1307 on I2C) + DHT22 on GPIO27
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.d1sd; m.props.run = true;
    const sd = addPart(c, 'D1SD', 20, 2); sd.name = 'SD1'; sd.props.files = {}; sd.props.speed = 1;
    // shield right row (D5 SCK, D6 MISO, D7 MOSI, D8 CS, 3V3) around the top to the ESP32 VSPI pins
    W(25, 2, 27, 2); W(27, 2, 27, -9); W(27, -9, 10, -9); W(10, -9, 10, -1); W(10, -1, 4, -1);        // D5 SCK → GPIO18
    W(25, 3, 28, 3); W(28, 3, 28, -10); W(28, -10, 9, -10); W(9, -10, 9, -2); W(9, -2, 4, -2);        // D6 MISO → GPIO19
    W(25, 4, 29, 4); W(29, 4, 29, -11); W(29, -11, 8, -11); W(8, -11, 8, -7); W(8, -7, 4, -7);        // D7 MOSI → GPIO23
    W(25, 5, 30, 5); W(30, 5, 30, -12); W(30, -12, 11, -12); W(11, -12, 11, 0); W(11, 0, 4, 0);       // D8 CS → GPIO5
    W(25, 6, 31, 6); W(31, 6, 31, -13); W(31, -13, 12, -13); W(12, -13, 12, 7); W(12, 7, 4, 7);       // 3V3 → 3V3
    // left row: D2 SDA, D1 SCL, GND, 5V (DS1307)
    W(15, 2, 13, 2); W(13, 2, 13, -3); W(13, -3, 4, -3);                                           // D2 SDA → GPIO21
    W(15, 1, 14, 1); W(14, 1, 14, -6); W(14, -6, 4, -6);                                           // D1 SCL → GPIO22
    W(15, 5, 14, 5); W(14, 5, 14, 8); addPart(c, 'GND', 14, 8);                                    // GND
    W(15, 6, 13, 6); W(13, 6, 13, 10); W(13, 10, -4, 10); W(-4, 10, -4, 7);                        // 5V ← VIN
    W(-4, 6, -6, 6); addPart(c, 'GND', -6, 6);
    // DHT22 on GPIO27, 3.3 V
    const d = addPart(c, 'DHT', -12, 2, 2); d.name = 'DHT1'; d.props.temp = 31; d.props.hum = 70;
    W(-4, 2, -9, 2);                                                                                 // DATA → GPIO27
    W(-9, 3, -7, 3); W(-7, 3, -7, 11); W(-7, 11, 12, 11); W(12, 11, 12, 7);                         // VCC ← 3V3
    W(-9, 1, -8, 1); W(-8, 1, -8, -1); addPart(c, 'GND', -8, -1);
  } else if (name === 'sdlog') {
    // ESP32 + micro SD card module (VSPI: SCK 18, MISO 19, MOSI 23, CS 5, VCC 5 V from VIN) + DHT22 on GPIO4: a CSV data logger
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.sdlog; m.props.run = true;
    const sd = addPart(c, 'SDCARD', 20, 0); sd.name = 'SD1'; sd.props.files = {};
    W(4, -2, 16, -2);                                            // MISO → GPIO19
    W(4, -7, 13, -7); W(13, -7, 13, -1); W(13, -1, 16, -1);      // MOSI ← GPIO23
    W(4, -1, 11, -1); W(11, -1, 11, 0); W(11, 0, 16, 0);         // SCK ← GPIO18
    W(4, 0, 8, 0); W(8, 0, 8, 1); W(8, 1, 16, 1);                // CS ← GPIO5
    W(16, 2, 14, 2); W(14, 2, 14, 10); W(14, 10, -4, 10); W(-4, 10, -4, 7);   // VCC = 5 V from VIN
    W(16, 3, 16, 5); addPart(c, 'GND', 16, 5);
    const d = addPart(c, 'DHT', 10, 5); d.name = 'DHT1'; d.props.temp = 30; d.props.hum = 65;
    W(4, 3, 6, 3); W(6, 3, 6, 5); W(6, 5, 7, 5);                 // DATA → GPIO4
    W(4, 7, 5, 7); W(5, 7, 5, 4); W(5, 4, 7, 4);                 // VCC 3.3 V
    addPart(c, 'GND', 7, 6);
    W(-4, 6, -6, 6); addPart(c, 'GND', -6, 6);
  } else if (name === 'oled') {
    // ESP32 + OLED 128×64 SSD1306 I2C (SDA = GPIO21, SCL = GPIO22): text, a bar and a moving graph of the pot voltage
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.oled; m.props.run = true;
    const d = addPart(c, 'OLED', 15, -5); d.name = 'OLED1'; d.props.color = 'yb';
    const pot = addPart(c, 'POT', -10, -2); pot.name = 'RV1'; pot.props.pos = 60;
    addPart(c, 'GND', 9, -3); addPart(c, 'GND', -6, 6); addPart(c, 'GND', -12, -2);
    W(4, -6, 10, -6); W(4, -3, 7, -3); W(7, -3, 7, -5); W(7, -5, 10, -5);
    W(10, -3, 9, -3); W(10, -4, 8, -4); W(8, -4, 8, 9); W(8, 9, -4, 9); W(-4, 9, -4, 7); W(-4, 6, -6, 6);
    W(-10, -4, -4, -4); W(4, 7, 6, 7); W(6, 7, 6, 11); W(6, 11, -14, 11); W(-14, 11, -14, 0); W(-14, 0, -8, 0); W(-8, 0, -8, -2);
  } else if (name === 'encoder') {
    // ESP32 + KY-040 rotary encoder (interrupt on CLK) + OLED menu + LED. Turn = move, push = choose
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.encoder; m.props.run = true;
    const d = addPart(c, 'OLED', 15, -5); d.name = 'OLED1'; d.props.color = 'yb';
    addPart(c, 'ENC', -12, 0).name = 'ENC1';
    const r = addPart(c, 'R', 7, -10); r.name = 'R1'; r.props.r = 330;
    addPart(c, 'LED', 12, -10).name = 'LED1';
    addPart(c, 'GND', 9, -3); addPart(c, 'GND', -6, 6); addPart(c, 'GND', -8, 2); addPart(c, 'GND', 15, -10);
    // OLED (same as the OLED example)
    W(4, -6, 10, -6); W(4, -3, 7, -3); W(7, -3, 7, -5); W(7, -5, 10, -5);
    W(10, -3, 9, -3); W(10, -4, 8, -4); W(8, -4, 8, 9); W(8, 9, -4, 9); W(-4, 9, -4, 7); W(-4, 6, -6, 6);
    // encoder: CLK → GPIO32, DT → GPIO33, SW → GPIO25, + → 3V3, GND
    W(-9, -2, -4, -2); W(-9, -1, -4, -1); W(-9, 0, -4, 0); W(-9, 2, -8, 2);
    W(-9, 1, -7, 1); W(-7, 1, -7, 11); W(-7, 11, 6, 11); W(6, 11, 6, 7); W(6, 7, 4, 7);
    // LED on GPIO23 through 330 Ω
    W(4, -7, 5, -7); W(5, -7, 5, -10); W(9, -10, 10, -10); W(14, -10, 15, -10);
  } else if (name === 'sr595sig') {
    // 74HC595 by hand: one signal generator is the DATA (SER), another the CLOCK (SRCLK). RCLK tied to SRCLK. 8 LEDs show QA … QH.
    const u = addPart(c, 'SR595', 0, 0); u.name = 'U1'; u.lbl = [4.5, 0];
    const clk = addPart(c, 'SIG', -12, 2, 1); clk.name = 'CLK'; Object.assign(clk.props, { wave: 'pwm', f: 2, amp: 5, off: 0, duty: 50 });
    const ser = addPart(c, 'SIG', -24, 2, 1); ser.name = 'SER'; Object.assign(ser.props, { wave: 'pwm', f: 0.3, amp: 5, off: 0, duty: 50 });
    const b = addPart(c, 'BAT', 8, -9); b.name = 'B1'; b.props.v = 5;
    addPart(c, 'SCOPE', -6, 12);
    addPart(c, 'GND', -12, 6); addPart(c, 'GND', 0, 7); addPart(c, 'GND', 2, 9); addPart(c, 'GND', 11, -9); addPart(c, 'GND', 8, 16); addPart(c, 'GND', -6, 14);
    // SER and CLK into the chip, RCLK joined to the clock
    W(-24, 0, -24, -4); W(-24, -4, -4, -4); W(-12, 0, -12, -3); W(-12, -3, -4, -3); W(-6, -3, -6, -2); W(-6, -2, -4, -2);
    W(-24, 4, -24, 6); W(-24, 6, -12, 6); W(-12, 4, -12, 6);
    // 5 V to VCC and SRCLR, OE to ground
    W(0, -6, 0, -9); W(0, -9, 6, -9); W(2, -6, 2, -8); W(2, -8, 0, -8); W(10, -9, 11, -9); W(2, 7, 2, 9);
    // QA … QH → 330 Ω → LED → ground
    for (let k = 0; k < 8; k++) {
      const x = 8 + 4 * k, y = -4 + k;
      W(4, y, x, y); W(x, y, x, 6);
      const r = addPart(c, 'R', x, 8, 1); r.name = 'R' + (k + 1); r.props.r = 330;
      const l = addPart(c, 'LED', x, 13, 1); l.name = 'Q' + 'ABCDEFGH'[k]; l.props.color = 'red';
      W(x, 10, x, 11); W(x, 15, x, 16); if (k < 7) W(x, 16, x + 4, 16);
    }
    // scope: CH1 = clock, CH2 = data
    W(-12, 0, -10, 0); W(-10, 0, -10, 11); W(-10, 11, -9, 11);
    W(-24, 0, -26, 0); W(-26, 0, -26, 13); W(-26, 13, -9, 13);
  } else if (name === 'relay10') {
    // ESP32 → two 74HCT595 in a chain → 10 relay modules (active LOW). Serial commands switch them (type in the Serial box).
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.relay10; m.props.run = true;
    const u1 = addPart(c, 'SR595', 12, 2); u1.name = 'U1'; u1.props.model = '74HCT595';
    const u2 = addPart(c, 'SR595', 12, 20); u2.name = 'U2'; u2.props.model = '74HCT595';
    const ps = addPart(c, 'BAT', 33, -15); ps.name = 'PSU'; ps.props.v = 5;
    for (let k = 0; k < 10; k++) addPart(c, 'RMOD', 36, -10 + 6 * k).name = 'RLY' + (k + 1);
    u1.lbl = [4.5, 0]; u2.lbl = [4.5, 0];
    addPart(c, 'GND', -6, 6); addPart(c, 'GND', 12, 9); addPart(c, 'GND', 12, 27); addPart(c, 'GND', 36, -15); addPart(c, 'GND', 32, 44);
    W(-4, 6, -6, 6);
    // ESP32 → U1: SER ← GPIO19, SRCLK ← GPIO18, RCLK ← GPIO5
    W(4, -2, 8, -2); W(4, -1, 8, -1); W(4, 0, 8, 0);
    // clock + latch to U2, U1 QH' → U2 SER (the cascade)
    W(6, -1, 6, 17); W(6, 17, 8, 17); W(5, 0, 5, 18); W(5, 18, 8, 18);
    W(16, 7, 17, 7); W(17, 7, 17, 11); W(17, 11, 7, 11); W(7, 11, 7, 16); W(7, 16, 8, 16);
    // chip power: VCC + SRCLR to 5 V, GND + OE to ground
    W(12, -4, 14, -4); W(12, -4, 12, -6); W(12, -6, 31, -6);
    W(12, 14, 14, 14); W(12, 14, 12, 12); W(12, 12, 31, 12);
    // OE (pin 13) of both chips ← GPIO4: HIGH while booting = every relay OFF (on the real board add 10 kΩ from OE to 3.3 V)
    W(4, 3, 7, 3); W(7, 3, 7, 10); W(7, 10, 19, 10); W(14, 9, 14, 10); W(19, 10, 19, 28); W(19, 28, 14, 28); W(14, 28, 14, 27);
    // 5 V supply rails for the relays
    W(31, -15, 31, 43); W(32, -10, 32, 44); W(35, -15, 36, -15);
    for (let k = 0; k < 10; k++) { const y = -10 + 6 * k; W(31, y - 1, 33, y - 1); W(32, y, 33, y); }
    // outputs → relay IN: U1 QA…QH = relays 1–8, U2 QA, QB = relays 9, 10
    const route = (yq, x, k) => { const yin = -9 + 6 * k; W(16, yq, x, yq); W(x, yq, x, yin); W(x, yin, 33, yin); };
    for (let k = 0; k < 8; k++) route(-2 + k, 30 - k, k);
    route(16, 22, 8); route(17, 21, 9);
  } else if (name === 'seg7') {
    // UNO counts 0 → 9 on a common-cathode 7-segment: a … dp on D2 … D9, one 330 Ω on the common pin
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO';
    m.props.code = '// 7-segment, common cathode: a b c d e f g dp on D2 ... D9\nconst int SEG[8] = {2, 3, 4, 5, 6, 7, 8, 9};\n//                      0     1     2     3     4     5     6     7     8     9\nconst byte DIGITS[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};\n\nvoid setup() {\n  Serial.begin(9600);\n  for (int i = 0; i < 8; i++) pinMode(SEG[i], OUTPUT);\n}\n\nvoid show(int n) {\n  for (int i = 0; i < 7; i++) digitalWrite(SEG[i], (DIGITS[n] >> i) & 1);\n}\n\nvoid loop() {\n  for (int n = 0; n < 10; n++) {\n    show(n);\n    Serial.println(n);\n    delay(700);\n  }\n}\n';
    m.props.run = true;
    const d = addPart(c, 'SEG7', 16, -1); d.name = 'DS1';
    const r = addPart(c, 'R', 11, 5, 1); r.name = 'R1'; r.props.r = 330; r.lbl = [-6, 0];
    addPart(c, 'GND', 11, 7); addPart(c, 'GND', -6, -2);
    for (let k = 0; k < 8; k++) W(4, -5 + k, 13, -5 + k);
    W(13, 3, 11, 3); W(-4, -2, -6, -2);
  } else if (name === 'thermo') {
    // ESP32 + DHT22 on GPIO4: above 30 °C the FAN LED (GPIO23) turns on. Slide the DHT temperature in its panel.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.thermo; m.props.run = true;
    const d = addPart(c, 'DHT', 12, 3); d.name = 'DHT1'; d.props.temp = 27;
    const r = addPart(c, 'R', 7, -7); r.name = 'R1'; r.props.r = 330;
    const l = addPart(c, 'LED', 12, -7); l.name = 'FAN'; l.props.color = 'blue';
    addPart(c, 'GND', 9, 4); addPart(c, 'GND', 14, -7); addPart(c, 'GND', -6, 6); W(-4, 6, -6, 6);
    W(4, 3, 9, 3); W(4, 7, 16, 7); W(16, 7, 16, 1); W(16, 1, 9, 1); W(9, 1, 9, 2);
    W(4, -7, 5, -7); W(9, -7, 10, -7);
  } else if (name === 'parking') {
    // UNO + HC-SR04 (TRIG D9, ECHO D10): LED on D13 when something is closer than 20 cm. Slide the distance in the sensor panel.
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO'; m.props.code = SKETCH_EX.parking; m.props.run = true;
    const u = addPart(c, 'HCSR04', 14, 2); u.name = 'SONAR'; u.props.cm = 35;
    const r = addPart(c, 'R', 7, 6); r.name = 'R1'; r.props.r = 220;
    const l = addPart(c, 'LED', 12, 6); l.name = 'NEAR'; l.props.color = 'red';
    addPart(c, 'GND', 10, 4); addPart(c, 'GND', 14, 6); addPart(c, 'GND', -6, -2);
    W(4, 2, 10, 2); W(4, 3, 10, 3); W(-4, -5, -6, -5); W(-6, -5, -6, -9); W(-6, -9, 8, -9); W(8, -9, 8, 1); W(8, 1, 10, 1);
    W(4, 6, 5, 6); W(9, 6, 10, 6); W(-4, -2, -6, -2);
  } else if (name === 'autolight') {
    // UNO + LDR / 10 kΩ divider on A0: the darker it gets, the brighter the LED on D9 (PWM). Slide the light level in the LDR panel.
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO'; m.props.code = SKETCH_EX.autolight; m.props.run = true;
    const ld = addPart(c, 'LDR', -8, -2, 1); ld.name = 'LDR1'; ld.props.lux = 50;
    const rd = addPart(c, 'R', -8, 2, 1); rd.name = 'R1'; rd.props.r = 10000;
    const r = addPart(c, 'R', 7, 2); r.name = 'R2'; r.props.r = 220;
    const l = addPart(c, 'LED', 12, 2); l.name = 'LAMP'; l.props.color = 'white';
    addPart(c, 'GND', -8, 4); addPart(c, 'GND', 14, 2); addPart(c, 'GND', -6, -2);
    W(-8, -4, -8, -5); W(-8, -5, -4, -5); W(-8, 0, -4, 0); W(-4, -2, -6, -2);
    W(4, 2, 5, 2); W(9, 2, 10, 2);
  } else if (name === 'doorlock') {
    // Keypad door lock: ESP32 + 4×4 keypad + LCD 16×2 I2C + buzzer + IRLZ44N switching a 12 V solenoid lock. PIN 1234 then #.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.doorlock; m.props.run = true;
    addPart(c, 'KEYPAD', 17, 1).name = 'KEYPAD';
    addPart(c, 'LCD', 22, -9).name = 'LCD1';
    addPart(c, 'BUZZER', 8, -13).name = 'BUZZER';
    const lk = addPart(c, 'LOCK', -13, 2, 1); lk.name = 'LOCK'; lk.lbl = [-1, -3.3];
    const d = addPart(c, 'D', -10, 2, 3); d.name = 'D1'; d.props.model = '1N5819'; d.lbl = [0.6, 1.2];
    const q = addPart(c, 'NMOS', -14, 8); q.name = 'Q1'; q.props.model = 'IRLZ44N'; q.lbl = [-4, 0.4];
    const rg = addPart(c, 'R', -9, 12); rg.name = 'R1'; rg.props.r = 100;
    const rp = addPart(c, 'R', -17, 14, 1); rp.name = 'R2'; rp.props.r = 10000;
    const b = addPart(c, 'BAT', -20, 3, 1); b.name = '12V'; b.props.v = 12;
    for (const [x, y] of [[15, -7], [10, -13], [6, 6], [-13, 10], [-17, 16], [-20, 5]]) addPart(c, 'GND', x, y);
    for (let y = -2; y <= 5; y++) W(4, y, 12, y);
    W(4, -6, 6, -6); W(6, -6, 6, -10); W(6, -10, 15, -10);
    W(4, -3, 8, -3); W(8, -3, 8, -9); W(8, -9, 15, -9);
    W(-4, 7, -4, 9); W(-4, 9, 24, 9); W(24, 9, 24, -5); W(24, -5, 13, -5); W(13, -5, 13, -8); W(13, -8, 15, -8);
    W(4, -7, 5, -7); W(5, -7, 5, -13); W(5, -13, 6, -13);
    W(4, 6, 6, 6);
    W(-4, 5, -6, 5); W(-6, 5, -6, 12); W(-6, 12, -7, 12); W(-11, 12, -17, 12); W(-17, 12, -17, 8); W(-17, 8, -16, 8);
    W(-13, 4, -13, 6); W(-10, 4, -10, 6); W(-10, 6, -13, 6); W(-13, 0, -10, 0);
    W(-20, 1, -20, 0); W(-20, 0, -13, 0);
  } else if (name === 'esp32io') {
    // ESP32 pins set by hand: D23 OUTPUT HIGH → 330 Ω → LED · D15 INPUT_PULLUP + button to GND · D34 analogRead of a 10 kΩ pot on 3.3 V
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.pins = { D23: { mode: 'high' }, D15: { mode: 'pu' }, D34: { mode: 'adc' } };
    addPart(c, 'R', 7, -7).props.r = 330;
    const l = addPart(c, 'LED', 12, -7); l.props.color = 'red';
    const pb = addPart(c, 'PB', 10, 5); pb.name = 'BTN';
    const pot = addPart(c, 'POT', -10, 0, 1); pot.props.pos = 50;
    addPart(c, 'GND', 16, 10);
    W(4, -7, 5, -7); W(9, -7, 10, -7); W(14, -7, 16, -7); W(16, -7, 16, 10);
    W(4, 5, 8, 5); W(12, 5, 12, 10); W(4, 6, 6, 6); W(6, 6, 6, 10); W(6, 10, 16, 10);
    W(-8, 0, -6, 0); W(-6, 0, -6, -4); W(-6, -4, -4, -4);
    W(-10, 2, -10, 6); W(-10, 6, -4, 6);
    W(-10, -2, -12, -2); W(-12, -2, -12, 9); W(-12, 9, 4, 9); W(4, 9, 4, 7);
  } else if (name === 'unoio') {
    // Arduino UNO pins set by hand: D13 OUTPUT HIGH → 220 Ω → LED · D2 INPUT_PULLUP + button to GND · A0 analogRead of a 10 kΩ pot on 5 V
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO';
    m.props.pins = { D13: { mode: 'high' }, D2: { mode: 'pu' }, A0: { mode: 'adc' } };
    addPart(c, 'R', 7, 6).props.r = 220;
    addPart(c, 'LED', 12, 6).props.color = 'red';
    const pb = addPart(c, 'PB', 10, -5); pb.name = 'BTN';
    const pot = addPart(c, 'POT', -10, 0, 1); pot.props.pos = 50; pot.lbl = [-1.5, 3.5];
    addPart(c, 'GND', 16, 10);
    W(4, 6, 5, 6); W(9, 6, 10, 6); W(14, 6, 16, 6); W(16, 6, 16, 10);
    W(4, -5, 8, -5); W(12, -5, 16, -5); W(16, -5, 16, 6);
    W(-4, -2, -6, -2); W(-6, -2, -6, 10); W(-10, 10, 16, 10);
    W(-8, 0, -4, 0); W(-10, -2, -10, -5); W(-10, -5, -4, -5); W(-10, 2, -10, 10);
  } else if (name === 'servo') {
    // ESP32 D18 PWM 50 Hz → servo signal. Duty 2.5 % (0.5 ms) = 0°, 7.5 % (1.5 ms) = 90°, 12.5 % (2.5 ms) = 180°. Servo power from VIN (USB 5 V)
    c.tdiv = 0.005;
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.pins = { D18: { mode: 'pwm', f: 50, duty: 7.5 } };
    const sv = addPart(c, 'SERVO', 14, 0); sv.props.model = 'SG90'; sv.name = 'SERVO';
    addPart(c, 'GND', 8, 10);
    // D18 (4,-1) → SIG (11,-1); VIN (-4,7) → VCC (11,0); GND2 (4,6) → GND (11,1)
    W(4, -1, 11, -1); W(4, 6, 8, 6); W(8, 6, 8, 1); W(8, 1, 11, 1); W(8, 6, 8, 10);
    W(-4, 7, -6, 7); W(-6, 7, -6, 9); W(-6, 9, 9, 9); W(9, 9, 9, 0); W(9, 0, 11, 0);
  } else if (name === 'stepper') {
    // ESP32 D18 = STEP (PWM 200 Hz = 200 steps/s = 1 turn/s = 60 RPM), D5 = DIR. EN left open = on (pulled down inside). Motor power 12 V on VMOT
    c.tdiv = 0.002;
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.pins = { D18: { mode: 'pwm', f: 200, duty: 50 }, D5: { mode: 'high' } };
    const st = addPart(c, 'STEPPER', 14, 1); st.name = 'STEPPER';
    const b = addPart(c, 'BAT', 24, 8, 1); b.name = 'VMOT'; b.props.v = 12;
    addPart(c, 'GND', -6, 12);
    // stepper pins (10,-1) STEP, (10,0) DIR, (10,1) EN, (10,2) VDD, (10,3) GND, (10,4) VMOT
    W(4, -1, 10, -1); W(4, 0, 10, 0);
    W(10, 3, 8, 3); W(8, 3, 8, 12);
    W(10, 2, 7, 2); W(7, 2, 7, 7); W(7, 7, 4, 7);
    W(10, 4, 9, 4); W(9, 4, 9, 10); W(9, 10, 22, 10); W(22, 10, 22, 6); W(22, 6, 24, 6);
    W(-4, 6, -6, 6); W(-6, 6, -6, 12); W(-6, 12, 24, 12); W(24, 10, 24, 12);
  } else if (name === 'bridge') {
    const b = addPart(c, 'BAT', 0, 8, 1); b.props.v = 10;
    addPart(c, 'R', 6, 4, 1).props.r = 1000;   // R1 top-left
    addPart(c, 'R', 6, 12, 1).props.r = 2000;  // R2 bottom-left
    addPart(c, 'R', 16, 4, 1).props.r = 1500;  // R3 top-right
    addPart(c, 'R', 16, 12, 1).props.r = 2000; // R4 bottom-right
    addPart(c, 'VM', 11, 8);
    addPart(c, 'GND', 0, 16);
    W(0, 6, 0, 0); W(0, 0, 16, 0); W(6, 0, 6, 2); W(16, 0, 16, 2); W(6, 6, 6, 10); W(16, 6, 16, 10);
    W(6, 8, 9, 8); W(13, 8, 16, 8); W(6, 14, 6, 16); W(16, 14, 16, 16); W(0, 10, 0, 16); W(0, 16, 16, 16);
  }
  return c;
}
