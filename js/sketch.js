// Arduino sketch runner: turns simple Arduino C++ (setup / loop, pinMode, digitalWrite, analogRead, delay, Serial, Servo, ledc…)
// into a JavaScript generator that the simulator steps through in circuit time. delay() pauses the sketch while the circuit runs on.
// Not a full C++ compiler: no classes / structs / pointers / interrupts. Ints divide like floats unless you use int().
import { BOARDS } from './sch-core.js';

const TYPES = 'int|long|short|float|double|bool|boolean|byte|char|word|size_t|String|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t';
const API_NAMES = ['pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'analogReadMilliVolts', 'ledcSetup', 'ledcAttachPin', 'ledcAttach', 'ledcWrite', 'ledcDetachPin', 'ledcDetach',
  'tone', 'noTone', 'dacWrite', 'dacDisable', 'analogReadResolution', 'analogWriteResolution', 'analogSetAttenuation', 'analogWriteFrequency', 'millis', 'micros', 'Serial', 'Servo', 'LiquidCrystal_I2C', 'Wire', 'map', 'constrain', 'random', 'randomSeed', 'abs', 'min', 'max', 'pow', 'sqrt', 'sq', 'sin', 'cos', 'tan', 'floor', 'ceil', 'round',
  'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'PI', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'DEC', 'HEX', 'BIN', '__ops', 'int', 'float', 'yieldNow'];

// find the ')' matching the '(' at i (skips strings / chars)
function closeParen(s, i) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const ch = s[k];
    if (ch === '"' || ch === "'") { const q = ch; k++; while (k < s.length && s[k] !== q) { if (s[k] === '\\') k++; k++; } continue; }
    if (ch === '(') d++; else if (ch === ')') { d--; if (!d) return k; }
  }
  return -1;
}
// wrap calls: delay(x) → (yield ((x)/1000)), userFn(a) → (yield* userFn(a))
function wrapCalls(s, fns) {
  let out = '', i = 0;
  const re = /[A-Za-z_]\w*/y;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"' || ch === "'") { let k = i + 1; while (k < s.length && s[k] !== ch) { if (s[k] === '\\') k++; k++; } out += s.slice(i, k + 1); i = k + 1; continue; }
    if (ch === '/' && s[i + 1] === '/') { const k = s.indexOf('\n', i); const e = k < 0 ? s.length : k; out += s.slice(i, e); i = e; continue; }
    if (ch === '/' && s[i + 1] === '*') { const k = s.indexOf('*/', i + 2); const e = k < 0 ? s.length : k + 2; out += s.slice(i, e); i = e; continue; }
    re.lastIndex = i; const m = re.exec(s);
    if (!m || (i > 0 && /[\w.$]/.test(s[i - 1]))) { out += ch; i++; continue; }
    const name = m[0]; let j = i + name.length; while (s[j] === ' ' || s[j] === '\t') j++;
    const prev = out.trimEnd();
    const isDef = /function\*\s*$/.test(prev);
    if (s[j] === '(' && !isDef && (name === 'delay' || name === 'delayMicroseconds' || name === 'yield' || fns.has(name))) {
      const e = closeParen(s, j); if (e < 0) throw new Error(`missing ) after ${name}(`);
      const inner = wrapCalls(s.slice(j + 1, e), fns);
      out += name === 'delay' ? `(yield ((${inner || 0}) / 1000))` : name === 'delayMicroseconds' ? `(yield ((${inner || 0}) / 1e6))` : name === 'yield' ? '(yield 0)' : `(yield* ${name}(${inner}))`;
      i = e + 1; continue;
    }
    out += name; i += name.length;
  }
  return out;
}
// guard every loop: a sketch stuck in while(...) without delay hands control back to the simulator now and then
function guardLoops(s) {
  let out = '', i = 0;
  const re = /\b(for|while)\s*\(|\bdo\s*\{/g; let m;
  while ((m = re.exec(s))) {
    if (m[0].startsWith('do')) { out += s.slice(i, m.index + m[0].length) + ' if (++__ops.n > 20000) { __ops.n = 0; yield 0; } '; i = m.index + m[0].length; continue; }
    const open = m.index + m[0].length - 1, e = closeParen(s, open); if (e < 0) continue;
    let k = e + 1; while (/\s/.test(s[k] ?? '')) k++;
    if (s[k] === '{') { out += s.slice(i, k + 1) + ' if (++__ops.n > 20000) { __ops.n = 0; yield 0; } '; i = k + 1; re.lastIndex = k + 1; }
  }
  return out + s.slice(i);
}

export function transpile(src) {
  let s = src.replace(/\r/g, '');
  s = s.replace(/^\s*#\s*include.*$/gm, '');
  s = s.replace(/^\s*#\s*define\s+(\w+)\s+(.+)$/gm, 'const $1 = $2;');
  s = s.replace(/\bLiquidCrystal_I2C\s+(\w+)\s*\(([^)]*)\)\s*;/g, 'let $1 = new LiquidCrystal_I2C($2);');
  s = s.replace(/\bServo\s+(\w+(?:\s*,\s*\w+)*)\s*;/g, (_, names) => 'let ' + names.split(',').map(n => `${n.trim()} = new Servo()`).join(', ') + ';');
  // function definitions → generators (params lose their types)
  const fns = new Set();
  const defRe = new RegExp(`\\b(?:static\\s+|inline\\s+)?(?:void|unsigned\\s+(?:${TYPES})|unsigned|${TYPES})\\s*[*&]?\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
  s = s.replace(defRe, (_, name, params) => {
    fns.add(name);
    const ps = params.trim() === '' || params.trim() === 'void' ? [] : params.split(',').map(p => { const t = p.replace(/=.*$/, '').replace(/[&*\[\]]/g, ' ').trim().split(/\s+/); return t[t.length - 1]; });
    return `function* ${name}(${ps.join(', ')}) {`;
  });
  // prototypes like "void blink(int n);" → drop
  s = s.replace(new RegExp(`^\\s*(?:void|${TYPES})\\s+\\w+\\s*\\([^)]*\\)\\s*;`, 'gm'), '');
  // casts
  s = s.replace(new RegExp(`\\(\\s*(?:unsigned\\s+)?(?:${TYPES})\\s*\\)`, 'g'), '');
  // declarations
  s = s.replace(new RegExp(`\\bconst\\s+(?:unsigned\\s+)?(?:${TYPES})\\s+`, 'g'), 'const ');
  s = s.replace(new RegExp(`\\b(?:static\\s+)?(?:volatile\\s+)?(?:unsigned\\s+)?(?:${TYPES})\\s+(?=[A-Za-z_])`, 'g'), 'let ');
  s = s.replace(/\bunsigned\s+(?=[A-Za-z_])/g, 'let ');
  s = s.replace(/\b(let|const)\s+(\w+)\s*\[\s*\w*\s*\]\s*=\s*\{([^}]*)\}/g, '$1 $2 = [$3]');
  s = s.replace(/\blet\s+(\w+)\s*\[\s*(\w+)\s*\]\s*;/g, 'let $1 = new Array($2).fill(0);');
  s = s.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((part, i) => (i % 2 ? part : part.replace(/\b(\d+(?:\.\d+)?)[uUlLfF]+\b/g, '$1'))).join('');   // 10UL, 2.5f (not inside strings)
  s = s.replace(/\bF\(\s*("(?:[^"\\]|\\.)*")\s*\)/g, '$1');
  s = guardLoops(s);
  s = wrapCalls(s, fns);
  if (!fns.has('loop')) throw new Error('No loop() found. A sketch needs void setup() { … } and void loop() { … }.');
  return `"use strict";\nconst { ${API_NAMES.join(', ')} } = __api;\n${s}\nreturn function* __main() { ${fns.has('setup') ? 'yield* setup();' : ''} for (;;) { yield* loop(); yield 0; } };`;
}

// pin number / name used in the sketch → board pin name
export function pinName(board, pin) {
  const B = BOARDS[board];
  if (typeof pin === 'string') return B.pins.some(q => q.n === pin) ? pin : null;
  if (board === 'ESP32') return B.pins.find(q => q.g === pin)?.n ?? null;
  if (pin >= 0 && pin <= 13) return 'D' + pin;
  if (pin >= 14 && pin <= 19) return 'A' + (pin - 14);
  return null;
}

// runtime for one board. host = { t(): circuit time, v(pinName): pin voltage or null, pins: the board's pin config object (mutated) }
export function createRuntime(p, src, host) {
  const board = p.type, B = BOARDS[board], esp = board === 'ESP32';
  const js = transpile(src);
  const lines = [], ledc = new Map(), servoPins = new Set();
  const say = (s) => { const last = lines.length ? lines[lines.length - 1] : null; if (last != null && !last.done) last.text += s; else lines.push({ text: s, done: false }); if (lines.length > 200) lines.shift(); };
  const endLine = () => { if (lines.length && !lines[lines.length - 1].done) lines[lines.length - 1].done = true; else lines.push({ text: '', done: true }); };
  const PN = (pin) => { const n = pinName(board, pin); if (!n) throw new Error(`pin ${pin} does not exist on the ${B.name}`); return n; };
  const setMode = (n, cfg) => { if (cfg == null) delete host.pins[n]; else host.pins[n] = cfg; };
  const fmt = (x, f) => {
    if (typeof x === 'number') { if (Number.isInteger(x)) { if (f === 16) return x.toString(16).toUpperCase(); if (f === 2) return x.toString(2); if (f === 8) return x.toString(8); return String(x); } return x.toFixed(typeof f === 'number' ? Math.min(10, f) : 2); }   // print(float, n) = n decimals, print(int, HEX/BIN) = base
    if (typeof x === 'boolean') return x ? '1' : '0';
    return String(x);
  };
  let adcBits = B.adcBits, pwmBits = 8, pwmF = null;
  const pwmOut = (n, duty, f) => setMode(n, duty <= 0 ? { mode: 'low' } : duty >= 100 ? { mode: 'high' } : { mode: 'pwm', f, duty });
  class Servo {
    attach(pin, mn = 500, mx = 2500) { this.n = PN(pin); this.mn = mn; this.mx = mx; servoPins.add(this.n); this.writeMicroseconds(this.us ?? 1500); return 1; }
    write(a) { if (a > 200) return this.writeMicroseconds(a); this.ang = Math.max(0, Math.min(180, a)); this.writeMicroseconds(this.mn + (this.mx - this.mn) * this.ang / 180); }
    writeMicroseconds(us) { this.us = us; if (this.n) setMode(this.n, { mode: 'pwm', f: 50, duty: us / 20000 * 100 }); }
    read() { return Math.round(this.ang ?? 90); }
    attached() { return !!this.n; }
    detach() { if (this.n) setMode(this.n, { mode: 'low' }); this.n = null; }
  }
  // LCD 16×2 / 20×4 over I2C (LiquidCrystal_I2C library). The schematic shows the text on an LCD part wired to SDA / SCL.
  const displays = [];
  class LiquidCrystal_I2C {
    constructor(addr = 0x27, cols = 16, rows = 2) { this.addr = addr; this.cols = cols; this.rows = rows; this.buf = Array.from({ length: rows }, () => ' '.repeat(cols)); this.cx = 0; this.cy = 0; this.bl = false; this.on = false; displays.push(this); }
    init() { this.on = true; this.clear(); } begin() { this.init(); }
    backlight() { this.bl = true; } noBacklight() { this.bl = false; } setBacklight(v) { this.bl = !!v; }
    display() { this.on = true; } noDisplay() { this.on = false; }
    clear() { this.buf = this.buf.map(() => ' '.repeat(this.cols)); this.cx = this.cy = 0; } home() { this.cx = this.cy = 0; }
    setCursor(c, r) { this.cx = Math.max(0, Math.trunc(c)); this.cy = Math.max(0, Math.min(this.rows - 1, Math.trunc(r))); }
    print(x, f) { for (const ch of fmt(x, f)) this.write(ch); return 1; }
    write(ch) { if (typeof ch === 'number') ch = String.fromCharCode(ch); if (this.cx < this.cols) { const r = this.buf[this.cy]; this.buf[this.cy] = r.slice(0, this.cx) + ch + r.slice(this.cx + 1); } this.cx++; }
    cursor() { } noCursor() { } blink() { } noBlink() { } createChar() { } scrollDisplayLeft() { } scrollDisplayRight() { } leftToRight() { } rightToLeft() { } autoscroll() { } noAutoscroll() { }
  }
  const Wire = { begin() { }, setClock() { }, beginTransmission() { }, endTransmission: () => 0, write() { }, requestFrom: () => 0, available: () => 0, read: () => 0 };
  const api = {
    HIGH: 1, LOW: 0, INPUT: 'in', OUTPUT: 'out', INPUT_PULLUP: 'pu', INPUT_PULLDOWN: 'pd', LED_BUILTIN: esp ? 2 : 13, PI: Math.PI, DEC: 10, HEX: 16, BIN: 2,
    A0: esp ? 36 : 'A0', A1: esp ? 37 : 'A1', A2: esp ? 38 : 'A2', A3: esp ? 39 : 'A3', A4: esp ? 32 : 'A4', A5: esp ? 33 : 'A5', A6: esp ? 34 : 'A6', A7: esp ? 35 : 'A7',
    __ops: { n: 0 },
    int: (x) => Math.trunc(x), float: (x) => +x,
    pinMode(pin, m) { const n = PN(pin); setMode(n, m === 'out' ? { mode: host.pins[n]?.mode === 'high' ? 'high' : 'low' } : m === 'in' ? null : { mode: m }); },
    digitalWrite(pin, v) { const n = PN(pin), m = host.pins[n]?.mode; if (m == null || m === 'in' || m === 'pu' || m === 'pd') { setMode(n, v ? { mode: 'pu' } : null); return; } setMode(n, { mode: v ? 'high' : 'low' }); },
    digitalRead(pin) { const n = PN(pin), v = host.v(n); return v == null ? 0 : v >= (B.vih + B.vil) / 2 ? 1 : 0; },
    analogRead(pin) { const n = PN(pin), v = host.v(n) ?? 0; return Math.round(Math.max(0, Math.min(1, v / B.adcRef)) * (2 ** adcBits - 1)); },
    analogReadMilliVolts(pin) { return Math.round(Math.max(0, Math.min(B.adcRef, host.v(PN(pin)) ?? 0)) * 1000); },
    analogWrite(pin, val) { const n = PN(pin), top = 2 ** pwmBits - 1; pwmOut(n, Math.max(0, Math.min(top, val)) / top * 100, pwmF ?? (esp ? 1000 : (/^D[56]$/.test(n) ? 980 : 490))); },
    ledcSetup(ch, f, bits) { ledc.set('ch' + ch, { f, bits, pins: [] }); return f; },
    ledcAttachPin(pin, ch) { const c = ledc.get('ch' + ch) ?? ledc.set('ch' + ch, { f: 5000, bits: 8, pins: [] }).get('ch' + ch); c.pins.push(PN(pin)); },
    ledcAttach(pin, f, bits) { ledc.set('pin' + PN(pin), { f, bits, pins: [PN(pin)] }); return true; },
    ledcWrite(x, duty) { const c = ledc.get('pin' + (pinName(board, x) ?? '')) ?? ledc.get('ch' + x); if (!c) throw new Error(`ledcWrite(${x}, …): attach the pin first (ledcAttach or ledcSetup + ledcAttachPin)`); for (const n of c.pins) pwmOut(n, duty / (2 ** c.bits - 1) * 100, c.f); },
    ledcDetachPin(pin) { setMode(PN(pin), null); }, ledcDetach(pin) { setMode(PN(pin), null); },
    dacWrite(pin, v) { if (!esp) throw new Error('dacWrite: the UNO has no DAC (use analogWrite PWM)'); const n = PN(pin); if (n !== 'D25' && n !== 'D26') throw new Error(`dacWrite: only GPIO25 and GPIO26 have a DAC (got ${n})`); setMode(n, { mode: 'dac', val: Math.max(0, Math.min(255, Math.round(v))) }); },
    dacDisable(pin) { setMode(PN(pin), null); },
    analogReadResolution(b) { adcBits = Math.max(1, Math.min(16, b)); }, analogWriteResolution(b) { pwmBits = Math.max(1, Math.min(16, b)); }, analogSetAttenuation() { }, analogWriteFrequency(f) { pwmF = f; },
    tone(pin, f) { setMode(PN(pin), { mode: 'pwm', f, duty: 50 }); }, noTone(pin) { setMode(PN(pin), { mode: 'low' }); },
    millis: () => Math.floor(host.t() * 1000), micros: () => Math.floor(host.t() * 1e6),
    map: (x, a, b, c, d) => Math.trunc((x - a) * (d - c) / (b - a) + c), constrain: (x, a, b) => Math.min(b, Math.max(a, x)),
    random: (a, b) => (b == null ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a))), randomSeed() { },
    abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt, sq: (x) => x * x, sin: Math.sin, cos: Math.cos, tan: Math.tan, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    Serial: { begin() { }, print(x, f) { say(fmt(x, f)); }, println(x = '', f) { say(fmt(x, f)); endLine(); }, printf(f, ...a) { let i = 0; const t = String(f).replace(/%[-+0 #]*\d*(?:\.(\d+))?[dilufsxXc%]/g, (m, d) => m === '%%' ? '%' : /[xX]/.test(m) ? Math.trunc(a[i++]).toString(16) : /f/.test(m) ? (+a[i++]).toFixed(d ? +d : 6) : /[dilu]/.test(m) ? String(Math.trunc(a[i++])) : String(a[i++])); const parts = t.split('\n'); parts.forEach((x, k) => { if (x) say(x); if (k < parts.length - 1) endLine(); }); }, available: () => 0, read: () => -1, flush() { } },
    Servo, LiquidCrystal_I2C, Wire, yieldNow: 0,
  };
  let main;
  try { main = new Function('__api', js)(api); } catch (e) { throw new Error('Code error: ' + e.message); }
  const gen = main();
  let wake = 0, err = null, done = false;
  return {
    lines, displays, get err() { return err; },
    // run the sketch up to circuit time t (call once per simulator step)
    step(t) {
      if (err || done || t + 1e-12 < wake) return;
      for (let k = 0; k < 4000; k++) {
        let r;
        try { r = gen.next(); } catch (e) { err = 'Runtime error: ' + e.message; return; }
        if (r.done) { done = true; return; }
        const d = +r.value || 0;
        if (d > 0) { wake = t + d; return; }
        if (k > 0 && r.value === 0) return;      // one loop() pass per step
      }
    },
  };
}

export const EXAMPLES = {
  blink: { name: 'Blink (LED on pin)', esp: 'const int LED = 23;\n\nvoid setup() {\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED, HIGH);\n  delay(500);\n  digitalWrite(LED, LOW);\n  delay(500);\n}\n',
    uno: 'const int LED = 13;\n\nvoid setup() {\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED, HIGH);\n  delay(500);\n  digitalWrite(LED, LOW);\n  delay(500);\n}\n' },
  button: { name: 'Button → LED + Serial', esp: 'const int LED = 23;\nconst int BTN = 15;\nconst int POT = 34;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);   // pressed = LOW\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BTN) == LOW;\n  digitalWrite(LED, pressed ? HIGH : LOW);\n  int pot = analogRead(POT);      // 0 ... 4095\n  Serial.print("button: ");\n  Serial.print(pressed ? "PRESSED" : "up");\n  Serial.print("   pot: ");\n  Serial.println(pot);\n  delay(200);\n}\n',
    uno: 'const int LED = 13;\nconst int BTN = 2;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(LED, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);   // pressed = LOW\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BTN) == LOW;\n  digitalWrite(LED, pressed ? HIGH : LOW);\n  int pot = analogRead(A0);       // 0 ... 1023\n  Serial.print("button: ");\n  Serial.print(pressed ? "PRESSED" : "up");\n  Serial.print("   A0: ");\n  Serial.println(pot);\n  delay(200);\n}\n' },
  dim: { name: 'Pot dims the LED (PWM)', esp: 'const int LED = 23;\nconst int POT = 34;\n\nvoid setup() {\n  ledcAttach(LED, 1000, 8);       // 1 kHz, 8 bit (0-255)\n}\n\nvoid loop() {\n  int pot = analogRead(POT);      // 0 ... 4095\n  ledcWrite(LED, pot / 16);       // 0 ... 255\n  delay(20);\n}\n',
    uno: 'const int LED = 9;   // a ~ PWM pin\n\nvoid setup() {\n}\n\nvoid loop() {\n  int pot = analogRead(A0);       // 0 ... 1023\n  analogWrite(LED, pot / 4);      // 0 ... 255\n  delay(20);\n}\n' },
  dac: { name: 'DAC ramp (ESP32 GPIO25) / PWM ramp (UNO)', esp: '// ESP32 DAC: real analog voltage 0 ... 3.3 V on GPIO25 / GPIO26\n\nvoid setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  for (int v = 0; v <= 255; v += 15) {\n    dacWrite(25, v);                  // 0 ... 255 → 0 ... 3.3 V\n    Serial.printf("DAC %d = %.2f V\\n", v, v * 3.3 / 255);\n    delay(200);\n  }\n}\n',
    uno: '// The UNO has no DAC: analogWrite makes PWM (average voltage)\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  for (int v = 0; v <= 255; v += 15) {\n    analogWrite(9, v);\n    Serial.print("PWM ");\n    Serial.println(v);\n    delay(200);\n  }\n}\n' },
  lcd: { name: 'LCD 16x2 I2C: show the pot voltage', esp: '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\n\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // SDA = GPIO21, SCL = GPIO22\n\nvoid setup() {\n  lcd.init();\n  lcd.backlight();\n  lcd.print("Hello migo!");\n}\n\nvoid loop() {\n  float v = analogRead(34) * 3.3 / 4095;\n  lcd.setCursor(0, 1);\n  lcd.print("Pot: ");\n  lcd.print(v, 2);\n  lcd.print(" V   ");\n  delay(200);\n}\n',
    uno: '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\n\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // SDA = A4, SCL = A5\n\nvoid setup() {\n  lcd.init();\n  lcd.backlight();\n  lcd.print("Hello migo!");\n}\n\nvoid loop() {\n  float v = analogRead(A0) * 5.0 / 1023;\n  lcd.setCursor(0, 1);\n  lcd.print("A0: ");\n  lcd.print(v, 2);\n  lcd.print(" V   ");\n  delay(200);\n}\n' },
  servo: { name: 'Servo sweep', esp: '#include <ESP32Servo.h>\n\nServo arm;\n\nvoid setup() {\n  arm.attach(18);\n}\n\nvoid loop() {\n  for (int a = 0; a <= 180; a += 10) {\n    arm.write(a);\n    delay(100);\n  }\n  for (int a = 180; a >= 0; a -= 10) {\n    arm.write(a);\n    delay(100);\n  }\n}\n',
    uno: '#include <Servo.h>\n\nServo arm;\n\nvoid setup() {\n  arm.attach(9);\n}\n\nvoid loop() {\n  for (int a = 0; a <= 180; a += 10) {\n    arm.write(a);\n    delay(100);\n  }\n  for (int a = 180; a >= 0; a -= 10) {\n    arm.write(a);\n    delay(100);\n  }\n}\n' },
};
