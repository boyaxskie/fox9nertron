// PCB view (inside the Schematic tab): place footprints, autoroute / hand-route a single-sided board, make G-code for a CNC 3018.
import { el, store, note } from '../ui.js';
import { parse } from '../num.js';
import { rotPt } from '../sch-core.js';
import * as P from '../pcb-core.js';
import { autoroute, cleanPath } from '../pcb-route.js';
import { camAll, vWidth, copperSvg } from '../pcb-cam.js';
import { gerberCopper, gerberOutline, excellon } from '../pcb-gerber.js';

const COL = { bg: '#0F1317', board: '#16352A', edge: '#6FAF8A', cu: '#D9894A', cuHi: '#FFC08A', hole: '#0F1317', silk: '#E8EDF2', rat: '#FFE16B', jump: '#4FC3F7', bad: '#FF6B6B', sel: '#4FC3F7', iso: '#7FDBFF', drill: '#FF6B6B', cut: '#C084FC', dim: '#7E8A97' };

export function pcbView(api) {
  // api: { getC, commit(push), undo, redo, say, shareFile, toSchematic }
  let L = null, an = null, errs = [], cam = null, showCam = false;
  let mode = 'move', sel = null, route = null, hover = null;
  const view = { ox: 20, oy: 20, s: 8 };
  const btn = (t, f, cls = '') => el('button', { class: 'sb ' + cls, type: 'button', text: t, onclick: f });
  const modeBtns = { move: btn('✋ Move', () => setMode('move')), route: btn('✏ Route', () => setMode('route')), delete: btn('🗑 Delete', () => setMode('delete')) };
  const camBtn = btn('🛠 G-code', () => { showCam = true; makeCam(); renderPanel(); panel.querySelector('.pcb-cam')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const top = el('div', { class: 'sch-tools' },
    btn('⚡ Schematic', () => api.toSchematic(), 'run'), modeBtns.move, modeBtns.route, modeBtns.delete,
    btn('↻', () => rotateSel(), 'icon'), btn('↶', () => { api.undo(); }, 'icon'), btn('↷', () => { api.redo(); }, 'icon'), btn('Fit', () => { fit(); draw(); }),
    btn('⚡ Autoroute', () => doAutoroute()), btn('✖ Clear traces', () => { L.traces = []; L.jumpers = []; cam = null; change('All traces removed.'); }), camBtn);
  const canvas = el('canvas', { class: 'sch-canvas' });
  const wrap = el('div', { class: 'sch-wrap pcb-wrap' }, canvas);
  const status = el('div', { class: 'sch-status' });
  const routeBar = el('div', { class: 'pcb-routebar', hidden: true }, btn('✓ Finish here', () => finishRoute(null)), btn('↶ Back one', () => { if (route?.pts.length > 1) { route.pts.pop(); draw(); } }), btn('✖ Cancel', () => { route = null; routeBar.hidden = true; draw(); }));
  const panel = el('div', { class: 'sch-panel' });
  const box = el('div', { class: 'pcb-box', hidden: true }, top, wrap, routeBar, status, panel);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  const say = (t) => { status.textContent = t; };

  // ---------- data ----------
  function load() {
    const c = api.getC();
    const had = !!c.pcb;
    L = P.syncLayout(c);
    analyzeNow();
    return had;
  }
  function analyzeNow() { const c = api.getC(); an = P.analyze(c); errs = P.drc(c, an); }
  function change(msg, push = true) { cam = null; api.commit(push); analyzeNow(); renderPanel(); draw(); if (msg) say(msg); }
  function setMode(m) {
    mode = m; route = null; routeBar.hidden = true;
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('on', k === m);
    say({ move: 'Drag parts to place them. Tap a part for its footprint, tap empty board to pan. Then ⚡ Autoroute.', route: 'Tap a pad to start a trace, tap to add bends, tap a pad of the same net to finish.', delete: 'Tap a trace or a jumper wire to delete it.' }[m]);
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
    wrap.style.height = Math.round(Math.max(260, Math.min(760, innerHeight * 0.64, ww * asp + 30))) + 'px';
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
    L.traces.forEach((t, i) => {
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
    // silkscreen: part outlines + names
    ctx.strokeStyle = 'rgba(232,237,242,0.75)'; ctx.lineWidth = 1.2;
    for (const p of parts()) {
      const bp = L.parts[p.id], f = P.footprintOf(p, bp);
      for (const b of f.body) { ctx.beginPath(); b.forEach((q, k) => { const [x, y] = rotPt(q, bp.rot); k ? ctx.lineTo(sx(bp.x + x), sy(bp.y + y)) : ctx.moveTo(sx(bp.x + x), sy(bp.y + y)); }); ctx.stroke(); }
      if (sel?.kind === 'part' && sel.id === p.id) { const e = P.partExtents(p, bp); ctx.save(); ctx.strokeStyle = COL.sel; ctx.setLineDash([5, 4]); ctx.strokeRect(sx(e[0]) - 3, sy(e[1]) - 3, (e[2] - e[0]) * view.s + 6, (e[3] - e[1]) * view.s + 6); ctx.restore(); }
      const e = P.partExtents(p, bp);
      ctx.fillStyle = COL.silk; ctx.font = `600 ${Math.max(9, Math.min(13, view.s * 1.3))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, sx((e[0] + e[2]) / 2), sy(e[1]) - 2);
    }
    // pad labels when zoomed in
    if (view.s >= 9) {
      ctx.font = `600 ${Math.min(11, view.s * 0.8)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1B1B1B';
      for (const pd of an.pads) if (pd.part && pd.pin >= 0) ctx.fillText(P.pinLabel(pd.part, pd.pin), sx(pd.x), sy(pd.y) + (pd.drill ? Math.max(pd.w, pd.h) / 2 * view.s + 6 : 0));
    }
    // jumper wires (on the parts side)
    for (const [ji, j] of (L.jumpers ?? []).entries()) {
      ctx.strokeStyle = sel?.kind === 'jumper' && sel.i === ji ? COL.sel : COL.jump; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx(j.x1), sy(j.y1)); ctx.lineTo(sx(j.x2), sy(j.y2)); ctx.stroke();
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
      const last = cam.cut[cam.cut.length - 1];
      ctx.beginPath(); last.pts.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.stroke();
      ctx.fillStyle = COL.cut; for (const [x, y, z] of last.pts) if (z > last.z + 1e-6) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 2.5, 0, 7); ctx.fill(); }
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
      ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // origin marker (machine X0 Y0 = lower-left, or lower-right before mirroring)
    ctx.fillStyle = '#3DDC84'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${L.w} × ${L.h} mm · seen from the parts side (copper underneath)`, sx(0), sy(L.h) + 4);
  }

  // ---------- actions ----------
  function rotateSel() {
    if (sel?.kind !== 'part') return say('Select a part first (✋ Move, tap it).');
    const bp = L.parts[sel.id]; bp.rot = (bp.rot + 1) & 3; change('Rotated. Run ⚡ Autoroute again if traces no longer reach.');
  }
  function doAutoroute() {
    say('Routing…');
    setTimeout(() => {
      const t0 = performance.now();
      const r = autoroute(api.getC(), { keepManual: true });
      const ms = Math.round(performance.now() - t0);
      change(r.failed.length ? `Routed ${r.routed}, ${r.failed.length} could not fit (yellow lines). Move parts apart, make the board bigger or route them by hand.` : `All connections routed in ${ms} ms${r.jumpers ? ` with ${r.jumpers} jumper wire${r.jumpers > 1 ? 's' : ''} (blue: a wire on the parts side)` : ''}.`);
    }, 30);
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
    L.traces.push({ w: L.rules.trace, pts, auto: false });
    change('Trace added.');
  }

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
    if (mode === 'move') { const p = partAt(x, y); if (p) { const bp = L.parts[p.id]; down.part = p; down.start = [bp.x, bp.y]; } }
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = pos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
    if (!down) { if (route) { const pd = padAt(wx(px), wy(py)); hover = { pt: pd ? [pd.x, pd.y] : routePoint(wx(px), wy(py)), net: route.net }; draw(); } return; }
    if (down.pinch && ptrs.size === 2) {
      const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), m = mid();
      view.ox += m[0] - down.last[0]; view.oy += m[1] - down.last[1]; zoomAt(d / pinch, m[0], m[1]); pinch = d; down.last = m; draw(); return;
    }
    if (Math.hypot(px - down.px, py - down.py) > 6) down.moved = true;
    if (!down.moved) return;
    if (down.part) {
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
    if (d.part && d.moved) { change(`${d.part.name} moved. ⚡ Autoroute again to redo the traces.`); return; }
    if (d.moved) return;
    tap(d.x, d.y);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); down = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = pos(e); zoomAt(Math.exp(-e.deltaY * 0.0015), px, py); draw(); }, { passive: false });

  function tap(x, y) {
    if (mode === 'route') {
      const pd = padAt(x, y);
      if (!route) {
        if (!pd) return say('Start on a pad (copper dot).');
        route = { net: pd.net, pts: [[pd.x, pd.y]], w: L.rules.trace, from: pd }; routeBar.hidden = false;
        say(`Routing ${netName(pd.net)}: tap to bend, tap a ${netName(pd.net)} pad to finish.`); draw(); return;
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
    sel = pd && !p ? { kind: 'pad', pad: pd } : p ? { kind: 'part', id: p.id } : ti >= 0 ? { kind: 'trace', i: ti } : ji >= 0 ? { kind: 'jumper', i: ji } : null;
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
    if (!L) return;
    panel.innerHTML = '';
    const c = api.getC();
    if (sel?.kind === 'part' && !L.parts[sel.id]) sel = null;
    // selection
    if (sel?.kind === 'part') {
      const p = c.parts.find(q => q.id === sel.id), bp = L.parts[p.id], f = P.footprintOf(p, bp);
      const nets = an.nl.pinNet.get(p.id);
      panel.append(el('div', { class: 'sp-head' }, el('b', { text: `${p.name} · ${p.type === 'R' ? 'resistor' : (p.props.model ?? '')}` })),
        grid(sel2('Footprint', f.key, P.fpChoices(p).map(k => [k, P.FOOTPRINTS[k].label]), v => { bp.fp = v; change(`${p.name}: ${P.FOOTPRINTS[v].label}.`); }),
          ...(f.orderStr ? [sel2('Pin order (left → right, flat side / tab facing you)', f.orderStr, P.ORDERS[p.type].map(o => [o, [...o].join(' ')]), v => { bp.order = v; change(`${p.name} pin order ${v}.`); })] : [])),
        el('div', { class: 'pcb-pins' }, ...nets.map((n, i) => el('span', { class: 'pin', text: `${P.pinLabel(p, i)} → ${netName(n)}` }))),
        el('div', { class: 'row wrap' }, btn('↻ Rotate', () => rotateSel())),
        note(f.orderStr ? 'Check the pin order in the datasheet: the same transistor name can come in different pin orders.' : ''));
    } else if (sel?.kind === 'trace') {
      const t = L.traces[sel.i];
      panel.append(el('div', { class: 'sp-head' }, el('b', { text: `Trace · ${netName(traceNet(sel.i))}${t.auto ? ' (autorouted)' : ''}` })),
        grid(sel2('Width', String(t.w), [[0.4, '0.4 mm (thin signal)'], [0.6, '0.6 mm (signal)'], [0.8, '0.8 mm'], [1.0, '1.0 mm (≈ 1.5 A)'], [1.5, '1.5 mm (≈ 2.5 A)'], [2.0, '2.0 mm (≈ 3.5 A)']].map(([v, s]) => [String(v), s]).concat(String(t.w) && ![0.4, 0.6, 0.8, 1, 1.5, 2].includes(t.w) ? [[String(t.w), `${t.w} mm`]] : []), v => { t.w = +v; t.auto = false; change('Width changed.'); })),
        el('div', { class: 'row wrap' }, btn('🗑 Delete trace', () => { L.traces.splice(sel.i, 1); sel = null; change('Trace deleted.'); })));
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
        el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: R.jumpers !== false, onchange: (e) => { R.jumpers = e.target.checked; change(); } }), ' Autoroute may use jumper wires'))));
    // CAM
    const C = L.cam, w = vWidth(C);
    const camSec = el('details', { class: 'pcb-sec pcb-cam', open: showCam || undefined }, el('summary', { text: '🛠 G-code for CNC 3018 (GRBL)' }),
      note(`Single-sided: copper on the bottom. ${C.mirror ? 'G-code is mirrored left ↔ right: mill with the copper facing up, the board flipped from how you see it here.' : 'Not mirrored.'} X0 Y0 = lower-left corner of the copper blank, Z0 = touch the copper surface.`),
      el('div', { class: 'sub', text: `Isolation (V-bit) · cut width ${w.toFixed(3)} mm` }),
      grid(numIn('V-bit angle', C.vAngle, '°', v => setCam('vAngle', v)), numIn('Tip width', C.vTip, 'mm', v => setCam('vTip', v)), numIn('Depth', C.isoDepth, 'mm', v => setCam('isoDepth', v), 'copper is 0.035'),
        numIn('Passes', C.isoPasses, '', v => setCam('isoPasses', Math.max(1, Math.round(v)))), numIn('Overlap', C.isoOverlap * 100, '%', v => setCam('isoOverlap', Math.min(90, v) / 100)), numIn('Feed', C.isoFeed, 'mm/min', v => setCam('isoFeed', v)),
        numIn('Plunge feed', C.plunge, 'mm/min', v => setCam('plunge', v)), numIn('Spindle', C.rpm, 'rpm', v => setCam('rpm', v), 'S value')),
      el('div', { class: 'sub', text: 'Drilling' }),
      grid(el('label', { class: 'field' }, el('span', { class: 'lab', text: 'Drill bits you have' }), Object.assign(el('input', { class: 'num wide', value: C.bits }), { onchange: (e) => setCam('bits', e.target.value) })),
        numIn('Drill depth', C.drillDepth, 'mm', v => setCam('drillDepth', v)), numIn('Drill feed', C.drillFeed, 'mm/min', v => setCam('drillFeed', v))),
      el('div', { class: 'sub', text: 'Cutout' }),
      grid(numIn('End mill', C.cutDia, 'mm', v => setCam('cutDia', v)), numIn('Board thickness', C.thick, 'mm', v => setCam('thick', v)), numIn('Cut depth', C.cutDepth, 'mm', v => setCam('cutDepth', v)),
        numIn('Step down', C.cutStep, 'mm', v => setCam('cutStep', v)), numIn('Cut feed', C.cutFeed, 'mm/min', v => setCam('cutFeed', v)), numIn('Tabs', C.tabs, '', v => setCam('tabs', Math.round(v))),
        numIn('Tab width', C.tabW, 'mm', v => setCam('tabW', v)), numIn('Tab height', C.tabH, 'mm', v => setCam('tabH', v)),
        numIn('Safe Z', C.zSafe, 'mm', v => setCam('zSafe', v)), numIn('Travel Z', C.zTravel, 'mm', v => setCam('zTravel', v))),
      el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: !!C.mirror, onchange: (e) => setCam('mirror', e.target.checked) }), ' Mirror for bottom copper (normal for single-sided)'),
      el('div', { class: 'row wrap' }, btn('🛠 Make G-code', () => { showCam = true; makeCam(); renderPanel(); }), btn(showCam ? 'Hide toolpaths' : 'Show toolpaths', () => { showCam = !showCam; if (showCam && !cam) makeCam(); renderPanel(); draw(); })));
    if (cam) {
      const st = cam.stats, total = st.iso.minutes + st.drill.minutes + st.cut.minutes;
      const name = (c.title ?? 'board').replace(/[^\w.-]+/g, '_');
      camSec.append(el('div', { class: 'readouts' },
        ...[['Isolation', `${cam.iso.loops.length} loops · ${Math.ceil(st.iso.minutes)} min`], ['Drilling', `${st.drill.holes} holes (${st.drill.bits.join(', ')} mm) · ${Math.ceil(st.drill.minutes)} min`], ['Cutout', `${st.cut.passes} passes · ${Math.ceil(st.cut.minutes)} min`], ['Total', `≈ ${Math.ceil(total)} min`]]
          .map(([l, v], k) => el('div', { class: 'ro' + (k === 3 ? ' hi' : '') }, el('span', { class: 'rl', text: l }), el('span', { class: 'rv', text: v })))),
        cam.warn.length ? el('div', { class: 'flags' }, cam.warn.map(([l, t]) => el('div', { class: 'flag ' + l, text: t }))) : el('div', { class: 'flag ok', text: 'Every gap is wider than the V-bit cut.' }),
        el('div', { class: 'row wrap' },
          btn('⬇ 1 isolation.nc', () => api.shareFile(`${name}-1-isolation.nc`, st.iso.gcode, 'text/plain')),
          btn('⬇ 2 drill.nc', () => api.shareFile(`${name}-2-drill.nc`, st.drill.gcode, 'text/plain')),
          btn('⬇ 3 cutout.nc', () => api.shareFile(`${name}-3-cutout.nc`, st.cut.gcode, 'text/plain')),
          btn('⬇ copper.svg (toner)', () => api.shareFile(`${name}-copper.svg`, copperSvg(api.getC()), 'image/svg+xml'))),
        el('pre', { class: 'steps', text: [
          'On the 3018:',
          '1. Tape / clamp the copper blank flat. Home or jog to its lower-left corner → set X0 Y0.',
          '2. V-bit in. Touch Z to the copper (paper method or probe) → Z0. Run 1-isolation.nc.',
          `3. Drill bit ${st.drill.bits[0] ?? ''} mm in, Z0 again, run 2-drill.nc (it pauses for each bit change).`,
          `4. ${C.cutDia} mm end mill in, Z0 again, run 3-cutout.nc. Snap the tabs, sand the edges.`,
          'Tip: a probe or auto-level (later) helps a lot when the blank is not perfectly flat.'].join('\n') }));
    }
    // Gerber + drill (same kind of files Proteus makes) for the Fox9ner web app
    {
      const nm = (c.title ?? 'board').replace(/[^\w.-]+/g, '_');
      const holes = an.pads.filter(p => p.drill > 0).length;
      panel.append(el('details', { class: 'pcb-sec', open: true }, el('summary', { text: '📤 Gerber + drill (for the Fox9ner web app)' }),
        note(`Same files Proteus makes: bottom copper, board outline and drill (${holes} holes). Seen from the top, not mirrored, mm, origin = lower-left corner. Load them in the Fox9ner web app like your Proteus files.`),
        an.rats.length || an.shorts.length ? el('div', { class: 'flag ' + (an.shorts.length ? 'bad' : 'warn'), text: an.shorts.length ? 'The board has a SHORT: fix it before cutting.' : `${an.rats.length} connection(s) not routed yet: the files would miss them.` }) : null,
        el('div', { class: 'row wrap' },
          btn('⬇ Copper (.GBL)', () => api.shareFile(`${nm}-Bottom_Copper.GBL`, gerberCopper(api.getC()), 'text/plain')),
          btn('⬇ Drill (.DRL)', () => api.shareFile(`${nm}-Drill.DRL`, excellon(api.getC()), 'text/plain')),
          btn('⬇ Outline (.GKO)', () => api.shareFile(`${nm}-Board_Outline.GKO`, gerberOutline(api.getC()), 'text/plain')))));
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
    hide() { box.hidden = true; },
    refresh() {
      if (box.hidden) return; load(); cam = null;
      if (sel?.kind === 'trace' && !L.traces[sel.i]) sel = null; if (sel?.kind === 'jumper' && !L.jumpers[sel.i]) sel = null; if (sel?.kind === 'part' && !L.parts[sel.id]) sel = null; if (sel?.kind === 'pad') sel = null;
      renderPanel(); draw();
    },
  };
}
