// Kirchhoff: type parts between numbered nodes, get every branch voltage drop, current, power, plus KCL / KVL checks.
import { el, card, note, resultBox, table, store, debounce } from '../ui.js';
import { si, plain, parse } from '../num.js';
import { solve } from '../mna.js';
import * as F from '../formulas.js';
import { wattName } from './basic.js';

const TYPES = [['R', 'Resistor', 'Ω'], ['V', 'Voltage source', 'V'], ['I', 'Current source', 'A'], ['W', 'Wire', '']];
const unitOf = t => TYPES.find(x => x[0] === t)[2];

const PRESETS = {
  'Series (3 resistors)': [['V', 'V1', 1, 0, '12'], ['R', 'R1', 1, 2, '1k'], ['R', 'R2', 2, 3, '2k2'], ['R', 'R3', 3, 0, '470']],
  'Series-parallel': [['V', 'V1', 1, 0, '9'], ['R', 'R1', 1, 2, '100'], ['R', 'R2', 2, 0, '220'], ['R', 'R3', 2, 3, '150'], ['R', 'R4', 3, 0, '330'], ['R', 'R5', 3, 0, '1k']],
  'Wheatstone bridge': [['V', 'V1', 1, 0, '10'], ['R', 'R1', 1, 2, '1k'], ['R', 'R2', 2, 0, '2k'], ['R', 'R3', 1, 3, '1k5'], ['R', 'R4', 3, 0, '2k'], ['R', 'R5', 2, 3, '470']],
  'Two sources, two loops': [['V', 'E1', 1, 0, '12'], ['R', 'R1', 1, 2, '4'], ['R', 'R2', 2, 0, '6'], ['R', 'R3', 2, 3, '3'], ['V', 'E2', 3, 0, '6']],
  'Current source + resistors': [['I', 'I1', 0, 1, '10m'], ['R', 'R1', 1, 0, '1k'], ['R', 'R2', 1, 2, '470'], ['R', 'R3', 2, 0, '330']],
};

export function kirchhoffTab(root) {
  let rows = load();
  const list = el('div', { class: 'netlist' });
  const res = resultBox();
  const schem = el('div', { class: 'schem' });
  const out = el('div');
  const presetSel = el('select', { class: 'sel', id: 'kvl-preset', onchange: e => { if (!e.target.value) return; rows = PRESETS[e.target.value].map(r => mk(...r)); e.target.value = ''; save(); paint(); } },
    el('option', { value: '', text: 'Load an example…' }), Object.keys(PRESETS).map(k => el('option', { value: k, text: k })));
  const addBtn = (t, label) => el('button', { class: 'btn', type: 'button', text: label, onclick: () => { rows.push(mk(t, nextName(t), lastNode(), 0, t === 'R' ? '1k' : t === 'V' ? '5' : t === 'I' ? '1m' : '0')); save(); paint(); } });
  root.append(
    card('Kirchhoff circuit solver', note('Number every junction: <b>0 = ground</b>, then 1, 2, 3… Each part goes <b>from</b> one node <b>to</b> another. Voltage source: <b>+ is the From node</b>. Current source: pushes current From → To.'),
      el('div', { class: 'row wrap' }, presetSel, addBtn('R', '+ Resistor'), addBtn('V', '+ V source'), addBtn('I', '+ I source'), addBtn('W', '+ Wire'),
        el('button', { class: 'btn ghost', type: 'button', text: 'Clear all', onclick: () => { rows = []; save(); paint(); } })),
      list),
    card('Circuit', schem, el('p', { class: 'note', text: 'Drawn from your list: dots are nodes with their voltage, arrows show real current direction.' })),
    card('Results', res.el, out));

  function mk(type, name, a, b, value) { return { type, name, a, b, value }; }
  function nextName(t) { const p = t === 'W' ? 'W' : t; let k = 1; while (rows.some(r => r.name === p + k)) k++; return p + k; }
  function lastNode() { return rows.reduce((m, r) => Math.max(m, +r.a || 0, +r.b || 0), 0) || 1; }
  function load() { try { const r = JSON.parse(store.get('kvl.net', 'null')); if (Array.isArray(r)) return r; } catch { } return PRESETS['Series-parallel'].map(r => mk(...r)); }
  function save() { store.set('kvl.net', JSON.stringify(rows)); }
  const recalc = debounce(() => { save(); calc(); }, 120);

  function paint() {
    list.innerHTML = '';
    list.append(el('div', { class: 'nl-head' }, ['Type', 'Name', 'From', 'To', 'Value', ''].map(t => el('span', { text: t }))));
    rows.forEach((r, k) => {
      const typeSel = el('select', { class: 'sel sm', 'aria-label': 'Type', onchange: e => { r.type = e.target.value; paint(); recalc(); } }, TYPES.map(([v, t]) => el('option', { value: v, text: v === 'W' ? 'Wire' : v === 'R' ? 'R' : v === 'V' ? 'V src' : 'I src', title: t })));
      typeSel.value = r.type;
      const inp = (key, cls, w) => { const i = el('input', { class: 'num ' + cls, value: r[key], 'aria-label': key, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: key === 'a' || key === 'b' ? 'numeric' : 'text' }); i.addEventListener('input', () => { r[key] = i.value; i.classList.toggle('badv', key === 'value' && r.type !== 'W' && parse(i.value) == null); recalc(); }); return i; };
      const val = r.type === 'W' ? el('span', { class: 'muted', text: '0 Ω' }) : el('span', { class: 'box' }, inp('value', 'v'), el('span', { class: 'unit sm', text: unitOf(r.type) }));
      list.append(el('div', { class: 'nl-row' }, typeSel, inp('name', 'nm'), inp('a', 'nd'), inp('b', 'nd'), val,
        el('button', { class: 'x', type: 'button', 'aria-label': 'Delete ' + r.name, text: '×', onclick: () => { rows.splice(k, 1); save(); paint(); } })));
    });
    calc();
  }

  function calc() {
    const els = rows.map(r => ({ type: r.type, name: r.name || '?', a: parseInt(r.a, 10), b: parseInt(r.b, 10), value: r.type === 'W' ? 0 : parse(r.value) }));
    out.innerHTML = '';
    const bad = els.find(e => !Number.isInteger(e.a) || !Number.isInteger(e.b) || (e.type !== 'W' && e.value == null));
    if (bad) { res.clear(`${bad.name}: fill From, To and a value.`); schem.innerHTML = drawSchematic(els.filter(e => Number.isInteger(e.a) && Number.isInteger(e.b)), null); return; }
    const s = solve(els);
    schem.innerHTML = drawSchematic(els, s.ok ? s : null);
    if (!s.ok) { res.clear(s.error); return; }
    const S = si;
    const srcs = s.elements.filter(e => e.type === 'V' || e.type === 'I');
    const values = [['Delivered by sources', S(s.delivered, 'W'), true], ['Used by parts', S(s.absorbed, 'W')]];
    srcs.forEach(e => values.push([`${e.name} current`, e.type === 'V' ? S(-e.i, 'A') : S(e.i, 'A')]));
    const warn = [];
    for (const e of s.elements) if (e.type === 'R') { const need = F.ratingFor(Math.abs(e.p), 2); if (Math.abs(e.p) > 0.125) warn.push([need && need <= 2 ? 'warn' : 'bad', `${e.name} dissipates ${S(e.p, 'W')} → use ${need ? wattName(need) : 'a power resistor'}.`]); }
    if (!warn.length) warn.push(['ok', 'All resistors are under 1/8 W.']);
    res.show({ values, warn, lines: [] });

    out.append(el('h3', { text: 'Node voltages (to ground)' }),
      table(['Node', 'Voltage'], [...s.nodes.entries()].sort((x, y) => x[0] - y[0]).map(([n, v]) => [n === 0 ? '0 (GND)' : String(n), S(v, 'V')])));

    out.append(el('h3', { text: 'Every branch' }),
      table(['Part', 'From→To', 'Value', 'Voltage drop', 'Current', 'Power'], s.elements.map(e => {
        const cur = Math.abs(e.i) < 1e-15 ? '0 A' : `${S(Math.abs(e.i), 'A')} ${e.i >= 0 ? `${e.a}→${e.b}` : `${e.b}→${e.a}`}`;
        const p = e.type === 'R' ? S(e.p, 'W') : e.p < 0 ? `gives ${S(-e.p, 'W')}` : e.p > 0 ? `takes ${S(e.p, 'W')}` : '0 W';
        return [e.name, `${e.a}→${e.b}`, e.type === 'W' ? 'wire' : S(e.value, unitOf(e.type)), S(e.v, 'V'), cur, p];
      })));

    const R = s.elements.filter(e => e.type === 'R');
    if (R.length) out.append(el('h3', { text: 'Ohm per resistor' }),
      el('pre', { class: 'steps', text: R.map(e => `${e.name}: I = V ÷ R = ${plain(e.v)} ÷ ${plain(e.value)} = ${S(e.i, 'A')}     V = I × R = ${plain(e.i)} × ${plain(e.value)} = ${S(e.v, 'V')}     P = I² × R = ${S(e.p, 'W')}`).join('\n') }));

    out.append(el('h3', { text: 'KCL: current in = current out at every node' }),
      el('pre', { class: 'steps', text: s.kcl.map(k => {
        const ins = k.terms.filter(t => t.out < -1e-15), outs = k.terms.filter(t => t.out > 1e-15);
        const fmt = ts => ts.length ? ts.map(t => `${t.name} ${S(Math.abs(t.out), 'A')}`).join(' + ') : '0';
        const sin = ins.reduce((a, t) => a - t.out, 0), sout = outs.reduce((a, t) => a + t.out, 0);
        return `Node ${k.node}: in ${fmt(ins)} = ${S(sin, 'A')}   out ${fmt(outs)} = ${S(sout, 'A')}   ${Math.abs(k.sum) < 1e-9 * Math.max(1, sin) ? '✓' : '✗'}`;
      }).join('\n') }));

    if (s.loops.length) out.append(el('h3', { text: 'KVL: voltage rises = voltage drops around every loop' }),
      el('pre', { class: 'steps', text: s.loops.map((l, i) => {
        const parts = l.terms.map(t => `${t.rise >= 0 ? '+' : '−'}${plain(Math.abs(t.rise))} (${t.name})`).join(' ');
        return `Loop ${i + 1}  ${l.path}:\n  ${parts} = ${plain(Math.abs(l.sum) < 1e-9 ? 0 : l.sum)} V ${Math.abs(l.sum) < 1e-6 ? '✓' : '✗'}`;
      }).join('\n') }));
    out.append(el('p', { class: 'note', text: `Power check: sources give ${S(s.delivered, 'W')}, parts use ${S(s.absorbed, 'W')}. Solved with Modified Nodal Analysis (the same method SPICE uses).` }));
  }
  paint();
}

// ---------- schematic (nodes on a circle, ground at the bottom) ----------
function drawSchematic(els, s) {
  const nodes = [...new Set(els.flatMap(e => [e.a, e.b]))].sort((a, b) => a - b);
  if (!nodes.length) return '<p class="note">No parts yet.</p>';
  const W = 420, H = 320, cx = W / 2, cy = H / 2 + 5, rad = Math.min(130, 40 + nodes.length * 18);
  const others = nodes.filter(n => n !== 0), pos = new Map();
  const all = nodes.includes(0) ? [0, ...others] : others;
  all.forEach((n, k) => { const t = Math.PI / 2 + (k / all.length) * 2 * Math.PI; pos.set(n, [cx + rad * Math.cos(t) * 1.3, cy + rad * Math.sin(t)]); });
  if (all.length === 2) { pos.set(all[0], [cx, cy + 100]); pos.set(all[1], [cx, cy - 100]); }
  const pairCount = new Map(), out = [];
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  els.forEach(e => pairCount.set(key(e.a, e.b), (pairCount.get(key(e.a, e.b)) ?? 0) + 1));
  const pairIdx = new Map();
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  for (const e of els) {
    const k = key(e.a, e.b), n = pairCount.get(k), i = pairIdx.get(k) ?? 0; pairIdx.set(k, i + 1);
    let [x1, y1] = pos.get(e.a), [x2, y2] = pos.get(e.b);
    const flip = e.a > e.b ? -1 : 1;
    const off = (i - (n - 1) / 2) * 46 * flip;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const qx = (x1 + x2) / 2 + nx * off * 2, qy = (y1 + y2) / 2 + ny * off * 2;
    const mx = 0.25 * x1 + 0.5 * qx + 0.25 * x2, my = 0.25 * y1 + 0.5 * qy + 0.25 * y2;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    out.push(`<path class="wire" d="M${x1} ${y1} Q${qx} ${qy} ${x2} ${y2}"/>`);
    let sym = '';
    if (e.type === 'R') sym = '<rect class="bgk" x="-20" y="-9" width="40" height="18"/><path class="part" d="M-20 0 h4 l3 -7 l6 14 l6 -14 l6 14 l6 -14 l3 7 h6"/>';
    else if (e.type === 'V') sym = '<circle class="src" r="12"/><text class="pm" x="-7" y="4">+</text><text class="pm" x="3" y="4">−</text>';
    else if (e.type === 'I') sym = '<circle class="src" r="12"/><path class="part" d="M-7 0 H7 M3 -4 L7 0 L3 4"/>';
    out.push(`<g transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${ang.toFixed(1)})">${sym}</g>`);
    const r = s?.elements.find(x => x.name === e.name && x.a === e.a && x.b === e.b);
    const lab = `${esc(e.name)}${e.type === 'W' ? '' : ' ' + esc(si(e.value, unitOf(e.type), 3))}`;
    const lx = mx + nx * 22 * (off >= 0 ? 1 : -1), ly = my + ny * 22 * (off >= 0 ? 1 : -1);
    out.push(`<text class="lbl" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle">${lab}</text>`);
    if (r && Math.abs(r.i) > 1e-15 && e.type !== 'I') {
      // current arrow in the real direction, just past the symbol
      const dir = r.i >= 0 ? 1 : -1, t = 0.5 + 0.2 * dir;
      const ax = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * qx + t * t * x2, ay = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * qy + t * t * y2;
      out.push(`<g transform="translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${(ang + (dir < 0 ? 180 : 0)).toFixed(1)})"><path class="arrow" d="M-5 -4 L3 0 L-5 4 Z"/></g>`);
      out.push(`<text class="cur" x="${(ax + nx * -12).toFixed(1)}" y="${(ay + ny * -12 + 4).toFixed(1)}" text-anchor="middle">${esc(si(Math.abs(r.i), 'A', 3))}</text>`);
    }
  }
  for (const [n, [x, y]] of pos) {
    const v = s?.nodes.get(n);
    out.push(`<circle class="${n === 0 ? 'gnd' : 'node'}" cx="${x}" cy="${y}" r="6"/>`);
    out.push(`<text class="nn" x="${x}" y="${y + 3.5}" text-anchor="middle">${n}</text>`);
    if (v != null) out.push(`<text class="nv" x="${x + 10}" y="${y - 9}">${esc(si(v, 'V', 3))}</text>`);
    if (n === 0) out.push(`<path class="wire" d="M${x - 12} ${y + 12} h24 M${x - 8} ${y + 16} h16 M${x - 4} ${y + 20} h8"/>`);
  }
  return `<svg viewBox="0 -10 ${W} ${H + 30}" role="img" aria-label="Circuit drawing">${out.join('')}</svg>`;
}
