// Fox9nertron: tabs, routing, help
import { el, store } from './ui.js';
import { ohmTab, dividerTab, powerTab } from './tabs/basic.js';
import { kirchhoffTab } from './tabs/kirchhoff.js';
import { rectifierTab } from './tabs/rectifier.js';
import { capacitorTab } from './tabs/capacitor.js';
import { inductorTab } from './tabs/inductor.js';
import { timingTab } from './tabs/timing.js';
import { partsTab } from './tabs/parts.js';
import { schematicTab } from './tabs/schematic.js';

export const VERSION = '1.4.0';
const TABS = [
  ['schematic', '⚡ Schematic', schematicTab], ['ohm', 'Ohm', ohmTab], ['divider', 'Divider', dividerTab], ['power', 'Power', powerTab], ['kirchhoff', 'Kirchhoff', kirchhoffTab],
  ['rectifier', 'Rectifier', rectifierTab], ['capacitor', 'Capacitor', capacitorTab], ['inductor', 'Inductor', inductorTab],
  ['timing', 'Timing / PWM', timingTab], ['parts', 'Parts', partsTab],
];

const nav = el('nav', { class: 'tabs', 'aria-label': 'Calculators' });
const main = el('main', { id: 'main' });
const built = new Map();

function show(id) {
  const t = TABS.find(x => x[0] === id) ?? TABS[0];
  for (const b of nav.children) { const on = b.dataset.id === t[0]; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  for (const [k, pane] of built) pane.hidden = k !== t[0];
  if (!built.has(t[0])) {
    const pane = el('div', { class: 'pane' });
    main.append(pane); built.set(t[0], pane);
    try { t[2](pane); } catch (e) { console.error(e); pane.append(el('p', { class: 'flag bad', text: 'This tab hit an error: ' + e.message })); }
  }
  store.set('tab', t[0]);
  document.title = `${t[1]} · Fox9nertron`;
}

function help() {
  const d = el('dialog', { class: 'dlg' },
    el('div', { class: 'help-head' }, el('img', { src: 'icons/icon-192.png', alt: '' }),
      el('div', {}, el('div', { class: 'h1', text: 'Fox9nertron' }), el('div', { class: 'h2', text: `Version ${VERSION} · by Fox9ner` }), el('div', { class: 'h3', text: 'Measure it. Solve it. Build it.' }))),
    el('div', { class: 'help-text', html: `
<p><b>Typing values</b>: <code>4k7</code> = 4700, <code>2M2</code> = 2.2 M, <code>4R7</code> = 4.7, <code>100n</code> = 100 nano, <code>10u</code> = 10 micro, <code>20m</code> = 20 milli (small m = milli, big M = mega). Units are ignored: <code>12V</code>, <code>100nF</code>, <code>60Hz</code> all work. Math works too: <code>220*1.414</code>, <code>12-0.7</code>, <code>√2</code>.</p>
<p><b>Empty boxes</b> are calculated: the answer shows greyed inside the box and in the green result.</p>
<p><b>⚡ Schematic</b>: tap a part in the tray, tap the grid to place it. <b>↖ Select</b>: drag parts, tap one for its voltage, current and power. <b>↻</b> rotates (key R). <b>〰 Wire</b>: tap a yellow pin, then the next point; wires bend once (L-shape) and stop on a pin. Tap a switch to flip it, hold a push button. Wire colors show voltage (green +, grey 0 V, red −) and yellow dots show the current flowing. Pinch or mouse wheel to zoom, drag empty space to move. Projects: save, open, export, and save a PNG picture.</p>
<p><b>📈 Time simulation</b>: add a Capacitor, Inductor, Signal generator or Scope and ▶ Run moves through time. The oscilloscope under the drawing shows CH1 (yellow) and CH2 (blue) against the scope's bottom pin (COM, usually ground), with p-p, average and frequency. Set time/div (or Auto time), speed (slow motion), ⏸ pause and ⟲ t = 0 to start again with empty capacitors. Examples marked 📈 show RC charging, PWM, the coil flyback spike, rectifier ripple and the PC817 optocoupler.</p>
<p><b>🔌 Active parts</b>: NPN / PNP transistors (2N2222, BC547, TIP120…), N / P MOSFETs (IRLZ44N, AO3400, IRF540N…), zener diodes, op-amps (LM358, MCP6002…), regulators (7805, AMS1117, LM317) and relays. Tap one to see if it is OFF, fully ON or only partly on (hot), its heat, and spikes over its rating. Try the examples: relay driver, MOSFET solenoid, 7805, LM317, zener and the op-amp comparator.</p>
<p><b>★ Your own parts</b>: part not in the list? Tap the part, open its Type list, pick <b>+ New part from datasheet…</b> and type the main values (typical column). It is saved and shows as ★ in the list from then on; ✎ Edit or delete it the same way. Projects carry their ★ parts, so a shared file opens right on another phone.</p>
<p><b>Kirchhoff</b>: number every junction (0 = ground). Each part goes From one node To another. Example: a 9 V battery with + on node 1 and − on ground is <i>V src, From 1, To 0, 9</i>.</p>
<p><b>Colours</b>: green = safe, yellow = check it, red = it will fail or it's dangerous.</p>
<p><b>Install</b>: iPhone Safari → Share → Add to Home Screen. Android Chrome → menu → Install app. Works offline after that. Your inputs are remembered on this device.</p>
<p><b>Safety</b>: anything on 220 V mains can kill. Calculators give ideal numbers; real parts have tolerances (resistors 1–5 %, electrolytic capacitors −20 % … +20 %, AL values ±25 %). Leave margin and measure.</p>` }),
    el('form', { method: 'dialog', class: 'dlg-buttons' }, el('button', { class: 'btn primary', text: 'Close' })));
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

function start() {
  const header = el('header', { class: 'top' },
    el('div', { class: 'brand' }, el('img', { src: 'icons/icon-192.png', alt: '', class: 'logo' }), el('span', { class: 'name', text: 'Fox9nertron' }), el('span', { class: 'ver', text: 'v' + VERSION })),
    el('button', { class: 'btn ghost help', type: 'button', text: '? Help', onclick: help }));
  for (const [id, label] of TABS) nav.append(el('a', { href: '#' + id, class: 'tab', 'data-id': id, text: label }));
  document.getElementById('app').append(header, nav, main);
  const route = () => show(location.hash.slice(1) || store.get('tab', 'ohm'));
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
}
start();
