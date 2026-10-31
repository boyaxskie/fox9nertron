// Schematic editor: place parts, draw wires, see every voltage / current / power live.
import { el, store, card, note } from '../ui.js';
import { si, plain, parse, pct, nearest, E12 } from '../num.js';
import * as S from '../sch-core.js';
import { wattName } from './basic.js';
import { pcbView } from './pcb.js';

const C = {
  bg: '#0F1317', dot: '#252D36', wire: '#8A97A6', part: '#E4E9EF', sel: '#4FC3F7', pin: '#FFC857', text: '#C9D3DD', dim: '#7E8A97',
  pos: [61, 220, 132], neg: [255, 107, 107], gnd: [138, 151, 166], cur: '#FFE16B',
};
const RATINGS = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10];

export function schematicTab(root) {
  root.classList.add('sch-pane');
  // ---------- state ----------
  registerLib(myParts(), false);
  let c = load() ?? S.example('led');
  registerLib(c.lib, true);
  let sel = null;            // {kind:'part', id} | {kind:'wire', i}
  let mode = 'select';       // select | wire | delete | place
  let placeType = null;
  let wireStart = null, hover = null;
  let res = null;
  const view = { ox: 0, oy: 0, g: 22 };
  const hist = [JSON.stringify(c)]; let hi = 0;
  let showVolts = store.get('sch.volts', '1') === '1';
  let showDots = store.get('sch.dots', '1') === '1';
  let running = store.get('sch.run', '1') === '1';
  const STOPPED = 'Simulation stopped: no voltages or currents. Tap ▶ Run to start it again.';
  // time simulation (capacitors, coils, signal generator, scope)
  const TDIVS = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60];
  const VDIVS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const SAMPLES = 400;      // samples across one scope screen (10 divisions)
  const sim = { t: 0, state: new Map(), buf: [], paused: false, tdiv: +store.get('sch.tdiv', '0.005'), speed: store.get('sch.speed2', 'screen'), next: null,
    v1: store.get('sch.v1', 'auto'), v2: store.get('sch.v2', 'auto') };
  const dtOf = () => sim.tdiv * 10 / SAMPLES;
  const timeMode = () => running && S.isDynamic(c);
  function solve() {
    if (!running) { res = { ok: false, stopped: true, error: STOPPED }; return; }
    res = timeMode() ? S.solveCircuit(c, { t: sim.t, dt: dtOf(), state: sim.state }) : S.solveCircuit(c);
  }
  // time 0 starts from the DC operating point (signals at their offset): amplifier coupling capacitors are already charged
  function resetSim() { sim.t = 0; sim.buf = []; sim.next = null; let st = new Map(); try { const r = S.solveCircuit(c, null, { sigOff: true }); if (r.ok) st = r.next; } catch { } sim.state = st; }
  // run the circuit for `span` seconds of circuit time. The step is fine enough for the fastest signal (≥ 40 per period),
  // independent of the scope. The scope only takes samples every time/div × 10 ÷ 400.
  const MAX_STEPS = 600;
  function simDt() {
    const fs = S.fastestFreq(c), sd = dtOf();
    // real-time runs: step size from the fastest signal only (20 per period), so zooming the scope doesn't slow the motors
    if (sim.speed !== 'screen') return Math.max(1e-7, Math.min(fs > 0 ? 1 / fs / 40 : 0.002, 0.002));
    return Math.max(1e-7, Math.min(sd, fs > 0 ? 1 / fs / 40 : sd, 0.002));
  }
  function stepSim(span) {
    const dt = simDt(), sd = dtOf(), scope = c.parts.find(p => p.type === 'SCOPE');
    let n = Math.max(1, Math.ceil(span / dt - 1e-9));
    let lag = n > MAX_STEPS; n = Math.min(n, MAX_STEPS);
    if (sim.next == null || sim.next < sim.t - sd) sim.next = sim.t;
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      if (k > 0 && (k & 7) === 0 && performance.now() - t0 > 40) { lag = true; break; }   // keep the screen smooth on big circuits (SMPS)
      sim.t += dt;
      const r = S.solveCircuit(c, { t: sim.t, dt, state: sim.state });
      res = r;
      if (!r.ok) return lag;
      sim.state = r.next;
      if (sim.t + 1e-12 >= sim.next) {
        const sc = scope && r.parts.get(scope.id);
        while (sim.t + 1e-12 >= sim.next) { sim.buf.push([sim.next, sc ? sc.ch1 : NaN, sc ? sc.ch2 : NaN]); sim.next += sd; }
      }
    }
    if (sim.buf.length > SAMPLES * 3) sim.buf.splice(0, sim.buf.length - SAMPLES * 3);
    return lag;
  }
  let panelRefresh = null, lastPanel = 0;

  // ---------- DOM ----------
  const btn = (text, on, cls = '') => el('button', { class: 'sb ' + cls, type: 'button', text, onclick: on });
  const modeBtns = {
    select: btn('↖ Select', () => setMode('select')),
    wire: btn('〰 Wire', () => setMode('wire')),
    delete: btn('🗑 Delete', () => { if (mode === 'select' && deleteSel()) return; setMode('delete'); }),
  };
  const voltsBtn = btn('', () => { showVolts = !showVolts; store.set('sch.volts', showVolts ? '1' : '0'); syncTop(); draw(); });
  const dotsBtn = btn('', () => { showDots = !showDots; store.set('sch.dots', showDots ? '1' : '0'); syncTop(); draw(); });
  const runBtn = btn('', () => { running = !running; store.set('sch.run', running ? '1' : '0'); syncTop(); commit(false); say(running ? 'Simulation running.' : 'Simulation stopped. Edit freely; tap ▶ Run to see the results.'); }, 'run');
  const floatBtn = btn('🪟 Float', () => setFloat(!floating));
  const top = el('div', { class: 'sch-tools' },
    runBtn, modeBtns.select, modeBtns.wire, modeBtns.delete,
    btn('↻', () => rotateSel(), 'icon'), btn('↶', () => undo(), 'icon'), btn('↷', () => redo(), 'icon'),
    btn('Fit', () => { fit(); draw(); }), voltsBtn, dotsBtn, floatBtn,
    btn('Projects', () => projects()), btn('Examples', () => examples()), btn('🟫 PCB', () => setView('pcb'), 'pcbbtn'));
  const tray = el('div', { class: 'sch-tray' });
  for (const t of S.PALETTE) {
    const cv = el('canvas', { width: 96, height: 56, class: 'ico' });
    const b = el('button', { class: 'tb', type: 'button', title: S.TYPES[t].label, onclick: () => { placeType = t; setMode('place'); } }, cv, el('span', { text: shortName(t) }));
    b.dataset.type = t;
    tray.append(b);
    requestAnimationFrame(() => drawIcon(cv, t));
  }
  // mouse wheel scrolls the rows sideways (when they don't wrap)
  for (const row of [top, tray]) row.addEventListener('wheel', (e) => { if (row.scrollWidth > row.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  // mouse drag scrolls the rows too (a click without movement still works)
  for (const row of [top, tray]) {
    let dx0 = null, sl0 = 0, moved = false;
    row.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; dx0 = e.clientX; sl0 = row.scrollLeft; moved = false; });
    addEventListener('pointermove', (e) => { if (dx0 == null) return; const d = e.clientX - dx0; if (Math.abs(d) > 5) moved = true; if (moved) row.scrollLeft = sl0 - d; });
    addEventListener('pointerup', () => { dx0 = null; });
    row.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  }
  const canvas = el('canvas', { class: 'sch-canvas' });
  const wrap = el('div', { class: 'sch-wrap' }, canvas);
  const status = el('div', { class: 'sch-status' });
  const panel = el('div', { class: 'sch-panel' });
  // floating settings: the part panel can float over the page (drag its bar) so you see the circuit while changing values
  let floating = store.get('sch.float', '0') === '1';
  const pTitle = el('b', { text: '⠿ Settings' });
  const pMin = btn('–', () => { panel.hidden = !panel.hidden; pMin.textContent = panel.hidden ? '+' : '–'; keepIn(); }, 'icon');
  const pHead = el('div', { class: 'sch-phead', hidden: true }, pTitle, el('span', { class: 'sch-phbtn' }, pMin, btn('✕ Dock', () => setFloat(false))));
  const panelBox = el('div', { class: 'sch-pbox' }, pHead, panel);
  function keepIn() {
    if (!floating) return;
    const w = panelBox.offsetWidth, h = panelBox.offsetHeight;
    let x = parseFloat(panelBox.style.left) || 0, y = parseFloat(panelBox.style.top) || 0;
    x = Math.max(4, Math.min(innerWidth - w - 4, x)); y = Math.max(4, Math.min(innerHeight - Math.min(h, 60) - 4, y));
    panelBox.style.left = x + 'px'; panelBox.style.top = y + 'px';
  }
  function setFloat(v) {
    floating = v; store.set('sch.float', v ? '1' : '0');
    panelBox.classList.toggle('floating', v); pHead.hidden = !v; floatBtn.classList.toggle('on', v);
    if (!v) { panel.hidden = false; pMin.textContent = '–'; panelBox.style.left = panelBox.style.top = ''; return; }
    const pos = (store.get('sch.floatpos', '') || '').split(',').map(Number);
    if (pos.length === 2 && pos.every(Number.isFinite)) { panelBox.style.left = pos[0] + 'px'; panelBox.style.top = pos[1] + 'px'; }
    else { panelBox.style.left = (innerWidth - Math.min(340, innerWidth - 16) - 8) + 'px'; panelBox.style.top = Math.round(innerHeight * 0.5) + 'px'; }
    requestAnimationFrame(keepIn);
  }
  {
    let d0 = null;
    pHead.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; d0 = { x: e.clientX, y: e.clientY, l: parseFloat(panelBox.style.left) || 0, t: parseFloat(panelBox.style.top) || 0 }; pHead.setPointerCapture(e.pointerId); e.preventDefault(); });
    pHead.addEventListener('pointermove', (e) => { if (!d0) return; panelBox.style.left = (d0.l + e.clientX - d0.x) + 'px'; panelBox.style.top = (d0.t + e.clientY - d0.y) + 'px'; keepIn(); });
    const up = () => { if (!d0) return; d0 = null; store.set('sch.floatpos', parseFloat(panelBox.style.left) + ',' + parseFloat(panelBox.style.top)); };
    pHead.addEventListener('pointerup', up); pHead.addEventListener('pointercancel', up);
    addEventListener('resize', keepIn);
  }
  // oscilloscope + time controls (shown while a time simulation runs)
  const scv = el('canvas', { class: 'scope-cv' });
  const fmtT = (t) => si(t, 's', 3) + '/div', fmtV = (v) => si(v, 'V', 3) + '/div';
  const tSel = el('select', { class: 'sel sm', 'aria-label': 'Time per division' }, TDIVS.map(t => el('option', { value: t, text: fmtT(t) })));
  const v1Sel = el('select', { class: 'sel sm', 'aria-label': 'CH1 volts per division' }, el('option', { value: 'auto', text: 'CH1 auto' }), VDIVS.map(v => el('option', { value: v, text: 'CH1 ' + fmtV(v) })));
  const v2Sel = el('select', { class: 'sel sm', 'aria-label': 'CH2 volts per division' }, el('option', { value: 'auto', text: 'CH2 auto' }), VDIVS.map(v => el('option', { value: v, text: 'CH2 ' + fmtV(v) })));
  // speed: 'screen' = one scope screen every 2 s (good for fast signals), numbers = × real time
  const spSel = el('select', { class: 'sel sm', 'aria-label': 'Speed' }, [['screen', '📺 scope pace'], [1, 'real time 1×'], [2, '2×'], [10, '10× fast'], [60, '60× fast'], [0.5, '½× slow'], [0.1, '0.1× slow'], [0.01, '0.01× slow'], [0.001, '0.001× slow']].map(([v, t]) => el('option', { value: v, text: t })));
  tSel.value = String(sim.tdiv); if (tSel.value === '') { sim.tdiv = 0.005; tSel.value = '0.005'; }
  v1Sel.value = sim.v1; v2Sel.value = sim.v2; spSel.value = String(sim.speed);
  tSel.onchange = () => { sim.tdiv = +tSel.value; store.set('sch.tdiv', tSel.value); sim.buf = []; sim.next = null; };
  v1Sel.onchange = () => { sim.v1 = v1Sel.value; store.set('sch.v1', sim.v1); };
  v2Sel.onchange = () => { sim.v2 = v2Sel.value; store.set('sch.v2', sim.v2); };
  spSel.onchange = () => { sim.speed = spSel.value; store.set('sch.speed2', spSel.value); };
  const pauseBtn = el('button', { class: 'sb', type: 'button', text: '⏸ Pause', onclick: () => { sim.paused = !sim.paused; pauseBtn.textContent = sim.paused ? '▶ Resume' : '⏸ Pause'; } });
  const resetBtn = el('button', { class: 'sb', type: 'button', text: '⟲ t = 0', onclick: () => { resetSim(); solve(); draw(); say('Time reset: capacitors empty, coils without current.'); } });
  const autoBtn = el('button', { class: 'sb', type: 'button', text: 'Auto time', onclick: () => autoTime() });
  const tInfo = el('div', { class: 'scope-info' });
  const scopeBox = el('div', { class: 'scope-box' }, el('div', { class: 'scope-head' }, el('b', { text: '📈 Oscilloscope' }), tInfo),
    scv, el('div', { class: 'scope-ctl' }, pauseBtn, resetBtn, autoBtn, tSel, spSel, v1Sel, v2Sel));
  scopeBox.hidden = true;
  // nudge arrows: move the selected part (wires follow), wire, or label one step
  let nudgeWhat = 'part';
  const whatSel = el('select', { class: 'sel sm', 'aria-label': 'What to move' }, el('option', { value: 'part', text: 'move part' }), el('option', { value: 'label', text: 'move label' }));
  whatSel.onchange = () => { nudgeWhat = whatSel.value; };
  const nudgeBar = el('div', { class: 'pcb-nudge', hidden: true }, el('span', { class: 'muted', text: 'Nudge' }),
    btn('◀', () => nudgeSch(-1, 0), 'icon'), btn('▲', () => nudgeSch(0, -1), 'icon'), btn('▼', () => nudgeSch(0, 1), 'icon'), btn('▶', () => nudgeSch(1, 0), 'icon'), whatSel);
  root.append(el('div', { class: 'sch-sticky' }, top, tray), wrap, nudgeBar, status, scopeBox, panelBox);
  setFloat(floating);
  // ---------- PCB view (same circuit, board layout + G-code) ----------
  let view2 = 'sch';
  const pcb = pcbView({ getC: () => c, commit: (push = true) => commit(push), undo: () => undo(), redo: () => redo(), say: (t) => say(t), shareFile: (n, t, m) => shareFile(n, t, m), toSchematic: () => setView('sch') });
  root.append(pcb.el);
  function setView(v) {
    view2 = v; store.set('sch.view', v);
    for (const e of [top, tray, wrap, status, panelBox]) e.hidden = v === 'pcb';
    if (v === 'pcb') nudgeBar.hidden = true; else syncNudgeSch();
    if (v === 'pcb') { scopeBox.hidden = true; pcb.show(); } else { pcb.hide(); resize(); commit(false); }
    scrollTo({ top: 0 });
  }
  function autoSpeed() { if (c.speed) { sim.speed = String(c.speed); spSel.value = sim.speed; store.set('sch.speed2', sim.speed); return; } const slow = c.parts.some(p => ['SERVO', 'STEPPER', 'T555', 'RELAY'].includes(p.type)) && !c.parts.some(p => p.type === 'SIG'); sim.speed = slow ? '1' : 'screen'; spSel.value = sim.speed; store.set('sch.speed2', sim.speed); }
  function autoTimeQuiet() { if (c.tdiv) { sim.tdiv = TDIVS.find(t => t >= c.tdiv) ?? 60; tSel.value = String(sim.tdiv); sim.buf = []; return; } const g = c.parts.find(p => p.type === 'SIG'); if (g) { const want = 2.5 / g.props.f / 10; sim.tdiv = TDIVS.find(t => t >= want) ?? 1; tSel.value = String(sim.tdiv); sim.buf = []; } else if (c.parts.some(p => p.type === 'L')) { sim.tdiv = 0.005; tSel.value = '0.005'; sim.buf = []; } }
  function autoTime() {
    const g = c.parts.find(p => p.type === 'SIG');
    if (!g) { say('Auto time needs a signal generator. Pick a time/div by hand.'); return; }
    autoTimeQuiet(); store.set('sch.tdiv', tSel.value);
    say(`Time/div set to ${fmtT(sim.tdiv)} for the ${si(g.props.f, 'Hz')} signal.`);
  }
  let ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  // ---------- helpers ----------
  function shortName(t) { return { R: 'Resistor', POT: 'Pot', BAT: 'Battery', LED: 'LED', D: 'Diode', SW: 'Switch', SPDT: 'SPDT', DPDT: 'DPDT', PB: 'Button', C: 'Capacitor', L: 'Inductor', SIG: 'Signal gen', SCOPE: 'Scope', OPTO: 'PC817', ZD: 'Zener', NPN: 'NPN', PNP: 'PNP', NMOS: 'N-MOSFET', PMOS: 'P-MOSFET', OPAMP: 'Op-amp', REG: 'Regulator', RELAY: 'Relay', T555: '555 timer', ESP32: 'ESP32', UNO: 'Arduino UNO', SERVO: 'Servo', STEPPER: 'Stepper', LAMP: 'Lamp', ISRC: 'I source', VM: 'Voltmeter', AM: 'Ammeter', GND: 'Ground' }[t]; }
  function load() { try { const j = JSON.parse(store.get('sch.cur', 'null')); return j && Array.isArray(j.parts) ? j : null; } catch { return null; } }
  const sx = (x) => view.ox + x * view.g, sy = (y) => view.oy + y * view.g;
  const wx = (px) => (px - view.ox) / view.g, wy = (py) => (py - view.oy) / view.g;
  const part = (id) => c.parts.find(p => p.id === id);
  const selPart = () => (sel?.kind === 'part' ? part(sel.id) : null);

  function setMode(m) {
    mode = m; wireStart = null;
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('on', k === m);
    syncNudgeSch();
    for (const b of tray.children) b.classList.toggle('on', m === 'place' && b.dataset.type === placeType);
    say({
      select: 'Tap a part to see its readings. Drag to move. Tap a switch to flip it, hold a button to press it.',
      wire: 'Tap a pin (yellow dot) or grid point to start, tap again to bend / finish. Ends automatically on a pin or wire.',
      delete: 'Tap a part or a wire to delete it.',
      place: `Tap the grid to place the ${S.TYPES[placeType]?.label}.`,
    }[m]);
    draw();
  }
  function say(t) { status.textContent = t; }
  function syncTop() { runBtn.textContent = running ? '■ Stop' : '▶ Run'; runBtn.classList.toggle('on', running); syncTop2(); }
  function syncTop2() { voltsBtn.textContent = showVolts ? 'Volts ●' : 'Volts ○'; voltsBtn.classList.toggle('on', showVolts); dotsBtn.textContent = showDots ? 'Flow ●' : 'Flow ○'; dotsBtn.classList.toggle('on', showDots); }

  function commit(push = true) {
    const lib = S.usedCustom(c); if (Object.keys(lib).length) c.lib = lib; else delete c.lib;
    solve();
    store.set('sch.cur', JSON.stringify(c));
    if (push) {
      const js = JSON.stringify(c);
      if (hist[hi] !== js) { hist.length = hi + 1; hist.push(js); if (hist.length > 80) hist.shift(); hi = hist.length - 1; }
    }
    renderPanel(); draw(); animate();
    if (view2 === 'pcb') pcb.refresh();
  }
  function undo() { if (hi <= 0) return say('Nothing to undo.'); hi--; c = JSON.parse(hist[hi]); sel = null; commit(false); say('Undone.'); }
  function redo() { if (hi >= hist.length - 1) return say('Nothing to redo.'); hi++; c = JSON.parse(hist[hi]); sel = null; commit(false); say('Redone.'); }

  // ---------- geometry ----------
  function partAt(x, y) {
    for (let k = c.parts.length - 1; k >= 0; k--) {
      const p = c.parts[k], [bx0, by0, bx1, by1] = S.TYPES[p.type].box;
      const [lx, ly] = S.rotPt([x - p.x, y - p.y], (4 - p.rot) & 3);
      if (lx >= bx0 - 0.3 && lx <= bx1 + 0.3 && ly >= by0 - 0.3 && ly <= by1 + 0.3) return p;
    }
    return null;
  }
  function wireAt(x, y, tol = 0.45) {
    let best = -1, bd = tol;
    c.wires.forEach((w, i) => {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / l2));
      const d = Math.hypot(x - (w.x1 + t * dx), y - (w.y1 + t * dy));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function snapPoint(x, y) {
    let best = null, bd = 0.7;
    for (const p of c.parts) for (const [px, py] of S.pinsOf(p)) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = [px, py]; } }
    return best ?? [Math.round(x), Math.round(y)];
  }
  function isConnectPoint(x, y) {
    const k = S.key(x, y);
    for (const p of c.parts) for (const q of S.pinsOf(p)) if (S.key(...q) === k) return true;
    return c.wires.some(w => S.key(w.x1, w.y1) === k || S.key(w.x2, w.y2) === k || wireAt(x, y, 0.01) >= 0);
  }

  // ---------- drawing ----------
  function resize() {
    const dpr = devicePixelRatio || 1;
    wrap.style.height = Math.round(Math.max(300, Math.min(760, innerHeight * 0.64))) + 'px';
    const rr = wrap.getBoundingClientRect();
    const first = !W;
    W = Math.round(rr.width); H = Math.round(rr.height);
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) fit();
    draw();
  }

  function fit() {
    const xs = [], ys = [];
    for (const p of c.parts) { const [a, b, cc, d] = S.TYPES[p.type].box; for (const q of [[a, b], [cc, d], [a, d], [cc, b]]) { const [x, y] = S.rotPt(q, p.rot); xs.push(p.x + x); ys.push(p.y + y); } }
    for (const w of c.wires) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
    if (!xs.length || !W) { view.g = 22; view.ox = W / 2; view.oy = H / 2; return; }
    const x0 = Math.min(...xs) - 7, x1 = Math.max(...xs) + 5, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 3;
    view.g = Math.max(8, Math.min(48, Math.min(W / (x1 - x0), H / (y1 - y0))));
    view.ox = W / 2 - (x0 + x1) / 2 * view.g; view.oy = H / 2 - (y0 + y1) / 2 * view.g;
  }

  function vColor(v, alpha = 1) {
    if (!showVolts || !res?.ok || v == null) return C.wire;
    let mx = 0; for (const w of res.wires) mx = Math.max(mx, Math.abs(w.va), Math.abs(w.vb));
    const t = mx > 1e-9 ? Math.max(-1, Math.min(1, v / mx)) : 0;
    const [r, g, b] = t >= 0 ? C.pos : C.neg, a = Math.abs(t);
    const mix = (x, y) => Math.round(x * a + y * (1 - a));
    return `rgba(${mix(r, C.gnd[0])},${mix(g, C.gnd[1])},${mix(b, C.gnd[2])},${alpha})`;
  }

  let tAnim = 0;
  const labelBoxes = [];
  function draw() {
    if (!W) return;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // grid dots
    if (view.g >= 9) {
      ctx.fillStyle = C.dot;
      const gx0 = Math.floor(wx(0)), gx1 = Math.ceil(wx(W)), gy0 = Math.floor(wy(0)), gy1 = Math.ceil(wy(H));
      const step = view.g < 14 ? 2 : 1;
      for (let x = gx0; x <= gx1; x++) { if (x % step) continue; for (let y = gy0; y <= gy1; y++) { if (y % step) continue; ctx.fillRect(sx(x) - 1, sy(y) - 1, 2, 2); } }
    }
    // wires
    const pieces = res?.ok ? res.wires : S.wirePieces(c).map(w => ({ ...w, va: null, vb: null, i: 0 }));
    ctx.lineCap = 'round';
    for (const w of pieces) {
      ctx.strokeStyle = vColor(w.va != null ? (w.va + w.vb) / 2 : null);
      const isSel = sel?.kind === 'wire' && sel.i === w.wi;
      ctx.lineWidth = isSel ? 4.5 : 2.6;
      if (isSel) ctx.strokeStyle = C.sel;
      ctx.beginPath(); ctx.moveTo(sx(w.x1), sy(w.y1)); ctx.lineTo(sx(w.x2), sy(w.y2)); ctx.stroke();
    }
    // parts
    for (const p of c.parts) drawPart(p);
    // junction dots
    ctx.fillStyle = C.part;
    for (const [x, y] of S.junctions(c)) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 3.6, 0, 7); ctx.fill(); }
    // current dots
    if (showDots && res?.ok) drawDots(pieces);
    // labels
    labelBoxes.length = 0;
    for (const p of c.parts) drawLabel(p);
    // pins in wire / place mode
    if (mode === 'wire') {
      ctx.fillStyle = C.pin;
      for (const p of c.parts) for (const [x, y] of S.pinsOf(p)) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 4, 0, 7); ctx.fill(); }
      if (wireStart && hover) {
        const [x0, y0] = wireStart, [x1, y1] = snapPoint(...hover);
        ctx.strokeStyle = C.sel; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx(x0), sy(y0)); ctx.lineTo(sx(x1), sy(y0)); ctx.lineTo(sx(x1), sy(y1)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (wireStart) { ctx.strokeStyle = C.sel; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(wireStart[0]), sy(wireStart[1]), 7, 0, 7); ctx.stroke(); }
    }
    if (mode === 'place' && hover) {
      const ghost = { id: -1, type: placeType, x: Math.round(hover[0]), y: Math.round(hover[1]), rot: 0, props: S.TYPES[placeType].props, name: '' };
      ctx.globalAlpha = 0.45; drawPart(ghost); ctx.globalAlpha = 1;
    }
  }

  function drawDots(pieces) {
    const t = tAnim / 1000;
    const dotsOn = (x1, y1, x2, y2, i) => {
      if (Math.abs(i) < 1e-7) return;
      const len = Math.hypot(x2 - x1, y2 - y1) * view.g; if (len < 1) return;
      const speed = Math.min(140, 18 * Math.max(0.6, Math.log10(Math.abs(i) / 1e-7)));
      const sp = 16, off = ((t * speed) % sp + sp) % sp;
      const dir = i > 0 ? 1 : -1;
      ctx.fillStyle = C.cur;
      for (let d = off; d < len; d += sp) {
        const f = dir > 0 ? d / len : 1 - d / len;
        ctx.beginPath(); ctx.arc(sx(x1 + (x2 - x1) * f), sy(y1 + (y2 - y1) * f), 2.2, 0, 7); ctx.fill();
      }
    };
    for (const w of pieces) dotsOn(w.x1, w.y1, w.x2, w.y2, w.i);
    for (const p of c.parts) {
      const r = res.parts.get(p.id); if (!r || p.type === 'GND' || p.type === 'POT' || p.type === 'SPDT' || p.type === 'DPDT' || p.type === 'SCOPE') continue;
      const pins = S.pinsOf(p);
      if (r.dots) { for (const [a, b, i] of r.dots) dotsOn(pins[a][0], pins[a][1], pins[b][0], pins[b][1], i); continue; }
      dotsOn(pins[0][0], pins[0][1], pins[1][0], pins[1][1], r.i);
    }
  }

  function drawPart(p) {
    const r = res?.ok ? res.parts.get(p.id) : null;
    const isSel = sel?.kind === 'part' && sel.id === p.id;
    ctx.save();
    ctx.translate(sx(p.x), sy(p.y)); ctx.rotate(p.rot * Math.PI / 2); ctx.scale(view.g, view.g);
    ctx.lineWidth = 2.2 / view.g; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (isSel) {
      const [a, b, cc, d] = S.TYPES[p.type].box;
      ctx.fillStyle = 'rgba(79,195,247,0.12)'; ctx.strokeStyle = C.sel; ctx.setLineDash([4 / view.g, 3 / view.g]);
      ctx.fillRect(a - 0.25, b - 0.25, cc - a + 0.5, d - b + 0.5); ctx.strokeRect(a - 0.25, b - 0.25, cc - a + 0.5, d - b + 0.5); ctx.setLineDash([]);
    }
    symbol(ctx, p, r, view.g);
    if (S.isBoard(p.type) && isSel) {
      const k = S.BOARDS[p.type].pins.findIndex(x => x.n === boardPin(p)), pt = S.TYPES[p.type].pins[k];
      if (pt) { ctx.strokeStyle = C.sel; ctx.lineWidth = 2.5 / view.g; ctx.beginPath(); ctx.arc(pt[0], pt[1], 0.55, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawLabel(p) {
    if (p.type === 'GND') return;
    const r = res?.ok ? res.parts.get(p.id) : null;
    let [nx, ny] = S.rotPt([0, 1], p.rot);
    const vert = p.rot & 1;
    if (vert) { nx = 1; ny = 0; }          // vertical parts: label always on the right (never cut off at the left edge)
    const dist = Math.max(1.6, S.TYPES[p.type].box[3] + 0.9);
    // parts with a pin in the middle of the bottom edge: put the label beside that wire, not on it
    const side = !vert && { REG: 0.6, OPAMP: 0.6, SCOPE: 0.6, RELAY: 2.6 }[p.type];
    const off = p.lbl ?? [0, 0];         // label dragged by hand (grid units)
    const x = sx(p.x + nx * dist + (side ? (p.rot ? -side : side) : 0) + off[0]), y = sy(p.y + ny * dist + off[1]);
    ctx.font = `600 ${Math.max(10, Math.min(13, view.g * 0.55))}px system-ui, sans-serif`;
    const align = vert ? (nx < 0 ? 'right' : 'left') : side ? (p.rot ? 'right' : 'left') : 'center';
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    const val = valueText(p);
    ctx.fillStyle = C.text;
    const lines = [p.name + (val ? '  ' + val : '')];
    if (r && (p.type === 'VM' || p.type === 'AM')) lines.push(p.type === 'VM' ? si(r.v, 'V') : si(r.i, 'A'));
    // hit box (screen px) so the label can be dragged
    const tw = Math.max(...lines.map(t => ctx.measureText(t).width)) + 6;
    const bx0 = align === 'left' ? x - 3 : align === 'right' ? x - tw + 3 : x - tw / 2;
    const by0 = y - (vert && lines.length > 1 ? 17 : 9), by1 = y + (lines.length > 1 ? (vert ? 17 : 23) : 9);
    labelBoxes.push({ p, x0: bx0, y0: by0, x1: bx0 + tw, y1: by1 });
    if ((sel?.kind === 'part' && sel.id === p.id) || down?.lab?.p === p) { ctx.save(); ctx.strokeStyle = 'rgba(79,195,247,0.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeRect(bx0, by0, tw, by1 - by0); ctx.restore(); ctx.fillStyle = C.text; }
    if (vert) { ctx.fillText(lines[0], x, y - (lines.length > 1 ? 8 : 0)); if (lines[1]) { ctx.fillStyle = C.cur; ctx.fillText(lines[1], x, y + 9); } }
    else { ctx.fillText(lines[0], x, y); if (lines[1]) { ctx.fillStyle = C.cur; ctx.font = '700 13px ui-monospace, monospace'; ctx.fillText(lines[1], x, y + 15); } }
  }

  function capTxt(v) { return v >= 1e-6 && v < 1 ? plain(v * 1e6, 3) + ' µF' : si(v, 'F', 3); }
  function valueText(p) {
    const q = p.props;
    switch (p.type) {
      case 'R': return si(q.r, 'Ω', 3);
      case 'POT': return `${si(q.r, 'Ω', 3)} @${Math.round(q.pos)}%`;
      case 'BAT': return si(q.v, 'V', 3);
      case 'ISRC': return si(q.i, 'A', 3);
      case 'LED': return q.color;
      case 'D': return q.model;
      case 'LAMP': return `${si(q.vr, 'V', 3)} ${si(q.wr, 'W', 3)}`;
      case 'XFMR': return `${plain(q.n1)}+${plain(q.n2)} : ${plain(q.ns)} turns`;
      case 'SW': return q.on ? 'ON' : 'OFF';
      case 'SPDT': case 'DPDT': return q.on ? '▼ down' : '▲ up';
      case 'PB': return q.on ? 'pressed' : '';
      case 'C': return capTxt(q.c);
      case 'L': return si(q.l, 'H', 3);
      case 'SIG': return `${q.wave} ${si(q.f, 'Hz', 3)} ${si(q.amp, 'V', 3)}`;
      case 'OPTO': return 'PC817';
      case 'ZD': return S.ZENER_PARTS[q.model] ? `${q.model} ${si(S.ZENER_PARTS[q.model].vz, 'V', 3)}` : si(q.vz, 'V', 3);
      case 'NPN': case 'PNP': case 'NMOS': case 'PMOS': case 'OPAMP': return q.model;
      case 'RELAY': return S.getCustom('RELAY', q.relay) ? q.relay : `${q.vcoil} V coil`;
      case 'T555': return q.model;
      case 'ESP32': case 'UNO': return '';
      case 'SERVO': return q.model;
      case 'STEPPER': return q.micro > 1 ? `1/${q.micro} step` : 'full step';
    }
    return '';
  }

  // ---------- animation ----------
  let raf = 0;
  let lastFrame = null;
  function animate() {
    if (raf) return;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      tAnim = t;
      if (!root.isConnected || root.hidden || !W) return;
      const tm = timeMode();
      const tm2 = tm && view2 !== 'pcb'; if (scopeBox.hidden === tm2) scopeBox.hidden = !tm2;
      if (tm) {
        const fdt = Math.min(0.05, Math.max(0, (t - (lastFrame ?? t)) / 1000)); lastFrame = t;
        if (!sim.paused && !down?.drag) sim.lag = stepSim(sim.speed === 'screen' ? sim.tdiv * 10 / 120 : (+sim.speed) * (fdt || 1 / 60));
        draw(); drawScope();
        if (t - lastPanel > 250) { lastPanel = t; panelRefresh?.(); }
      } else if (showDots && res?.ok) draw();
    };
    raf = requestAnimationFrame(loop);
  }

  // ---------- oscilloscope screen ----------
  function drawScope() {
    const dpr = devicePixelRatio || 1, r = scv.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    if (scv.width !== w * dpr || scv.height !== h * dpr) { scv.width = w * dpr; scv.height = h * dpr; }
    const x = scv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#07120C'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(80,140,100,0.25)'; x.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const px = Math.round(i * w / 10) + 0.5; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); }
    for (let i = 0; i <= 8; i++) { const py = Math.round(i * h / 8) + 0.5; x.beginPath(); x.moveTo(0, py); x.lineTo(w, py); x.stroke(); }
    x.strokeStyle = 'rgba(120,200,140,0.45)'; x.beginPath(); x.moveTo(0, h / 2 + 0.5); x.lineTo(w, h / 2 + 0.5); x.stroke();
    const scope = c.parts.find(p => p.type === 'SCOPE');
    tInfo.textContent = `t = ${si(sim.t, 's', 4)}  ·  ${fmtT(sim.tdiv)}${sim.paused ? '  ·  paused' : ''}${sim.lag && !sim.paused ? '  ·  ⚠ slower than real time (circuit too fast)' : ''}`;
    if (!scope) { x.fillStyle = '#9AD7A8'; x.font = '13px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('Add a Scope part and wire CH1 / CH2 to see waveforms', w / 2, h / 2 - 10); return; }
    const b = sim.buf; if (b.length < 2) return;
    // trigger: last rising crossing of CH1 through its middle level that still has a full screen after it
    let start = Math.max(0, b.length - SAMPLES);
    let lo = Infinity, hi = -Infinity; for (let i = start; i < b.length; i++) { lo = Math.min(lo, b[i][1]); hi = Math.max(hi, b[i][1]); }
    const mid = (lo + hi) / 2;
    if (hi - lo > 1e-6) for (let i = b.length - SAMPLES - 1; i > 0; i--) { if (b[i - 1][1] < mid && b[i][1] >= mid) { start = i; break; } }
    const seg = b.slice(start, start + SAMPLES);
    const scale = (sel, k) => {
      if (sel !== 'auto') return +sel;
      let m = 0; for (const s of seg) if (isFinite(s[k])) m = Math.max(m, Math.abs(s[k]));
      return VDIVS.find(v => v * 3.8 >= m) ?? VDIVS[VDIVS.length - 1];
    };
    const d1 = scale(sim.v1, 1), d2 = scale(sim.v2, 2);
    const pinsSc = S.pinsOf(scope), wired = (k) => { const kk = S.key(...pinsSc[k]); return c.wires.some(w => S.key(w.x1, w.y1) === kk || S.key(w.x2, w.y2) === kk) || c.parts.some(q => q !== scope && S.pinsOf(q).some(pp => S.key(...pp) === kk)); };
    const on1 = wired(0), on2 = wired(1);
    const clampY = (py) => Math.max(-5, Math.min(h + 5, py));
    const plot = (k, vdiv, col) => {
      x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
      seg.forEach((s, i) => { const px = i / (SAMPLES - 1) * w, py = clampY(h / 2 - s[k] / vdiv * (h / 8)); i ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.stroke();
    };
    if (on2) plot(2, d2, '#4FC3F7'); if (on1) plot(1, d1, '#FFE16B');
    const meas = (k) => {
      let mn = Infinity, mx = -Infinity, sum = 0, sq = 0;
      for (const s of seg) { mn = Math.min(mn, s[k]); mx = Math.max(mx, s[k]); sum += s[k]; sq += s[k] * s[k]; }
      const lvl = (mn + mx) / 2, cross = [];
      seg.forEach((s, i) => { if (i && seg[i - 1][k] < lvl && s[k] >= lvl) cross.push(s[0]); });
      const f = cross.length >= 2 && mx - mn > 1e-6 ? (cross.length - 1) / (cross[cross.length - 1] - cross[0]) : null;
      return `${si(mx - mn, 'V', 3)}pp · avg ${si(sum / seg.length, 'V', 3)}${w > 520 ? ' · rms ' + si(Math.sqrt(sq / seg.length), 'V', 3) : ''}${f ? ' · ' + si(f, 'Hz', 3) : ''}`;
    };
    x.font = `600 ${w < 420 ? 10 : 11}px ui-monospace, monospace`; x.textAlign = 'left';
    x.fillStyle = '#FFE16B'; x.fillText(on1 ? `CH1 ${fmtV(d1)} ${meas(1)}` : 'CH1 not connected', 6, 14);
    x.fillStyle = '#4FC3F7'; x.fillText(on2 ? `CH2 ${fmtV(d2)} ${meas(2)}` : 'CH2 not connected', 6, h - 7);
  }

  // ---------- input ----------
  const ptrs = new Map();
  let down = null, pinch = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    const [px, py] = pos(e); ptrs.set(e.pointerId, [px, py]);
    if (ptrs.size === 2) { const v = [...ptrs.values()]; pinch = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); down = { pinch: true, last: mid() }; return; }
    const x = wx(px), y = wy(py);
    down = { px, py, x, y, moved: false, last: [px, py], drag: null, pan: false };
    if (mode === 'select') {
      const lb = [...labelBoxes].reverse().find(b => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1);
      const p = partAt(x, y);
      const wEnd = !p && !lb ? wireEndAt(x, y) : null;
      const wi = !p && !lb && !wEnd ? wireAt(x, y) : -1;
      if (lb) down.lab = { p: lb.p, ox: lb.p.lbl?.[0] ?? 0, oy: lb.p.lbl?.[1] ?? 0, ax: x, ay: y };
      else if (p) {
        down.drag = { p, ox: p.x, oy: p.y, ax: x, ay: y, ends: attachedEnds(p) };
        if (p.type === 'PB') { p.props.on = true; down.pb = p; commit(false); }
      } else if (wEnd) down.wend = { k: wEnd, orig: structuredClone(c.wires) };
      else if (wi >= 0) down.wdrag = { i: wi, orig: structuredClone(c.wires), ax: x, ay: y };
      else down.pan = true;
    } else down.pan = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = pos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
    if (!down) { if (mode === 'wire' || mode === 'place') { hover = [wx(px), wy(py)]; draw(); } return; }
    if (down.pinch && ptrs.size >= 2) {
      const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), [mx, my] = mid();
      view.ox += mx - down.last[0]; view.oy += my - down.last[1];
      if (pinch > 0) zoomAt(d / pinch, mx, my);
      pinch = d; down.last = [mx, my]; draw(); return;
    }
    if (!down.moved && Math.hypot(px - down.px, py - down.py) > 6) down.moved = true;
    if (!down.moved) return;
    hover = [wx(px), wy(py)];
    if (down.lab) {
      const d = down.lab, q = (v) => Math.round(v * 4) / 4;
      d.p.lbl = [q(d.ox + wx(px) - d.ax), q(d.oy + wy(py) - d.ay)]; draw();
    } else if (down.wdrag) {
      const d = down.wdrag, dx = Math.round(wx(px) - d.ax), dy = Math.round(wy(py) - d.ay);
      if (dx !== d.dx || dy !== d.dy) { d.dx = dx; d.dy = dy; c.wires = moveWire(d.orig, d.i, dx, dy); sel = { kind: 'wire', i: d.i }; solve(); draw(); }
    } else if (down.wend) {
      const d = down.wend, [ox, oy] = d.k, nx = Math.round(wx(px)), ny = Math.round(wy(py));
      if (nx !== d.nx || ny !== d.ny) {
        d.nx = nx; d.ny = ny;
        c.wires = d.orig.map(w => { const o = { ...w }; for (const e of [1, 2]) if (o['x' + e] === ox && o['y' + e] === oy) { o['x' + e] = nx; o['y' + e] = ny; } return o; }).filter(w => w.x1 !== w.x2 || w.y1 !== w.y2);
        solve(); draw();
      }
    } else if (down.drag) {
      const d = down.drag, nx = Math.round(d.ox + wx(px) - d.ax), ny = Math.round(d.oy + wy(py) - d.ay);
      if (nx !== d.p.x || ny !== d.p.y) { d.p.x = nx; d.p.y = ny; followPins(d); solve(); renderPanel(); draw(); }
    } else if (down.pan) { view.ox += px - down.last[0]; view.oy += py - down.last[1]; down.last = [px, py]; draw(); }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    if (!down) return;
    if (down.pinch) { if (ptrs.size === 0) down = null; return; }
    const d = down; down = null;
    if (d.pb) { d.pb.props.on = false; commit(false); }
    if (d.drag && d.moved) { commit(); return; }
    if (d.lab && d.moved) { sel = { kind: 'part', id: d.lab.p.id }; commit(); say('Label moved. Reset it from the part panel.'); return; }
    if ((d.wdrag || d.wend) && d.moved) { if (d.wend) sel = null; commit(); say(d.wend ? 'Wire corner moved.' : 'Wire moved: connected wires stretch along.'); return; }
    if (!d.moved) { if (d.lab) { sel = { kind: 'part', id: d.lab.p.id }; renderPanel(); draw(); return; } tap(d.x, d.y, d); }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (down?.pb) { down.pb.props.on = false; commit(false); } down = null; });
  canvas.addEventListener('pointerleave', () => { if (!down && hover) { hover = null; draw(); } });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = pos(e); zoomAt(Math.exp(-e.deltaY * 0.0015), px, py); draw(); }, { passive: false });
  function pos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function mid() { const v = [...ptrs.values()]; return [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2]; }
  function zoomAt(k, fx, fy) { const ng = Math.max(6, Math.min(80, view.g * k)), kk = ng / view.g; view.ox = fx - (fx - view.ox) * kk; view.oy = fy - (fy - view.oy) * kk; view.g = ng; }

  // ---------- nudge (arrows) ----------
  function syncNudgeSch() {
    if (typeof nudgeBar === 'undefined') return;
    const on = view2 !== 'pcb' && mode === 'select' && (sel?.kind === 'wire' ? !!c.wires[sel.i] : !!selPart());
    nudgeBar.hidden = !on;
    whatSel.hidden = sel?.kind !== 'part';
    if (sel?.kind !== 'part') { nudgeWhat = 'part'; whatSel.value = 'part'; }
  }
  function nudgeSch(dx, dy) {
    if (sel?.kind === 'wire' && c.wires[sel.i]) {
      const w = c.wires[sel.i], horiz = w.y1 === w.y2, vert = w.x1 === w.x2;
      if ((horiz && !dy) || (vert && !dx)) return say('A straight wire slides sideways only: use ▲ ▼ for a flat wire, ◀ ▶ for a standing one.');
      const keep = { ...w, x1: w.x1 + dx, x2: w.x2 + dx, y1: w.y1 + dy, y2: w.y2 + dy };
      c.wires = moveWire(c.wires, sel.i, dx, dy);
      const ni = c.wires.findIndex(q => S.key(q.x1, q.y1) === S.key(keep.x1, keep.y1) && S.key(q.x2, q.y2) === S.key(keep.x2, keep.y2));
      sel = ni >= 0 ? { kind: 'wire', i: ni } : null;
      commit(); return;
    }
    const p = selPart(); if (!p) return;
    if (nudgeWhat === 'label') { const o = p.lbl ?? [0, 0]; p.lbl = [o[0] + dx * 0.5, o[1] + dy * 0.5]; commit(); return; }
    // wires on the pins: stretch them if they stay straight, otherwise add a short straight piece (no crooked wires)
    const old = S.pinsOf(p);
    const ends = attachedEnds(p);
    p.x += dx; p.y += dy;
    const now = S.pinsOf(p), add = [];
    for (const [i, end, k] of ends) {
      const w = c.wires[i]; if (!w) continue;
      const straight = (w.x1 === w.x2 && dx === 0) || (w.y1 === w.y2 && dy === 0);
      if (straight) { w['x' + end] = now[k][0]; w['y' + end] = now[k][1]; }
      else add.push({ x1: old[k][0], y1: old[k][1], x2: now[k][0], y2: now[k][1] });
    }
    c.wires.push(...add);
    c.wires = c.wires.filter(w => w.x1 !== w.x2 || w.y1 !== w.y2);
    commit();
  }
  // microcontroller boards: which pin the panel shows
  const boardPinSel = new Map();
  function boardPin(p) { const B = S.BOARDS[p.type]; const n = boardPinSel.get(p.id); return B.pins.some(x => x.n === n) ? n : (Object.keys(p.props.pins ?? {})[0] ?? B.pins.find(x => x.k === 'gpio').n); }
  const MODE_SHORT = { in: 'input', pu: 'pull-up', pd: 'pull-down', adc: 'ADC', high: 'HIGH', low: 'LOW', pwm: 'PWM', pwr: 'power', en: 'reset', nc: '—' };
  // free wire corner / end (not on a part pin) close to the finger
  function wireEndAt(x, y) {
    const pinK = new Set(c.parts.flatMap(p => S.pinsOf(p).map(q => S.key(...q))));
    let best = null, bd = Math.max(0.35, 9 / view.g);
    for (const w of c.wires) for (const e of [1, 2]) {
      const ex = w['x' + e], ey = w['y' + e], d = Math.hypot(ex - x, ey - y);
      if (d < bd && !pinK.has(S.key(ex, ey))) { bd = d; best = [ex, ey]; }
    }
    return best;
  }
  // slide a wire: straight wires move sideways, neighbours stretch (or a new piece of wire is added so nothing breaks)
  function moveWire(orig, i, dx, dy) {
    const ws = orig.map(w => ({ ...w })), w0 = orig[i];
    if (w0.y1 === w0.y2) dx = 0; else if (w0.x1 === w0.x2) dy = 0;
    if (!dx && !dy) return ws;
    const pinK = new Set(c.parts.flatMap(p => S.pinsOf(p).map(q => S.key(...q))));
    const onInside = (o, x, y) => { const vx = o.x2 - o.x1, vy = o.y2 - o.y1, l2 = vx * vx + vy * vy; if (!l2) return false; const t = ((x - o.x1) * vx + (y - o.y1) * vy) / l2; return t > 1e-6 && t < 1 - 1e-6 && Math.abs((x - o.x1) * vy - (y - o.y1) * vx) < 1e-6; };
    const add = [];
    for (const end of [1, 2]) {
      const ex = w0['x' + end], ey = w0['y' + end], k = S.key(ex, ey);
      let conn = pinK.has(k);
      orig.forEach((o, j) => {
        if (j === i) return;
        for (const e2 of [1, 2]) if (S.key(o['x' + e2], o['y' + e2]) === k) {
          const keepsStraight = (o.x1 === o.x2 && dx === 0) || (o.y1 === o.y2 && dy === 0);
          if (keepsStraight) { ws[j]['x' + e2] += dx; ws[j]['y' + e2] += dy; } else conn = true;
        }
        if (onInside(o, ex, ey)) conn = true;
      });
      ws[i]['x' + end] += dx; ws[i]['y' + end] += dy;
      if (conn) {
        if (!dx || !dy) add.push({ x1: ex, y1: ey, x2: ex + dx, y2: ey + dy });
        else add.push({ x1: ex, y1: ey, x2: ex + dx, y2: ey }, { x1: ex + dx, y1: ey, x2: ex + dx, y2: ey + dy });
      }
    }
    return ws.concat(add).filter(w => w.x1 !== w.x2 || w.y1 !== w.y2);
  }
  // crooked (diagonal) wire → L shape
  function straighten(i, downFirst = false) {
    const w = c.wires[i]; if (!w || w.x1 === w.x2 || w.y1 === w.y2) return false;
    const cx = downFirst ? w.x1 : w.x2, cy = downFirst ? w.y2 : w.y1;
    c.wires.splice(i, 1, { x1: w.x1, y1: w.y1, x2: cx, y2: cy }, { x1: cx, y1: cy, x2: w.x2, y2: w.y2 });
    return true;
  }
  function straightenAll() { let n = 0; for (let i = c.wires.length - 1; i >= 0; i--) if (straighten(i)) n++; return n; }
  // wire ends touching a part's pins move with it (rubber band)
  function attachedEnds(p) {
    const pins = S.pinsOf(p).map(q => S.key(...q)), out = [];
    c.wires.forEach((w, i) => {
      const a = pins.indexOf(S.key(w.x1, w.y1)), b = pins.indexOf(S.key(w.x2, w.y2));
      if (a >= 0) out.push([i, 1, a]); if (b >= 0) out.push([i, 2, b]);
    });
    return out;
  }
  function followPins(d) {
    const pins = S.pinsOf(d.p);
    for (const [i, end, k] of d.ends) { const w = c.wires[i]; if (!w) continue; w['x' + end] = pins[k][0]; w['y' + end] = pins[k][1]; }
  }

  function tap(x, y) {
    if (mode === 'place') {
      const p = S.addPart(c, placeType, Math.round(x), Math.round(y));
      sel = { kind: 'part', id: p.id }; hover = null;
      setMode('select'); commit();
      say(`${p.name} placed. Drag to move, ↻ to rotate, then wire it with 〰 Wire.`);
      return;
    }
    if (mode === 'delete') {
      const p = partAt(x, y);
      if (p) { c.parts = c.parts.filter(q => q !== p); sel = null; commit(); say(`${p.name} deleted.`); return; }
      const wi = wireAt(x, y);
      if (wi >= 0) { c.wires.splice(wi, 1); sel = null; commit(); say('Wire deleted.'); return; }
      say('Nothing here. Tap a part or a wire.'); return;
    }
    if (mode === 'wire') {
      const pt = snapPoint(x, y);
      if (!wireStart) { wireStart = pt; draw(); say('Now tap where the wire goes. It bends once (L-shape).'); return; }
      const [x0, y0] = wireStart, [x1, y1] = pt;
      if (x0 === x1 && y0 === y1) { wireStart = null; draw(); say('Wire finished. Tap a new start point.'); return; }
      const endsOnSomething = isConnectPoint(x1, y1);
      if (x0 !== x1) c.wires.push({ x1: x0, y1: y0, x2: x1, y2: y0 });
      if (y0 !== y1) c.wires.push({ x1: x1, y1: y0, x2: x1, y2: y1 });
      wireStart = endsOnSomething ? null : pt;
      commit();
      say(endsOnSomething ? 'Connected. Tap a new start point, or ↖ Select when done.' : 'Keep going: tap the next point (tap the same point twice to stop).');
      return;
    }
    // select mode
    const p = partAt(x, y);
    if (p) {
      if (p.type === 'SW' || p.type === 'SPDT' || p.type === 'DPDT') { p.props.on = !p.props.on; sel = { kind: 'part', id: p.id }; commit(); say(`${p.name} ${p.props.on ? 'ON (closed)' : 'OFF (open)'}. Tap again to flip.`); return; }
      if (S.isBoard(p.type)) {
        // tap near a pin = select that pin
        const pts = S.pinsOf(p); let bi = -1, bd = 0.8;
        pts.forEach(([px, py], k) => { const d = Math.hypot(px - x, py - y); if (d < bd && S.BOARDS[p.type].pins[k].k !== 'gnd') { bd = d; bi = k; } });
        if (bi >= 0) boardPinSel.set(p.id, S.BOARDS[p.type].pins[bi].n);
      }
      sel = { kind: 'part', id: p.id }; renderPanel(); draw(); return;
    }
    const wi = wireAt(x, y);
    if (wi >= 0) { sel = { kind: 'wire', i: wi }; renderPanel(); draw(); return; }
    sel = null; renderPanel(); draw();
  }

  function rotateSel() {
    const p = selPart(); if (!p) return say('Select a part first, then ↻.');
    const d = { p, ends: attachedEnds(p) };
    p.rot = (p.rot + 1) & 3; followPins(d); commit();
  }

  // delete whatever is selected (toolbar 🗑, Delete key). Returns false when nothing is selected.
  function deleteSel() {
    if (sel?.kind === 'part') { const p = selPart(); if (!p) return false; c.parts = c.parts.filter(q => q !== p); sel = null; commit(); say(`${p.name} deleted. ↶ brings it back.`); return true; }
    if (sel?.kind === 'wire' && c.wires[sel.i]) { c.wires.splice(sel.i, 1); sel = null; commit(); say('Wire deleted. ↶ brings it back.'); return true; }
    return false;
  }
  // keyboard (PC)
  addEventListener('keydown', (e) => {
    if (root.hidden || !root.isConnected || view2 === 'pcb' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') rotateSel();
    else if (k === 'w') setMode('wire');
    else if (k === 'escape') { setMode('select'); sel = null; renderPanel(); }
    else if (k.startsWith('arrow') && mode === 'select' && sel) { e.preventDefault(); const m = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k]; nudgeSch(m[0], m[1]); }
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); } else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  });

  // ---------- properties + readings panel ----------
  function field(label, value, unit, onSet) {
    const inp = el('input', { class: 'num', value, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const apply = () => { const v = parse(inp.value); if (v == null || !(v >= 0)) { inp.classList.add('badv'); return; } inp.classList.remove('badv'); onSet(v); commit(); };
    inp.addEventListener('change', apply); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    return el('label', { class: 'field' }, el('span', { class: 'lab', text: label }), el('span', { class: 'box' }, inp, el('span', { class: 'unit', text: unit })));
  }
  // ---------- my parts (custom parts typed in from a datasheet) ----------
  function builtins(lib, filt = () => true) { return Object.entries(lib).filter(([, m]) => !m.custom && filt(m)).map(([k, m]) => [k, `${k}: ${m.note}`]); }
  function modelChoice(p, label, kind, value, opts, onPick) {
    const pol = { NPN: 'npn', PNP: 'pnp', NMOS: 'n', PMOS: 'p' }[p.type];
    const lib = { BJT: S.BJTS, FET: S.FETS, DIODE: S.DIODES, ZENER: S.ZENER_PARTS, LED: S.LED_COLORS, AMP: S.AMPS, REG: S.REGS, RELAY: S.RELAYS }[kind];
    const mine = Object.entries(lib).filter(([, m]) => m.custom && (!pol || m.pol === pol)).map(([k]) => [k, `★ ${k}`]);
    const wrap = el('div', { class: 'mp-row' }, choice(label, value, [...opts, ...mine, ['__new', '+ New part from datasheet…']], v => {
      if (v === '__new') { partForm(kind, p, null); return; }
      onPick(v);
      const m = S.getCustom(kind, v); if (m && kind === 'LED') p.props.imax = m.imax;
    }));
    if (S.getCustom(kind, value)) wrap.append(el('button', { class: 'btn', type: 'button', text: `✎ Edit ★ ${value}`, onclick: () => partForm(kind, p, value) }));
    return wrap;
  }
  function myParts() { try { return JSON.parse(store.get('sch.myparts', '{}')) || {}; } catch { return {}; } }
  function saveMyParts(a) { store.set('sch.myparts', JSON.stringify(a)); }
  // register a library (my parts, or the one inside a project file); project parts I don't have yet are added to my parts
  function registerLib(lib, addToMine) {
    if (!lib || typeof lib !== 'object') return 0;
    const my = myParts(); let added = 0;
    for (const [kind, o] of Object.entries(lib)) {
      if (!S.CUSTOM_KINDS[kind] || !o) continue;
      for (const [nm, d] of Object.entries(o)) {
        if (S.isBuiltIn(kind, nm)) continue;
        if (addToMine && !my[kind]?.[nm]) { (my[kind] ??= {})[nm] = d; added++; }
        S.registerCustom(kind, nm, d, d.pol);
      }
    }
    if (added) saveMyParts(my);
    return added;
  }
  function setPartModel(p, kind, nm) {
    const m = S.getCustom(kind, nm);
    if (kind === 'LED') { p.props.color = nm; p.props.imax = m.imax; } else if (kind === 'RELAY') p.props.relay = nm; else p.props.model = nm;
  }
  function partForm(kind, p, name) {
    const K = S.CUSTOM_KINDS[kind], pol = { NPN: 'npn', PNP: 'pnp', NMOS: 'n', PMOS: 'p' }[p.type];
    const old = name ? S.getCustom(kind, name)?.raw ?? {} : {};
    const nameIn = el('input', { class: 'num wide', value: name ?? '', placeholder: 'e.g. MRF510, 2SC5200, LM2940-5', maxlength: 30, autocapitalize: 'characters', spellcheck: 'false' });
    if (name) nameIn.disabled = true;
    const ins = {};
    const rows = K.fields.map(([k, label, unit, def, hint, opt]) => {
      let inp;
      if (k === 'glow') inp = el('select', { class: 'sel' }, Object.entries(S.LED_COLORS).filter(([, v]) => !v.custom).map(([c]) => el('option', { value: c, text: c })));
      else if (k === 'adj') inp = el('select', { class: 'sel' }, el('option', { value: '0', text: 'No (fixed, GND pin)' }), el('option', { value: '1', text: 'Yes (ADJ pin, like LM317)' }));
      else inp = el('input', { class: 'num', autocomplete: 'off', spellcheck: 'false', inputmode: 'decimal', placeholder: opt ? `optional (${plain(def)})` : '' });
      inp.value = old[k] != null ? String(old[k]) : opt ? '' : String(def);
      ins[k] = inp;
      return el('label', { class: 'field' }, el('span', { class: 'lab', text: label + (hint ? ` · ${hint}` : '') }),
        inp.tagName === 'SELECT' ? inp : el('span', { class: 'box' }, inp, el('span', { class: 'unit', text: unit })));
    });
    const err = el('div', { class: 'flag bad', hidden: true });
    const save = () => {
      const nm = (name ?? nameIn.value).trim().replace(/[★]/g, '');
      const bad = (t) => { err.textContent = t; err.hidden = false; };
      if (!nm) return bad('Type a name.');
      if (S.isBuiltIn(kind, nm)) return bad(`"${nm}" is already in the list.`);
      if (!name && S.getCustom(kind, nm)) return bad(`You already have ★ ${nm}. Pick it from the list and tap Edit.`);
      const raw = {};
      for (const [k, , , , , opt] of K.fields) {
        const t = ins[k].value.trim();
        if (k === 'glow' || k === 'adj') { raw[k] = t; continue; }
        if (!t) { if (opt) continue; return bad('Fill in every value (optional ones can stay empty).'); }
        const v = parse(t); if (v == null || !(v >= 0)) return bad(`"${t}" is not a number.`);
        raw[k] = v;
      }
      if (pol) raw.pol = pol;
      const my = myParts(); (my[kind] ??= {})[nm] = raw; saveMyParts(my);
      S.registerCustom(kind, nm, raw, pol);
      setPartModel(p, kind, nm);
      d.close(); commit(); say(`Saved ★ ${nm} to your parts. It's in the list for every ${K.title.toLowerCase()} now.`);
    };
    const del = () => {
      const my = myParts(); if (my[kind]) delete my[kind][name]; saveMyParts(my);
      S.unregisterCustom(kind, name);
      for (const q of c.parts) if (S.kindOfType(q.type) === kind && S.partModelKey(q) === name) {
        const def = S.TYPES[q.type].props; if (kind === 'LED') Object.assign(q.props, { color: def.color, imax: def.imax }); else if (kind === 'RELAY') delete q.props.relay; else q.props.model = def.model;
      }
      d.close(); commit(); say(`Deleted ★ ${name}. Parts using it went back to the default.`);
    };
    const d = el('dialog', { class: 'dlg' }, el('div', { class: 'dlg-title2', text: name ? `Edit ★ ${name}` : `New ${K.title.toLowerCase()}${pol ? ` (${{ npn: 'NPN', pnp: 'PNP', n: 'N-channel', p: 'P-channel' }[pol]})` : ''}` }),
      el('div', { class: 'dlg-pad mp-form' }, note('Type the values from the datasheet. Use the "typical" column; a rough value is fine.'),
        el('label', { class: 'field' }, el('span', { class: 'lab', text: 'Part name' }), nameIn), ...rows, err),
      el('div', { class: 'dlg-buttons mp-btns' }, name ? el('button', { class: 'btn danger', type: 'button', text: 'Delete', onclick: del }) : null,
        el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => d.close() }), el('button', { class: 'btn primary', type: 'button', text: 'Save', onclick: save })));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
    if (!name) nameIn.focus();
  }
  function choice(label, value, options, onSet) {
    const s = el('select', { class: 'sel' }, options.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = value; s.addEventListener('change', () => { onSet(s.value); commit(); });
    return el('label', { class: 'field' }, el('span', { class: 'lab', text: label }), s);
  }

  function renderPanel() {
    syncNudgeSch();
    panel.innerHTML = '';
    panelRefresh = null;
    if (!res) solve();
    if (sel?.kind === 'wire') {
      const w = c.wires[sel.i]; if (!w) { sel = null; return renderPanel(); }
      const pcs = res.ok ? res.wires.filter(x => x.wi === sel.i) : [];
      const v = pcs.length ? pcs[0].va : null, i = pcs.length ? Math.max(...pcs.map(x => Math.abs(x.i))) : 0;
      panel.append(el('div', { class: 'sp-head' }, el('b', { text: 'Wire' }), el('span', { class: 'muted', text: '0 Ω' })),
        readings([['Voltage to ground', v == null ? '—' : si(v, 'V'), true], ['Current', si(i, 'A'), true]], [], []),
        el('div', { class: 'row wrap' },
          ...(w.x1 !== w.x2 && w.y1 !== w.y2 ? [el('button', { class: 'btn primary', type: 'button', text: '⌐ Straighten (across first)', onclick: () => { straighten(sel.i, false); sel = null; commit(); say('Crooked wire turned into an L.'); } }),
            el('button', { class: 'btn', type: 'button', text: '⌙ Straighten (down first)', onclick: () => { straighten(sel.i, true); sel = null; commit(); say('Crooked wire turned into an L.'); } })] : []),
          el('button', { class: 'btn', type: 'button', text: '🗑 Delete wire', onclick: () => { c.wires.splice(sel.i, 1); sel = null; commit(); } })),
        note('Drag a wire to slide it; connected wires stretch along. Drag a wire corner (not on a pin) to move it.'));
      panelRefresh = () => renderPanel();
      return;
    }
    const p = selPart();
    if (!p) { summary(); const again = () => { panel.innerHTML = ''; summary(); panelRefresh = again; }; panelRefresh = again; return; }
    const t = S.TYPES[p.type], q = p.props;
    const nameInp = el('input', { class: 'num nm', value: p.name, maxlength: 12 });
    nameInp.addEventListener('change', () => { p.name = nameInp.value.trim().slice(0, 12) || p.name; commit(); });
    panel.append(el('div', { class: 'sp-head' }, nameInp, el('span', { class: 'muted', text: t.label }),
      el('button', { class: 'btn', type: 'button', text: '↻', title: 'Rotate (R)', onclick: rotateSel }),
      el('button', { class: 'btn', type: 'button', text: '🗑', title: 'Delete', onclick: () => { c.parts = c.parts.filter(x => x !== p); sel = null; commit(); } }),
      p.lbl ? el('button', { class: 'btn', type: 'button', text: '⟲ Label', title: 'Put the label back', onclick: () => { delete p.lbl; commit(); } }) : null));
    const f = el('div', { class: 'fields' });
    switch (p.type) {
      case 'R': f.append(field('Resistance', plain(q.r), 'Ω', v => { q.r = Math.max(v, 1e-6); }), choice('Power rating', String(q.rating), RATINGS.map(x => [String(x), wattName(x)]), v => { q.rating = +v; })); break;
      case 'POT': {
        f.append(field('Total resistance', plain(q.r), 'Ω', v => { q.r = Math.max(v, 1); }));
        const rng = el('input', { type: 'range', min: 0, max: 100, step: 1, value: q.pos, class: 'rng' });
        const lab = el('span', { class: 'lab', text: `Wiper ${Math.round(q.pos)} %` });
        rng.addEventListener('input', () => { q.pos = +rng.value; lab.textContent = `Wiper ${q.pos} %`; solve(); draw(); updateReadings(); });
        rng.addEventListener('change', () => commit());
        f.append(el('label', { class: 'field' }, lab, rng));
        break;
      }
      case 'BAT': f.append(field('Voltage', plain(q.v), 'V', v => { q.v = v; }), field('Internal resistance', plain(q.rint), 'Ω', v => { q.rint = v; })); break;
      case 'ISRC': f.append(field('Current', plain(q.i), 'A', v => { q.i = v; })); break;
      case 'SW': f.append(el('button', { class: 'btn primary', type: 'button', text: q.on ? 'Switch OFF (open)' : 'Switch ON (close)', onclick: () => { q.on = !q.on; commit(); } })); break;
      case 'SPDT': case 'DPDT': f.append(el('button', { class: 'btn primary', type: 'button', text: q.on ? 'Flip to ▲ up' : 'Flip to ▼ down', onclick: () => { q.on = !q.on; commit(); } })); break;
      case 'PB': {
        const b = el('button', { class: 'btn primary hold', type: 'button', text: 'Hold to press' });
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); q.on = true; solve(); draw(); updateReadings(); });
        const rel = () => { if (!q.on) return; q.on = false; solve(); draw(); updateReadings(); };
        b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('lostpointercapture', rel);
        f.append(b); break;
      }
      case 'LED': f.append(modelChoice(p, 'Color / part', 'LED', q.color, Object.entries(S.LED_COLORS).filter(([, v]) => !v.custom).map(([k, v]) => [k, `${k} (${v.vf} V)`]), v => { q.color = v; }), field('Max current', plain(q.imax), 'A', v => { q.imax = v; })); break;
      case 'D': f.append(modelChoice(p, 'Type', 'DIODE', q.model, builtins(S.DIODES), v => { q.model = v; })); break;
      case 'XFMR': f.append(field('Turns P1–CT', plain(q.n1), 'turns', v => { q.n1 = Math.max(v, 1e-3); }), field('Turns CT–P2', plain(q.n2), 'turns', v => { q.n2 = v; }),
        field('Turns secondary', plain(q.ns), 'turns', v => { q.ns = v; }), field('Inductance P1–CT', plain(q.lm), 'H', v => { q.lm = Math.max(v, 1e-9); }),
        field('Resistance P1–CT', plain(q.r1), 'Ω', v => { q.r1 = v; }), field('Resistance CT–P2', plain(q.r2), 'Ω', v => { q.r2 = v; }), field('Resistance secondary', plain(q.rs), 'Ω', v => { q.rs = v; })); break;
      case 'LAMP': f.append(field('Rated voltage', plain(q.vr), 'V', v => { q.vr = v; }), field('Rated power', plain(q.wr), 'W', v => { q.wr = v; })); break;
      case 'C': f.append(field('Capacitance', plain(q.c), 'F', v => { q.c = Math.max(v, 1e-15); }), field('Voltage rating', plain(q.vmax), 'V', v => { q.vmax = v; }),
        choice('Type', q.polar ? 'e' : 'n', [['e', 'Electrolytic (has + and −)'], ['n', 'Ceramic / film (no polarity)']], v => { q.polar = v === 'e'; })); break;
      case 'L': f.append(field('Inductance', plain(q.l), 'H', v => { q.l = Math.max(v, 1e-12); }), field('Coil resistance', plain(q.r), 'Ω', v => { q.r = v; })); break;
      case 'SIG': f.append(choice('Wave', q.wave, [['sine', 'Sine'], ['square', 'Square (±)'], ['triangle', 'Triangle'], ['saw', 'Sawtooth'], ['pwm', 'PWM (0 to amplitude)']], v => { q.wave = v; }),
        field('Frequency', plain(q.f), 'Hz', v => { q.f = Math.max(v, 1e-3); }), field('Amplitude (peak)', plain(q.amp), 'V', v => { q.amp = v; }),
        field('DC offset', plain(q.off), 'V', v => { q.off = v; }), field('Duty (PWM)', plain(q.duty), '%', v => { q.duty = Math.min(100, v); })); break;
      case 'SCOPE': f.append(note('CH1 (yellow) and CH2 (blue) measure against the bottom pin (COM). Usually wire COM to ground. Settings are under the scope screen.'),
        el('button', { class: 'btn', type: 'button', text: 'Auto time/div', onclick: () => autoTime() })); break;
      case 'ZD': {
        f.append(modelChoice(p, 'Part', 'ZENER', q.model ?? '', [['', 'Generic (choose Vz below)']], v => { q.model = v || undefined; }));
        if (!S.ZENER_PARTS[q.model]) f.append(choice('Zener voltage', S.ZENERS.includes(q.vz) ? String(q.vz) : 'x', [...S.ZENERS.map(v => [String(v), `${v} V`]), ['x', 'custom']], v => { if (v !== 'x') q.vz = +v; }),
          field('Zener voltage (custom)', plain(q.vz), 'V', v => { q.vz = Math.max(0.5, v); }),
          choice('Power rating', String(q.pmax), [['0.5', '0.5 W (BZX55, small glass)'], ['1', '1 W (1N47xx)'], ['5', '5 W (1N53xx)']], v => { q.pmax = +v; }));
        f.append(note('The bar (cathode) goes to + . Always put a resistor in series.')); break;
      }
      case 'NPN': case 'PNP': f.append(modelChoice(p, 'Type', 'BJT', q.model, builtins(S.BJTS, m => m.pol === p.type.toLowerCase()), v => { q.model = v; }),
        note(p.type === 'NPN' ? 'Pins: B left, C top, E bottom. Low-side switch: E to ground, load between + and C.' : 'Pins: B left, E top, C bottom. High-side switch: E to +, load between C and ground. Base LOW = on.')); break;
      case 'NMOS': case 'PMOS': f.append(modelChoice(p, 'Type', 'FET', q.model, builtins(S.FETS, m => m.pol === (p.type === 'NMOS' ? 'n' : 'p')), v => { q.model = v; }),
        note(p.type === 'NMOS' ? 'Pins: G left, D top, S bottom. Low-side switch: S to ground, load between + and D. Add 100 Ω in the gate and 10 kΩ gate → ground.' : 'Pins: G left, S top, D bottom. High-side: S to +, load between D and ground. Gate LOW (below S) = on.')); break;
      case 'OPAMP': f.append(modelChoice(p, 'Type', 'AMP', q.model, builtins(S.AMPS), v => { q.model = v; }),
        note('Pins: − input top-left, + input bottom-left, output right, supply V+ top, V− bottom (to ground on a single supply).')); break;
      case 'REG': f.append(modelChoice(p, 'Type', 'REG', q.model, builtins(S.REGS), v => { q.model = v; }),
        note(S.REGS[q.model]?.adj ? 'Pins: IN left, OUT right, ADJ bottom. R1 (240 Ω) from OUT to ADJ, R2 from ADJ to ground: Vout = 1.25 × (1 + R2 ÷ R1).' : 'Pins: IN left, OUT right, GND bottom. Real circuit: 0.33 µF on IN and 0.1 µF on OUT, close to the pins.')); break;
      case 'SERVO': f.append(choice('Type', q.model, Object.entries(S.SERVOS).map(([k, m]) => [k, `${k}: ${m.note}`]), v => { q.model = v; }),
        note('Wires: SIG (orange / yellow), V+ (red), GND (brown / black). Signal: a pulse every 20 ms (50 Hz). 0.5 ms = 0°, 1.5 ms = 90°, 2.5 ms = 180° → PWM duty 2.5 %, 7.5 %, 12.5 %.')); break;
      case 'STEPPER': f.append(choice('Microstepping (MS1–MS3)', String(q.micro), [[1, 'Full step (all MS LOW)'], [2, '1/2 (MS1 HIGH)'], [4, '1/4 (MS2 HIGH)'], [8, '1/8 (MS1 + MS2 HIGH)'], [16, '1/16 (all MS HIGH)']].map(([v, t]) => [String(v), t]), v => { q.micro = +v; }),
        choice('Motor', String(q.steps), [['200', '1.8° / step (200 steps per turn, NEMA 17)'], ['400', '0.9° / step (400 steps per turn)'], ['2048', '28BYJ-48 geared (≈ 2048 steps per turn)']], v => { q.steps = +v; }),
        field('Current limit (set with the trimpot)', plain(q.ilim), 'A', v => { q.ilim = Math.max(0.05, Math.min(2, v)); }),
        note('A4988: each rising edge on STEP = one (micro)step. DIR picks the direction. EN LOW (or open) = driver on. VDD = logic 3–5.5 V, VMOT = motor 8–35 V with a 100 µF capacitor close by. Tie RST to SLP on the module.')); break;
      case 'ESP32': case 'UNO': {
        const B = S.BOARDS[p.type]; q.pins ??= {};
        const cur = boardPin(p), pin = B.pins.find(x => x.n === cur);
        const label = (x) => { const m = x.k === 'gpio' ? (q.pins[x.n]?.mode ?? 'in') : x.k; return `${x.n}${x.label && x.label !== x.n ? ` (${x.label})` : ''} · ${MODE_SHORT[m]}`; };
        f.append(choice('Pin (or tap a pin on the drawing)', cur, B.pins.filter(x => x.k !== 'gnd').map(x => [x.n, label(x)]), v => { boardPinSel.set(p.id, v); }));
        if (pin.k === 'gpio') {
          const mode = q.pins[cur]?.mode ?? 'in';
          const hwPwm = p.type === 'ESP32' || pin.pwm;
          const mLabel = (m) => m === 'pwm' && !hwPwm ? 'Pulses (Servo library / timer code, NOT analogWrite)' : m === 'pwm' && p.type === 'UNO' ? 'PWM ~ (analogWrite, 490 Hz; D5 / D6 980 Hz)' : S.PIN_MODES[m];
          f.append(choice('Pin mode (what your code would do)', mode, S.pinModesFor(p.type, pin).map(m => [m, mLabel(m)]), v => {
            if (v === 'in') { delete q.pins[cur]; return; }
            const was = q.pins[cur]?.mode;
            q.pins[cur] = { ...(q.pins[cur] ?? {}), mode: v };
            if (v === 'pwm' && was !== 'pwm' && q.pins[cur].f == null) q.pins[cur].f = p.type === 'UNO' ? (hwPwm ? (/^D[56]$/.test(cur) ? 980 : 490) : 50) : 1000;
          }));
          if (mode === 'pwm') f.append(field('PWM frequency', plain(q.pins[cur].f ?? 1000), 'Hz', v => { q.pins[cur].f = Math.max(v, 0.1); }), field('Duty', plain(q.pins[cur].duty ?? 50), '%', v => { q.pins[cur].duty = Math.min(100, v); }));
          const caps = [pin.label, pin.inOnly ? 'input only' : 'in / out', pin.pwm || p.type === 'ESP32' ? (pin.inOnly ? null : (p.type === 'UNO' ? 'PWM ~' : 'PWM')) : (p.type === 'UNO' ? 'no analogWrite (pulses by code OK)' : null), pin.adc ? `${pin.adc} (analog in)` : null, pin.i2c ? `I²C ${pin.i2c}` : null].filter(Boolean).join(' · ');
          f.append(note(caps + (pin.strap ? ' · ⚠ boot strapping pin' : '') + (pin.serial ? ' · ⚠ USB serial pin' : '')));
        } else f.append(note(pin.k === 'pwr' ? `${pin.n}: ${pin.v} V out, ${pin.note}.` : pin.k === 'en' ? 'EN: reset. Pulled up to 3.3 V inside (10 kΩ). Pull it to GND = reset.' : `${pin.n}: ${pin.note ?? 'not connected inside'}.`));
        f.append(note(`No program runs: each pin is set by hand, as if your code had already done it. The board is powered from USB (${B.vcc} V logic).`));
        break;
      }
      case 'T555': f.append(choice('Type', q.model, Object.entries(S.TIMERS).map(([k, m]) => [k, `${k}: ${m.note}`]), v => { q.model = v; }),
        note('Pins: 1 GND · 2 TRIG · 3 OUT · 4 RESET · 5 CTRL · 6 THR · 7 DIS · 8 VCC. TRIG below ⅓ Vcc → output HIGH. THR above ⅔ Vcc → output LOW (and DIS shorts to ground). RESET to + for normal use. 10 nF from CTRL to ground keeps it steady.')); break;
      case 'RELAY': {
        const cust = S.getCustom('RELAY', q.relay);
        f.append(modelChoice(p, 'Coil', 'RELAY', cust ? q.relay : String(q.vcoil), Object.entries(S.RELAYS).filter(([, m]) => !m.custom).map(([v, m]) => [v, `${v} V coil (${m.rcoil} Ω)`]),
          v => { if (S.getCustom('RELAY', v)) q.relay = v; else { delete q.relay; q.vcoil = +v; Object.assign(q, { rcoil: S.RELAYS[v].rcoil, l: S.RELAYS[v].l }); } }));
        if (!cust) f.append(field('Coil resistance', plain(q.rcoil), 'Ω', v => { q.rcoil = Math.max(v, 1); }), field('Coil inductance', plain(q.l), 'H', v => { q.l = Math.max(v, 1e-6); }));
        f.append(note('Coil pins on the left. Contacts: COM (bottom) connects to NC when off, to NO when the coil pulls in (≥ 75 % of rated current).')); break;
      }
      case 'OPTO': f.append(choice('CTR (current transfer ratio)', String(q.ctr), [[50, '50 %'], [80, '80 %'], [100, '100 % (typical)'], [160, '160 %'], [200, '200 %'], [300, '300 %'], [600, '600 %']].map(([v, t]) => [String(v), t]), v => { q.ctr = +v; }),
        note('Pins: 1 anode, 2 cathode (LED, left) · 4 collector, 3 emitter (transistor, right). Ic = CTR × If until it saturates.')); break;
    }
    if (f.children.length) panel.append(f);
    const rd = el('div', { class: 'sp-read' }); panel.append(rd);
    updateReadings();
    panelRefresh = updateReadings;
    function updateReadings() {
      const r = res.ok ? res.parts.get(p.id) : null;
      rd.innerHTML = '';
      if (!res.ok) { rd.append(el('p', { class: 'flag ' + (res.stopped ? 'warn' : 'bad'), text: res.error })); return; }
      if (!r) { rd.append(note('Ground: this point is 0 V. Every voltage is measured from here.')); return; }
      rd.append(partReadings(p, r));
    }
  }

  function readings(vals, lines, warn) {
    return el('div', {},
      el('div', { class: 'readouts' }, vals.map(([l, v, hi]) => el('div', { class: 'ro' + (hi ? ' hi' : '') }, el('span', { class: 'rl', text: l }), el('span', { class: 'rv', text: v })))),
      warn.length ? el('div', { class: 'flags' }, warn.map(([lvl, t]) => el('div', { class: 'flag ' + lvl, text: t }))) : null,
      lines.length ? el('pre', { class: 'steps', text: lines.join('\n') }) : null);
  }

  function partReadings(p, r) {
    const c0 = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
    const q = p.props, vals = [], L = [], warn = [];
    const I = Math.abs(r.i), Vab = r.v;
    switch (p.type) {
      case 'R': {
        vals.push(['Voltage drop', si(Math.abs(Vab), 'V'), true], ['Current', si(I, 'A'), true], ['Power', si(r.p, 'W'), true]);
        L.push(`I = V ÷ R = ${plain(Math.abs(Vab))} ÷ ${plain(q.r)} = ${si(I, 'A')}`, `P = I² × R = ${plain(I)}² × ${plain(q.r)} = ${si(r.p, 'W')}`);
        const load = r.p / q.rating;
        warn.push([load > 1 ? 'bad' : load > 0.5 ? 'warn' : 'ok', load > 1 ? `Over its ${wattName(q.rating)} rating (${pct(load, 0)}): it will burn. Use ${wattName(RATINGS.find(x => x >= r.p * 2) ?? 10)}.` : load > 0.5 ? `Runs hot: ${pct(load, 0)} of ${wattName(q.rating)}. Use a bigger rating for 2× margin.` : `Cool: ${pct(load, 0)} of its ${wattName(q.rating)} rating.`]);
        break;
      }
      case 'POT':
        vals.push(['Wiper voltage', si(r.vw, 'V'), true], ['Current', si(Math.abs(r.iaw), 'A')], ['Power', si(r.p, 'W')]);
        L.push(`Top part = ${si(q.r * q.pos / 100, 'Ω')}, bottom part = ${si(q.r * (1 - q.pos / 100), 'Ω')}`, `Wiper = ${si(r.vw, 'V')} (to ground)`);
        if (r.p > 0.25) warn.push(['warn', 'Most small pots are 0.1–0.25 W: use it as a divider, not to carry load current.']);
        break;
      case 'BAT': {
        const out = -r.i;
        vals.push(['Current out of +', si(out, 'A'), true], ['Power delivered', si(-r.p, 'W'), true], ['Terminal voltage', si(Vab, 'V')]);
        if (q.rint > 0) L.push(`Terminal V = EMF − I × r = ${plain(q.v)} − ${plain(out)} × ${plain(q.rint)} = ${si(Vab, 'V')}`);
        if (out < -1e-6) warn.push(['warn', `Current flows INTO ${p.name}: it is being charged (or another source is stronger).`]);
        if (Math.abs(out) > 50) warn.push(['bad', 'SHORT CIRCUIT! Add a resistor or a fuse.']);
        if (q.v > 0 && 9 === q.v && Math.abs(out) > 0.5) warn.push(['warn', 'A 9 V battery can only supply about 0.1–0.5 A for long.']);
        break;
      }
      case 'ISRC': vals.push(['Current', si(q.i, 'A'), true], ['Voltage across', si(Vab, 'V'), true]); break;
      case 'SPDT': case 'DPDT':
        vals.push(['Position', q.on ? '▼ down' : '▲ up', true], [p.type === 'DPDT' ? 'Pole 1 current' : 'Current', si(Math.abs(r.i1), 'A'), true]);
        if (p.type === 'DPDT') vals.push(['Pole 2 current', si(Math.abs(r.i2), 'A'), true]);
        L.push(p.type === 'DPDT' ? 'Two switches moved by one lever. Common pins on the left; each connects to the upper (▲) or lower (▼) pin on the right.\nClassic use: reverse a DC motor or solenoid (cross-wire the outer pins).' : 'Common pin on the left connects to the upper (▲) or lower (▼) pin.');
        break;
      case 'SW': case 'PB': vals.push(['State', q.on ? 'closed' : 'open', true], [q.on ? 'Current' : 'Voltage across', q.on ? si(I, 'A') : si(Math.abs(Vab), 'V'), true]);
        if (!q.on && Math.abs(Vab) > 1e-3) L.push(`Open switch: the full ${si(Math.abs(Vab), 'V')} appears across it.`);
        break;
      case 'LED': {
        const m = S.LED_COLORS[q.color] ?? S.LED_COLORS.red;
        vals.push(['Current', si(I, 'A'), true], ['Voltage', si(Math.abs(Vab), 'V'), true], ['Power', si(r.p, 'W')]);
        if (r.on) {
          L.push(`LED needs ≈ ${m.vf} V (${q.color}). The rest drops on the resistor in series.`);
          const pct20 = I / q.imax;
          warn.push([pct20 > 1.2 ? 'bad' : pct20 > 1 ? 'warn' : I < 0.001 ? 'warn' : 'ok', pct20 > 1.2 ? `Too much current (${si(I, 'A')} > ${si(q.imax, 'A')}): it will burn. Use a bigger series resistor.` : pct20 > 1 ? 'At its limit: a slightly bigger resistor makes it last longer.' : I < 0.001 ? 'Very dim (under 1 mA).' : `OK: ${pct(pct20, 0)} of max current.`]);
        } else warn.push(['warn', Vab < 0 ? 'Reversed: the LED blocks. Flip it (↻ twice): the long leg (+, anode) goes to +.' : `Off: not enough voltage (needs ${m.vf} V).`]);
        if (Vab < -5) warn.push(['bad', 'More than 5 V backwards can damage an LED.']);
        break;
      }
      case 'D': {
        const m = S.DIODES[q.model] ?? S.DIODES['1N4007'];
        vals.push(['Current', si(I, 'A'), true], ['Voltage', si(Vab, 'V'), true], ['Power', si(r.p, 'W')]);
        warn.push(r.on ? [I > m.imax ? 'bad' : 'ok', I > m.imax ? `Over ${si(m.imax, 'A')}: use a bigger diode.` : `Conducting (${m.vf} V drop).`] : ['ok', Vab < 0 ? `Blocking ${si(-Vab, 'V')} (rated ${m.piv} V).` : 'Not conducting.']);
        if (-Vab > m.piv) warn.push(['bad', `Reverse voltage over ${m.piv} V: it breaks down.`]);
        break;
      }
      case 'XFMR': {
        vals.push(['Secondary', si(r.vs, 'V'), true], ['P1–CT', si(r.v1, 'V'), true], ['CT–P2', si(r.v2, 'V')], ['I secondary', si(r.is, 'A')], ['I P1', si(r.i1, 'A')], ['I P2', si(r.i2, 'A')],
          ['Magnetizing', si(r.im, 'A')], ['Power out', si(r.pout, 'W')]);
        L.push(`Volts follow turns: V secondary = V(P1–CT) × ${plain(q.ns)} ÷ ${plain(q.n1)} = × ${plain(+(q.ns / q.n1).toFixed(3))}`, 'Amps go the other way: the side with more turns carries less current (power in ≈ power out).',
          'A transformer only passes changing voltage (AC or switched DC). Steady DC just makes the magnetizing current climb: the core saturates and it overheats.', 'Dots: P1 and S1 go positive at the same moment.');
        if (Math.abs(r.im) > 5 * Math.max(0.1, Math.abs(r.i1) + Math.abs(r.i2))) warn.push(['warn', 'Magnetizing current is large compared to the load current: DC on the winding or the frequency is too low for this inductance.']);
        break;
      }
      case 'LAMP': {
        const b = r.p / q.wr;
        vals.push(['Brightness', pct(b, 0), true], ['Current', si(I, 'A'), true], ['Power', si(r.p, 'W')], ['Voltage', si(Math.abs(Vab), 'V')]);
        L.push(`Hot resistance = V² ÷ P = ${plain(q.vr)}² ÷ ${plain(q.wr)} = ${si(q.vr * q.vr / q.wr, 'Ω')}`);
        if (b > 1.2) warn.push(['bad', 'Over its rated voltage: it burns out quickly.']);
        break;
      }
      case 'VM': vals.push(['Reads', si(Vab, 'V'), true]); L.push('Voltmeter: + side (left pin) minus − side. 10 MΩ inside, like a real multimeter.'); break;
      case 'AM': vals.push(['Reads', si(r.i, 'A'), true]); L.push('Ammeter: current flowing in at the left pin. Put it IN the wire (in series), never across a battery.'); break;
      case 'C':
        vals.push(['Voltage', si(Vab, 'V'), true], ['Current', si(r.i, 'A'), true], ['Energy', si(r.energy, 'J')]);
        L.push(`Charge Q = C × V = ${si(q.c * Vab, 'C')}`, 'Current only flows while the voltage changes: i = C × dV/dt.');
        if (Math.abs(Vab) > q.vmax) warn.push(['bad', `Over its ${si(q.vmax, 'V')} rating: it can burst. Use a higher voltage capacitor (1.25× margin).`]);
        else if (Math.abs(Vab) > 0.8 * q.vmax) warn.push(['warn', `Close to its ${si(q.vmax, 'V')} rating.`]);
        if (q.polar && Vab < -0.5) warn.push(['bad', 'Electrolytic capacitor connected backwards (− side is higher): it heats up and can explode. Flip it.']);
        break;
      case 'L':
        vals.push(['Current', si(r.i, 'A'), true], ['Voltage', si(Vab, 'V'), true], ['Energy', si(r.energy, 'J')]);
        L.push(`Stored energy = ½ × L × I² = ${si(r.energy, 'J')}`, 'A coil fights changes in current. Switch it off suddenly and the voltage jumps (flyback spike): use a diode across it.');
        if (Math.abs(Vab) > 60) warn.push(['bad', `${si(Math.abs(Vab), 'V')} across the coil: a switch-off spike. It can kill transistors and MOSFETs. Add a flyback diode.`]);
        break;
      case 'SIG': {
        vals.push(['Output now', si(Vab, 'V'), true], ['Current', si(-r.i, 'A'), true], ['Frequency', si(q.f, 'Hz')], ['Period', si(1 / q.f, 's')]);
        if (q.wave === 'sine') L.push(`Sine: peak ${si(q.amp, 'V')}, peak-to-peak ${si(2 * q.amp, 'V')}, RMS = peak ÷ √2 = ${si(q.amp / Math.SQRT2, 'V')}`);
        if (q.wave === 'pwm') L.push(`PWM: ${q.duty} % high → average ${si(q.off + q.amp * q.duty / 100, 'V')}`);
        break;
      }
      case 'SCOPE': vals.push(['CH1 now', si(r.ch1, 'V'), true], ['CH2 now', si(r.ch2, 'V'), true]); break;
      case 'ZD': {
        const vz = -r.v, iz = -r.i, zq = S.zenerOf(q);
        if (r.state === 'rev') {
          vals.push(['Holds', si(vz, 'V'), true], ['Zener current', si(iz, 'A'), true], ['Power', si(c0(r.p), 'W'), true]);
          L.push(`P = Vz × Iz = ${plain(vz)} × ${plain(iz)} = ${si(c0(r.p), 'W')}`, 'The series resistor drops the rest: R = (Vin − Vz) ÷ (Iload + Iz).');
          warn.push(r.p > zq.pmax ? ['bad', `Over its ${zq.pmax} W rating: it will burn. Use a bigger series resistor or a ${zq.pmax < 1 ? '1 W' : '5 W'} zener.`] : iz < 0.002 ? ['warn', 'Under 2 mA: the voltage is soft (not well regulated). Aim for 5–20 mA.'] : r.p > 0.6 * zq.pmax ? ['warn', `Hot: ${pct(r.p / zq.pmax, 0)} of its rating.`] : ['ok', `Regulating at ${si(vz, 'V')}.`]);
        } else if (r.state === 'fwd') { vals.push(['Current', si(r.i, 'A'), true], ['Voltage', si(r.v, 'V'), true]); warn.push(['warn', 'Forward: it just acts like a normal diode (0.7 V). For regulation flip it: the bar (cathode) goes to +.']); }
        else { vals.push(['Voltage', si(vz, 'V'), true], ['Current', '0 A', true]); warn.push(['warn', vz > 0 ? `Below ${si(zq.vz, 'V')}: blocking, not regulating yet.` : 'Not conducting.']); }
        break;
      }
      case 'NPN': case 'PNP': {
        const m = S.BJTS[q.model] ?? S.BJTS[p.type === 'NPN' ? '2N2222' : '2N2907'], npn = p.type === 'NPN', st = { off: 'OFF', act: 'ACTIVE (partly on)', sat: 'SATURATED (fully on)', brk: 'BREAKDOWN' }[r.state];
        vals.push(['State', st, true], ['Base current', si(c0(r.ib), 'A'), true], ['Collector current', si(c0(r.ic), 'A'), true], [npn ? 'Vce' : 'Vec', si(c0(r.vce), 'V'), true], [npn ? 'Vbe' : 'Veb', si(c0(r.vbe), 'V')], ['Power (heat)', si(c0(r.p), 'W')]);
        L.push(`β (gain) ≈ ${m.beta}: Ic can be up to β × Ib = ${m.beta} × ${si(c0(r.ib), 'A')} = ${si(m.beta * r.ib, 'A')}`, `As a switch use Ib ≈ Ic ÷ 10 → base resistor ≈ (Vpin − ${m.vbe}) ÷ (Ic ÷ 10)`, `Heat = ${npn ? 'Vce' : 'Vec'} × Ic + ${npn ? 'Vbe' : 'Veb'} × Ib = ${si(c0(r.p), 'W')}`);
        if (r.state === 'off') warn.push(['ok', `OFF: no base current (needs ${npn ? 'B above E' : 'B below E'} by ${m.vbe} V).`]);
        if (r.state === 'sat') warn.push(['ok', `Fully ON: only ${si(c0(r.vce), 'V')} across it. Good switch.`]);
        if (r.state === 'act') { warn.push(['ok', `ACTIVE (amplifier mode): Vce ${si(c0(r.vce), 'V')}. Right for an amplifier; as a switch it would need more base current (smaller base resistor).`]); L.push(`Small signal: gm = Ic ÷ 26 mV = ${si(r.ic / 0.025852, 'S')}, input resistance at the base rπ = β ÷ gm = ${si(m.beta * 0.025852 / Math.max(r.ic, 1e-12), 'Ω')}`); }
        if (r.state === 'brk') warn.push(['bad', `BREAKDOWN: ${si(c0(r.vce), 'V')} is over its ${m.vmax} V rating. A coil switch-off spike? Add a flyback diode across the coil.`]);
        if (r.ic > m.imax) warn.push(['bad', `Collector current over ${si(m.imax, 'A')}: too much for a ${q.model}.`]);
        if (r.p > m.pmax) warn.push(['bad', `${si(c0(r.p), 'W')} heat: over ${m.pmax} W, it needs a heatsink or a bigger transistor.`]);
        if (r.ib > 0.012) warn.push(['warn', `Base current ${si(c0(r.ib), 'A')}: more than an MCU pin likes (ESP32 / Arduino ≈ 10–20 mA). Use a bigger base resistor or a Darlington / MOSFET.`]);
        break;
      }
      case 'NMOS': case 'PMOS': {
        const m = S.FETS[q.model] ?? S.FETS[p.type === 'NMOS' ? 'IRLZ44N' : 'AO3401'], nch = p.type === 'NMOS', st = { off: 'OFF', ohm: 'ON (fully on)', sat: 'PARTLY ON (gate too low)', brk: 'AVALANCHE' }[r.state];
        vals.push(['State', st, true], [nch ? 'Gate Vgs' : 'Gate Vsg', si(c0(r.vgs), 'V'), true], ['Drain current', si(c0(r.id), 'A'), true], [nch ? 'Vds' : 'Vsd', si(c0(r.vds), 'V'), true], ...(r.rds != null ? [['Rds(on)', si(r.rds, 'Ω')]] : []), ['Power (heat)', si(c0(r.p), 'W')]);
        L.push(`Threshold Vth ≈ ${m.vth} V (starts to turn on), fully on at ${m.vfull} V: Rds = ${si(m.rdson, 'Ω')}`);
        if (r.rds != null) L.push(`Heat = Id² × Rds = ${plain(r.id)}² × ${plain(r.rds)} = ${si(c0(r.id) * r.id * r.rds, 'W')}`);
        if (r.state === 'off') warn.push(['ok', `OFF: gate ${si(c0(r.vgs), 'V')} is below the ${m.vth} V threshold.`]);
        if (r.state === 'ohm') warn.push(r.vgs >= m.vfull * 0.9 ? ['ok', 'Fully ON. Good switch.'] : ['warn', `ON, but the gate is only ${si(c0(r.vgs), 'V')}: Rds ${si(r.rds, 'Ω')} instead of ${si(m.rdson, 'Ω')} (${m.vfull} V gate). ${m.logic ? 'OK for moderate current.' : 'Use a logic-level MOSFET (IRLZ44N, AO3400).'}`]);
        if (r.state === 'sat') warn.push(['bad', `NOT fully on: gate ${si(c0(r.vgs), 'V')} is too low for ${si(c0(r.id), 'A')}. It drops ${si(c0(r.vds), 'V')} and burns ${si(c0(r.p), 'W')}. Use a logic-level MOSFET or drive the gate with ${m.vfull} V.`]);
        if (r.state === 'brk') warn.push(['bad', `AVALANCHE: ${si(c0(r.vds), 'V')} is over its ${m.vmax} V rating (coil switch-off spike). Add a flyback diode across the coil.`]);
        if (r.body) warn.push(['warn', 'Body diode is conducting (current flowing backwards through the MOSFET).']);
        if (Math.abs(r.vgs) > 20) warn.push(['bad', 'Gate over ±20 V: it can punch through. Clamp it with a zener.']);
        if (r.id > m.imax) warn.push(['bad', `Drain current over ${si(m.imax, 'A')}.`]);
        if (r.p > m.pmax) warn.push(['bad', `${si(c0(r.p), 'W')} heat: needs a heatsink (about ${m.pmax} W without one).`]);
        break;
      }
      case 'OPAMP': {
        const m = S.AMPS[q.model] ?? S.AMPS.LM358, st = { lin: 'LINEAR', high: 'OUTPUT HIGH (at the top)', low: 'OUTPUT LOW (at the bottom)' }[r.state];
        vals.push(['Output', si(r.vout, 'V'), true], ['Input + minus −', si(c0(r.vdiff), 'V'), true], ['State', st, true], ['Supply', si(r.vsup, 'V')], ['Output current', si(c0(r.iout), 'A')]);
        L.push(`Vout = gain × (V+ − V−), gain ≈ ${si(m.a, '')}: a tiny difference swings the output to a rail.`, 'With negative feedback (output → − input) it keeps both inputs equal: amplifier.', 'Without feedback it is a comparator: + higher → output HIGH, − higher → output LOW.', `${q.model}: output reaches ${m.dl < 0.1 ? 'the bottom rail' : `${m.dl} V above the bottom`} and ${m.dh < 0.1 ? 'the top rail' : `${m.dh} V below the top`}.`);
        if (r.vsup < 3) warn.push(['bad', 'Not powered: wire V+ (top pin) to + and V− (bottom pin) to ground or the − supply.']);
        if (r.vsup > m.vmax) warn.push(['bad', `Supply ${si(r.vsup, 'V')} is over its ${m.vmax} V maximum.`]);
        if (Math.abs(r.iout) > m.iout) warn.push(['warn', `Output current ${si(Math.abs(r.iout), 'A')}: op-amps only drive a few mA. Add a transistor for loads.`]);
        break;
      }
      case 'REG': {
        const m = S.REGS[q.model] ?? S.REGS['7805'], st = { reg: 'REGULATING', drop: 'DROPOUT (input too low)', lim: 'CURRENT LIMIT', off: 'OFF' }[r.state];
        vals.push(['Output', si(r.vout, 'V'), true], ['Load current', si(c0(r.iout), 'A'), true], ['Heat', si(c0(r.p), 'W'), true], ['Input', si(r.vin, 'V')], ['State', st]);
        L.push(`Heat = (Vin − Vout) × I = ${plain(r.vio)} × ${plain(r.iout)} = ${si(c0(r.p), 'W')}  (a linear regulator burns the difference)`, `Needs Vin ≥ ${m.adj ? 'Vout' : si(m.vout, 'V')} + ${m.drop} V`);
        if (m.adj) L.push('Vout = 1.25 V × (1 + R2 ÷ R1) + 50 µA × R2');
        if (r.state === 'reg') warn.push(['ok', `Steady ${si(r.vout, 'V')}.`]);
        if (r.state === 'drop') warn.push(['bad', `Input too low: needs at least ${m.drop} V more than the output. Output sags to ${si(r.vout, 'V')}.`]);
        if (r.state === 'lim') warn.push(['bad', `Overload: current limit ${si(m.ilim, 'A')} (short or too heavy a load).`]);
        if (r.state === 'off') warn.push(['warn', 'Off: no input, or something else pushes the output higher.']);
        if (r.vin > m.vinmax) warn.push(['bad', `Input over ${m.vinmax} V maximum.`]);
        if (r.p > 15) warn.push(['bad', 'Way too much heat for a linear regulator: use a buck converter (LM2596, MP1584).']);
        else if (r.p > 1) warn.push(['warn', `${si(c0(r.p), 'W')} of heat: needs a heatsink (bare TO-220 handles ≈ 1 W). A buck converter wastes much less.`]);
        if (m.adj && r.iout < 0.0095) warn.push(['warn', 'LM317 needs ≥ 10 mA load or the output creeps up. Use R1 = 120–240 Ω.']);
        break;
      }
      case 'SERVO': {
        const m = S.SERVOS[q.model] ?? S.SERVOS.SG90;
        vals.push(['Angle', `${Math.round(r.ang)}°`, true], ['Pulse width', r.w ? si(r.w, 's') : '—', true], ['Target', `${Math.round(r.tgt)}°`], ['Supply', si(r.vcc, 'V')], ['Current now', si(c0(r.icc), 'A')]);
        L.push('Angle = (pulse − 0.5 ms) ÷ 2 ms × 180°', `${q.model}: about ${si(m.run, 'A')} while moving, up to ${si(m.stall, 'A')} when blocked (stall).`, 'Power it from 5 V (VIN / USB or a 5–6 V supply), not from the 3.3 V pin. Common GND with the board.');
        if (!r.w) warn.push(['warn', 'No valid pulse yet: give SIG a 50 Hz PWM with 2.5–12.5 % duty (0.5–2.5 ms).']);
        if (r.vcc < m.vmin) warn.push(['bad', `Supply ${si(r.vcc, 'V')} is too low (needs ${m.vmin}–${m.vmax} V): it jitters or doesn't move.`]);
        if (r.vcc > m.vmax) warn.push(['bad', `Supply over ${m.vmax} V: it can burn.`]);
        if (m.stall > 0.5) warn.push(['warn', `Stall current ${si(m.stall, 'A')}: use a separate 5–6 V supply that can give it, not the USB pin.`]);
        break;
      }
      case 'STEPPER': {
        vals.push(['Speed', `${Math.round(Math.abs(r.rpm))} RPM ${r.rpm < 0 ? '(reverse)' : ''}`, true], ['Steps counted', String(r.n), true], ['Shaft angle', `${r.ang.toFixed(1)}°`], ['Driver', r.en ? 'ON' : 'OFF'], ['VMOT', si(r.vmot, 'V')], ['Motor supply current', si(c0(r.imot), 'A')]);
        L.push(`Step angle = 360° ÷ ${q.steps} ÷ ${q.micro} = ${(360 / q.steps / q.micro).toFixed(3)}°`, `RPM = step rate × 60 ÷ (${q.steps} × ${q.micro})`, 'Current limit: Vref = I × 8 × Rsense (Rsense often 0.1 Ω → Vref = 0.8 × I). Measure Vref on the trimpot.');
        if (!r.en) warn.push(['warn', r.vdd < 3 ? 'No logic power on VDD (3–5.5 V).' : r.vmot < 8 ? 'VMOT below 8 V: the A4988 shuts down.' : 'EN is HIGH: driver off (motor free).']);
        if (r.vmot > 35) warn.push(['bad', 'VMOT over 35 V: the A4988 can be destroyed.']);
        if (q.ilim > 1.2) warn.push(['warn', 'Above about 1.2 A the A4988 needs a heatsink and a fan.']);
        if (Math.abs(r.rpm) > 600 / q.micro && q.micro <= 2) warn.push(['warn', 'Very fast for full / half step: a real motor may stall. Ramp the speed up.']);
        break;
      }
      case 'ESP32': case 'UNO': {
        const B = S.BOARDS[p.type], cur = boardPin(p), pin = B.pins.find(x => x.n === cur), pr0 = r.pins[cur] ?? { v: 0, i: 0, mode: 'in' };
        const ma = (v) => si(c0(v), 'A');
        if (pin.k === 'gpio') {
          const isIn = /in|pu|pd|adc/.test(pr0.mode);
          vals.push([`${cur} voltage`, si(c0(pr0.v), 'V'), true], [pr0.i >= 0 ? 'Current out' : 'Current in', ma(Math.abs(pr0.i)), true]);
          if (isIn) {
            const lv = pr0.v >= B.vih ? 'HIGH (1)' : pr0.v <= B.vil ? 'LOW (0)' : 'UNDEFINED';
            if (pr0.mode !== 'adc') vals.push(['digitalRead', lv, true]);
            if (pr0.mode === 'adc') { const full = 2 ** B.adcBits - 1, val = Math.round(Math.max(0, Math.min(1, pr0.v / B.adcRef)) * full); vals.push(['analogRead', `${val} / ${full}`, true]); L.push(`analogRead = V ÷ ${B.adcRef} V × ${full} = ${plain(pr0.v)} ÷ ${B.adcRef} × ${full} = ${val}`); if (p.type === 'ESP32') L.push('Real ESP32 ADC is not very linear near 0 V and above ≈ 3.1 V (11 dB attenuation).'); }
            if (lv === 'UNDEFINED' && pr0.mode !== 'adc') warn.push(['warn', `${plain(pr0.v)} V is between LOW (< ${B.vil} V) and HIGH (> ${B.vih} V): the reading can flicker.`]);
            if (pr0.mode === 'in' && Math.abs(pr0.v) < 1e-3 && Math.abs(pr0.i) < 1e-9) warn.push(['warn', 'Input with nothing driving it is "floating": it reads random values. Use INPUT_PULLUP or an external resistor.']);
          } else {
            const pmax = B.imax / 1000, prec = B.irec / 1000;
            L.push(`Output ${pr0.mode === 'pwm' ? 'PWM' : pr0.mode.toUpperCase()}: about ${B.rout} Ω inside, so the voltage sags with current: ${B.vcc} V − I × ${B.rout} Ω.`);
            if (Math.abs(pr0.i) > pmax) warn.push(['bad', `${ma(Math.abs(pr0.i))} is over the ${B.imax} mA absolute max: the pin can be damaged. Use a transistor / MOSFET.`]);
            else if (Math.abs(pr0.i) > prec) warn.push(['warn', `${ma(Math.abs(pr0.i))}: above the ${B.irec} mA recommended. OK for a moment, not for always.`]);
            else warn.push(['ok', `${ma(Math.abs(pr0.i))}: fine for a pin (≤ ${B.irec} mA).`]);
          }
          if (pr0.v > B.vcc + 0.3) warn.push(['bad', `${si(pr0.v, 'V')} on a ${B.vcc} V pin: this kills it. Use a voltage divider or a level shifter.`]);
          if (pr0.v < -0.3) warn.push(['bad', 'Negative voltage on a pin: it can be damaged.']);
          if (pin.strap && pr0.mode !== 'in') warn.push(['warn', `${pin.label} is a boot strapping pin: what is connected can stop the ESP32 from booting / flashing.${pin.g === 12 ? ' GPIO12 HIGH at boot = wrong flash voltage.' : pin.g === 0 ? ' GPIO0 LOW at boot = download mode.' : ''}`]);
          if (pin.serial) warn.push(['warn', 'Used by USB serial (upload / Serial.print): avoid for other things.']);
          if (pin.adc === 'ADC2' && pr0.mode === 'adc') warn.push(['warn', 'ADC2 pins can\'t read analog while WiFi is on: use ADC1 (GPIO32–39).']);
        } else if (pin.k === 'pwr') {
          vals.push([`${cur} voltage`, si(pr0.v, 'V'), true], ['Current out', ma(pr0.i), true], ['Max', si(pin.imax, 'A')]);
          if (pr0.i > pin.imax) warn.push(['bad', `Over ${si(pin.imax, 'A')} from ${cur}: use a separate supply for big loads.`]);
        } else vals.push([`${cur}`, si(c0(pr0.v), 'V'), true]);
        // all pins in use
        const used = B.pins.filter(x => x.k !== 'gnd' && x.k !== 'nc' && (x.k === 'pwr' ? Math.abs(r.pins[x.n].i) > 1e-6 : x.k === 'gpio' && ((q.pins?.[x.n]?.mode ?? 'in') !== 'in' || Math.abs(r.pins[x.n].v) > 0.01)));
        if (used.length) L.push('', 'Pins in use:', ...used.map(x => { const z = r.pins[x.n]; return `${x.n.padEnd(5)} ${(MODE_SHORT[z.mode] ?? z.mode).padEnd(9)} ${si(c0(z.v), 'V').padStart(9)}  ${si(c0(z.i), 'A').padStart(9)}`; }));
        break;
      }
      case 'T555': {
        const m = S.TIMERS[q.model] ?? S.TIMERS.NE555;
        vals.push(['Output', r.q ? `HIGH ${si(r.vout, 'V')}` : `LOW ${si(r.vout, 'V')}`, true], ['Supply Vcc', si(r.vcc, 'V'), true], ['TRIG (pin 2)', si(c0(r.vtrig), 'V')], ['THR (pin 6)', si(c0(r.vthr), 'V')], ['Output current', si(c0(r.iout), 'A')], ['Power', si(c0(r.p), 'W')]);
        L.push(`Switch points: ⅓ Vcc = ${si(r.vlo, 'V')} (TRIG) and ⅔ Vcc = ${si(r.vhi, 'V')} (THR)`, 'Monostable (one pulse): t = 1.1 × R × C', 'Astable (blinks): f = 1.44 ÷ ((R1 + 2·R2) × C), high time 0.693·(R1+R2)·C, low time 0.693·R2·C', 'Power-on delay: C from Vcc to TRIG+THR, R to ground → output goes HIGH after t ≈ 1.1 × R × C');
        if (r.vcc < m.vmin) warn.push(['warn', `Supply ${si(r.vcc, 'V')} is below the ${m.vmin} V minimum: not running.`]);
        if (r.vcc > m.vmax) warn.push(['bad', `Supply over ${m.vmax} V: the ${q.model} can be damaged.`]);
        if (Math.abs(r.iout) > m.iout) warn.push(['bad', `Output current ${si(Math.abs(r.iout), 'A')} is over ${si(m.iout, 'A')}: drive a transistor / MOSFET for bigger loads.`]);
        break;
      }
      case 'RELAY': {
        const rq = S.relayOf(q), inom = rq.vcoil / rq.rcoil;
        vals.push(['Contacts', r.on ? 'ON (COM → NO)' : 'OFF (COM → NC)', true], ['Coil current', si(Math.abs(r.icoil), 'A'), true], ['Coil voltage', si(Math.abs(r.v), 'V'), true], ['Contact current', si(Math.abs(r.icon), 'A')], ['Coil power', si(c0(r.p), 'W')]);
        L.push(`Rated coil current = ${rq.vcoil} V ÷ ${plain(rq.rcoil)} Ω = ${si(inom, 'A')}`, `Pulls in at ≥ ${si(0.75 * inom, 'A')} (75 %), lets go under ${si(0.3 * inom, 'A')} (30 %)`, 'Never drive a coil straight from an ESP32 / Arduino pin: use a transistor or MOSFET + flyback diode.');
        if (Math.abs(r.v) > 1.3 * rq.vcoil) warn.push(['bad', Math.abs(r.v) > 3 * rq.vcoil ? `${si(Math.abs(r.v), 'V')} across the coil: switch-off spike! Add a flyback diode across the coil.` : 'Coil over-voltage: it overheats.']);
        if (Math.abs(r.icon) > 10) warn.push(['bad', 'Contact current over 10 A (typical relay rating).']);
        if (!r.on && Math.abs(r.icoil) > 0.3 * inom) warn.push(['warn', 'Coil current too low to pull in: check the driver / supply voltage.']);
        break;
      }
      case 'OPTO': {
        const st = { off: 'OFF', act: 'ACTIVE (current-limited)', sat: 'SATURATED (fully on)' }[r.state];
        vals.push(['LED current If', si(r.ifw, 'A'), true], ['Collector Ic', si(r.ic, 'A'), true], ['Vce', si(r.vce, 'V'), true], ['State', st]);
        L.push(`Max Ic = CTR × If = ${q.ctr} % × ${si(r.ifw, 'A')} = ${si(r.ifw * q.ctr / 100, 'A')}`, 'LED side and transistor side are joined only by light: isolation up to 5 kV.');
        if (r.ifw > 0.05) warn.push(['bad', 'LED current over 50 mA: the PC817 LED burns. Use a bigger series resistor.']);
        else if (r.on && r.ifw < 0.001) warn.push(['warn', 'Weak drive (under 1 mA): the output may not switch fully. Aim for 5–10 mA.']);
        if (r.state === 'sat') warn.push(['ok', 'Saturated: the output is fully ON (good for switching).']);
        if (r.state === 'act') warn.push(['warn', 'Not saturated: the load wants more current than CTR × If. Increase If or use a bigger pull-up resistor.']);
        if (r.vce > 35) warn.push(['bad', 'Vce over 35 V: above the PC817 rating.']);
        break;
      }
    }
    return readings(vals, L, warn);
  }

  function summary() {
    const box = el('div');
    if (!res.ok) { box.append(el('p', { class: 'flag ' + (res.stopped ? 'warn' : 'bad'), text: res.error })); panel.append(box); return; }
    box.append(readings([[timeMode() ? 'Power now' : 'Power from sources', si(res.delivered, 'W'), true], ...(timeMode() ? [['Time', si(sim.t, 's', 4)]] : []), ['Parts', String(c.parts.length)], ['Wires', String(c.wires.length)]], [],
      res.notes.map(t => [/SHORT/.test(t) ? 'bad' : 'warn', t])));
    const crooked = c.wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length;
    if (crooked) box.append(el('div', { class: 'row wrap' }, el('button', { class: 'btn primary', type: 'button', text: `⌐ Straighten ${crooked} crooked wire${crooked > 1 ? 's' : ''}`, onclick: () => { const n = straightenAll(); commit(); say(`${n} wire${n > 1 ? 's' : ''} turned into L shapes.`); } })));
    box.append(note('Tap a part or wire for its voltage, current and power. Drag a label or a wire to tidy up. Wire colors: <b style="color:#3DDC84">green = +</b>, grey = 0 V, <b style="color:#FF6B6B">red = −</b>. Yellow dots = current flow.'));
    panel.append(box);
  }

  // ---------- projects ----------
  const projStore = {
    all() { try { return JSON.parse(store.get('sch.projects', '{}')) || {}; } catch { return {}; } },
    save(all) { store.set('sch.projects', JSON.stringify(all)); },
  };
  function dialog(title, items, onPick, extra) {
    const d = el('dialog', { class: 'dlg' }, el('div', { class: 'dlg-title2', text: title }), extra ?? null,
      el('div', { class: 'dlg-items' }, items.map((t, i) => el('button', { class: 'dlg-it', type: 'button', text: t, onclick: () => { d.close(); onPick(i); } }))),
      el('form', { method: 'dialog', class: 'dlg-buttons' }, el('button', { class: 'btn', text: 'Close' })));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
    return d;
  }
  function loadCircuit(j, msg) { const added = registerLib(j.lib, true); if (added) msg += ` Added ${added} part${added > 1 ? 's' : ''} from the file to your parts (★).`; c = j; resetSim(); sel = null; if (S.isDynamic(c)) { running = true; store.set('sch.run', '1'); syncTop(); autoTimeQuiet(); autoSpeed(); } hist.length = 0; hist.push(JSON.stringify(c)); hi = 0; fit(); commit(false); setMode('select'); say(msg); }
  function examples() {
    const ex = [['led', 'LED + resistor + switch (9 V)'], ['divider', 'Voltage divider with voltmeter'], ['bridge', 'Wheatstone bridge'], ['esp32', 'Solenoid coil + push button + flyback diode (12 V)'], ['dpdt', 'DPDT switch reversing a DC motor'], ['rc', '📈 RC filter: square wave charging a capacitor'], ['pwmled', '📈 PWM dimming an LED'], ['flyback', '📈 Coil switch-off spike + flyback diode (hold the button, let go)'], ['rectifier', '📈 Bridge rectifier + filter capacitor (ripple)'], ['opto', '📈 PC817: ESP32 PWM switching a 12 V line'], ['relay', '📈 ESP32 → 2N2222 → 12 V relay → lamp (flip GPIO)'], ['mosfet', '📈 ESP32 PWM → IRLZ44N MOSFET → 12 V solenoid'], ['reg7805', '7805 regulator: 12 V → 5 V (heat)'], ['lm317', 'LM317 adjustable regulator (5 V)'], ['zener', 'Zener diode 5.1 V reference'], ['preamp', '📈 Transistor audio preamp (BC547, gain ≈ 100)'], ['delay555', '📈 555 power-on delay (flip POWER, LED after ≈ 1.1 s)'], ['buck', '📈 DC-DC buck converter 30 V → 12 V (PWM duty sets Vout)'], ['buckreg', '📈 Regulated buck 0–30 V → 0–20 V (like XL4015 / LM2596, flip POWER)'], ['inverter', '📈 Inverter 12 V DC → 220 V AC (push-pull, 50 Hz)'], ['smps', '📈 Switching power supply 220 V AC → 5 V (flyback + opto feedback)'], ['fridge', '📈 Fridge / aircon guard: 4-min restart delay (flip MAINS)'], ['esp32io', 'ESP32 pins: LED output, button with pull-up, pot on the ADC'], ['unoio', 'Arduino UNO pins: LED on D13, button on D2, pot on A0'], ['servo', '📈 Servo on ESP32 PWM (change D18 duty: 2.5–12.5 %)'], ['stepper', '📈 Stepper + A4988 from ESP32 (STEP / DIR)'], ['comparator', '📈 Op-amp comparator: triangle vs pot → PWM']];
    dialog('Examples', ex.map(e => e[1]), i => loadCircuit(S.example(ex[i][0]), `Loaded: ${ex[i][1]}.`));
  }
  function projects() {
    const all = projStore.all(), names = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
    dialog('Schematic projects', ['Save as…', ...names.map(n => `Open: ${n}`), 'Delete a project…', 'New (empty)', 'Export file (backup)', 'Import file…', 'Save picture (PNG)'], i => {
      if (i === 0) {
        const name = prompt2('Name for this circuit', c.title ?? '', (n) => { n = n.trim().slice(0, 40); if (!n) return; c.title = n; const a = projStore.all(); a[n] = { json: JSON.stringify(c), t: Date.now() }; projStore.save(a); say(`Saved "${n}".`); });
        return name;
      }
      if (i <= names.length) { const n = names[i - 1]; loadCircuit(JSON.parse(all[n].json), `Opened "${n}".`); return; }
      const k = i - names.length;
      if (k === 1) { if (!names.length) return say('No saved projects.'); dialog('Delete which?', names, j => { const a = projStore.all(); delete a[names[j]]; projStore.save(a); say(`Deleted "${names[j]}".`); }); }
      else if (k === 2) loadCircuit(S.newCircuit(), 'Empty circuit. Add parts from the tray.');
      else if (k === 3) shareFile(`${c.title ?? 'circuit'}.f9t.json`, JSON.stringify(c), 'application/json');
      else if (k === 4) { const f = el('input', { type: 'file', accept: '.json,application/json' }); f.onchange = async () => { const file = f.files[0]; if (!file) return; try { const j = JSON.parse(await file.text()); if (!Array.isArray(j.parts)) throw 0; loadCircuit(j, `Imported ${file.name}.`); } catch { say("That file isn't a Fox9nertron circuit."); } }; f.click(); }
      else if (k === 5) savePng();
    });
  }
  function prompt2(title, value, onOk) {
    const inp = el('input', { class: 'num wide', value });
    const d = el('dialog', { class: 'dlg' }, el('div', { class: 'dlg-title2', text: title }), el('div', { class: 'dlg-pad' }, inp),
      el('div', { class: 'dlg-buttons' }, el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => d.close() }), el('button', { class: 'btn primary', type: 'button', text: 'Save', onclick: () => { d.close(); onOk(inp.value); } })));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal(); inp.focus();
  }
  async function shareFile(name, text, mime) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: mime });
    try { const file = new File([blob], name, { type: mime }); if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
    say(`Saved ${name}.`);
  }
  function savePng() {
    const keep = { ...view }, keepSel = sel, keepMode = mode, real = ctx, realW = W, realH = H;
    sel = null; mode = 'select';
    const dpr = 2, w = 1400, h = 1000;
    const oc = document.createElement('canvas'); oc.width = w * dpr; oc.height = h * dpr;
    ctx = oc.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h; fit(); draw();
    ctx = real; W = realW; H = realH; Object.assign(view, keep); sel = keepSel; mode = keepMode; draw();
    oc.toBlob(b => shareFile(`${c.title ?? 'circuit'}.png`, b, 'image/png'), 'image/png');
  }

  // Learn tab: "Open in Schematic"
  addEventListener('f9t-example', (e) => { if (view2 === 'pcb') setView('sch'); loadCircuit(S.example(e.detail), 'Loaded from Learn: ' + e.detail + '.'); });
  // ---------- start ----------
  syncTop(); setMode('select');
  new ResizeObserver(() => resize()).observe(wrap);
  addEventListener('resize', () => resize());
  requestAnimationFrame(() => { resetSim(); resize(); commit(false); if (store.get('sch.view', 'sch') === 'pcb') setView('pcb'); });
}

// ---------- symbols (local grid units, pin a at left) ----------
function symbol(ctx, p, r, g) {
  const q = p.props;
  const L = (...pts) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
  const T = (txt, x, y, size = 0.75, col = C.part) => { ctx.save(); ctx.translate(x, y); ctx.rotate(-(p.rot || 0) * Math.PI / 2); ctx.scale(1 / g, 1 / g); ctx.fillStyle = col; ctx.font = `700 ${size * g}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 0); ctx.restore(); };
  ctx.strokeStyle = C.part; ctx.fillStyle = C.part;
  switch (p.type) {
    case 'R': L(-2, 0, -1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0, 2, 0);
      if (r && q.rating && r.p > q.rating) { ctx.strokeStyle = '#FF6B6B'; L(-1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0); }
      break;
    case 'POT': L(-2, 0, -1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0, 2, 0);
      { const x = -1.2 + 2.4 * q.pos / 100; L(0, -2, 0, -1.3, x, -1.3, x, -0.65); ctx.beginPath(); ctx.moveTo(x, -0.5); ctx.lineTo(x - 0.25, -0.85); ctx.lineTo(x + 0.25, -0.85); ctx.closePath(); ctx.fill(); }
      break;
    case 'BAT': L(-2, 0, -0.25, 0); L(0.25, 0, 2, 0); ctx.lineWidth *= 1.4; L(-0.25, -0.9, -0.25, 0.9); ctx.lineWidth *= 1.6; L(0.25, -0.45, 0.25, 0.45);
      T('+', -0.9, -0.65, 0.8, '#3DDC84'); T('−', 0.9, -0.65, 0.8, '#FF6B6B'); break;
    case 'ISRC': L(-2, 0, -0.85, 0); L(0.85, 0, 2, 0); ctx.beginPath(); ctx.arc(0, 0, 0.85, 0, 7); ctx.stroke(); L(-0.5, 0, 0.45, 0); L(0.15, -0.3, 0.5, 0, 0.15, 0.3); break;
    case 'SW': L(-2, 0, -1, 0); L(1, 0, 2, 0); ctx.beginPath(); ctx.arc(-1, 0, 0.14, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(1, 0, 0.14, 0, 7); ctx.fill();
      if (q.on) L(-1, 0, 1, -0.05); else L(-1, 0, 0.85, -0.85); break;
    case 'SPDT': case 'DPDT': {
      const pole = (cy) => {
        L(-2, cy, -1, cy); L(1, cy - 1, 2, cy - 1); L(1, cy + 1, 2, cy + 1);
        for (const [x, y] of [[-1, cy], [1, cy - 1], [1, cy + 1]]) { ctx.beginPath(); ctx.arc(x, y, 0.14, 0, 7); ctx.fill(); }
        L(-1, cy, 0.95, q.on ? cy + 0.92 : cy - 0.92);
      };
      if (p.type === 'SPDT') pole(0);
      else { pole(-2); pole(2); ctx.save(); ctx.setLineDash([0.18, 0.18]); L(0, q.on ? -1.5 : -2.5, 0, q.on ? 2.5 : 1.5); ctx.restore(); }
      break;
    }
    case 'PB': L(-2, 0, -1, 0); L(1, 0, 2, 0); ctx.beginPath(); ctx.arc(-1, 0, 0.14, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(1, 0, 0.14, 0, 7); ctx.fill();
      { const y = q.on ? -0.12 : -0.55; L(-1.05, y, 1.05, y); L(0, y, 0, -1.2); L(-0.35, -1.2, 0.35, -1.2); } break;
    case 'LED': case 'D': {
      const lit = p.type === 'LED' && r?.on && Math.abs(r.i) > 1e-4;
      const col = p.type === 'LED' ? (S.LED_COLORS[q.color]?.hex ?? '#FF3B30') : C.part;
      if (lit) { const a = Math.min(1, 0.35 + Math.abs(r.i) / q.imax * 0.65); const gr = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1.6); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha *= a; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 7); ctx.fill(); ctx.globalAlpha /= a; }
      L(-2, 0, -0.55, 0); L(0.55, 0, 2, 0);
      ctx.beginPath(); ctx.moveTo(-0.55, -0.6); ctx.lineTo(0.55, 0); ctx.lineTo(-0.55, 0.6); ctx.closePath();
      ctx.fillStyle = p.type === 'LED' ? col : 'transparent'; if (p.type === 'LED') { ctx.globalAlpha *= lit ? 1 : 0.35; ctx.fill(); ctx.globalAlpha /= lit ? 1 : 0.35; }
      ctx.strokeStyle = C.part; ctx.stroke(); L(0.55, -0.6, 0.55, 0.6);
      if (p.type === 'LED') { ctx.strokeStyle = lit ? col : C.dim; L(0.1, -0.75, 0.55, -1.2); L(0.4, -1.2, 0.55, -1.2, 0.55, -1.05); L(-0.35, -0.85, 0.1, -1.3); L(-0.05, -1.3, 0.1, -1.3, 0.1, -1.15); }
      break;
    }
    case 'LAMP': {
      const b = r ? Math.min(1, r.p / Math.max(q.wr, 1e-9)) : 0;
      if (b > 0.02) { const gr = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1.7); gr.addColorStop(0, `rgba(255,225,107,${0.25 + 0.75 * b})`); gr.addColorStop(1, 'rgba(255,225,107,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1.7, 0, 7); ctx.fill(); }
      L(-2, 0, -0.85, 0); L(0.85, 0, 2, 0); ctx.strokeStyle = C.part; ctx.beginPath(); ctx.arc(0, 0, 0.85, 0, 7); ctx.stroke(); L(-0.6, -0.6, 0.6, 0.6); L(-0.6, 0.6, 0.6, -0.6); break;
    }
    case 'XFMR': {
      L(-3, -2, -1.2, -2); L(-3, 0, -1.2, 0); L(-3, 2, -1.2, 2); L(1.2, -2, 3, -2); L(1.2, 2, 3, 2);
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const cy = -1.5 + k; ctx.moveTo(-1.2, cy - 0.5); ctx.arc(-1.2, cy, 0.5, -Math.PI / 2, Math.PI / 2); } ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const cy = -1.5 + k; ctx.moveTo(1.2, cy - 0.5); ctx.arc(1.2, cy, 0.5, -Math.PI / 2, Math.PI / 2, true); } ctx.stroke();
      L(-0.22, -2.3, -0.22, 2.3); L(0.22, -2.3, 0.22, 2.3);
      ctx.fillStyle = C.part; for (const x of [-1.7, 1.7]) { ctx.beginPath(); ctx.arc(x, -2.35, 0.17, 0, 7); ctx.fill(); }
      T('CT', -2.4, -0.45, 0.45, C.dim);
      break;
    }
    case 'GND': L(0, 0, 0, 0.8); L(-0.75, 0.8, 0.75, 0.8); L(-0.5, 1.1, 0.5, 1.1); L(-0.25, 1.4, 0.25, 1.4); break;
    case 'C': {
      L(-2, 0, -0.25, 0); L(0.25, 0, 2, 0); ctx.lineWidth *= 1.5;
      L(-0.25, -0.85, -0.25, 0.85);
      if (q.polar) { ctx.beginPath(); ctx.arc(1.0, 0, 0.95, Math.PI * 0.72, Math.PI * 1.28); ctx.stroke(); T('+', -0.75, -0.75, 0.7, '#3DDC84'); }
      else L(0.25, -0.85, 0.25, 0.85);
      if (r && q.vmax && Math.abs(r.v) > q.vmax) { ctx.strokeStyle = '#FF6B6B'; L(-0.25, -0.85, -0.25, 0.85); }
      break;
    }
    case 'L': {
      L(-2, 0, -1.6, 0); L(1.6, 0, 2, 0);
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const cx = -1.2 + k * 0.8; ctx.moveTo(cx - 0.4, 0); ctx.arc(cx, 0, 0.4, Math.PI, 0); } ctx.stroke();
      break;
    }
    case 'SIG': {
      L(-2, 0, -0.95, 0); L(0.95, 0, 2, 0); ctx.strokeStyle = C.sel; ctx.beginPath(); ctx.arc(0, 0, 0.95, 0, 7); ctx.stroke();
      ctx.save(); ctx.rotate(-(p.rot || 0) * Math.PI / 2); ctx.strokeStyle = C.part; ctx.lineWidth *= 0.9; ctx.beginPath();
      const w = q.wave;
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, xx = -0.55 + 1.1 * u, ph = u * 1.5 % 1;
        const yv = w === 'square' ? (ph < 0.5 ? -1 : 1) : w === 'triangle' ? (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) : w === 'saw' ? 2 * ph - 1 : w === 'pwm' ? (ph < 0.3 ? -1 : 1) : Math.sin(u * 3 * Math.PI);
        i ? ctx.lineTo(xx, yv * 0.35 * -1) : ctx.moveTo(xx, yv * 0.35 * -1);
      }
      ctx.stroke(); ctx.restore();
      T('+', -1.35, -0.6, 0.7, '#3DDC84');
      break;
    }
    case 'SCOPE': {
      L(-3, -1, -2.1, -1); L(-3, 1, -2.1, 1); L(0, 2, 0, 1.55);
      ctx.fillStyle = '#07120C'; ctx.fillRect(-2.1, -1.55, 4.2, 3.1); ctx.strokeStyle = C.part; ctx.strokeRect(-2.1, -1.55, 4.2, 3.1);
      ctx.strokeStyle = '#FFE16B'; ctx.beginPath(); for (let i = 0; i <= 30; i++) { const u = i / 30; const xx = -1.2 + 3 * u, yy = -0.35 + Math.sin(u * 4 * Math.PI) * 0.45; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();
      ctx.strokeStyle = '#4FC3F7'; ctx.beginPath(); for (let i = 0; i <= 30; i++) { const u = i / 30; const xx = -1.2 + 3 * u, yy = 0.65 + ((u * 2) % 1 < 0.5 ? -0.3 : 0.3); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();
      T('1', -1.75, -1, 0.55, '#FFE16B'); T('2', -1.75, 1, 0.55, '#4FC3F7'); T('⏚', 0, 1.15, 0.6, C.dim);
      break;
    }
    case 'OPTO': {
      const lit = r?.on && r.ifw > 1e-4;
      ctx.setLineDash([0.25, 0.18]); ctx.strokeStyle = C.dim; ctx.strokeRect(-1.4, -1.75, 2.8, 3.5); ctx.setLineDash([]); ctx.strokeStyle = C.part;
      if (lit) { const gr = ctx.createRadialGradient(-0.8, 0, 0.05, -0.8, 0, 1.1); gr.addColorStop(0, 'rgba(255,90,60,0.9)'); gr.addColorStop(1, 'rgba(255,90,60,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(-0.8, 0, 1.1, 0, 7); ctx.fill(); }
      L(-2, -1, -0.8, -1, -0.8, -0.4); L(-0.8, 0.35, -0.8, 1, -2, 1);
      ctx.beginPath(); ctx.moveTo(-1.2, -0.4); ctx.lineTo(-0.4, -0.4); ctx.lineTo(-0.8, 0.35); ctx.closePath(); ctx.fillStyle = lit ? '#FF5A3C' : 'rgba(255,90,60,0.25)'; ctx.fill(); ctx.stroke();
      L(-1.2, 0.35, -0.4, 0.35);
      ctx.strokeStyle = lit ? '#FFB199' : C.dim; L(-0.2, -0.35, 0.25, -0.1); L(0.1, -0.08, 0.25, -0.1, 0.18, -0.25); L(-0.2, 0.15, 0.25, 0.4); L(0.1, 0.42, 0.25, 0.4, 0.18, 0.25);
      ctx.strokeStyle = C.part; ctx.lineWidth *= 1.4; L(0.55, -0.65, 0.55, 0.65); ctx.lineWidth /= 1.4;
      L(0.55, -0.25, 1.2, -0.8, 1.2, -1, 2, -1); L(0.55, 0.25, 1.2, 0.8, 1.2, 1, 2, 1);
      ctx.beginPath(); ctx.moveTo(1.2, 0.8); ctx.lineTo(0.9, 0.75); ctx.lineTo(1.08, 0.55); ctx.closePath(); ctx.fillStyle = C.part; ctx.fill();
      T('1', -1.7, -1.4, 0.5, C.dim); T('2', -1.7, 1.4, 0.5, C.dim); T('4', 1.7, -1.4, 0.5, C.dim); T('3', 1.7, 1.4, 0.5, C.dim);
      break;
    }
    case 'ZD': {
      const on = r?.state === 'rev';
      L(-2, 0, -0.55, 0); L(0.55, 0, 2, 0);
      ctx.beginPath(); ctx.moveTo(-0.55, -0.6); ctx.lineTo(0.55, 0); ctx.lineTo(-0.55, 0.6); ctx.closePath();
      ctx.fillStyle = on ? 'rgba(61,220,132,0.35)' : 'transparent'; ctx.fill(); ctx.stroke();
      L(0.3, -0.85, 0.55, -0.6, 0.55, 0.6, 0.8, 0.85);
      break;
    }
    case 'NPN': case 'PNP': {
      const npn = p.type === 'NPN', s = r?.state, ce = s === 'sat' ? '#3DDC84' : s === 'act' ? '#FFC857' : s === 'brk' ? '#FF6B6B' : C.part;
      ctx.beginPath(); ctx.arc(0.25, 0, 1.3, 0, 7); ctx.stroke();
      L(-2, 0, -0.45, 0); ctx.lineWidth *= 1.6; L(-0.45, -0.8, -0.45, 0.8); ctx.lineWidth /= 1.6;
      ctx.strokeStyle = ce; ctx.fillStyle = ce;
      L(-0.45, -0.35, 1, -1.05, 1, -2); L(-0.45, 0.35, 1, 1.05, 1, 2);
      if (npn) arrowHead(ctx, -0.45, 0.35, 1, 1.05, 0.8); else arrowHead(ctx, 1, -1.05, -0.45, -0.35, 0.75);
      T(npn ? 'C' : 'E', 1.5, -1.6, 0.5, C.dim); T(npn ? 'E' : 'C', 1.5, 1.6, 0.5, C.dim); T('B', -1.5, -0.45, 0.5, C.dim);
      break;
    }
    case 'NMOS': case 'PMOS': {
      const nch = p.type === 'NMOS', s = r?.state, ch = s === 'ohm' ? '#3DDC84' : s === 'sat' ? '#FFC857' : s === 'brk' ? '#FF6B6B' : C.part;
      L(-2, 0, -0.75, 0); ctx.lineWidth *= 1.3; L(-0.75, -0.9, -0.75, 0.9); ctx.lineWidth /= 1.3;
      ctx.strokeStyle = ch; ctx.fillStyle = ch; ctx.lineWidth *= 1.5;
      L(-0.35, -1, -0.35, -0.5); L(-0.35, -0.25, -0.35, 0.25); L(-0.35, 0.5, -0.35, 1); ctx.lineWidth /= 1.5;
      L(-0.35, -0.75, 1, -0.75, 1, -2); L(-0.35, 0.75, 1, 0.75, 1, 2);
      // body connects to the source (bottom for N, top for P)
      if (nch) { L(-0.35, 0, 1, 0, 1, 0.75); arrowHead(ctx, 0.6, 0, -0.3, 0, 1); } else { L(-0.35, 0, 1, 0, 1, -0.75); arrowHead(ctx, -0.25, 0, 0.6, 0, 1); }
      // body diode (cathode up)
      ctx.strokeStyle = r?.body ? '#FFC857' : C.dim; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth *= 0.7;
      L(1, -1.35, 1.6, -1.35, 1.6, 1.35, 1, 1.35);
      ctx.beginPath(); ctx.moveTo(1.38, 0.2); ctx.lineTo(1.82, 0.2); ctx.lineTo(1.6, -0.2); ctx.closePath(); ctx.fill(); L(1.38, -0.2, 1.82, -0.2); ctx.lineWidth /= 0.7;
      T('G', -1.5, -0.45, 0.5, C.dim); T(nch ? 'D' : 'S', 0.55, -1.55, 0.5, C.dim); T(nch ? 'S' : 'D', 0.55, 1.55, 0.5, C.dim);
      break;
    }
    case 'OPAMP': {
      const s = r?.state;
      ctx.beginPath(); ctx.moveTo(-2, -1.8); ctx.lineTo(2, 0); ctx.lineTo(-2, 1.8); ctx.closePath();
      ctx.fillStyle = s === 'high' ? 'rgba(61,220,132,0.18)' : s === 'low' ? 'rgba(255,107,107,0.12)' : 'rgba(79,195,247,0.08)'; ctx.fill(); ctx.stroke();
      L(-3, 1, -2, 1); L(-3, -1, -2, -1); L(2, 0, 3, 0); L(0, -2, 0, -0.9); L(0, 2, 0, 0.9);
      T('−', -1.45, -1, 0.9, '#FF6B6B'); T('+', -1.45, 1, 0.9, '#3DDC84');
      T('V+', 0.55, -1.6, 0.45, C.dim); T('V−', 0.55, 1.6, 0.45, C.dim);
      break;
    }
    case 'REG': {
      const m = S.REGS[q.model] ?? S.REGS['7805'];
      L(-3, 0, -2, 0); L(2, 0, 3, 0); L(0, 2, 0, 1.1);
      ctx.fillStyle = '#161C22'; ctx.fillRect(-2, -1.1, 4, 2.2); ctx.strokeStyle = r?.state && r.state !== 'reg' ? '#FF6B6B' : C.part; ctx.strokeRect(-2, -1.1, 4, 2.2);
      T(q.model.replace('AMS', ''), 0, -0.2, q.model.length > 6 ? 0.5 : 0.62, C.part);
      T('IN', -1.45, 0.55, 0.42, C.dim); T('OUT', 1.35, 0.55, 0.42, C.dim); T(m.adj ? 'ADJ' : 'GND', 0, 0.7, 0.42, C.dim);
      break;
    }
    case 'SERVO': {
      const ang = r?.ang ?? 90;
      L(-3, -1, -2, -1); L(-3, 0, -2, 0); L(-3, 1, -2, 1);
      ctx.fillStyle = '#1E2A36'; ctx.fillRect(-2, -1.6, 4.6, 3.2); ctx.strokeStyle = C.part; ctx.strokeRect(-2, -1.6, 4.6, 3.2);
      T('SIG', -1.35, -1, 0.38, '#FFC857'); T('V+', -1.35, 0, 0.38, '#FF6B6B'); T('GND', -1.35, 1, 0.38, C.dim);
      // horn: 0° points left, 180° right (seen from the top)
      ctx.save(); ctx.translate(1.1, 0); ctx.rotate(-(p.rot || 0) * Math.PI / 2);
      const a = Math.PI - ang * Math.PI / 180;
      ctx.strokeStyle = '#E8EDF2'; ctx.lineWidth *= 2.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 1.4, -Math.sin(a) * 1.4); ctx.stroke(); ctx.lineWidth /= 2.4;
      ctx.fillStyle = '#E8EDF2'; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, 7); ctx.fill();
      ctx.restore();
      if (r) T(`${Math.round(ang)}°`, 1.1, 1.25, 0.45, '#4FC3F7');
      break;
    }
    case 'STEPPER': {
      L(-4, -2, -3, -2); L(-4, -1, -3, -1); L(-4, 0, -3, 0); L(-4, 1, -3, 1); L(-4, 2, -3, 2); L(-4, 3, -3, 3);
      ctx.fillStyle = '#0E3A2A'; ctx.fillRect(-3, -2.8, 3.2, 6.4); ctx.strokeStyle = C.part; ctx.strokeRect(-3, -2.8, 3.2, 6.4);
      T('A4988', -1.4, -2.35, 0.42, '#3DDC84');
      for (const [t, y] of [['STEP', -2], ['DIR', -1], ['EN', 0], ['VDD', 1], ['GND', 2], ['VMOT', 3]]) T(t, -2.15, y, 0.36, t === 'VMOT' ? '#FF9F43' : C.dim);
      // motor
      L(0.2, -0.5, 1.2, -0.5); L(0.2, 0.5, 1.2, 0.5);
      ctx.fillStyle = '#1E2A36'; ctx.fillRect(1.2, -1.6, 3.2, 3.2); ctx.strokeStyle = C.part; ctx.strokeRect(1.2, -1.6, 3.2, 3.2);
      ctx.beginPath(); ctx.arc(2.8, 0, 1.15, 0, 7); ctx.stroke();
      ctx.save(); ctx.translate(2.8, 0); ctx.rotate(-(p.rot || 0) * Math.PI / 2 + (r?.ang ?? 0) * Math.PI / 180);
      ctx.strokeStyle = r?.en ? '#3DDC84' : C.dim; ctx.lineWidth *= 2.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -1); ctx.stroke(); ctx.lineWidth /= 2.2; ctx.restore();
      ctx.fillStyle = '#E8EDF2'; ctx.beginPath(); ctx.arc(2.8, 0, 0.22, 0, 7); ctx.fill();
      if (r) T(`${Math.round(r.rpm)} RPM`, 2.8, 2.25, 0.45, '#4FC3F7');
      break;
    }
    case 'ESP32': case 'UNO': {
      const B = S.BOARDS[p.type], P = S.TYPES[p.type].pins, cfg = q.pins ?? {};
      ctx.fillStyle = p.type === 'ESP32' ? '#121C26' : '#0B2533'; ctx.fillRect(-3, -8.6, 6, 17.2); ctx.strokeStyle = C.part; ctx.strokeRect(-3, -8.6, 6, 17.2);
      T(p.type === 'ESP32' ? 'ESP32' : 'UNO', 0, -8.0, 0.6, p.type === 'ESP32' ? '#E8EDF2' : '#4FC3F7');
      const col = { high: '#3DDC84', low: '#FF6B6B', pwm: '#FFC857', adc: '#C084FC', pu: '#4FC3F7', pd: '#4FC3F7' };
      B.pins.forEach((pin, k) => {
        const [x, y] = P[k], sx2 = x > 0 ? 3 : -3;
        ctx.strokeStyle = C.part; L(x, y, sx2, y);
        const m = pin.k === 'gpio' ? (cfg[pin.n]?.mode ?? 'in') : pin.k;
        T(pin.n, x > 0 ? 2.05 : -2.05, y, 0.42, pin.k === 'gnd' ? C.dim : pin.k === 'pwr' ? '#FF9F43' : col[m] ?? C.text);
        if (col[m]) { ctx.fillStyle = col[m]; ctx.beginPath(); ctx.arc(x > 0 ? 3.5 : -3.5, y, 0.17, 0, 7); ctx.fill(); }
        // live readings next to input pins: analogRead value or digitalRead H / L
        const rp = r?.pins?.[pin.n];
        if (rp && pin.k === 'gpio' && /adc|in|pu|pd/.test(m) && (m !== 'in' || Math.abs(rp.v) > 0.01)) {
          const txt = m === 'adc' ? String(Math.round(Math.max(0, Math.min(1, rp.v / B.adcRef)) * (2 ** B.adcBits - 1))) : rp.v >= B.vih ? 'H' : rp.v <= B.vil ? 'L' : '?';
          const tw = txt.length * 0.32 + 0.4, cx = x > 0 ? x + 0.6 + tw / 2 : x - 0.6 - tw / 2;
          ctx.fillStyle = 'rgba(15,19,23,0.85)'; ctx.fillRect(cx - tw / 2, y - 0.38, tw, 0.76);
          T(txt, cx, y + 0.02, 0.52, m === 'adc' ? '#C084FC' : txt === 'H' ? '#3DDC84' : txt === 'L' ? '#FF6B6B' : '#FFC857');
        }
      });
      break;
    }
    case 'T555': {
      const on = !!r?.q;
      ctx.fillStyle = '#161C22'; ctx.fillRect(-3, -3, 6, 6); ctx.strokeStyle = on ? '#3DDC84' : C.part; ctx.strokeRect(-3, -3, 6, 6); ctx.strokeStyle = C.part;
      L(0, 3, 0, 4); L(-4, 2, -3, 2); L(3, 0, 4, 0); L(1, -4, 1, -3); L(2, 3, 2, 4); L(-4, 0, -3, 0); L(-4, -2, -3, -2); L(-1, -4, -1, -3);
      T(q.model === 'NE555' ? '555' : q.model, 0, 0.1, 0.95, C.part);
      for (const [t, x, y] of [['DIS', -2.15, -2], ['THR', -2.15, 0], ['TRIG', -2.05, 2], ['OUT', 2.15, 0], ['VCC', -1, -2.45], ['RST', 1, -2.45], ['GND', 0, 2.45], ['CV', 2, 2.45]]) T(t, x, y, 0.42, C.dim);
      if (r) T(on ? 'HIGH' : 'LOW', 2.1, -1.1, 0.45, on ? '#3DDC84' : '#FF6B6B');
      break;
    }
    case 'RELAY': {
      const on = !!r?.on;
      L(-3, -2, -3, -1); L(-3, 1, -3, 2);
      if (on) { ctx.fillStyle = 'rgba(255,200,87,0.25)'; ctx.fillRect(-3.55, -1, 1.1, 2); }
      ctx.strokeRect(-3.55, -1, 1.1, 2); L(-3.55, 1, -2.45, -1);
      L(0, 2, 0, 1); L(0, -2, 0, -1.45, -0.6, -1.45, -0.6, -1.05); L(2, -2, 2, -1.45, 1.1, -1.45, 1.1, -1.05);
      for (const [x, y] of [[0, 1], [-0.6, -1.05], [1.1, -1.05]]) { ctx.beginPath(); ctx.arc(x, y, 0.13, 0, 7); ctx.fill(); }
      ctx.strokeStyle = on ? '#3DDC84' : C.part; L(0, 1, on ? 1.05 : -0.55, -0.95);
      ctx.strokeStyle = C.dim; ctx.setLineDash([0.18, 0.15]); L(-2.45, 0, on ? 0.5 : -0.27, 0); ctx.setLineDash([]);
      T('NC', -0.75, -1.85, 0.4, C.dim); T('NO', 1.45, -1.85, 0.4, C.dim); T('COM', 0.75, 1.6, 0.4, C.dim);
      break;
    }
    case 'VM': case 'AM': L(-2, 0, -1, 0); L(1, 0, 2, 0); ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.stroke(); T(p.type === 'VM' ? 'V' : 'A', 0, 0.05, 1.0, C.sel); T('+', -1.45, -0.55, 0.7, '#3DDC84'); break;
  }
}

// filled arrow head on the segment (x1,y1)→(x2,y2), tip at fraction f
function arrowHead(ctx, x1, y1, x2, y2, f) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const tx = x1 + dx * f, ty = y1 + dy * f, s = 0.36;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ux * s - uy * s * 0.6, ty - uy * s + ux * s * 0.6); ctx.lineTo(tx - ux * s + uy * s * 0.6, ty - uy * s - ux * s * 0.6); ctx.closePath(); ctx.fill();
}

function drawIcon(cv, type) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height, g = type === 'GND' ? 22 : 20;
  x.clearRect(0, 0, w, h); x.save(); const gg = { DPDT: 7, SPDT: 14, SCOPE: 11, OPTO: 12, NPN: 12, PNP: 12, NMOS: 12, PMOS: 12, OPAMP: 9, REG: 9, RELAY: 9, T555: 6, ESP32: 3, UNO: 3, SERVO: 8, STEPPER: 6, XFMR: 8 }[type] ?? g; x.translate(w / 2 + (type === 'RELAY' ? 6 : 0), type === 'GND' ? 10 : h / 2 + (type === 'POT' ? 10 : 0)); x.scale(gg, gg); x.lineWidth = 2.6 / gg; x.lineCap = 'round'; x.lineJoin = 'round';
  symbol(x, { type, props: S.TYPES[type].props, rot: 0 }, null, gg); x.restore();
}
