// Calculator: standard + scientific, with electronics units (4.7k, 100u, 2M2 style not needed: 2.2M).
import { el, store } from '../ui.js';
import { si } from '../num.js';

const SI = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
const FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sinh: 1, cosh: 1, tanh: 1,
  ln: 1, log: 1, log2: 1, sqrt: 1, cbrt: 1, abs: 1, exp: 1, round: 1, floor: 1, ceil: 1,
};

// ---------- safe expression evaluator (no eval) ----------
export function tokenize(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if ((s[j] === 'e' || s[j] === 'E') && /[-+0-9]/.test(s[j + 1] ?? '') && /[0-9]/.test(s[j + 1] === '-' || s[j + 1] === '+' ? s[j + 2] ?? '' : s[j + 1])) { j += 2; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      let v = Number(s.slice(i, j)); if (!Number.isFinite(v)) throw new Error('bad number');
      // SI suffix right after the number (not the start of a word like "mod" or a function)
      const nx = s[j];
      if (nx && SI[nx] != null && !/[a-zA-Z(]/.test(s[j + 1] ?? '')) { v *= SI[nx]; j++; }
      out.push({ t: 'num', v }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i; while (j < s.length && /[a-zA-Z_]/.test(s[j])) j++;
      let w = s.slice(i, j);
      if (w === 'log' && s[j] === '2' && s[j + 1] === '(') { w = 'log2'; j++; }
      if (FUNCS[w]) out.push({ t: 'fn', v: w });
      else if (w === 'pi') out.push({ t: 'num', v: Math.PI });
      else if (w === 'e') out.push({ t: 'num', v: Math.E });
      else if (w === 'Ans' || w === 'ans') out.push({ t: 'ans' });
      else throw new Error(`unknown "${w}"`);
      i = j; continue;
    }
    if ('+-*/^()%!,'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error(`unexpected "${ch}"`);
  }
  // implicit multiplication: 2pi, 2(3), (1)(2), 3sin(x), pi r
  const res = [];
  for (const tk of out) {
    const p = res[res.length - 1];
    const leftEnds = p && (p.t === 'num' || p.t === 'ans' || (p.t === 'op' && (p.v === ')' || p.v === '!' || p.v === '%')));
    const rightStarts = tk.t === 'num' || tk.t === 'ans' || tk.t === 'fn' || (tk.t === 'op' && tk.v === '(');
    if (leftEnds && rightStarts) res.push({ t: 'op', v: '*' });
    res.push(tk);
  }
  return res;
}
export function evaluate(src, { deg = true, ans = 0 } = {}) {
  const tk = tokenize(src);
  let i = 0;
  const peek = () => tk[i], isOp = (v) => tk[i]?.t === 'op' && tk[i].v === v;
  const toRad = (x) => (deg ? x * Math.PI / 180 : x), fromRad = (x) => (deg ? x * 180 / Math.PI : x);
  const fact = (n) => { if (n < 0 || !Number.isInteger(n)) throw new Error('n! needs a whole number ≥ 0'); if (n > 170) return Infinity; let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };
  const call = (f, x) => {
    switch (f) {
      case 'sin': return clean(Math.sin(toRad(x))); case 'cos': return clean(Math.cos(toRad(x))); case 'tan': return clean(Math.tan(toRad(x)));
      case 'asin': return fromRad(Math.asin(x)); case 'acos': return fromRad(Math.acos(x)); case 'atan': return fromRad(Math.atan(x));
      case 'sinh': return Math.sinh(x); case 'cosh': return Math.cosh(x); case 'tanh': return Math.tanh(x);
      case 'ln': return Math.log(x); case 'log': return Math.log10(x); case 'log2': return Math.log2(x);
      case 'sqrt': return Math.sqrt(x); case 'cbrt': return Math.cbrt(x); case 'abs': return Math.abs(x); case 'exp': return Math.exp(x);
      case 'round': return Math.round(x); case 'floor': return Math.floor(x); case 'ceil': return Math.ceil(x);
    }
    throw new Error('unknown function');
  };
  function expr() { let v = term(); while (isOp('+') || isOp('-')) { const o = tk[i++].v; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term() { let v = unary(); while (isOp('*') || isOp('/')) { const o = tk[i++].v; const r = unary(); v = o === '*' ? v * r : v / r; } return v; }
  function unary() { if (isOp('-')) { i++; return -unary(); } if (isOp('+')) { i++; return unary(); } return power(); }
  function power() { const b = postfix(); if (isOp('^')) { i++; return Math.pow(b, unary()); } return b; }
  function postfix() { let v = primary(); for (;;) { if (isOp('!')) { i++; v = fact(v); } else if (isOp('%')) { i++; v = v / 100; } else break; } return v; }
  function primary() {
    const t = peek();
    if (!t) throw new Error('incomplete');
    if (t.t === 'num') { i++; return t.v; }
    if (t.t === 'ans') { i++; return ans; }
    if (t.t === 'fn') { i++; if (isOp('(')) { i++; const v = expr(); if (isOp(')')) i++; return call(t.v, v); } return call(t.v, power()); }
    if (isOp('(')) { i++; const v = expr(); if (isOp(')')) i++; return v; }    // missing ")" at the end is forgiven
    throw new Error(`unexpected "${t.v}"`);
  }
  const v = expr();
  if (i < tk.length) throw new Error(`unexpected "${tk[i].v ?? ''}"`);
  return v;
}
const clean = (x) => (Math.abs(x) < 1e-15 ? 0 : x);
export function fmt(v) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'Error' : (v > 0 ? '∞' : '−∞');
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e15 || a < 1e-9) return v.toExponential(9).replace(/\.?0+e/, 'e');
  return String(Number(v.toPrecision(12)));
}

export function calcTab(root) {
  root.classList.add('calc-pane');
  let sci = store.get('calc.sci', '0') === '1';
  let deg = store.get('calc.deg', '1') === '1';
  let ans = Number(store.get('calc.ans', '0')) || 0;
  let hist = []; try { hist = JSON.parse(store.get('calc.hist', '[]')) || []; } catch { }
  let justDone = false;

  const inp = el('input', { class: 'calc-in', type: 'text', inputmode: 'none', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Expression', placeholder: '0' });
  const out = el('div', { class: 'calc-out', 'aria-live': 'polite' });
  const siOut = el('div', { class: 'calc-si' });
  const modeBtn = el('button', { class: 'sb', type: 'button', onclick: () => { sci = !sci; store.set('calc.sci', sci ? '1' : '0'); build(); } });
  const degBtn = el('button', { class: 'sb', type: 'button', onclick: () => { deg = !deg; store.set('calc.deg', deg ? '1' : '0'); syncTop(); preview(); } });
  const kbBtn = el('button', { class: 'sb', type: 'button', text: '⌨', title: 'Phone keyboard', onclick: () => { inp.inputMode = inp.inputMode === 'none' ? 'decimal' : 'none'; inp.blur(); inp.focus(); } });
  const pad = el('div', { class: 'calc-pad' });
  const histBox = el('div', { class: 'calc-hist' });
  root.append(el('div', { class: 'card calc' },
    el('div', { class: 'row wrap calc-top' }, modeBtn, degBtn, kbBtn),
    el('div', { class: 'calc-screen' }, inp, out, siOut), pad),
    el('div', { class: 'card' }, el('h2', { text: 'History' }), histBox,
      el('p', { class: 'note', html: 'Tap a line to use it again. Units work: <b>4.7k</b>, <b>100u</b>, <b>2.2M</b>, <b>15m</b> (k M G T, m u n p). <b>Ans</b> = last answer.' })));

  function syncTop() {
    modeBtn.textContent = sci ? '🧮 Scientific' : '🧮 Standard'; modeBtn.classList.toggle('on', sci);
    degBtn.textContent = deg ? 'DEG' : 'RAD'; degBtn.hidden = !sci;
  }
  const K = (label, act, cls = '') => el('button', { class: 'ck ' + cls, type: 'button', text: label, onclick: () => { act(); inp.focus({ preventScroll: true }); } });
  const ins = (s) => () => {
    if (justDone && /^[0-9.(πe√a-z]/.test(s)) inp.value = '';          // new number after = starts fresh
    else if (justDone) inp.value = 'Ans';
    justDone = false;
    const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
    inp.value = inp.value.slice(0, a) + s + inp.value.slice(b);
    const pos = a + s.length; inp.setSelectionRange(pos, pos); preview();
  };
  const back = () => { justDone = false; const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a; if (a !== b) inp.value = inp.value.slice(0, a) + inp.value.slice(b); else if (a > 0) { inp.value = inp.value.slice(0, a - 1) + inp.value.slice(a); inp.setSelectionRange(a - 1, a - 1); } preview(); };
  const clear = () => { inp.value = ''; justDone = false; preview(); };
  const neg = () => { const v = inp.value.trim(); inp.value = v.startsWith('-(') && v.endsWith(')') ? v.slice(2, -1) : v ? `-(${v})` : '-'; justDone = false; preview(); };
  function build() {
    syncTop();
    pad.innerHTML = '';
    pad.classList.toggle('sci', sci);
    const rows = [];
    if (sci) rows.push(
      [K('sin', ins('sin('), 'f'), K('cos', ins('cos('), 'f'), K('tan', ins('tan('), 'f'), K('ln', ins('ln('), 'f'), K('log', ins('log('), 'f')],
      [K('sin⁻¹', ins('asin('), 'f'), K('cos⁻¹', ins('acos('), 'f'), K('tan⁻¹', ins('atan('), 'f'), K('eˣ', ins('exp('), 'f'), K('10ˣ', ins('10^'), 'f')],
      [K('x²', ins('^2'), 'f'), K('xʸ', ins('^'), 'f'), K('√', ins('√('), 'f'), K('∛', ins('cbrt('), 'f'), K('1/x', () => { inp.value = `1/(${inp.value || 'Ans'})`; justDone = false; preview(); }, 'f')],
      [K('(', ins('('), 'f'), K(')', ins(')'), 'f'), K('π', ins('π'), 'f'), K('e', ins('e'), 'f'), K('n!', ins('!'), 'f')],
      [K('k', ins('k'), 'u'), K('M', ins('M'), 'u'), K('m', ins('m'), 'u'), K('µ', ins('u'), 'u'), K('n', ins('n'), 'u')]);
    rows.push(
      [K('C', clear, 'c'), K('⌫', back, 'c'), K('%', ins('%'), 'o'), K('÷', ins('÷'), 'o')],
      [K('7', ins('7')), K('8', ins('8')), K('9', ins('9')), K('×', ins('×'), 'o')],
      [K('4', ins('4')), K('5', ins('5')), K('6', ins('6')), K('−', ins('−'), 'o')],
      [K('1', ins('1')), K('2', ins('2')), K('3', ins('3')), K('+', ins('+'), 'o')],
      [K('±', neg), K('0', ins('0')), K('.', ins('.')), K('=', equals, 'eq')]);
    for (const r of rows) pad.append(el('div', { class: 'calc-row' + (r.length === 5 ? ' five' : '') }, ...r));
  }
  function preview() {
    const s = inp.value.trim();
    out.classList.remove('err'); siOut.textContent = '';
    if (!s) { out.textContent = justDone ? '' : '0'; return; }
    try { const v = evaluate(s, { deg, ans }); out.textContent = '= ' + fmt(v); siOut.textContent = siText(v); }
    catch { out.textContent = ''; }
  }
  const siText = (v) => { if (!Number.isFinite(v) || v === 0) return ''; const a = Math.abs(v); if (a >= 1e-12 && a < 1e15 && (a >= 1000 || a < 0.1)) return '≈ ' + si(v, '', 4).trim(); return ''; };
  function equals() {
    const s = inp.value.trim(); if (!s) return;
    try {
      const v = evaluate(s, { deg, ans });
      ans = v; store.set('calc.ans', String(v));
      hist.unshift({ e: s, v: fmt(v) }); hist = hist.slice(0, 30); store.set('calc.hist', JSON.stringify(hist));
      inp.value = fmt(v); out.textContent = s + ' ='; siOut.textContent = siText(v); justDone = true;
      renderHist();
    } catch (e) { out.textContent = e.message; out.classList.add('err'); }
  }
  function renderHist() {
    histBox.innerHTML = '';
    if (!hist.length) { histBox.append(el('p', { class: 'muted', text: 'Nothing yet.' })); return; }
    for (const h of hist) histBox.append(el('button', { class: 'calc-h', type: 'button', onclick: () => { inp.value = h.e; justDone = false; preview(); inp.focus(); } }, el('span', { text: h.e }), el('b', { text: '= ' + h.v })));
    histBox.append(el('button', { class: 'btn', type: 'button', text: 'Clear history', onclick: () => { hist = []; store.set('calc.hist', '[]'); renderHist(); } }));
  }
  inp.addEventListener('input', () => { justDone = false; preview(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); }
    else if (e.key === 'Escape') { e.preventDefault(); clear(); }
    else if (justDone && /^[-+*/^%]$/.test(e.key)) { inp.value = 'Ans'; justDone = false; }
    else if (justDone && /^[0-9.(]$/.test(e.key)) { inp.value = ''; justDone = false; }
  });
  build(); renderHist(); preview();
}
