// Small UI kit: inputs that remember their value, cards, result readouts, step lines, warnings.
import { parse } from './num.js';

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('f9t.' + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('f9t.' + k, String(v)); } catch { } },
};

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}

let uid = 0;
// numeric input. opts: { def, hint, onchange }. f.value -> number | null, f.raw -> text
export function numField(key, label, unit = '', opts = {}) {
  const id = 'in-' + key;
  const inp = el('input', {
    id, type: 'text', class: 'num', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
    inputmode: 'text', value: store.get(key, opts.def ?? ''),
  });
  const u = el('span', { class: 'unit', text: unit });
  const wrap = el('label', { class: 'field', for: id }, el('span', { class: 'lab', text: label }), el('span', { class: 'box' }, inp, u));
  if (opts.hint) wrap.append(el('span', { class: 'hint', text: opts.hint }));
  const f = {
    el: wrap, input: inp, key,
    get raw() { return inp.value.trim(); },
    get value() { return parse(inp.value); },
    set(v) { inp.value = v; store.set(key, v); },
    show(text) { inp.placeholder = text ?? ''; },           // a computed value shown greyed in an empty box
    bad(isBad) { wrap.classList.toggle('bad', !!isBad); },
  };
  inp.addEventListener('input', () => { store.set(key, inp.value); f.bad(inp.value.trim() !== '' && f.value == null); opts.onchange?.(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  f.bad(f.raw !== '' && f.value == null);
  return f;
}

export function select(key, label, options, def, onchange) {
  const id = 'sel-' + key;
  const s = el('select', { id, class: 'sel' }, options.map(([v, t]) => el('option', { value: v, text: t })));
  s.value = store.get(key, def);
  if (!options.some(o => o[0] === s.value)) s.value = def;
  s.addEventListener('change', () => { store.set(key, s.value); onchange?.(); });
  return { el: el('label', { class: 'field', for: id }, el('span', { class: 'lab', text: label }), s), get value() { return s.value; }, set(v) { s.value = v; store.set(key, v); }, sel: s };
}

export function segmented(key, options, def, onchange) {
  let cur = store.get(key, def);
  if (!options.some(o => o[0] === cur)) cur = def;
  const box = el('div', { class: 'seg', role: 'tablist' });
  const btns = options.map(([v, t]) => el('button', { type: 'button', class: 'segb', text: t, onclick: () => { cur = v; store.set(key, v); paint(); onchange?.(v); } }));
  const paint = () => btns.forEach((b, i) => { const on = options[i][0] === cur; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  box.append(...btns); paint();
  return { el: box, get value() { return cur; } };
}

export const card = (title, ...kids) => el('section', { class: 'card' }, title ? el('h2', { text: title }) : null, ...kids);
export const grid = (...kids) => el('div', { class: 'fields' }, ...kids.map(k => k.el ?? k));
export const note = (text) => el('p', { class: 'note', html: text });

// result block: readouts (big numbers), steps (formulas), flags (ok / warn / bad)
export function resultBox() {
  const read = el('div', { class: 'readouts' });
  const flags = el('div', { class: 'flags' });
  const steps = el('pre', { class: 'steps' });
  const extra = el('div', { class: 'extra' });
  const box = el('div', { class: 'result' }, read, flags, steps, extra);
  return {
    el: box, extra,
    clear(msg) { extra.innerHTML = ''; read.innerHTML = ''; flags.innerHTML = ''; steps.textContent = msg ?? ''; steps.hidden = !msg; box.classList.toggle('empty', !!msg); },
    show({ values = [], lines = [], warn = [] }) {
      box.classList.remove('empty');
      read.innerHTML = ''; extra.innerHTML = '';
      for (const [label, value, hi] of values) read.append(el('div', { class: 'ro' + (hi ? ' hi' : '') }, el('span', { class: 'rl', text: label }), el('span', { class: 'rv', text: value })));
      flags.innerHTML = '';
      for (const w of warn) { const [lvl, text] = Array.isArray(w) ? w : ['warn', w]; flags.append(el('div', { class: 'flag ' + lvl, text })); }
      steps.textContent = lines.join('\n'); steps.hidden = !lines.length;
    },
  };
}

export function table(head, rows, cls = '') {
  return el('div', { class: 'tablewrap' }, el('table', { class: cls },
    el('thead', {}, el('tr', {}, head.map(h => el('th', { text: h })))),
    el('tbody', {}, rows.map(r => el('tr', { class: r.cls ?? '' }, (r.cells ?? r).map(c => (c instanceof Node ? el('td', {}, c) : el('td', { text: c }))))))));
}

export function debounce(fn, ms = 60) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
