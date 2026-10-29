// Capacitors: RC timing, reactance (incl. capacitive dropper), energy, series / parallel
import { el, numField, card, grid, note, resultBox, table, store } from '../ui.js';
import { si, plain, parse, pct, nearest, E12 } from '../num.js';
import * as F from '../formulas.js';

export function capacitorTab(root) {
  // ---- RC time constant ----
  {
    const go = () => run();
    const R = numField('cap.R', 'Resistor R', 'Ω', { def: '10k', onchange: go });
    const C = numField('cap.C', 'Capacitor C', 'F', { def: '100u', onchange: go });
    const Vs = numField('cap.Vs', 'Supply voltage', 'V', { def: '5', onchange: go });
    const Vt = numField('cap.Vt', 'Time to reach (optional)', 'V', { def: '3.3', onchange: go, hint: 'Charging from 0 V, or discharging from the supply voltage' });
    const res = resultBox(), tbl = el('div');
    root.append(card('RC time constant  τ = R × C', grid(R, C, Vs, Vt), res.el, tbl));
    function run() {
      tbl.innerHTML = '';
      const r = R.value, c = C.value, vs = Vs.value, vt = Vt.value;
      if (!(r > 0 && c > 0)) { res.clear('Type R and C.'); return; }
      const tau = F.tau(r, c), L = [`τ = R × C = ${plain(r)} × ${plain(c)} = ${si(tau, 's')}`], vals = [['τ', si(tau, 's'), true], ['5τ (≈ full)', si(5 * tau, 's')]];
      const warn = [];
      if (vs > 0 && vt != null) {
        if (vt > 0 && vt < vs) {
          const tc = F.chargeTime(r, c, vs, vt), td = F.dischargeTime(r, c, vs, vt);
          L.push(`Charge 0 → ${plain(vt)} V: t = −RC × ln(1 − Vt ÷ Vs) = −${plain(tau)} × ln(1 − ${plain(vt)} ÷ ${plain(vs)}) = ${si(tc, 's')}`,
            `Discharge ${plain(vs)} → ${plain(vt)} V: t = RC × ln(Vs ÷ Vt) = ${plain(tau)} × ln(${plain(vs)} ÷ ${plain(vt)}) = ${si(td, 's')}`);
          vals.push([`Charge to ${si(vt, 'V')}`, si(tc, 's'), true], [`Discharge to ${si(vt, 'V')}`, si(td, 's')]);
        } else warn.push(['warn', 'Target voltage must be between 0 and the supply.']);
      }
      L.push(`Peak charging current = Vs ÷ R = ${si((vs ?? 0) / r, 'A')}`);
      res.show({ values: vals, lines: L, warn });
      tbl.append(table(['Time', 'Charged', vs ? 'Voltage (charging)' : '', vs ? 'Voltage (discharging)' : ''].filter(Boolean), [1, 2, 3, 4, 5].map(k => {
        const f = 1 - Math.exp(-k);
        return [`${k}τ = ${si(k * tau, 's')}`, pct(f), ...(vs ? [si(vs * f, 'V'), si(vs * (1 - f), 'V')] : [])];
      })));
    }
    run();
  }
  // ---- reactance + capacitive dropper ----
  {
    const go = () => run();
    const f = numField('xc.f', 'Frequency', 'Hz', { def: '60', onchange: go });
    const C = numField('xc.C', 'Capacitance', 'F', { def: '1u', onchange: go });
    const V = numField('xc.V', 'AC voltage RMS (optional)', 'V', { def: '220', onchange: go, hint: 'Gives the current through the cap (capacitive dropper)' });
    const res = resultBox();
    root.append(card('Capacitive reactance  Xc = 1 ÷ (2π f C)', grid(f, C, V), res.el));
    function run() {
      const fv = f.value, c = C.value, v = V.value;
      if (!(fv > 0 && c > 0)) { res.clear('Type frequency and capacitance.'); return; }
      const xc = F.reactanceC(fv, c), L = [`Xc = 1 ÷ (2π × ${plain(fv)} × ${plain(c)}) = ${si(xc, 'Ω')}`], vals = [['Xc', si(xc, 'Ω'), true]], warn = [];
      if (v > 0) {
        const I = v / xc;
        L.push(`I = V ÷ Xc = ${plain(v)} ÷ ${plain(xc)} = ${si(I, 'A')} RMS`, `(no real power is lost in an ideal capacitor; current leads voltage by 90°)`);
        vals.push(['Current', si(I, 'A'), true]);
        if (v > 50) warn.push(['bad', 'Capacitive dropper on mains is not isolated. Use an X2-rated capacitor, a 1 MΩ bleeder across it and a series resistor (≈ 100 Ω) for the switch-on surge.']);
      }
      res.show({ values: vals, lines: L, warn });
    }
    run();
  }
  // ---- energy ----
  {
    const go = () => run();
    const C = numField('en.C', 'Capacitance', 'F', { def: '4700u', onchange: go });
    const V = numField('en.V', 'Voltage', 'V', { def: '50', onchange: go });
    const res = resultBox();
    root.append(card('Energy and charge', grid(C, V), res.el));
    function run() {
      const c = C.value, v = V.value;
      if (!(c > 0 && v != null)) { res.clear('Type C and V.'); return; }
      const E = F.energyC(c, v), Q = c * v;
      const warn = E > 10 ? [['bad', `${si(E, 'J')} can weld a screwdriver tip. Discharge through a resistor before touching.`]] : E > 1 ? [['warn', 'Enough energy to spark and hurt. Discharge through a resistor (e.g. 1 kΩ 5 W).']] : [];
      res.show({ values: [['Energy', si(E, 'J'), true], ['Charge', si(Q, 'C')]], lines: [`E = ½ × C × V² = 0.5 × ${plain(c)} × ${plain(v)}² = ${si(E, 'J')}`, `Q = C × V = ${plain(c)} × ${plain(v)} = ${si(Q, 'C')}`], warn });
    }
    run();
  }
  // ---- series / parallel ----
  {
    const inp = el('input', { id: 'cap-list', class: 'num wide', value: store.get('cap.list', '100u, 47u, 22u'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const res = resultBox();
    inp.addEventListener('input', () => { store.set('cap.list', inp.value); run(); });
    root.append(card('Capacitors in series and parallel', note('Type values separated by commas or spaces, e.g. <code>100u 47u 22u</code>.'), inp, res.el));
    function run() {
      const vals = inp.value.split(/[\s;,]+/).map(t => t.trim()).filter(Boolean).map(parse);
      if (!vals.length || vals.some(v => !(v > 0))) { res.clear('Type at least one value.'); return; }
      const par = vals.reduce((a, b) => a + b, 0), ser = 1 / vals.reduce((a, b) => a + 1 / b, 0);
      res.show({ values: [['Parallel', si(par, 'F'), true], ['Series', si(ser, 'F'), true]], lines: [`Parallel: C = C1 + C2 + … = ${vals.map(v => si(v, 'F')).join(' + ')} = ${si(par, 'F')}`, `Series: 1/C = 1/C1 + 1/C2 + … → C = ${si(ser, 'F')}`, `Series caps share voltage inversely to their value; for equal caps add balancing resistors.`] });
    }
    run();
  }
}
