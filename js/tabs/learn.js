// Learn: how the example circuits are designed, step by step. "Open in Schematic" loads the circuit to play with.
import { el, store } from '../ui.js';
import * as S from '../sch-core.js';

// each article: id, title, example (or null), sections [[heading, html]]
const ARTICLES = [
  {
    id: 'preamp', title: 'Transistor audio preamp (common emitter)', example: 'preamp', tag: 'Amplifier',
    intro: 'One BC547 turns a 10 mV microphone signal into about 2 V. This is the classic textbook design: choose a few targets, and every part value falls out of simple Ohm\'s-law steps.',
    parts: [['B1', '9 V supply'], ['R1 / R2', '47 kΩ / 10 kΩ bias divider'], ['RC', '4.7 kΩ collector resistor'], ['RE', '1 kΩ emitter resistor'], ['CE', '100 µF emitter bypass'], ['CIN / COUT', '10 µF coupling capacitors'], ['LOAD', '10 kΩ (the next stage)']],
    steps: [
      ['1. Supply and resting point', 'Supply is <b>9 V</b>. The collector should rest near the <b>middle (≈ 4.5 V)</b> so the output can swing equally up and down before it clips.'],
      ['2. Collector current ≈ 1 mA', 'About 1 mA is a good low-noise working point for a BC547.<br><b>RC = 4.7 kΩ</b>: 1 mA × 4.7 kΩ ≈ 4.7 V drop → collector ≈ 9 − 4.7 = <b>4.3 V</b> (simulator: 4.8 V). ✔'],
      ['3. Emitter resistor = stability', '<b>RE = 1 kΩ</b> puts about <b>1 V</b> on the emitter (1 mA × 1 kΩ).<br>It works like negative feedback for DC: if the transistor tries to conduct more (hotter, higher β), the emitter voltage rises and pulls the current back. So any BC547 works the same.'],
      ['4. Base voltage from a divider', 'Base = emitter + 0.65 V ≈ <b>1.6 V</b>.<br>Divider: 9 V × 10k ÷ (47k + 10k) = <b>1.58 V</b>. ✔<br>Divider current ≈ 9 V ÷ 57 kΩ = 0.16 mA, about 30× the base current (1 mA ÷ β 200 = 0.005 mA), so β hardly moves the bias. Rule of thumb: divider current ≥ 10 × base current.'],
      ['5. Gain', 'For audio, <b>CE = 100 µF</b> shorts RE, so the signal only "sees" the transistor\'s own emitter resistance:<br>re = 26 mV ÷ Ic = 26 mV ÷ 0.89 mA ≈ <b>29 Ω</b><br>Gain = (RC ∥ LOAD) ÷ re = (4.7k ∥ 10k) ÷ 29 = 3.2k ÷ 29 ≈ <b>110</b>.<br>The simulator measures 2.2 V p-p out for 20 mV p-p in = 110. ✔ The output is <b>inverted</b> (upside down): normal for a common emitter.'],
      ['6. Coupling capacitors', '<b>CIN / COUT = 10 µF</b> pass the audio but block DC, so the mic and the next stage don\'t upset the 1.6 V bias.<br>Lowest frequency ≈ 1 ÷ (2π × R × C): with ≈ 8 kΩ input resistance and 10 µF → about <b>2 Hz</b>, far below 20 Hz bass. CE must be big because it works against small resistances (re): 1 ÷ (2π × 29 Ω × 100 µF) ≈ 55 Hz.'],
      ['Why the output is clean', 'Only 10 mV goes in, so the 2.2 V p-p output stays far from 0 V and 9 V: the transistor stays in its smooth middle region.'],
    ],
    tryit: ['Raise MIC amplitude to 50 mV: the bottom of the wave flattens (clipping, distortion).', 'Delete CE: gain drops to RC ÷ RE ≈ 3 (4.7k ∥ 10k ÷ 1k), but distortion almost disappears. Gain vs. clean sound is the classic trade-off.', 'Change RC to 2.2 kΩ: collector moves up to ≈ 7 V, gain halves.', 'Swap BC547 for 2N2222: almost nothing changes. That\'s RE doing its job.'],
  },
  {
    id: 'led', title: 'LED resistor', example: 'led', tag: 'Basics',
    intro: 'An LED needs a fixed voltage (its forward voltage) and the resistor sets the current.',
    steps: [
      ['Formula', 'R = (Vsupply − Vled) ÷ I<br>9 V, red LED 1.8 V, 15 mA → (9 − 1.8) ÷ 0.015 = 480 Ω → use <b>470 Ω</b>.'],
      ['Resistor power', 'P = I² × R = 0.015² × 470 = 0.1 W → a ¼ W resistor is fine.'],
      ['Typical forward voltages', 'Red 1.8–2 V · yellow / green 2–2.2 V · blue / white 3–3.2 V. Most 5 mm LEDs: 10–20 mA.'],
    ],
    tryit: ['Change the LED to blue: current drops (less voltage left for the resistor).', 'Set the resistor to 100 Ω: the LED panel warns it will burn.'],
  },
  {
    id: 'flyback', title: 'Flyback diode (coils, relays, solenoids)', example: 'flyback', tag: 'Protection',
    intro: 'A coil stores energy in its magnetic field. Switch it off and it forces the current to keep flowing, so the voltage jumps to hundreds of volts and kills the transistor or MOSFET.',
    steps: [
      ['The spike', 'V = L × di/dt. A fast switch-off means a huge di/dt, so a huge voltage. In the example without the diode it goes past 1000 V.'],
      ['The fix', 'A diode across the coil, <b>cathode (bar) to +</b>. While on, it is reversed and does nothing. At switch-off it carries the coil current around in a loop, so the spike is clamped to supply + 0.7 V.'],
      ['Which diode', '1N4148 for small relays, 1N4007 or 1N5819 (Schottky, faster) for solenoids and motors.'],
    ],
    tryit: ['Hold the button, then let go: the scope shows the clamped switch-off.', 'Delete the diode and do it again: watch the spike.'],
  },
  {
    id: 'mosfet', title: 'MOSFET switch from an ESP32 pin', example: 'mosfet', tag: 'Switching',
    intro: 'A logic-level N-MOSFET lets a 3.3 V pin switch amps of 12 V load current.',
    steps: [
      ['Logic level matters', 'Rds(on) is specified at a gate voltage. IRLZ44N / AO3400 are fully on at 4.5 V and work at 3.3 V. IRF540N / IRFZ44N need 10 V: on 3.3 V they stay half on and get hot (the simulator shows this).'],
      ['Gate resistors', '100 Ω in series with the gate limits the charging current spike. 10 kΩ from gate to ground keeps it OFF while the ESP32 boots (pins float).'],
      ['Heat', 'P = I² × Rds(on). 0.5 A × 0.5 A × 0.05 Ω = 12 mW: no heatsink needed.'],
      ['Flyback diode', 'Always across an inductive load (see the flyback article).'],
    ],
    tryit: ['Change the MOSFET to IRF540N and look at its panel: "NOT fully on".', 'Set PWM duty to 20 %: the solenoid gets less average current.'],
  },
  {
    id: 'relay', title: 'Relay driver with an NPN transistor', example: 'relay', tag: 'Switching',
    intro: 'An ESP32 pin can\'t power a relay coil (tens of mA), but it can switch a small NPN that does.',
    steps: [
      ['Coil current', '12 V relay, 400 Ω coil → 12 ÷ 400 = 30 mA.'],
      ['Base resistor', 'Drive the transistor hard (saturated): Ib ≈ Ic ÷ 10 = 3 mA.<br>R = (3.3 − 0.65) ÷ 0.003 ≈ 880 Ω → <b>1 kΩ</b> (2.65 mA).'],
      ['Diode', '1N4148 across the coil, bar to +12 V.'],
    ],
    tryit: ['Flip GPIO off: the relay releases, the diode clamps the spike.', 'Change the base resistor to 47 kΩ: the transistor is only partly on and the relay may not pull in.'],
  },
  {
    id: 'reg', title: '7805 / LM317 regulators', example: 'lm317', tag: 'Power',
    intro: 'A linear regulator gives a steady voltage and burns the extra as heat.',
    steps: [
      ['Heat', 'P = (Vin − Vout) × I. 12 V → 5 V at 0.25 A = 1.75 W: needs a small heatsink (a bare TO-220 handles about 1 W).'],
      ['Dropout', '7805 needs Vin ≥ about 7 V. AMS1117 only about 6.1 V for 5 V (1.1 V dropout).'],
      ['LM317 formula', 'Vout = 1.25 × (1 + R2 ÷ R1). R1 = 240 Ω, R2 = 720 Ω → 5 V. Keep R1 ≤ 240 Ω so at least 5 mA always flows.'],
    ],
    tryit: ['Lower B1 to 6 V: dropout, the output sags.', 'Change R2 to 2.2 kΩ: about 12.7 V out.'],
  },
];

export function learnTab(root) {
  const list = el('div', { class: 'learn-list' });
  const view = el('div', { class: 'learn-view' });
  root.append(list, view);
  for (const a of ARTICLES) list.append(el('button', { class: 'learn-it', type: 'button', onclick: () => show(a.id) }, el('span', { class: 'tag', text: a.tag }), el('span', { text: a.title })));
  function openExample(name) {
    store.set('sch.cur', JSON.stringify(S.example(name)));
    store.set('sch.view', 'sch');
    dispatchEvent(new CustomEvent('f9t-example', { detail: name }));
    location.hash = '#schematic';
  }
  function show(id) {
    const a = ARTICLES.find(x => x.id === id) ?? ARTICLES[0];
    store.set('learn.cur', a.id);
    for (const b of list.children) b.classList.toggle('on', b.lastChild.textContent === a.title);
    view.innerHTML = '';
    const card = el('section', { class: 'card learn' },
      el('h2', { text: a.title }),
      el('p', { class: 'lead', text: a.intro }),
      a.example ? el('div', { class: 'row wrap' }, el('button', { class: 'btn primary', type: 'button', text: '⚡ Open in Schematic', onclick: () => openExample(a.example) })) : null,
      a.parts ? el('div', { class: 'learn-parts' }, a.parts.map(([k, v]) => el('div', {}, el('b', { text: k }), el('span', { text: v })))) : null,
      ...a.steps.map(([h, html]) => el('div', { class: 'learn-step' }, el('h3', { text: h }), el('p', { html }))),
      a.tryit ? el('div', { class: 'learn-try' }, el('h3', { text: '🧪 Try it in the simulator' }), el('ul', {}, a.tryit.map(t => el('li', { text: t })))) : null);
    view.append(card);
  }
  show(store.get('learn.cur', 'preamp'));
}
