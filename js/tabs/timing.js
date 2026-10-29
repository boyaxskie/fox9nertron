// Frequency / period, PWM, MCU timer settings, 555 astable
import { el, numField, card, grid, note, resultBox, segmented, select, table } from '../ui.js';
import { si, plain, pct, nearest, E12 } from '../num.js';
import * as F from '../formulas.js';

export function timingTab(root) {
  // ---- frequency <-> period ----
  {
    const go = () => run();
    const f = numField('tm.f', 'Frequency', 'Hz', { def: '1k', onchange: go });
    const T = numField('tm.T', 'Period', 's', { onchange: go, hint: 'Fill one of the two' });
    const res = resultBox();
    root.append(card('Frequency ↔ period', grid(f, T), res.el));
    function run() {
      f.show(''); T.show('');
      if (f.value > 0) { const t = 1 / f.value; T.show(plain(t)); res.show({ values: [['Period', si(t, 's'), true], ['Angular ω', si(2 * Math.PI * f.value, 'rad/s')]], lines: [`T = 1 ÷ f = 1 ÷ ${plain(f.value)} = ${si(t, 's')}`] }); }
      else if (T.value > 0) { const fr = 1 / T.value; f.show(plain(fr)); res.show({ values: [['Frequency', si(fr, 'Hz'), true]], lines: [`f = 1 ÷ T = 1 ÷ ${plain(T.value)} = ${si(fr, 'Hz')}`] }); }
      else res.clear('Type frequency or period.');
    }
    run();
  }
  // ---- PWM ----
  {
    const go = () => run();
    const f = numField('pwm.f', 'PWM frequency', 'Hz', { def: '1k', onchange: go });
    const D = numField('pwm.D', 'Duty cycle', '%', { def: '25', onchange: go });
    const Ton = numField('pwm.on', 'Or on-time', 's', { onchange: go, hint: 'Empty duty and type on-time to get the duty' });
    const Vh = numField('pwm.V', 'High voltage', 'V', { def: '5', onchange: go });
    const bits = numField('pwm.bits', 'Duty resolution (bits)', 'bit', { def: '8', onchange: go });
    const res = resultBox(), pic = el('div', { class: 'graph' });
    root.append(card('PWM duty cycle', grid(f, D, Ton, Vh, bits), res.el, pic));
    function run() {
      D.show(''); Ton.show('');
      const fv = f.value; if (!(fv > 0)) { res.clear('Type the PWM frequency.'); pic.innerHTML = ''; return; }
      const T = 1 / fv; let d;
      if (D.value != null) d = D.value / 100; else if (Ton.value != null) { d = Ton.value / T; D.show(plain(d * 100)); }
      if (d == null || d < 0 || d > 1) { res.clear('Type a duty from 0 to 100 %, or an on-time shorter than the period.'); pic.innerHTML = ''; return; }
      const on = d * T, off = T - on, L = [`T = 1 ÷ f = ${si(T, 's')}`, `On-time = D × T = ${plain(d)} × ${plain(T)} = ${si(on, 's')}`, `Off-time = T − on = ${si(off, 's')}`];
      if (D.value != null) Ton.show(plain(on));
      const vals = [['On', si(on, 's'), true], ['Off', si(off, 's')], ['Period', si(T, 's')]];
      if (Vh.value != null) { const va = d * Vh.value; L.push(`Average voltage = D × Vhigh = ${plain(d)} × ${plain(Vh.value)} = ${si(va, 'V')}  (what a motor, LED or RC filter "sees")`, `RMS voltage = Vhigh × √D = ${si(Vh.value * Math.sqrt(d), 'V')}  (heating in a resistive load)`); vals.push(['Average', si(va, 'V'), true]); }
      if (bits.value > 0) { const steps = 2 ** Math.round(bits.value); const reg = Math.round(d * (steps - 1)); L.push(`Register value (${Math.round(bits.value)}-bit, 0…${steps - 1}) = D × ${steps - 1} = ${reg}  → analogWrite(pin, ${reg}) on 8-bit Arduino`); vals.push(['Register', String(reg)]); }
      res.show({ values: vals, lines: L });
      const W = 600, H = 90, x = t => 10 + (t / (3 * T)) * (W - 20), yh = 15, yl = 75;
      let path = `M${x(0)} ${yl}`;
      for (let k = 0; k < 3; k++) { const t0 = k * T; path += ` L${x(t0)} ${yl} L${x(t0)} ${yh} L${x(t0 + on)} ${yh} L${x(t0 + on)} ${yl}`; }
      path += ` L${x(3 * T)} ${yl}`;
      const avg = Vh.value != null ? `<line class="avg" x1="10" x2="${W - 10}" y1="${yl - d * (yl - yh)}" y2="${yl - d * (yl - yh)}"/><text class="ax" x="${W - 12}" y="${yl - d * (yl - yh) - 4}" text-anchor="end">avg ${si(d * Vh.value, 'V', 3)}</text>` : '';
      pic.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="PWM waveform"><path class="wb" d="${path}"/>${avg}</svg>`;
    }
    run();
  }
  // ---- MCU timer ----
  {
    const go = () => run();
    const chip = select('mcu.chip', 'Board / timer', [
      ['avr1', 'Arduino Uno/Nano Timer1 (16-bit, 16 MHz)'], ['avr0', 'Arduino Uno/Nano Timer0 (8-bit, 16 MHz)'], ['avr2', 'Arduino Uno/Nano Timer2 (8-bit, 16 MHz)'],
      ['stm32', 'STM32F103 (Blue Pill) TIMx (16-bit, 72 MHz)'], ['stm32f4', 'STM32F4 TIM2/TIM5 (32-bit, 84 MHz)'], ['esp32', 'ESP32 LEDC PWM (80 MHz APB)'], ['custom', 'Custom clock (16-bit, any prescaler)']], 'avr1', go);
    const clk = numField('mcu.clk', 'Timer clock (custom only)', 'Hz', { def: '16M', onchange: go });
    const target = numField('mcu.f', 'Wanted frequency', 'Hz', { def: '1k', onchange: go });
    const res = resultBox(), tbl = el('div');
    root.append(card('Microcontroller timer settings', note('f<sub>out</sub> = f<sub>clk</sub> ÷ (prescaler × (TOP + 1)). Shows the exact frequency you get and the error.'), grid(chip, clk, target), res.el, tbl));
    function run() {
      tbl.innerHTML = '';
      const ft = target.value, c = chip.value;
      clk.el.hidden = c !== 'custom';
      if (!(ft > 0)) { res.clear('Type the wanted frequency.'); return; }
      if (c === 'esp32') {
        const b = F.ledcBits(ft);
        if (b < 1) { res.clear('Too fast for LEDC (max ≈ 40 MHz at 1 bit).'); return; }
        res.show({ values: [['Max resolution', `${b} bit`, true], ['Steps', String(2 ** b)]], lines: [`bits = floor(log2(80 MHz ÷ f)) = floor(log2(${plain(80e6 / ft)})) = ${b}`, `ledcAttach(pin, ${Math.round(ft)}, ${b});   // Arduino-ESP32 3.x`, `ledcWrite(pin, duty);   // duty 0 … ${2 ** b - 1}`],
          warn: ft < 1 ? [['warn', 'Very low frequency: LEDC needs a slower clock source (REF_TICK).']] : [] });
        return;
      }
      const cfg = { avr1: [16e6, 16, F.AVR_PSC], avr0: [16e6, 8, F.AVR_PSC], avr2: [16e6, 8, F.AVR_PSC_T2], stm32: [72e6, 16, null], stm32f4: [84e6, 32, null], custom: [clk.value ?? 16e6, 16, Array.from({ length: 1024 }, (_, i) => i + 1)] }[c];
      const [fclk, bits, pscs] = cfg;
      const list = pscs ? F.timerSearch(fclk, ft, bits, pscs) : F.stm32Search(fclk, ft, bits);
      if (!list.length) { res.clear(`Can't reach ${si(ft, 'Hz')} with this timer (too fast or too slow for ${bits}-bit).`); return; }
      const b = list[0];
      const lines = [`f = ${si(fclk, 'Hz')} ÷ (${b.psc} × (${b.top} + 1)) = ${si(b.f, 'Hz')}  (error ${pct(b.err, 3)})`];
      if (c.startsWith('avr')) {
        const t = c === 'avr1' ? 1 : c === 'avr0' ? 0 : 2;
        lines.push(`// Timer${t}, CTC mode, toggle → square wave at ${si(b.f / 2, 'Hz')} on OC${t}A; or Fast PWM with TOP = ${b.top}`, `OCR${t}A = ${b.top};   // prescaler ${b.psc}`);
      } else lines.push(`htim.Init.Prescaler = ${b.psc - 1};   // divider ${b.psc}`, `htim.Init.Period = ${b.top};   // ARR`, `PWM duty: CCR = duty × ${b.top + 1}`);
      res.show({ values: [['Prescaler', String(b.psc), true], ['TOP / ARR', String(b.top), true], ['Real frequency', si(b.f, 'Hz')], ['PWM steps', String(b.steps)]], lines,
        warn: [[Math.abs(b.err) < 0.001 ? 'ok' : 'warn', Math.abs(b.err) < 0.001 ? 'Exact (under 0.1 % error).' : `Closest possible is ${pct(b.err, 3)} off.`]] });
      tbl.append(table(['Prescaler', 'TOP', 'Frequency', 'Error', 'Steps'], list.slice(0, 6).map(o => [String(o.psc), String(o.top), si(o.f, 'Hz'), pct(o.err, 3), String(o.steps)])));
    }
    run();
  }
  // ---- 555 ----
  {
    const go = () => run();
    const R1 = numField('555.R1', 'R1', 'Ω', { def: '1k', onchange: go });
    const R2 = numField('555.R2', 'R2', 'Ω', { def: '10k', onchange: go });
    const C = numField('555.C', 'C', 'F', { def: '100n', onchange: go });
    const res = resultBox();
    root.append(card('555 astable', grid(R1, R2, C), res.el));
    function run() {
      if (!(R1.value > 0 && R2.value > 0 && C.value > 0)) { res.clear('Type R1, R2 and C.'); return; }
      const o = F.ne555(R1.value, R2.value, C.value);
      res.show({ values: [['Frequency', si(o.f, 'Hz'), true], ['Duty', pct(o.duty), true], ['High', si(o.th, 's')], ['Low', si(o.tl, 's')]],
        lines: [`t high = 0.693 × (R1 + R2) × C = ${si(o.th, 's')}`, `t low = 0.693 × R2 × C = ${si(o.tl, 's')}`, `f = 1.44 ÷ ((R1 + 2·R2) × C) = ${si(o.f, 'Hz')}`, `Duty = (R1 + R2) ÷ (R1 + 2·R2) = ${pct(o.duty)}  (always > 50 %; add a diode across R2 for less)`],
        warn: R1.value < 1000 ? [['warn', 'R1 below 1 kΩ: the discharge pin carries a lot of current.']] : [] });
    }
    run();
  }
}
