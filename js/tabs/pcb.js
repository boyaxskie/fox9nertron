// PCB view (inside the Schematic tab): place footprints, autoroute / hand-route a single-sided board, make G-code for a CNC 3018.
import { el, store, note } from '../ui.js';
import { parse } from '../num.js';
import { rotPt } from '../sch-core.js';
import * as P from '../pcb-core.js';
import { autoroute, autorouteSteps, cleanPath } from '../pcb-route.js';
import { autoPlaceSteps } from '../pcb-place.js';
import { camAll, vWidth, copperSvg, copperPdf } from '../pcb-cam.js';
import { gerberSet, excellon } from '../pcb-gerber.js';
import { assemblyPdf, bomCsv } from '../pcb-assembly.js';

const COL = { bg: '#0F1317', board: '#16352A', edge: '#6FAF8A', cu: '#D9894A', cuHi: '#FFC08A', hole: '#0F1317', silk: '#E8EDF2', rat: '#FFE16B', jump: '#4FC3F7', bad: '#FF6B6B', sel: '#4FC3F7', iso: '#7FDBFF', drill: '#FF6B6B', cut: '#C084FC', dim: '#7E8A97' };

export function pcbView(api) {
  // api: { getC, commit(push), undo, redo, say, shareFile, toSchematic }
  let L = null, an = null, errs = [], cam = null, showCam = false;
  let mode = 'move', sel = null, route = null, hover = null, jfirst = null;   // jfirst: first hole of a jumper being placed
  const view = { ox: 20, oy: 20, s: 8 };
  const btn = (t, f, cls = '') => el('button', { class: 'sb ' + cls, type: 'button', text: t, onclick: f });
  const modeBtns = { move: btn('✋ Move', () => setMode('move')), route: btn('✏ Route', () => setMode('route')), jumper: btn('⤴ Jumper', () => setMode('jumper')), delete: btn('🗑 Delete', () => { if (mode === 'move' && deleteSel()) return; setMode('delete'); }) };
  const camBtn = btn('🛠 G-code', () => { showCam = true; makeCam(); renderPanel(); panel.querySelector('.pcb-cam')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const top = el('div', { class: 'sch-tools' },
    btn('⚡ Schematic', () => api.toSchematic(), 'run'), modeBtns.move, modeBtns.route, modeBtns.jumper, modeBtns.delete,
    btn('↻', () => rotateSel(), 'icon'), btn('↶', () => { api.undo(); }, 'icon'), btn('↷', () => { api.redo(); }, 'icon'), btn('Fit', () => { fit(); draw(); }),
    btn('🧩 Auto place', () => doAutoPlace()), btn('⚡ Autoroute', () => doAutoroute()), btn('✖ Clear traces', () => { L.traces = []; L.jumpers = []; cam = null; change('All traces removed.'); }), camBtn);
  const canvas = el('canvas', { class: 'sch-canvas' });
  const wrap = el('div', { class: 'sch-wrap pcb-wrap' }, canvas);
  const status = el('div', { class: 'sch-status' });
  // ⤴ Jumper while routing by hand: the next tap is where a wire on the parts side lands (it hops over other traces), then the trace goes on from there
  const jumpBtn = btn('⤴ Jumper', () => { if (!route) return; route.jump = !route.jump; jumpBtn.classList.toggle('on', route.jump); say(route.jump ? 'Jumper: tap where the wire should land (straight line, it jumps over any trace). Tap ⤴ Jumper again to cancel.' : 'Jumper cancelled: tap to bend the trace.'); draw(); });
  jumpBtn.title = 'Next tap = a jumper wire on the parts side, hopping over other traces';
  const routeBar = el('div', { class: 'pcb-routebar', hidden: true }, jumpBtn, btn('✓ Finish here', () => finishRoute(null)), btn('↶ Back one', () => { if (route?.pts.length > 1) { route.pts.pop(); draw(); } }), btn('✖ Cancel', () => { route = null; routeBar.hidden = true; draw(); }));
  const panel = el('div', { class: 'sch-panel' });
  // fine tuning: arrows move the selected part / trace corner / trace segment by one step
  let step = +store.get('pcb.step', '0.25');
  const stepSel = el('select', { class: 'sel sm', 'aria-label': 'Nudge step' }, [0.1, 0.25, 0.5, 0.635, 1.27].map(v => el('option', { value: v, text: `step ${v} mm` })));
  stepSel.value = String(step); stepSel.onchange = () => { step = +stepSel.value; store.set('pcb.step', stepSel.value); };
  const nudgeBar = el('div', { class: 'pcb-nudge', hidden: true }, el('span', { class: 'muted', text: 'Nudge' }),
    btn('◀', () => nudge(-1, 0), 'icon'), btn('▲', () => nudge(0, -1), 'icon'), btn('▼', () => nudge(0, 1), 'icon'), btn('▶', () => nudge(1, 0), 'icon'), stepSel);
  const box = el('div', { class: 'pcb-box', hidden: true }, top, wrap, routeBar, nudgeBar, status, panel);
  // ---------- ⛶ full screen: only the board + a floating tool menu (drag it by ⠿, ▾ folds it) ----------
  let full = false, routeW = +store.get('pcb.routeW', '0') || 0;     // 0 = board rule width
  const fullBtn = el('button', { class: 'sb icon pcb-fullbtn', type: 'button', text: '⛶', title: 'Full screen', onclick: () => (full ? exitFull() : enterFull()) });
  wrap.append(fullBtn);
  const fmModes = { move: btn('✋ Move', () => setMode('move')), route: btn('✏ Route', () => setMode('route')), jumper: btn('⤴ Jumper', () => setMode('jumper')), delete: btn('🗑', () => { if (mode === 'move' && deleteSel()) return; setMode('delete'); }) };
  fmModes.delete.title = 'Delete (the selected item, or tap what to delete)';
  const wSel = el('select', { class: 'sel sm', 'aria-label': 'Trace width for hand routing' }, [[0, 'width: rule'], [0.4, '0.4 mm'], [0.6, '0.6 mm'], [0.8, '0.8 mm'], [1.0, '1.0 mm'], [1.5, '1.5 mm'], [2.0, '2.0 mm']].map(([v, t]) => el('option', { value: v, text: t })));
  wSel.value = String(routeW); wSel.onchange = () => { routeW = +wSel.value; store.set('pcb.routeW', wSel.value); if (route) { route.w = routeW || L.rules.trace; draw(); } say(`Hand traces: ${routeW ? routeW + ' mm' : `board rule (${L.rules.trace} mm)`}.`); };
  const lockBtn = btn('📌 Lock', () => {
    if (sel?.kind !== 'part' || !L.parts[sel.id]) return say('Select a part first, then 📌 Lock keeps it where it is during 🧩 Auto place.');
    const bp = L.parts[sel.id], p = api.getC().parts.find(q => q.id === sel.id);
    if (bp.lock) delete bp.lock; else bp.lock = true;
    change(bp.lock ? `${p.name} 📌 locked: 🧩 Auto place leaves it here.` : `${p.name} unlocked.`);
  });
  const fmBody = el('div', { class: 'fm-body' },
    el('div', { class: 'fm-row' }, ...Object.values(fmModes)),
    el('div', { class: 'fm-row' }, btn('↻', () => rotateSel(), 'icon'), lockBtn, btn('↶', () => api.undo(), 'icon'), btn('↷', () => api.redo(), 'icon'), btn('Fit', () => { fit(); draw(); })),
    el('div', { class: 'fm-row' }, wSel),
    el('div', { class: 'fm-row' }, btn('🧩 Auto place', () => doAutoPlace()), btn('⚡ Autoroute', () => doAutoroute())));
  const fmFold = el('button', { class: 'fm-btn', type: 'button', text: '▾', title: 'Fold / unfold the menu' });
  const fmHead = el('div', { class: 'fm-head' }, el('span', { class: 'fm-grip', text: '⠿ PCB tools' }), fmFold, el('button', { class: 'fm-btn', type: 'button', text: '✕', title: 'Leave full screen', onclick: () => exitFull() }));
  const fm = el('div', { class: 'pcb-fm', hidden: true }, fmHead, fmBody);
  const setFold = (f) => { fmBody.hidden = f; fmFold.textContent = f ? '▸' : '▾'; store.set('pcb.fmFold', f ? '1' : ''); };
  fmFold.onclick = () => setFold(!fmBody.hidden);
  setFold(store.get('pcb.fmFold', '') === '1');
  // drag the menu by its head; the spot is remembered
  const placeFm = (x, y) => { const r = fm.getBoundingClientRect(), bw = box.clientWidth, bh = box.clientHeight; x = Math.max(0, Math.min(bw - Math.min(r.width, bw), x)); y = Math.max(0, Math.min(bh - 40, y)); fm.style.left = x + 'px'; fm.style.top = y + 'px'; return [x, y]; };
  fmHead.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.fm-btn')) return;
    e.preventDefault(); fmHead.setPointerCapture?.(e.pointerId);
    const r = fm.getBoundingClientRect(), b = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (ev) => placeFm(ev.clientX - b.left - dx, ev.clientY - b.top - dy);
    const upf = () => { fmHead.removeEventListener('pointermove', mv); fmHead.removeEventListener('pointerup', upf); fmHead.removeEventListener('pointercancel', upf); store.set('pcb.fmPos', JSON.stringify([parseFloat(fm.style.left), parseFloat(fm.style.top)])); };
    fmHead.addEventListener('pointermove', mv); fmHead.addEventListener('pointerup', upf); fmHead.addEventListener('pointercancel', upf);
  });
  function syncFm() {
    for (const [k, b] of Object.entries(fmModes)) b.classList.toggle('on', k === mode);
    const bp = sel?.kind === 'part' ? L?.parts[sel.id] : null;
    lockBtn.disabled = !bp; lockBtn.classList.toggle('on', !!bp?.lock); lockBtn.textContent = bp?.lock ? '📌 Locked' : '📌 Lock';
  }
  function enterFull() {
    if (full) return; full = true;
    box.classList.add('pcb-full'); fm.hidden = false; fullBtn.textContent = '✕'; fullBtn.title = 'Leave full screen';
    box.append(fm); fmBody.append(routeBar, nudgeBar); wrap.append(status);     // route / nudge bars ride in the menu, the status line on the board
    document.documentElement.classList.add('pcb-fs');
    try { history.pushState({ pcbFull: 1 }, ''); } catch { }
    box.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => { });
    syncFm();
    requestAnimationFrame(() => { W = 0; resize(); let pos = null; try { pos = JSON.parse(store.get('pcb.fmPos', 'null')); } catch { } placeFm(...(pos ?? [8, 64])); });
  }
  function exitFull(fromBack = false) {
    if (!full) return; full = false;
    box.classList.remove('pcb-full'); fm.hidden = true; fullBtn.textContent = '⛶'; fullBtn.title = 'Full screen';
    box.insertBefore(routeBar, panel); box.insertBefore(nudgeBar, panel); box.insertBefore(status, panel);
    document.documentElement.classList.remove('pcb-fs');
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => { });
    if (!fromBack && history.state?.pcbFull) history.back();
    requestAnimationFrame(() => { W = 0; resize(); });
  }
  addEventListener('popstate', () => { if (full) exitFull(true); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && full) exitFull(); });

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  const nameBoxes = [];
  const say = (t) => { status.textContent = t; };
  // 📤 Send to Nova: open the Fox9ner Nova app on the ESP32 (http://fox9ner.local/?import) and hand it the 3 G-code files.
  // The Nova page asks before saving them to its SD card. postMessage works between the https page and the http ESP32 page.
  function sendToNova(files) {
    const host = store.get('novaHost', 'fox9ner.local');
    const w = window.open(`http://${host}/?import`, 'fox9ner-nova');
    if (!w) { say('📤 The browser blocked the new tab: allow pop-ups for this page and press Send to Nova again.'); return; }
    say(`📤 Opening http://${host} … (phone and Nova must be on the same WiFi)`);
    let sent = false;
    const done = (t) => { removeEventListener('message', onMsg); clearTimeout(timer); say(t); };
    const onMsg = (e) => {
      if (e.source !== w || typeof e.data !== 'object' || !e.data) return;
      if (e.data.type === 'nova-ready' && !sent) {
        sent = true; say(`📤 Nova v${e.data.version ?? '?'} found: confirm on the Nova page to save the files to its SD card.`);
        w.postMessage({ type: 'f9t-files', files: files.map(([n, text]) => ({ name: n, text })) }, e.origin);
      } else if (e.data.type === 'nova-imported') {
        const ok = e.data.saved ?? [];
        done(ok.length ? `✔ Saved on the Nova SD card: ${ok.join(', ')}. Run them from its SD card list.` : '✖ Nothing saved (cancelled on the Nova page, or no SD card).');
      }
    };
    addEventListener('message', onMsg);
    const timer = setTimeout(() => { if (!sent) done(`✖ No answer from http://${host}. Is the Nova ESP32 on and on the same WiFi? Android: type its IP (e.g. 192.168.1.50) instead of fox9ner.local. The Nova app on the ESP32 must be v1.2.0 or newer (PlatformIO: Upload Filesystem Image).`); }, 25000);
  }

  // ---------- data ----------
  function load() {
    const c = api.getC();
    const had = !!c.pcb;
    L = P.syncLayout(c);
    analyzeNow();
    return had;
  }
  function analyzeNow() { const c = api.getC(); an = P.analyze(c); errs = P.drc(c, an); }
  function change(msg, push = true) { cam = null; const w0 = L.w, h0 = L.h; P.fitBoard(api.getC(), 1.5, true); if (L.w !== w0 || L.h !== h0) { msg = (msg ? msg + ' ' : '') + `Board grew to ${L.w} × ${L.h} mm.`; setTimeout(() => { W = 0; resize(); }, 0); } api.commit(push); analyzeNow(); renderPanel(); draw(); if (msg) say(msg); }
  function setMode(m) {
    mode = m; route = null; routeBar.hidden = true; jfirst = null;
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('on', k === m);
    syncNudge(); syncFm();
    say({ move: 'Drag parts, labels and traces (corners or segments). Tap to select, arrows below for fine tuning. Tap empty board to pan.', route: 'Tap a pad to start a trace, tap to add bends, tap a pad of the same net to finish.', jumper: 'Jumper: tap anywhere for the first hole, then anywhere for the second (the white dashed wire joins them on the parts side). Drag a hole to move it. Then ✏ Route traces to the holes like any pad.', delete: 'Tap a trace or a jumper wire to delete it.' }[m]);
    draw();
  }

  // ---------- geometry ----------
  const sx = (x) => view.ox + x * view.s, sy = (y) => view.oy + y * view.s;
  const wx = (px) => (px - view.ox) / view.s, wy = (py) => (py - view.oy) / view.s;
  const parts = () => api.getC().parts.filter(p => L.parts[p.id]);
  function padAt(x, y) {
    let best = null, bd = Infinity;
    for (const pd of an.pads) { const d = Math.hypot(pd.x - x, pd.y - y); if (d <= Math.max(pd.w, pd.h) / 2 + 0.3 && d < bd) { bd = d; best = pd; } }
    return best;
  }
  function partAt(x, y) {
    for (const p of parts().reverse()) { const e = P.partExtents(p, L.parts[p.id]); if (x >= e[0] && x <= e[2] && y >= e[1] && y <= e[3]) return p; }
    return null;
  }
  function traceAt(x, y) {
    let best = -1, bd = Infinity;
    L.traces.forEach((t, i) => { for (let k = 0; k + 1 < t.pts.length; k++) { const d = P.segDist(x, y, x, y, t.pts[k][0], t.pts[k][1], t.pts[k + 1][0], t.pts[k + 1][1]); if (d <= t.w / 2 + 5 / view.s && d < bd) { bd = d; best = i; } } });
    return best;
  }
  function jumperAt(x, y) { return (L.jumpers ?? []).findIndex(j => P.segDist(x, y, x, y, j.x1, j.y1, j.x2, j.y2) <= 0.6 + 5 / view.s); }
  const netName = (n) => (n >= 0 ? an.nl.nets[n]?.name ?? '?' : 'no net');
  const traceNet = (i) => an.traceNet[i];

  // ---------- drawing ----------
  function resize() {
    const dpr = devicePixelRatio || 1;
    // height follows the board shape (a wide board on a phone doesn't need a tall window)
    const ww = wrap.getBoundingClientRect().width || 300, asp = L ? (L.h + 8) / (L.w + 8) : 0.7;
    wrap.style.height = full ? box.clientHeight + 'px' : Math.round(Math.max(260, Math.min(760, innerHeight * 0.64, ww * asp + 30))) + 'px';
    const r = wrap.getBoundingClientRect(); const first = !W;
    W = Math.round(r.width); H = Math.round(r.height); if (!W) return;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) fit();
    draw();
  }
  function fit() {
    if (!L || !W) return;
    const m = 6;
    view.s = Math.max(1, Math.min((W - 2 * m) / (L.w + 4), (H - 2 * m) / (L.h + 4)));
    view.ox = W / 2 - L.w / 2 * view.s; view.oy = H / 2 - L.h / 2 * view.s;
  }
  function padPath(pd, grow = 0) {
    const x = sx(pd.x), y = sy(pd.y), w = (pd.w + 2 * grow) * view.s, h = (pd.h + 2 * grow) * view.s;
    ctx.beginPath();
    if (pd.shape === 'rect') ctx.rect(x - w / 2, y - h / 2, w, h);
    else if (pd.shape === 'oval') { const r = Math.min(w, h) / 2; ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, r) : ctx.rect(x - w / 2, y - h / 2, w, h); }
    else ctx.arc(x, y, w / 2, 0, 7);
  }
  function draw() {
    if (!W || !L) return;
    const c = api.getC();
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
    // board
    ctx.fillStyle = COL.board; ctx.fillRect(sx(0), sy(0), L.w * view.s, L.h * view.s);
    ctx.strokeStyle = COL.edge; ctx.lineWidth = 1.5; ctx.strokeRect(sx(0), sy(0), L.w * view.s, L.h * view.s);
    // mm grid ticks (every 10 mm)
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x <= L.w; x += 10) for (let y = 0; y <= L.h; y += 10) ctx.fillRect(sx(x) - 1, sy(y) - 1, 2, 2);
    const hiNet = sel?.kind === 'trace' ? traceNet(sel.i) : sel?.kind === 'pad' ? sel.pad.net : route ? route.net : hover?.net ?? -2;
    // traces
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const growing = rt ? new Set(rt.anim.filter(a => a.ok && performance.now() - a.t0 < GROW).map(a => a.pts)) : null;
    L.traces.forEach((t, i) => {
      if (growing?.has(t.pts)) return;          // still drawing itself (⚡ Autoroute animation)
      const n = traceNet(i);
      ctx.strokeStyle = (sel?.kind === 'trace' && sel.i === i) ? COL.sel : (n >= 0 && n === hiNet) ? COL.cuHi : COL.cu;
      ctx.lineWidth = Math.max(1, t.w * view.s);
      ctx.beginPath(); t.pts.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.stroke();
    });
    // pads
    for (const pd of an.pads) {
      ctx.fillStyle = (pd.net >= 0 && pd.net === hiNet) ? COL.cuHi : COL.cu;
      padPath(pd); ctx.fill();
      if (pd.drill > 0) { ctx.fillStyle = COL.hole; ctx.beginPath(); ctx.arc(sx(pd.x), sy(pd.y), Math.max(1, pd.drill / 2 * view.s), 0, 7); ctx.fill(); }
    }
    nameBoxes.length = 0;
    // silkscreen: part outlines + names
    ctx.strokeStyle = 'rgba(232,237,242,0.75)'; ctx.lineWidth = 1.2;
    for (const p of parts()) {
      const bp = L.parts[p.id], f = P.footprintOf(p, bp);
      for (const b of f.body) { ctx.beginPath(); b.forEach((q, k) => { const [x, y] = rotPt(q, bp.rot); k ? ctx.lineTo(sx(bp.x + x), sy(bp.y + y)) : ctx.moveTo(sx(bp.x + x), sy(bp.y + y)); }); ctx.stroke(); }
      if (sel?.kind === 'part' && sel.id === p.id) { const e = P.partExtents(p, bp); ctx.save(); ctx.strokeStyle = COL.sel; ctx.setLineDash([5, 4]); ctx.strokeRect(sx(e[0]) - 3, sy(e[1]) - 3, (e[2] - e[0]) * view.s + 6, (e[3] - e[1]) * view.s + 6); ctx.restore(); }
      const e = P.partExtents(p, bp);
      ctx.fillStyle = COL.silk; ctx.font = `600 ${Math.max(9, Math.min(13, view.s * 1.3))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const lo = bp.lbl ?? [0, 0], lx = sx((e[0] + e[2]) / 2 + lo[0]), ly = sy(e[1] + lo[1]) - 2, lw = ctx.measureText(p.name).width + 6, lh = Math.max(9, Math.min(13, view.s * 1.3)) + 4;
      ctx.fillText(p.name, lx, ly);
      nameBoxes.push({ p, x0: lx - lw / 2, y0: ly - lh, x1: lx + lw / 2, y1: ly + 2 });
    }
    // pad labels when zoomed in
    if (view.s >= 9) {
      ctx.font = `600 ${Math.min(11, view.s * 0.8)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1B1B1B';
      for (const pd of an.pads) if (pd.part && pd.pin >= 0) ctx.fillText(P.pinLabel(pd.part, pd.pin), sx(pd.x), sy(pd.y) + (pd.drill ? Math.max(pd.w, pd.h) / 2 * view.s + 6 : 0));
    }
    // selected trace: corner handles, selected segment / corner brighter
    if (sel?.kind === 'trace' && L.traces[sel.i]) {
      const t = L.traces[sel.i];
      if (sel.seg != null && t.pts[sel.seg + 1]) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(2, t.w * view.s * 0.45); ctx.beginPath(); ctx.moveTo(sx(t.pts[sel.seg][0]), sy(t.pts[sel.seg][1])); ctx.lineTo(sx(t.pts[sel.seg + 1][0]), sy(t.pts[sel.seg + 1][1])); ctx.stroke(); }
      t.pts.forEach(([x, y], k) => { const big = sel.pt === k; ctx.fillStyle = big ? '#FFFFFF' : COL.sel; ctx.strokeStyle = '#0F1317'; ctx.lineWidth = 1; const r = big ? 6 : 4; ctx.fillRect(sx(x) - r, sy(y) - r, 2 * r, 2 * r); ctx.strokeRect(sx(x) - r, sy(y) - r, 2 * r, 2 * r); });
    }
    // jumper wires (on the parts side)
    for (const [ji, j] of (L.jumpers ?? []).entries()) {
      ctx.strokeStyle = sel?.kind === 'jumper' && sel.i === ji ? COL.sel : '#FFFFFF'; ctx.lineWidth = Math.max(3, 0.9 * view.s); ctx.lineCap = 'butt'; ctx.setLineDash([Math.max(6, 1.6 * view.s), Math.max(4, 1.1 * view.s)]);
      ctx.beginPath(); ctx.moveTo(sx(j.x1), sy(j.y1)); ctx.lineTo(sx(j.x2), sy(j.y2)); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round';
      if (sel?.kind === 'jumper' && sel.i === ji) for (const k of sel.k == null ? [0, 1] : [sel.k]) { const hx = k ? j.x2 : j.x1, hy = k ? j.y2 : j.y1; ctx.strokeStyle = COL.sel; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(hx), sy(hy), Math.max(6, 1.4 * view.s), 0, 7); ctx.stroke(); }
    }
    // ratsnest
    ctx.strokeStyle = COL.rat; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
    for (const r of an.rats) { ctx.beginPath(); ctx.moveTo(sx(r.a.x), sy(r.a.y)); ctx.lineTo(sx(r.b.x), sy(r.b.y)); ctx.stroke(); }
    ctx.setLineDash([]);
    // toolpaths
    if (showCam && cam) {
      ctx.lineWidth = 1; ctx.strokeStyle = COL.iso;
      for (const lp of cam.iso.loops) { ctx.beginPath(); lp.pts.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.closePath(); ctx.stroke(); }
      ctx.strokeStyle = COL.cut; ctx.lineWidth = 1.5;
      if (cam.perf) for (const h of cam.perf) { ctx.beginPath(); ctx.arc(sx(h.x), sy(h.y), Math.max(1.5, L.cam.perfBit / 2 * view.s), 0, 7); ctx.stroke(); }
      else {
        const last = cam.cut[cam.cut.length - 1];
        ctx.beginPath(); last.pts.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.stroke();
        ctx.fillStyle = COL.cut; for (const [x, y, z] of last.pts) if (z > last.z + 1e-6) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 2.5, 0, 7); ctx.fill(); }
      }
      ctx.strokeStyle = COL.drill; ctx.lineWidth = 1.2;
      for (const g of cam.holes) for (const h of g.holes) { ctx.beginPath(); ctx.arc(sx(h.x), sy(h.y), Math.max(2, g.bit / 2 * view.s), 0, 7); ctx.stroke(); }
      ctx.fillStyle = COL.bad; for (const t of cam.tight) { ctx.beginPath(); ctx.arc(sx(t.x), sy(t.y), 6, 0, 7); ctx.fill(); }
    }
    // DRC markers
    ctx.strokeStyle = COL.bad; ctx.lineWidth = 2;
    for (const e of errs) { ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), 9, 0, 7); ctx.stroke(); }
    // route in progress
    if (route) {
      const pts = [...route.pts]; if (hover?.pt) pts.push(hover.pt);
      ctx.strokeStyle = COL.sel; ctx.lineWidth = Math.max(1, route.w * view.s); ctx.globalAlpha = 0.8;
      if (route.jump) pts.pop();
      ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.stroke(); ctx.globalAlpha = 1;
      if (route.jump && hover?.pt) {   // pending jumper: blue wire with a hole at each end
        const [x1, y1] = route.pts[route.pts.length - 1], [x2, y2] = hover.pt;
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(3, 0.9 * view.s); ctx.setLineDash([Math.max(6, 1.6 * view.s), Math.max(4, 1.1 * view.s)]); ctx.beginPath(); ctx.moveTo(sx(x1), sy(y1)); ctx.lineTo(sx(x2), sy(y2)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#FFFFFF'; for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(sx(x), sy(y), Math.max(3, 0.9 * view.s), 0, 7); ctx.fill(); }
        ctx.fillStyle = '#E6EDF3'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`jumper ${Math.hypot(x2 - x1, y2 - y1).toFixed(1)} mm`, sx(x2) + 8, sy(y2) - 4);
      }
    }
    if (mode === 'jumper' && (jfirst || hover?.pt)) {
      const a = jfirst ?? hover.pt, b = jfirst ? hover?.pt ?? jfirst : null;
      ctx.fillStyle = '#FFFFFF';
      for (const q of [a, b]) if (q) { ctx.beginPath(); ctx.arc(sx(q[0]), sy(q[1]), Math.max(3, 0.9 * view.s), 0, 7); ctx.fill(); ctx.fillStyle = COL.hole; ctx.beginPath(); ctx.arc(sx(q[0]), sy(q[1]), Math.max(1, 0.4 * view.s), 0, 7); ctx.fill(); ctx.fillStyle = '#FFFFFF'; }
      if (b && jfirst) {
        ctx.strokeStyle = '#FFFFFF'; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(3, 0.9 * view.s); ctx.setLineDash([Math.max(6, 1.6 * view.s), Math.max(4, 1.1 * view.s)]);
        ctx.beginPath(); ctx.moveTo(sx(a[0]), sy(a[1])); ctx.lineTo(sx(b[0]), sy(b[1])); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1)} mm`, sx(b[0]) + 8, sy(b[1]) - 4);
      }
    }
    drawRouting();
    // origin marker (machine X0 Y0 = lower-left, or lower-right before mirroring)
    ctx.fillStyle = '#3DDC84'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${L.w} × ${L.h} mm · seen from the parts side (copper underneath)`, sx(0), sy(L.h) + 4);
  }

  // ---------- actions ----------
  function rotateSel() {
    if (sel?.kind !== 'part') return say('Select a part first (✋ Move, tap it).');
    const bp = L.parts[sel.id]; bp.rot = (bp.rot + 1) & 3; change('Rotated. Run ⚡ Autoroute again if traces no longer reach.');
  }
  // ⚡ Autoroute, animated: the router runs a step per frame, each new trace grows from pad to pad, a bar shows how far it is
  let rt = null;                       // { gen, anim: [{pts, w, t0, ok}], tryN, startT, last }
  const rtBar = el('div', { class: 'rt-fill' }), rtTxt = el('span', { class: 'rt-txt' });
  const rtStop = el('button', { class: 'sb', type: 'button', text: '⏹ Stop', onclick: () => { if (rt) rt.stop = true; if (pl) pl.stop = true; } });
  // after a try that left connections stuck the router waits: 🔁 Retry runs one more try in a new order, ✓ Keep stops with the best try
  const rtRetry = el('button', { class: 'sb primary', type: 'button', text: '🔁 Retry', onclick: () => { if (!rt?.paused) return; rt.paused = null; rtPause(false); requestAnimationFrame(rt.tick); } });
  const rtKeep = el('button', { class: 'sb', type: 'button', text: '✓ Keep', onclick: () => { if (!rt?.paused) return; const s = rt.gen.next('keep'); rt.paused = null; rt.finish(s.value); } });
  // 🧩 Place + route: the parts are where the trouble is, so rearrange them and route again
  const rtPlace = el('button', { class: 'sb', type: 'button', text: '🧩 Place + route', title: 'Rearrange the parts for shorter, less crossing connections, then autoroute again', onclick: () => { if (!rt?.paused) return; rt.gen.return(); rt = null; rtBox.hidden = true; rtPause(false); doAutoPlace(true); } });
  const rtPause = (on) => { rtRetry.hidden = rtKeep.hidden = rtPlace.hidden = !on; rtStop.hidden = on; };
  const rtBox = el('div', { class: 'rt-box', hidden: true }, el('div', { class: 'rt-track' }, rtBar), el('div', { class: 'rt-row' }, rtTxt, el('span', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end' }, rtRetry, rtPlace, rtKeep, rtStop)));
  rtPause(false);
  wrap.append(rtBox);
  const GROW = 260;                    // ms for one trace to draw itself
  function doAutoroute() {
    if (rt) return;
    const c = api.getC();
    sel = null; route = null; renderPanel();
    rt = { gen: autorouteSteps(c, { keepManual: true }), anim: [], tryN: 0, startT: performance.now(), lastNew: 0, n: 0, stop: false };
    rtBox.hidden = false; rtBar.style.width = '0%'; rtBar.classList.remove('busy'); rtTxt.textContent = 'Routing…';
    const total0 = Math.max(1, an?.rats?.length ?? 1);
    const pace = total0 > 40 ? 0 : total0 > 15 ? 60 : 140;      // big boards: no waiting between traces
    const tick = () => {
      if (!rt) return;
      const now = performance.now(), t0 = now;
      let res = null;
      // routing steps until the time budget is used, or a new trace appeared and needs its moment on screen
      while (performance.now() - t0 < 24 && !rt.stop) {
        if (now - rt.lastNew < pace) break;
        let s;
        try { s = rt.gen.next(); } catch (err) {         // a router error must never leave the bar hanging: stop and keep what is routed
          console.error(err); res = { routed: rt.cur?.routed ?? 0, failed: P.analyze(api.getC()).rats, jumpers: (L.jumpers ?? []).filter(j => j.auto).length, stopped: true }; break;
        }
        if (s.done) { res = s.value; break; }
        const v = s.value;
        if (v.pause) { rt.paused = v; break; }
        if (v.attempt !== rt.tryN) { rt.tryN = v.attempt; rt.anim = []; }
        rt.anim = rt.anim.filter(a => performance.now() - a.t0 < GROW + 600);
        rt.cur = v;
        if (!v.skip) {
          for (const t of v.newTraces) rt.anim.push({ pts: t.pts, w: t.w, t0: performance.now(), ok: true });
          if (!v.ok && v.a && v.b) rt.anim.push({ pts: [[v.a.x, v.a.y], [v.b.x, v.b.y]], w: 0.3, t0: performance.now(), ok: false });
          if (v.newTraces.length || !v.ok) { rt.lastNew = performance.now(); rt.n++; break; }
        }
      }
      if (rt.stop && !res) { rt.gen.return(); res = { routed: rt.cur?.routed ?? 0, failed: P.analyze(api.getC()).rats, jumpers: (L.jumpers ?? []).filter(j => j.auto).length, stopped: true }; }   // ⏹: keep what is routed so far
      if (rt.paused && !res) {
        const q = rt.paused;
        rtBar.style.width = '100%';
        rtBar.classList.remove('busy'); rtTxt.textContent = `Try ${q.attempt + 1} done: ${q.routed} of ${q.total} routed · ${q.failed} stuck${q.bestFailed < q.failed ? ` (best try so far: ${q.bestFailed} stuck)` : ''}. 🔁 Retry tries a new order (${q.attempts - q.attempt - 1} left).`;
        rtPause(true); an = P.analyze(api.getC()); renderPanel(); draw();
        say(`Try ${q.attempt + 1} finished with ${q.failed} connection${q.failed > 1 ? 's' : ''} stuck. Tap 🔁 Retry for another try, 🧩 Place + route to rearrange the parts first, or ✓ Keep.`);
        return;                        // waits for the user
      }
      const v = rt.cur;
      if (v) {
        const frac = (v.attempt + v.done / Math.max(1, v.total)) / (v.attempt + 1);
        rtBar.style.width = `${Math.round(Math.min(1, v.done / Math.max(1, v.total)) * 100)}%`;
        rtBar.classList.toggle('retry', v.attempt > 0);
        rtTxt.textContent = v.round
          ? `${v.attempt ? `Try ${v.attempt + 1} of ${v.attempts} · ` : ''}checking pieces that came apart (pass ${v.round + 1}) · ${v.routed} routed`
          : `${Math.round(Math.min(1, v.done / Math.max(1, v.total)) * 100)} % · ${v.attempt ? `Try ${v.attempt + 1} of ${v.attempts} (new order) · ` : ''}${v.done} / ${v.total} connections · ${v.routed} routed${v.failed ? ` · ${v.failed} stuck` : ''}${v.done >= v.total ? ' · finishing the try…' : ''}`;
        rtBar.classList.toggle('busy', v.done >= v.total || !!v.round);
        void frac;
      }
      an = P.analyze(api.getC());
      draw();
      if (res) { rt.finish(res); return; }
      requestAnimationFrame(tick);
    };
    rt.tick = tick;
    rt.finish = (res) => {
      {
        const ms = Math.round(performance.now() - rt.startT);
        rt = null; rtBox.hidden = true; rtPause(false);
        if (res.stopped) { change(`Stopped: ${res.routed} routed, ${res.failed.length} still open (yellow lines). ⚡ Autoroute again to finish.`); return; }
        change(res.failed.length ? `Routed ${res.routed}, ${res.failed.length} could not fit (yellow lines). 🧩 Auto place rearranges the parts, or move them apart / route those by hand.` : `All connections routed in ${(ms / 1000).toFixed(1)} s${res.jumpers ? ` with ${res.jumpers} jumper wire${res.jumpers > 1 ? 's' : ''} (white dashed: a wire on the parts side)` : ''}.`);
      }
    };
    requestAnimationFrame(tick);
  }
  // 🧩 Auto place, animated: parts slide / turn while the optimizer works, the bar shows how far; ⏹ keeps the best so far
  let pl = null;
  function doAutoPlace(thenRoute = false) {
    if (rt || pl) return;
    const c = api.getC();
    if (!Object.keys(L.parts).length) return say('No parts on the board yet.');
    sel = null; route = null; routeBar.hidden = true; renderPanel();
    const had = L.traces.length + (L.jumpers ?? []).length;
    L.traces = []; L.jumpers = [];            // traces would no longer reach once the parts move
    pl = { gen: autoPlaceSteps(c), stop: false, startT: performance.now() };
    rtBox.hidden = false; rtPause(false); rtBar.style.width = '0%'; rtBar.classList.remove('retry'); rtTxt.textContent = 'Placing parts…'; say('🧩 Placing: parts slide and turn to make the connections short and cross less. ⏹ Stop keeps the best so far.');
    const tick = () => {
      if (!pl) return;
      const t0 = performance.now(); let res = null, v = null;
      while (performance.now() - t0 < 30) {
        if (pl.stop) { pl.gen.return(); res = { stopped: true }; break; }
        const s = pl.gen.next();
        if (s.done) { res = s.value; break; }
        v = s.value;
        if (performance.now() - pl.startT < 2500) break;     // one step per frame for the first seconds, so the parts are seen moving
      }
      if (v) {
        const f = (v.run + v.it / v.iters) / v.runs;
        rtBar.style.width = `${Math.round(f * 100)}%`;
        rtTxt.textContent = `🧩 ${Math.round(f * 100)} % · pass ${v.run + 1} of ${v.runs} · wire ${Math.round(v.len)} mm · ${v.crosses} crossing${v.crosses === 1 ? '' : 's'}${v.overlaps ? ` · ${v.overlaps} overlapping` : ''}`;
      }
      if (res) {
        pl = null; rtBox.hidden = true;
        W = 0; resize(); fit();
        if (res.stopped) { change(`Placement stopped: the best layout so far is kept.${thenRoute ? '' : ' ⚡ Autoroute next.'}`); if (thenRoute) doAutoroute(); return; }
        const b = res.before, a = res.after;
        if (res.nothing) { change('Nothing to move: every part is locked or there are no connections.'); return; }
        const msg = `Parts rearranged: wire ${Math.round(b.len)} → ${Math.round(a.len)} mm, crossings ${b.crosses} → ${a.crosses}, board ${L.w} × ${L.h} mm.${had ? ' Old traces removed.' : ''} Tap 🧩 again for a different layout, ↶ undoes it. 📌 Lock a part in its panel to keep it where it is.`;
        change(thenRoute ? msg + ' Routing…' : msg + ' ⚡ Autoroute next.');
        if (thenRoute) doAutoroute();
        return;
      }
      an = P.analyze(c); draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // the newest traces draw themselves from the start pad to the end pad (glowing), a stuck connection flashes red
  function drawRouting() {
    if (!rt) return;
    const now = performance.now();
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const a of rt.anim) {
      const k = Math.min(1, (now - a.t0) / GROW);
      if (k >= 1 && now - a.t0 > GROW + 500) continue;
      const seg = []; let tot = 0; for (let i = 1; i < a.pts.length; i++) tot += Math.hypot(a.pts[i][0] - a.pts[i - 1][0], a.pts[i][1] - a.pts[i - 1][1]);
      let left = tot * k; seg.push(a.pts[0]);
      for (let i = 1; i < a.pts.length && left > 0; i++) { const d = Math.hypot(a.pts[i][0] - a.pts[i - 1][0], a.pts[i][1] - a.pts[i - 1][1]); if (d <= left) { seg.push(a.pts[i]); left -= d; } else { const f = left / d; seg.push([a.pts[i - 1][0] + (a.pts[i][0] - a.pts[i - 1][0]) * f, a.pts[i - 1][1] + (a.pts[i][1] - a.pts[i - 1][1]) * f]); left = 0; } }
      ctx.shadowColor = a.ok ? '#FFE16B' : '#FF6B6B'; ctx.shadowBlur = 14;
      ctx.strokeStyle = a.ok ? '#FFE16B' : '#FF6B6B'; ctx.lineWidth = Math.max(2, a.w * view.s);
      ctx.globalAlpha = k < 1 ? 1 : Math.max(0, 1 - (now - a.t0 - GROW) / 500);
      if (!a.ok) ctx.setLineDash([6, 5]);
      ctx.beginPath(); seg.forEach(([x, y], q) => (q ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.stroke(); ctx.setLineDash([]);
      if (k < 1 && a.ok) { const [hx, hy] = seg[seg.length - 1]; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(sx(hx), sy(hy), Math.max(3, a.w * view.s * 0.8), 0, 7); ctx.fill(); }   // the "drill head" at the tip
    }
    ctx.restore();
  }
  // snap to the 0.635 mm grid and 45° steps from the previous point
  function routePoint(x, y) {
    const g = 0.635; const last = route.pts[route.pts.length - 1];
    const dx = x - last[0], dy = y - last[1];
    const m = (Math.abs(dx) + Math.abs(dy)) / 2;
    const cand = [[dx, 0], [0, dy], [Math.sign(dx) * m, Math.sign(dy) * m]];
    let best = cand[0], bd = Infinity; for (const c of cand) { const d = Math.hypot(c[0] - dx, c[1] - dy); if (d < bd) { bd = d; best = c; } }
    return [P.snap(last[0] + best[0], g), P.snap(last[1] + best[1], g)].map(v => Math.round(v * 1000) / 1000);
  }
  function finishRoute(endPad) {
    if (!route) return;
    if (endPad) route.pts.push([endPad.x, endPad.y]);
    const pts = cleanPath(route.pts);
    route = null; routeBar.hidden = true;
    if (pts.length < 2) { draw(); return; }
    L.traces.push({ w: routeW || L.rules.trace, pts, auto: false });
    change('Trace added.');
  }

  // ---------- trace editing ----------
  const onPad = (pt) => an.pads.some(pd => Math.hypot(pd.x - pt[0], pd.y - pt[1]) < 0.05);
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  // which part of trace i is under (x, y): a corner {pt} or a segment {seg}
  function tracePart(i, x, y) {
    const t = L.traces[i], tol = Math.max(0.5, 10 / view.s);
    let bp = -1, bd = tol;
    t.pts.forEach((q, k) => { const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; bp = k; } });
    if (bp >= 0 && !((bp === 0 || bp === t.pts.length - 1) && onPad(t.pts[bp]))) return { pt: bp };
    let bs = 0, bsd = Infinity;
    for (let k = 0; k + 1 < t.pts.length; k++) { const d = P.segDist(x, y, x, y, t.pts[k][0], t.pts[k][1], t.pts[k + 1][0], t.pts[k + 1][1]); if (d < bsd) { bsd = d; bs = k; } }
    return { seg: bs };
  }
  // move a corner or a segment of trace i by (dx, dy). Ends on a pad stay put (a short new piece keeps them connected).
  // Other traces / jumpers that end on a moved point follow it. Returns the new traces and where the selection went.
  function editTrace(orig, i, part, dx, dy) {
    const T = structuredClone(orig), J = structuredClone(L.jumpers ?? []), tr = T[i];
    let idx = part.pt != null ? [part.pt] : [part.seg, part.seg + 1];
    if (part.pt != null && (part.pt === 0 || part.pt === tr.pts.length - 1) && onPad(tr.pts[part.pt])) return null;
    if (part.seg != null) {
      if (idx[1] === tr.pts.length - 1 && onPad(tr.pts[idx[1]])) tr.pts.push([...tr.pts[idx[1]]]);
      if (idx[0] === 0 && onPad(tr.pts[0])) { tr.pts.unshift([...tr.pts[0]]); idx = idx.map(k => k + 1); }
    }
    const moved = [];
    for (const k of idx) {
      const o = [...tr.pts[k]], n = [Math.round((o[0] + dx) * 1000) / 1000, Math.round((o[1] + dy) * 1000) / 1000];
      tr.pts[k] = n; moved.push(n);
      const isEnd = k === 0 || k === tr.pts.length - 1;
      if (!isEnd) continue;
      T.forEach((t2, j) => { if (j === i) return; for (const e of [0, t2.pts.length - 1]) if (same(t2.pts[e], o)) t2.pts[e] = [...n]; });
      for (const jp of J) { if (same([jp.x1, jp.y1], o)) { jp.x1 = n[0]; jp.y1 = n[1]; } if (same([jp.x2, jp.y2], o)) { jp.x2 = n[0]; jp.y2 = n[1]; } }
    }
    tr.auto = false;
    return { T, J, moved, part: part.pt != null ? { pt: idx[0] } : { seg: idx[0] } };
  }
  // tidy (drop duplicate / straight-through points) and find the selection again
  function tidyTrace(i, moved) {
    const t = L.traces[i]; t.pts = cleanPath(t.pts);
    if (moved.length === 2) { for (let k = 0; k + 1 < t.pts.length; k++) if (same(t.pts[k], moved[0]) && same(t.pts[k + 1], moved[1])) return { seg: k }; }
    const k = t.pts.findIndex(q => same(q, moved[0]));
    if (moved.length === 1 && k >= 0) return { pt: k };
    let bs = 0, bd = Infinity; for (let q = 0; q + 1 < t.pts.length; q++) { const d = P.segDist(moved[0][0], moved[0][1], moved[0][0], moved[0][1], t.pts[q][0], t.pts[q][1], t.pts[q + 1][0], t.pts[q + 1][1]); if (d < bd) { bd = d; bs = q; } }
    return { seg: bs };
  }
  function nudge(dx, dy) {
    if (!sel) return;
    if (sel.kind === 'part') { const bp = L.parts[sel.id]; bp.x = Math.round((bp.x + dx * step) * 1000) / 1000; bp.y = Math.round((bp.y + dy * step) * 1000) / 1000; change(); return; }
    if (sel.kind === 'trace' && L.traces[sel.i]) {
      const part = sel.pt != null ? { pt: sel.pt } : { seg: sel.seg ?? 0 };
      const r = editTrace(L.traces, sel.i, part, dx * step, dy * step);
      if (!r) return say('That end sits on a pad. Move the part, or pick a corner / segment.');
      L.traces = r.T; L.jumpers = r.J;
      sel = { kind: 'trace', i: sel.i, ...tidyTrace(sel.i, r.moved) };
      change();
      return;
    }
    if (sel.kind === 'jumper' && L.jumpers?.[sel.i]) {      // one hole (sel.k = 0 / 1) or the whole jumper; trace ends on a hole come along
      const j = L.jumpers[sel.i], mx = dx * step, my = dy * step, r3 = (v) => Math.round(v * 1000) / 1000;
      for (const k of sel.k == null ? [0, 1] : [sel.k]) {
        const ox = k ? j.x2 : j.x1, oy = k ? j.y2 : j.y1, nx = r3(ox + mx), ny = r3(oy + my);
        for (const t of L.traces) for (const q of [0, t.pts.length - 1]) if (Math.abs(t.pts[q][0] - ox) < 1e-6 && Math.abs(t.pts[q][1] - oy) < 1e-6) t.pts[q] = [nx, ny];
        if (k) { j.x2 = nx; j.y2 = ny; } else { j.x1 = nx; j.y1 = ny; }
      }
      change(`Jumper ${sel.k == null ? '' : `hole ${sel.k + 1} `}moved · ${Math.hypot(j.x2 - j.x1, j.y2 - j.y1).toFixed(2)} mm long.`);
    }
  }
  function syncNudge() { nudgeBar.hidden = !((mode === 'move' || mode === 'jumper') && (sel?.kind === 'part' || sel?.kind === 'trace' || sel?.kind === 'jumper')); }
  // delete the selection: trace, jumper, or a part (removed from the circuit too; ↶ brings it back)
  function deleteSel() {
    if (sel?.kind === 'trace' && L.traces[sel.i]) { L.traces.splice(sel.i, 1); sel = null; change('Trace deleted. ↶ brings it back.'); return true; }
    if (sel?.kind === 'jumper' && L.jumpers[sel.i]) { L.jumpers.splice(sel.i, 1); sel = null; change('Jumper deleted. ↶ brings it back.'); return true; }
    if (sel?.kind === 'part') { const c = api.getC(), p = c.parts.find(q => q.id === sel.id); if (!p) return false; c.parts = c.parts.filter(q => q !== p); sel = null; change(`${p.name} deleted from the circuit (schematic too). ↶ brings it back.`); return true; }
    return false;
  }
  addEventListener('keydown', (e) => {
    if (box.hidden || !sel || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!m) return; e.preventDefault(); nudge(m[0] * (e.shiftKey ? 4 : 1), m[1] * (e.shiftKey ? 4 : 1));
  });

  // ---------- pointer ----------
  const ptrs = new Map(); let down = null, pinch = 0;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const mid = () => { const v = [...ptrs.values()]; return [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2]; };
  function zoomAt(k, fx, fy) { const ns = Math.max(1, Math.min(60, view.s * k)), kk = ns / view.s; view.ox = fx - (fx - view.ox) * kk; view.oy = fy - (fy - view.oy) * kk; view.s = ns; }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    const [px, py] = pos(e); ptrs.set(e.pointerId, [px, py]);
    if (ptrs.size === 2) { const v = [...ptrs.values()]; pinch = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); down = { pinch: true, last: mid() }; return; }
    const x = wx(px), y = wy(py);
    down = { px, py, x, y, moved: false };
    if (mode === 'move' || mode === 'jumper') {
      const tol = Math.max(0.9, 12 / view.s);
      for (const [ji, j] of (L.jumpers ?? []).entries()) for (const k of [0, 1]) {
        const hx = k ? j.x2 : j.x1, hy = k ? j.y2 : j.y1;
        if (Math.hypot(hx - x, hy - y) < tol && !down.jend) down.jend = { i: ji, k, x0: hx, y0: hy, orig: structuredClone(L.traces) };
      }
      if (down.jend) return;
    }
    if (mode === 'move') {
      const nb = [...nameBoxes].reverse().find(b => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1);
      const pd = padAt(x, y), ti = pd ? -1 : traceAt(x, y);
      if (nb) { const bp = L.parts[nb.p.id]; down.lab = nb.p; down.start = [...(bp.lbl ?? [0, 0])]; }
      else if (ti >= 0) { down.tr = { i: ti, part: tracePart(ti, x, y), orig: structuredClone(L.traces), origJ: structuredClone(L.jumpers ?? []) }; }
      else { const p = partAt(x, y); if (p) { const bp = L.parts[p.id]; down.part = p; down.start = [bp.x, bp.y]; } }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = pos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
    if (!down) { if (route) { const pd = padAt(wx(px), wy(py)); hover = { pt: pd ? [pd.x, pd.y] : routePoint(wx(px), wy(py)), net: route.net }; draw(); } else if (mode === 'jumper') { hover = { pt: [P.snap(wx(px), 0.1), P.snap(wy(py), 0.1)] }; draw(); } return; }
    if (down.pinch && ptrs.size === 2) {
      const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), m = mid();
      view.ox += m[0] - down.last[0]; view.oy += m[1] - down.last[1]; zoomAt(d / pinch, m[0], m[1]); pinch = d; down.last = m; draw(); return;
    }
    if (Math.hypot(px - down.px, py - down.py) > 6) down.moved = true;
    if (!down.moved) return;
    if (down.jend) {          // move one jumper hole anywhere; trace ends sitting on it come along
      const d = down.jend, nx = Math.round(P.snap(d.x0 + (px - down.px) / view.s, 0.1) * 1000) / 1000, ny = Math.round(P.snap(d.y0 + (py - down.py) / view.s, 0.1) * 1000) / 1000;
      const j = L.jumpers[d.i]; if (d.k) { j.x2 = nx; j.y2 = ny; } else { j.x1 = nx; j.y1 = ny; }
      L.traces = structuredClone(d.orig);
      for (const t of L.traces) for (const q of [0, t.pts.length - 1]) if (Math.abs(t.pts[q][0] - d.x0) < 1e-6 && Math.abs(t.pts[q][1] - d.y0) < 1e-6) t.pts[q] = [nx, ny];
      sel = { kind: 'jumper', i: d.i, k: d.k }; analyzeNow(); draw(); return;
    }
    if (down.tr) {
      const d = down.tr, dx = P.snap((px - down.px) / view.s, step), dy = P.snap((py - down.py) / view.s, step);
      if (dx === d.dx && dy === d.dy) return;
      d.dx = dx; d.dy = dy;
      L.jumpers = structuredClone(d.origJ);
      const r = editTrace(d.orig, d.i, d.part, dx, dy);
      if (!r) { say('That end sits on a pad: drag a corner or a segment instead.'); return; }
      L.traces = r.T; L.jumpers = r.J; d.res = r; sel = { kind: 'trace', i: d.i, ...r.part };
      analyzeNow(); draw();
    } else if (down.lab) {
      const bp = L.parts[down.lab.id];
      bp.lbl = [P.snap(down.start[0] + (px - down.px) / view.s, 0.5), P.snap(down.start[1] + (py - down.py) / view.s, 0.5)]; draw();
    } else if (down.part) {
      const bp = L.parts[down.part.id];
      bp.x = P.snap(down.start[0] + (px - down.px) / view.s, 1.27); bp.y = P.snap(down.start[1] + (py - down.py) / view.s, 1.27);
      analyzeNow(); draw();
    } else { view.ox += px - (down.lx ?? down.px); view.oy += py - (down.ly ?? down.py); down.lx = px; down.ly = py; draw(); }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    const d = down; if (!d) return;
    if (d.pinch) { if (!ptrs.size) down = null; return; }
    down = null;
    if (d.jend && d.moved) { const j = L.jumpers[d.jend.i]; change(`Jumper hole moved (${Math.hypot(j.x2 - j.x1, j.y2 - j.y1).toFixed(2)} mm long now).`); return; }
    if (d.jend && !d.moved && mode === 'move') { sel = { kind: 'jumper', i: d.jend.i, k: d.jend.k }; say(`Jumper hole ${d.jend.k + 1} selected: use the arrows to move it (tap the wire itself to move the whole jumper).`); renderPanel(); draw(); return; }
    if (d.jend && !d.moved && !jfirst) { sel = { kind: 'jumper', i: d.jend.i, k: d.jend.k }; say('That is a jumper hole: drag it to move it, or tap empty board for a new jumper.'); renderPanel(); draw(); return; }
    if (d.tr && d.moved && d.tr.res) { sel = { kind: 'trace', i: d.tr.i, ...tidyTrace(d.tr.i, d.tr.res.moved) }; change('Trace reshaped. Use the arrows for fine tuning.'); return; }
    if (d.tr && !d.moved) { sel = { kind: 'trace', i: d.tr.i, ...d.tr.part }; renderPanel(); draw(); return; }
    if (d.lab && d.moved) { sel = { kind: 'part', id: d.lab.id }; change(`${d.lab.name} label moved.`); return; }
    if (d.lab) { sel = { kind: 'part', id: d.lab.id }; renderPanel(); draw(); return; }
    if (d.part && d.moved) { change(`${d.part.name} moved. ⚡ Autoroute again to redo the traces.`); return; }
    if (d.moved) return;
    tap(d.x, d.y);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); down = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = pos(e); zoomAt(Math.exp(-e.deltaY * 0.0015), px, py); draw(); }, { passive: false });

  function tap(x, y) {
    if (mode === 'jumper') {
      const pd = padAt(x, y), onPd = pd && pd.jumper == null && Math.hypot(pd.x - x, pd.y - y) < Math.min(pd.w, pd.h) / 2;
      const pt = onPd ? [pd.x, pd.y] : [P.snap(x, 0.1), P.snap(y, 0.1)].map(v => Math.round(v * 1000) / 1000);
      if (!jfirst) { jfirst = pt; say('First hole placed. Tap where the second hole goes (tap the first hole again to cancel).'); draw(); return; }
      const len = Math.hypot(pt[0] - jfirst[0], pt[1] - jfirst[1]);
      if (len < 0.5) { jfirst = null; say('Jumper cancelled.'); draw(); return; }
      if (len < 2.5) return say('Too short: the second hole must be at least 2.54 mm (one hole) away.');
      L.jumpers = L.jumpers ?? []; L.jumpers.push({ x1: jfirst[0], y1: jfirst[1], x2: pt[0], y2: pt[1], auto: false });
      jfirst = null; change(`Jumper added (${len.toFixed(2)} mm). Tap for the next one, or ✏ Route traces to its two holes.`); return;
    }
    if (mode === 'route') {
      const pd = padAt(x, y);
      if (!route) {
        if (!pd) return say('Start on a pad (copper dot).');
        route = { net: pd.net, pts: [[pd.x, pd.y]], w: routeW || L.rules.trace, from: pd }; routeBar.hidden = false; jumpBtn.classList.remove('on');
        say(`Routing ${netName(pd.net)}: tap to bend, tap a ${netName(pd.net)} pad to finish, ⤴ Jumper to hop over a trace.`); draw(); return;
      }
      if (route.jump) {
        const last = route.pts[route.pts.length - 1];
        if (pd && pd.net >= 0 && route.net >= 0 && pd.net !== route.net) return say(`That pad is on ${netName(pd.net)}, this trace is ${netName(route.net)}.`);
        const end = pd ? [pd.x, pd.y] : routePoint(x, y);
        const len = Math.hypot(end[0] - last[0], end[1] - last[1]);
        if (len < 2.5) return say('Jumper too short: land it at least 2.54 mm away (one hole).');
        // the trace so far ends at the jumper's first hole
        const pts = cleanPath(route.pts);
        if (pts.length >= 2) L.traces.push({ w: route.w, pts, auto: false });
        L.jumpers = L.jumpers ?? []; L.jumpers.push({ x1: last[0], y1: last[1], x2: end[0], y2: end[1], auto: false });
        jumpBtn.classList.remove('on');
        if (pd) { route = null; routeBar.hidden = true; change(`Jumper added (${len.toFixed(2)} mm) and connected to the pad.`); return; }
        route = { ...route, pts: [end], jump: false, from: null };
        change(`Jumper added (${len.toFixed(2)} mm). Keep routing from its end, or ✓ Finish here.`); routeBar.hidden = false; return;
      }
      if (pd && pd !== route.from) {
        if (pd.net >= 0 && route.net >= 0 && pd.net !== route.net) return say(`That pad is on ${netName(pd.net)}, this trace is ${netName(route.net)}. Pick a ${netName(route.net)} pad.`);
        finishRoute(pd); return;
      }
      const ti = traceAt(x, y);
      if (ti >= 0 && traceNet(ti) === route.net && route.pts.length > 1) { route.pts.push(routePoint(x, y)); finishRoute(null); return; }
      route.pts.push(routePoint(x, y)); draw(); return;
    }
    if (mode === 'delete') {
      const ti = traceAt(x, y); if (ti >= 0) { L.traces.splice(ti, 1); sel = null; change('Trace deleted.'); return; }
      const ji = jumperAt(x, y); if (ji >= 0) { L.jumpers.splice(ji, 1); sel = null; change('Jumper deleted.'); return; }
      say('Nothing to delete there. Parts are deleted in the schematic.'); return;
    }
    // move mode: select
    const ji = jumperAt(x, y), ti = traceAt(x, y), p = partAt(x, y), pd = padAt(x, y);
    sel = pd && !p ? { kind: 'pad', pad: pd } : p ? { kind: 'part', id: p.id } : ti >= 0 ? { kind: 'trace', i: ti, ...tracePart(ti, x, y) } : ji >= 0 ? { kind: 'jumper', i: ji } : null;
    if (pd && p) sel.pad = pd;
    renderPanel(); draw();
  }

  // ---------- panel ----------
  function numIn(label, value, unit, onSet, hint) {
    const inp = el('input', { class: 'num', value: String(value), autocomplete: 'off', inputmode: 'decimal' });
    inp.addEventListener('change', () => { const v = parse(inp.value); if (v == null || !(v >= 0)) { inp.classList.add('badv'); return; } inp.classList.remove('badv'); onSet(v); });
    return el('label', { class: 'field' }, el('span', { class: 'lab', text: label + (hint ? ` · ${hint}` : '') }), el('span', { class: 'box' }, inp, el('span', { class: 'unit', text: unit })));
  }
  function sel2(label, value, options, onSet) {
    const s = el('select', { class: 'sel' }, options.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = value; s.addEventListener('change', () => onSet(s.value));
    return el('label', { class: 'field' }, el('span', { class: 'lab', text: label }), s);
  }
  const grid = (...k) => el('div', { class: 'fields' }, ...k);
  function renderPanel() {
    syncFm();
    if (!L) return;
    syncNudge();
    panel.innerHTML = '';
    const c = api.getC();
    if (sel?.kind === 'part' && !L.parts[sel.id]) sel = null;
    // selection
    if (sel?.kind === 'part') {
      const p = c.parts.find(q => q.id === sel.id), bp = L.parts[p.id], f = P.footprintOf(p, bp);
      const nets = an.nl.pinNet.get(p.id);
      panel.append(el('div', { class: 'sp-head' }, el('b', { text: `${p.name} · ${p.type === 'R' ? 'resistor' : (p.props.model ?? '')}` })),
        grid(sel2('Footprint', f.key, P.fpChoices(p).map(k => [k, P.FOOTPRINTS[k].label]), v => { bp.fp = v; change(`${p.name}: ${P.FOOTPRINTS[v].label}.`); }),
          ...(f.pitch ? [sel2('Lead spacing (hole to hole)', String(f.pitch), P.SPACINGS[f.key].map(v => [String(v), `${v} mm (${Math.round(v / 2.54)} holes)` + (Math.abs(v - (P.FOOTPRINTS[f.key].make({ order: [0, 1, 2] }).pads.reduce((a, q) => Math.abs(q.x) * 2, 0))) < 0.01 ? ' · normal' : '')]), v => { bp.pitch = +v; change(`${p.name} legs ${v} mm apart. ⚡ Autoroute again to use the space underneath.`); })] : []),
          ...(f.orderStr ? [sel2('Pin order (left → right, flat side / tab facing you)', f.orderStr, P.ORDERS[p.type].map(o => [o, [...o].join(' ')]), v => { bp.order = v; change(`${p.name} pin order ${v}.`); })] : [])),
        el('div', { class: 'pcb-pins' }, ...nets.map((n, i) => el('span', { class: 'pin', text: `${P.pinLabel(p, i)} → ${netName(n)}` }))),
        el('div', { class: 'row wrap' }, btn('↻ Rotate', () => rotateSel()), btn('🗑 Delete part', () => deleteSel()),
          el('label', { class: 'chk', title: '🧩 Auto place leaves a locked part where it is' }, Object.assign(el('input', { type: 'checkbox' }), { checked: !!bp.lock, onchange: (e) => { if (e.target.checked) bp.lock = true; else delete bp.lock; change(bp.lock ? `${p.name} 📌 locked: 🧩 Auto place leaves it here.` : `${p.name} unlocked.`); } }), ' 📌 Lock place')),
        note(f.orderStr ? 'Check the pin order in the datasheet: the same transistor name can come in different pin orders.' : ''));
    } else if (sel?.kind === 'trace') {
      const t = L.traces[sel.i];
      panel.append(el('div', { class: 'sp-head' }, el('b', { text: `Trace · ${netName(traceNet(sel.i))}${t.auto ? ' (autorouted)' : ''}` })),
        grid(sel2('Width', String(t.w), [[0.4, '0.4 mm (thin signal)'], [0.6, '0.6 mm (signal)'], [0.8, '0.8 mm'], [1.0, '1.0 mm (≈ 1.5 A)'], [1.5, '1.5 mm (≈ 2.5 A)'], [2.0, '2.0 mm (≈ 3.5 A)']].map(([v, s]) => [String(v), s]).concat(String(t.w) && ![0.4, 0.6, 0.8, 1, 1.5, 2].includes(t.w) ? [[String(t.w), `${t.w} mm`]] : []), v => { t.w = +v; t.auto = false; change('Width changed.'); })),
        el('div', { class: 'row wrap' }, btn('🗑 Delete trace', () => { L.traces.splice(sel.i, 1); sel = null; change('Trace deleted.'); })),
        note(`Selected: ${sel.pt != null ? 'a corner (white square)' : 'a segment (white line)'}. Drag a corner or a segment to reshape, or use the ◀ ▲ ▼ ▶ arrows (keyboard arrows too, Shift = 4 steps). Ends on a pad stay connected.`));
    } else if (sel?.kind === 'jumper') {
      const j = L.jumpers[sel.i];
      panel.append(el('div', { class: 'sp-head' }, el('b', { text: `Jumper wire · ${Math.hypot(j.x2 - j.x1, j.y2 - j.y1).toFixed(2)} mm` })),
        note('A short bare wire on the parts side, soldered into its two holes. It hops over traces on a single-sided board.'),
        el('div', { class: 'row wrap' }, btn('🗑 Delete jumper', () => { L.jumpers.splice(sel.i, 1); sel = null; change('Jumper deleted.'); })));
    } else if (sel?.kind === 'pad') panel.append(el('b', { text: `Pad · ${netName(sel.pad.net)}` }));
    // board + status
    const nRoutes = an.rats.length, shorts = an.shorts.length;
    const flags = [];
    flags.push(nRoutes ? ['warn', `${nRoutes} connection${nRoutes > 1 ? 's' : ''} not routed yet (yellow dashed lines).`] : ['ok', 'Every connection is routed.']);
    if (shorts) flags.push(['bad', `SHORT: ${an.shorts.map(s => s.nets.join(' + ')).join(', ')}.`]);
    for (const e of errs.filter(e => e.kind !== 'short').slice(0, 6)) flags.push(['bad', e.msg]);
    if (errs.length > 7) flags.push(['bad', `… and ${errs.length - 7} more (red circles).`]);
    panel.append(el('div', { class: 'flags' }, flags.map(([l, t]) => el('div', { class: 'flag ' + l, text: t }))));
    const R = L.rules;
    panel.append(el('details', { class: 'pcb-sec', open: !sel || undefined }, el('summary', { text: `Board ${L.w} × ${L.h} mm · rules` }),
      grid(numIn('Board width', L.w, 'mm', v => { L.w = Math.max(5, v); change(); W = 0; resize(); }), numIn('Board height', L.h, 'mm', v => { L.h = Math.max(5, v); change(); W = 0; resize(); }),
        numIn('Signal trace', R.trace, 'mm', v => { R.trace = Math.max(0.2, v); change(); }), numIn('Power trace (GND, supply)', R.power, 'mm', v => { R.power = Math.max(0.2, v); change(); }),
        numIn('Clearance', R.clear, 'mm', v => { R.clear = Math.max(0.1, v); change(); }, 'gap between nets')),
      el('div', { class: 'row wrap' }, btn('Fit board to parts', () => { P.fitBoard(api.getC(), 4); change('Board fitted around the parts (4 mm margin).'); W = 0; resize(); }),
        el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: R.jumpers !== false, onchange: (e) => { R.jumpers = e.target.checked; change(); } }), ' Autoroute may use jumper wires'),
        el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: R.bigPads !== false, onchange: (e) => { R.bigPads = e.target.checked; P.setBigPads(R.bigPads); change(R.bigPads ? 'Big pads ON: header pins get oval pads, lone pads 2.4 mm. Autoroute again.' : 'Big pads OFF: standard 1.8 mm pads.'); W = 0; resize(); } }), ' DIY big pads (oval, easier to solder)'))));
    // CAM
    const C = L.cam, w = vWidth(C);
    const camSec = el('details', { class: 'pcb-sec pcb-cam', open: showCam || undefined }, el('summary', { text: '🛠 G-code for CNC 3018 (GRBL)' }),
      note(`Single-sided: copper on the bottom. ${C.mirror ? 'G-code is mirrored left ↔ right: mill with the copper facing up, the board flipped from how you see it here.' : 'Not mirrored.'} X0 Y0 = lower-left corner of the copper blank, Z0 = touch the copper surface.`),
      el('div', { class: 'sub', text: `Isolation (V-bit) · cut width ${w.toFixed(3)} mm` }),
      grid(numIn('V-bit angle', C.vAngle, '°', v => setCam('vAngle', v)), numIn('Tip width', C.vTip, 'mm', v => setCam('vTip', v)), numIn('Depth', C.isoDepth, 'mm', v => setCam('isoDepth', v), 'copper is 0.035'),
        numIn('Passes', C.isoPasses, '', v => setCam('isoPasses', Math.max(1, Math.round(v)))), numIn('Overlap', C.isoOverlap * 100, '%', v => setCam('isoOverlap', Math.min(90, v) / 100)), numIn('Feed', C.isoFeed, 'mm/min', v => setCam('isoFeed', v)),
        numIn('Plunge feed', C.plunge, 'mm/min', v => setCam('plunge', v)), numIn('Spindle', C.rpm, 'S', v => setCam('rpm', Math.max(1, Math.min(1000, Math.round(v)))), 'Fox9ner 0–1000 (1000 = full)')),
      el('div', { class: 'sub', text: 'Drilling' }),
      grid(el('label', { class: 'field' }, el('span', { class: 'lab', text: 'Drill bits you have' }), Object.assign(el('input', { class: 'num wide', value: C.bits }), { onchange: (e) => setCam('bits', e.target.value) })),
        numIn('Drill depth', C.drillDepth, 'mm', v => setCam('drillDepth', v)), numIn('Drill feed', C.drillFeed, 'mm/min', v => setCam('drillFeed', v))),
      el('div', { class: 'sub', text: 'Cutout' }),
      grid(sel2('Board cutout', C.cutMode, [['mill', 'Mill the edge (end mill + tabs)'], ['perf', 'Perforate (row of drill holes)']], v => setCam('cutMode', v))),
      C.cutMode === 'perf' ? grid(numIn('Perforation bit', C.perfBit, 'mm', v => setCam('perfBit', Math.max(0.5, v))), numIn('Gap between holes', C.perfGap, 'mm', v => setCam('perfGap', Math.max(0.1, v)), 'smaller = easier to snap')) : null,
      grid(numIn('End mill', C.cutDia, 'mm', v => setCam('cutDia', v)), numIn('Board thickness', C.thick, 'mm', v => setCam('thick', v)), numIn('Cut depth', C.cutDepth, 'mm', v => setCam('cutDepth', v)),
        numIn('Step down', C.cutStep, 'mm', v => setCam('cutStep', v)), numIn('Cut feed', C.cutFeed, 'mm/min', v => setCam('cutFeed', v)), numIn('Tabs', C.tabs, '', v => setCam('tabs', Math.round(v))),
        numIn('Tab width', C.tabW, 'mm', v => setCam('tabW', v)), numIn('Tab height', C.tabH, 'mm', v => setCam('tabH', v)),
        numIn('Safe Z', C.zSafe, 'mm', v => setCam('zSafe', v)), numIn('Travel Z', C.zTravel, 'mm', v => setCam('zTravel', v))),
      el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: !!C.mirror, onchange: (e) => setCam('mirror', e.target.checked) }), ' Mirror for bottom copper (normal for single-sided)'),
      el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: !!C.spotMarks, onchange: (e) => setCam('spotMarks', e.target.checked) }), ' Drill marks: V-bit dimple at every hole centre (end of isolation)'),
      C.spotMarks ? grid(numIn('Drill mark depth', C.spotDepth, 'mm', v => setCam('spotDepth', Math.min(1, Math.max(0.05, Math.abs(v)))), '0.2 = small dimple')) : null,
      el('div', { class: 'row wrap' }, btn('🛠 Make G-code', () => { showCam = true; makeCam(); renderPanel(); }), btn(showCam ? 'Hide toolpaths' : 'Show toolpaths', () => { showCam = !showCam; if (showCam && !cam) makeCam(); renderPanel(); draw(); })));
    if (cam) {
      const st = cam.stats, total = st.iso.minutes + st.drill.minutes + st.cut.minutes;
      const name = (c.title ?? 'board').replace(/[^\w.-]+/g, '_');
      camSec.append(el('div', { class: 'readouts' },
        ...[['Isolation', `${cam.iso.loops.length} loops · ${Math.ceil(st.iso.minutes)} min`], ['Drilling', `${st.drill.holes} holes (${st.drill.bits.join(', ')} mm) · ${Math.ceil(st.drill.minutes)} min`], ['Cutout', `${st.cut.mode === 'perf' ? `${st.cut.holes} perforation holes` : `${st.cut.passes} passes`} · ${Math.ceil(st.cut.minutes)} min`], ['Total', `≈ ${Math.ceil(total)} min`]]
          .map(([l, v], k) => el('div', { class: 'ro' + (k === 3 ? ' hi' : '') }, el('span', { class: 'rl', text: l }), el('span', { class: 'rv', text: v })))),
        cam.warn.length ? el('div', { class: 'flags' }, cam.warn.map(([l, t]) => el('div', { class: 'flag ' + l, text: t }))) : el('div', { class: 'flag ok', text: 'Every gap is wider than the V-bit cut.' }),
        el('div', { class: 'row wrap' },
          btn('⬇ 1 isolation.nc', () => api.shareFile(`${name}-1-isolation.nc`, st.iso.gcode, 'text/plain')),
          ...st.drill.files.map((f, k, all) => { const tag = all.length > 1 ? `2${'abcdefgh'[k] ?? k} drill ${f.bit}mm` : '2 drill'; return btn(`⬇ ${tag}.nc`, () => api.shareFile(`${name}-${tag.replace(/ /g, '-')}.nc`, f.gcode, 'text/plain')); }),
          btn('⬇ 3 cutout.nc', () => api.shareFile(`${name}-3-cutout.nc`, st.cut.gcode, 'text/plain')),
          btn('⬇ copper.pdf (print 1:1)', () => api.shareFile(`${name}-copper.pdf`, copperPdf(api.getC(), undefined, name), 'application/pdf')),
          btn('⬇ copper.svg', () => api.shareFile(`${name}-copper.svg`, copperSvg(api.getC()), 'image/svg+xml'))),
        el('div', { class: 'row wrap nova-send' },
          btn('📤 Send to Nova', () => sendToNova([[`${name}-1-isolation.nc`, st.iso.gcode], [`${name}-2-drill.nc`, st.drill.gcode], [`${name}-3-cutout.nc`, st.cut.gcode]])),
          el('input', { type: 'text', class: 'nova-host', value: store.get('novaHost', 'fox9ner.local'), title: 'Fox9ner Nova ESP32: fox9ner.local, or its IP (Android)', spellcheck: false,
            onchange: (e) => store.set('novaHost', e.target.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'fox9ner.local') })),

        el('pre', { class: 'steps', text: [
          'On the 3018:',
          '1. Tape / clamp the copper blank flat. Home or jog to its lower-left corner → set X0 Y0.',
          '2. V-bit in. Touch Z to the copper (paper method or probe) → Z0. Run 1-isolation.nc.',
          ...(st.drill.files.length > 1
            ? st.drill.files.map((f, k) => `3${'abcdefgh'[k] ?? k}. Drill bit ${f.bit} mm in, Z0 again (keep X0 Y0), run 2${'abcdefgh'[k] ?? k}-drill-${f.bit}mm.nc (${f.holes} holes).`)
            : [`3. Drill bit ${st.drill.bits[0] ?? ''} mm in, Z0 again (keep X0 Y0), run 2-drill.nc.`]),
          C.cutMode === 'perf' ? `4. ${C.perfBit} mm drill bit in, Z0 again (keep X0 Y0), run 3-cutout.nc. Snap the board out along the holes, file the edge.` : `4. ${C.cutDia} mm end mill in, Z0 again (keep X0 Y0), run 3-cutout.nc. Snap the tabs, sand the edges.`,
          'Tip: a probe or auto-level (later) helps a lot when the blank is not perfectly flat.'].join('\n') }));
    }
    // Gerber + drill (same kind of files Proteus makes) for the Fox9ner web app
    {
      const nm = (c.title ?? 'board').replace(/[^\w.-]+/g, '_');
      const holes = an.pads.filter(p => p.drill > 0).length;
      panel.append(el('details', { class: 'pcb-sec', open: true }, el('summary', { text: '📤 Gerber + drill (for the Fox9ner web app)' }),
        note(`Same format as Proteus 9 "CADCAM" Gerber (mm, 4.5, signed coordinates, round pads, drill as a Gerber): bottom copper, drill (${holes} holes) and board outline. Seen from the top, not mirrored, origin = lower-left corner. Load them in the Fox9ner web app like your Proteus files.`),
        an.rats.length || an.shorts.length ? el('div', { class: 'flag ' + (an.shorts.length ? 'bad' : 'warn'), text: an.shorts.length ? 'The board has a SHORT: fix it before cutting.' : `${an.rats.length} connection(s) not routed yet: the files would miss them.` }) : null,
        el('div', { class: 'row wrap' },
          btn('⬇ Bottom Copper', () => api.shareFile(`${nm} - CADCAM Bottom Copper.GBR`, gerberSet(api.getC()).copper, 'text/plain')),
          btn('⬇ Drill', () => api.shareFile(`${nm} - CADCAM Drill TOP-BOT Plated.GBR`, gerberSet(api.getC()).drill, 'text/plain')),
          btn('⬇ Board Outline', () => api.shareFile(`${nm} - CADCAM Board Outline.GBR`, gerberSet(api.getC()).outline, 'text/plain')),
          btn('⬇ Excellon .DRL (other tools)', () => api.shareFile(`${nm}-Drill.DRL`, excellon(api.getC()), 'text/plain'))),
        note('Check the fit before cutting: print this PDF at 100 % (Actual size), lay your ESP32 / UNO / headers on it. Every pin should land on a pad. The 50 mm ruler on the sheet proves the print scale.'),
        el('div', { class: 'row wrap' }, btn('🖨 Copper PDF 1:1 (print check)', () => api.shareFile(`${nm}-copper-1to1.pdf`, copperPdf(api.getC(), undefined, nm), 'application/pdf')))));
      panel.append(el('details', { class: 'pcb-sec', open: true }, el('summary', { text: '🧩 Assembly print + parts list' }),
        note('Print it 1:1 and keep it next to you while soldering: each part\'s outline, name and value sits exactly where it goes on the board (seen from the parts side). The parts list says what to buy.'),
        el('div', { class: 'row wrap' },
          btn('🖨 Assembly + parts list (PDF)', () => api.shareFile(`${nm}-assembly.pdf`, assemblyPdf(api.getC(), nm), 'application/pdf')),
          btn('⬇ Parts list (CSV / Excel)', () => api.shareFile(`${nm}-parts.csv`, bomCsv(api.getC()), 'text/csv')))));
    }
    panel.append(camSec);
  }
  function setCam(k, v) { L.cam[k] = v; cam = null; api.commit(true); if (showCam) makeCam(); renderPanel(); draw(); }
  function makeCam() {
    const t0 = performance.now();
    try { cam = camAll(api.getC()); say(`G-code ready in ${Math.round(performance.now() - t0)} ms. Blue = V-bit path, red = drill, purple = cutout (dots = tabs).`); }
    catch (e) { cam = null; say('G-code failed: ' + e.message); }
    draw();
  }

  globalThis.__pcbDbg = { view, an: () => an, L: () => L };     // for automated tests
  new ResizeObserver(() => { if (!box.hidden) resize(); }).observe(wrap);
  return {
    el: box,
    show() { box.hidden = false; const had = load(); sel = null; route = null; if (!had) setTimeout(() => say('Board made from your schematic. Drag parts into place, then ⚡ Autoroute.'), 0); else setMode(mode); W = 0; resize(); renderPanel(); },
    hide() { exitFull(); box.hidden = true; },
    refresh() {
      if (box.hidden) return; load(); cam = null;
      if (sel?.kind === 'trace' && !L.traces[sel.i]) sel = null; if (sel?.kind === 'jumper' && !L.jumpers[sel.i]) sel = null; if (sel?.kind === 'part' && !L.parts[sel.id]) sel = null; if (sel?.kind === 'pad') sel = null;
      renderPanel(); draw();
    },
  };
}
