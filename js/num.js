// Numbers for electronics: parse "4k7", "10u", "2.2M", "100nF", "220/2", "1e-3"; format as 4.7 kΩ.

const PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, R: 1 };
// unit words people type after the number; they are ignored
const UNIT_RE = /^(ohms?|Ω|ω|hz|va|v|a|w|f|h|s|°|deg|t|%)/i;

// "4k7" -> 4700, "4R7" -> 4.7, "10u" -> 1e-5, "2.2M" -> 2.2e6, "100nF" -> 1e-7
function readNumber(src, i) {
  const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
  if (!m) return null;
  let text = m[0], j = i + text.length, v = parseFloat(text);
  if (m[2] && !/^e[+-]?\d+$/i.test(m[2])) return null;
  const c = src[j];
  if (c && c in PREFIX) {
    // a prefix can also be the decimal point: 4k7, 2M2, 4R7, 1u5
    const mult = PREFIX[c];
    const tail = /^\d+/.exec(src.slice(j + 1));
    if (tail && !/^\d+\.?\d*e/i.test(text) && !text.includes('.')) {
      v = parseFloat(text + '.' + tail[0]) * mult; j += 1 + tail[0].length;
    } else { v *= mult; j += 1; }
  }
  const u = UNIT_RE.exec(src.slice(j));
  if (u) j += u[0].length;
  return { v, j };
}

// Small expression parser: + - * / ^ ( ), √ or sqrt(), x ×, ÷, comma as decimal point
export function parse(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/×|x(?=\s*[\d(.])/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s+/g, '').replace(/−/g, '-');
  if (s === '') return null;
  let i = 0;
  const peek = () => s[i];
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); if (r == null || v == null) return null; v = op === '+' ? v + r : v - r; } return v; }
  function term() { let v = power(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = power(); if (r == null || v == null) return null; if (op === '/' && r === 0) return null; v = op === '*' ? v * r : v / r; } return v; }
  function power() { const b = unary(); if (peek() === '^') { i++; const e = power(); if (b == null || e == null) return null; return Math.pow(b, e); } return b; }
  function unary() { if (peek() === '-') { i++; const v = unary(); return v == null ? null : -v; } if (peek() === '+') { i++; return unary(); } return atom(); }
  function atom() {
    if (s.startsWith('sqrt', i) || peek() === '√') { i += peek() === '√' ? 1 : 4; const v = atom(); return v == null || v < 0 ? null : Math.sqrt(v); }
    if (s.startsWith('pi', i) || peek() === 'π') { i += peek() === 'π' ? 1 : 2; return Math.PI; }
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') return null; i++; return v; }
    const r = readNumber(s, i); if (!r) return null; i = r.j; return r.v;
  }
  const v = expr();
  if (i !== s.length || v == null || !isFinite(v)) return null;
  return v;
}

const SI = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];

// 4700, 'Ω' -> "4.7 kΩ"; keeps `sig` significant digits, trims zeros
export function si(v, unit = '', sig = 4) {
  if (v == null || !isFinite(v)) return '—';
  if (v === 0) return '0 ' + unit;
  const a = Math.abs(v);
  let [mult, p] = SI.find(([m]) => a >= m * 0.9995) ?? SI[SI.length - 1];
  if (unit === '%' || unit === '°') { mult = 1; p = ''; }
  const n = v / mult;
  return trimNum(n, sig) + ' ' + p + unit;
}
export function trimNum(n, sig = 4) {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(n))));
  let t = n.toFixed(Math.min(digits, 12));
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t === '-0' ? '0' : t;
}
// plain number for formulas, e.g. 0.0047 -> "0.0047", 4700 -> "4700"
export function plain(n, sig = 4) {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-4 || a >= 1e7)) return n.toExponential(sig - 1).replace(/\.?0+e/, 'e');
  return trimNum(n, sig);
}
export const pct = (v, d = 1) => (v * 100).toFixed(d) + ' %';

// ---------- standard values ----------
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
export const E96 = [1.00, 1.02, 1.05, 1.07, 1.10, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.30, 1.33, 1.37, 1.40, 1.43, 1.47, 1.50, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.00, 2.05, 2.10, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.80, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.40, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.90, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.50, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76];
export const SERIES = { E12, E24, E96 };

// every value of a series between lo and hi
export function seriesValues(series, lo = 1, hi = 10e6) {
  const out = [];
  for (let d = Math.floor(Math.log10(lo)) - 1; d <= Math.ceil(Math.log10(hi)); d++)
    for (const m of series) { const v = +(m * 10 ** d).toPrecision(3); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  return out;
}
// nearest standard value (by ratio), plus the one just below and above
export function nearest(v, series = E24) {
  if (!(v > 0)) return null;
  const d = Math.floor(Math.log10(v));
  const cands = [];
  for (const k of [d - 1, d, d + 1]) for (const m of series) cands.push(+(m * 10 ** k).toPrecision(3));
  cands.sort((a, b) => a - b);
  let best = cands[0];
  for (const c of cands) if (Math.abs(Math.log(c / v)) < Math.abs(Math.log(best / v))) best = c;
  const below = [...cands].reverse().find(c => c <= v * 1.0000001) ?? best;
  const above = cands.find(c => c >= v * 0.9999999) ?? best;
  return { best, below, above, err: best / v - 1 };
}

export const parallel = (...rs) => { let g = 0; for (const r of rs) { if (r === 0) return 0; g += 1 / r; } return 1 / g; };
