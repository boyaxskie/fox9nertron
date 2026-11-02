// Arduino sketch runner: turns simple Arduino C++ (setup / loop, pinMode, digitalWrite, analogRead, delay, Serial, Servo, ledc…)
// into a JavaScript generator that the simulator steps through in circuit time. delay() pauses the sketch while the circuit runs on.
// Not a full C++ compiler: no classes / structs / pointers. attachInterrupt works: the ISR runs on the pin edge, between circuit steps. Ints divide like floats unless you use int().
import { BOARDS } from './sch-core.js';
import { makeOled, OLED_CONST } from './oled.js';

const TYPES = 'int|long|short|float|double|bool|boolean|byte|char|word|size_t|String|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t';
const API_NAMES = ['pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'analogReadMilliVolts', 'ledcSetup', 'ledcAttachPin', 'ledcAttach', 'ledcWrite', 'ledcDetachPin', 'ledcDetach',
  'tone', 'noTone', 'dacWrite', 'dacDisable', 'analogReadResolution', 'analogWriteResolution', 'analogSetAttenuation', 'analogWriteFrequency', 'millis', 'micros', 'Serial', 'Servo', 'LiquidCrystal_I2C', 'Wire', 'DHT', 'DHT11', 'DHT22', 'DHT21', 'pulseIn', 'pulseInLong', 'isnan', 'NAN', 'Keypad', 'makeKeymap', 'NO_KEY', 'Adafruit_SSD1306', ...Object.keys(OLED_CONST), 'attachInterrupt', 'detachInterrupt', 'digitalPinToInterrupt', 'interrupts', 'noInterrupts', 'shiftOut', 'MSBFIRST', 'LSBFIRST', 'RISING', 'FALLING', 'CHANGE', 'NOT_AN_INTERRUPT', 'map', 'constrain', 'random', 'randomSeed', 'abs', 'min', 'max', 'pow', 'sqrt', 'sq', 'sin', 'cos', 'tan', 'floor', 'ceil', 'round',
  'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'PI', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'DEC', 'HEX', 'BIN', '__ops', 'int', 'float', 'yieldNow', '__no'];

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

// "name = {" (from an array declaration) … matching "}" → "[ … ]" (nested braces too), outside strings
function arrayInits(s) {
  const re = /\b(?:let|const)\s+\w+\s*=\s*\{/g; let m, out = '', last = 0;
  // only the declarations we marked: they came from "name[...] = {"
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length - 1;
    // find matching brace
    let d = 0, k = start;
    for (; k < s.length; k++) { const ch = s[k]; if (ch === '"' || ch === "'") { const q = ch; k++; while (k < s.length && s[k] !== q) { if (s[k] === '\\') k++; k++; } continue; } if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    let body = s.slice(start, k + 1), o = '';
    for (let i = 0; i < body.length; i++) { const ch = body[i]; if (ch === '"' || ch === "'") { let j = i + 1; while (j < body.length && body[j] !== ch) { if (body[j] === '\\') j++; j++; } o += body.slice(i, j + 1); i = j; continue; } o += ch === '{' ? '[' : ch === '}' ? ']' : ch; }
    out += s.slice(last, start) + o; last = k + 1; re.lastIndex = k + 1;
  }
  return out + s.slice(last);
}
// drop // and /* */ comments (keeps strings and line breaks), so words like "byte" in a comment never get rewritten
function stripComments(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"' || ch === "'") { let k = i + 1; while (k < s.length && s[k] !== ch && s[k] !== '\n') { if (s[k] === '\\') k++; k++; } out += s.slice(i, k + 1); i = k + 1; continue; }
    if (ch === '/' && s[i + 1] === '/') { const k = s.indexOf('\n', i); i = k < 0 ? s.length : k; continue; }
    if (ch === '/' && s[i + 1] === '*') { const k = s.indexOf('*/', i + 2), e = k < 0 ? s.length : k + 2; out += s.slice(i, e).replace(/[^\n]/g, ''); i = e; continue; }
    out += ch; i++;
  }
  return out;
}
export function transpile(src) {
  let s = stripComments(src.replace(/\r/g, ''));
  s = s.replace(/^\s*#\s*include.*$/gm, '');
  s = s.replace(/^\s*#\s*define\s+(\w+)\s+(.+)$/gm, 'const $1 = $2;');
  s = s.replace(/\bLiquidCrystal_I2C\s+(\w+)\s*\(([^)]*)\)\s*;/g, 'let $1 = new LiquidCrystal_I2C($2);');
  s = s.replace(/\bDHT\s+(\w+)\s*\(([^)]*)\)\s*;/g, 'let $1 = new DHT($2);');
  s = s.replace(/\bAdafruit_SSD1306\s+(\w+)\s*\(([^)]*)\)\s*;/g, (_, n, a) => `let ${n} = new Adafruit_SSD1306(${a.replace(/&/g, '')});`).replace(/\bAdafruit_SSD1306\s+(\w+)\s*;/g, 'let $1 = new Adafruit_SSD1306();');
  s = s.replace(/\b(?:IRAM_ATTR|ICACHE_RAM_ATTR|ARDUINO_ISR_ATTR)\b/g, '');
  s = s.replace(/\bPROGMEM\b/g, '').replace(/\bstatic\s+(?=const\b)/g, '');
  s = s.replace(/(?<!\}\s*)\b((?:for|while)\s*\([^()]*(?:\([^()]*\)[^()]*)*\))\s*;/g, '$1 { }');   // for (;;); / while (1); → a loop the guard can pause
  s = s.replace(/\bKeypad\s+(\w+)\s*=\s*Keypad\s*\(/g, 'let $1 = new Keypad(').replace(/\bKeypad\s+(\w+)\s*\(/g, 'let $1 = new Keypad(');
  s = s.replace(/\.length\(\s*\)/g, '.length');
  s = s.replace(/\b(\w+)\.(trim|toUpperCase|toLowerCase)\(\s*\)\s*;/g, '$1 = $1.$2();');   // Arduino String changes itself; JS returns a new one      // Arduino String.length() → JS .length
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
  // arrays: int a[3] = {1, 2, 3};  char k[4][4] = {{...}, {...}};  → JS arrays
  s = s.replace(/\b(let|const)\s+(\w+)\s*((?:\[\s*\w*\s*\])+)\s*=\s*\{/g, (m, kw, name, dims, off, all) => `${kw} ${name} = \u0001`);
  s = s.replace(/\u0001/g, '{');
  s = arrayInits(s);
  s = s.replace(/\blet\s+(\w+)\s*\[\s*(\w+)\s*\]\s*;/g, 'let $1 = new Array($2).fill(0);');
  s = s.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((part, i) => (i % 2 ? part : part.replace(/\b(\d+(?:\.\d+)?)[uUlLfF]+\b/g, '$1'))).join('');   // 10UL, 2.5f (not inside strings)
  s = s.replace(/\bF\(\s*("(?:[^"\\]|\\.)*")\s*\)/g, '$1');
  s = guardLoops(s);
  s = wrapCalls(s, new Set([...fns, 'digitalWrite', 'shiftOut']));   // these two may pause one circuit step so every edge reaches the circuit
  if (!fns.has('loop')) throw new Error('No loop() found. A sketch needs void setup() { … } and void loop() { … }.');
  return `"use strict";\nconst { ${API_NAMES.join(', ')} } = __api;\n${['print', 'println', 'alert', 'confirm', 'prompt', 'open', 'close', 'stop', 'focus', 'blur', 'find', 'scroll', 'fetch'].filter(n => !fns.has(n)).map(n => `const ${n} = __no('${n}');`).join(' ')} const window = undefined, document = undefined, location = undefined;\n${s}\nreturn function* __main() { ${fns.has('setup') ? 'yield* setup();' : ''} for (;;) { yield* loop(); yield 0; } };`;
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
  // interrupts: attachInterrupt(digitalPinToInterrupt(pin), isr, RISING / FALLING / CHANGE / LOW / HIGH)
  const isrs = new Map(); let intOn = true;
  const level = (n) => { const v = host.v(n); return v == null ? 0 : v >= (B.vih + B.vil) / 2 ? 1 : 0; };
  const runIsr = (fn) => { const g = fn(); for (let k = 0; k < 100000; k++) if (g.next().done) return; throw new Error('the interrupt function never ends (no loops or delay() inside an ISR)'); };
  const writePin = (n, v) => { const m = host.pins[n]?.mode; if (v) lastHigh.set(n, host.t()); if (m == null || m === 'in' || m === 'pu' || m === 'pd') { setMode(n, v ? { mode: 'pu' } : null); return; } setMode(n, { mode: v ? 'high' : 'low' }); };
  const touched = new Set(); let rx = '';    // pins written in this circuit step · Serial input waiting to be read
  if (!String.prototype.toInt) Object.defineProperties(String.prototype, { toInt: { value() { return parseInt(this, 10) || 0; } }, toFloat: { value() { return parseFloat(this) || 0; } }, equals: { value(x) { return this == x; } }, equalsIgnoreCase: { value(x) { return this.toLowerCase() == String(x).toLowerCase(); } } });
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
  const displays = [], oleds = [];
  const Adafruit_SSD1306 = makeOled(fmt, oleds);
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
  // DHT11 / DHT22 (Adafruit DHT library): reads the sensor wired to that pin; NaN when it isn't there (like the real library)
  class DHT {
    constructor(pin, type = 22) { this.n = PN(pin); this.type = type; }
    begin() { }
    read() { return host.dht?.(this.n) ?? null; }
    readTemperature(f = false) { const d = this.read(); if (!d) return NaN; const t = this.type === 11 ? Math.round(d.t) : Math.round(d.t * 10) / 10; return f ? t * 1.8 + 32 : t; }
    readHumidity() { const d = this.read(); if (!d) return NaN; return this.type === 11 ? Math.round(d.h) : Math.round(d.h * 10) / 10; }
    computeHeatIndex(t, h, f = true) { const T = f ? t : t * 1.8 + 32; const HI = -42.379 + 2.04901523 * T + 10.14333127 * h - 0.22475541 * T * h - 0.00683783 * T * T - 0.05481717 * h * h + 0.00122874 * T * T * h + 0.00085282 * T * h * h - 0.00000199 * T * T * h * h; const out = T < 80 ? 0.5 * (T + 61 + (T - 68) * 1.2 + h * 0.094) : HI; return f ? out : (out - 32) / 1.8; }
  }
  // pulseIn on an HC-SR04 ECHO pin: echo width = distance × 58 µs, only after its TRIG got a HIGH pulse from this board
  const lastHigh = new Map();
  const pulseIn = (pin, level = 1, timeout = 1000000) => {
    const e = host.echo?.(PN(pin)); if (!e || !level) return 0;
    const t = lastHigh.get(e.trig); if (t == null || host.t() - t > 0.06) return 0;
    const us = Math.round(e.cm * 58.3); return us > timeout ? 0 : us;
  };
  // 4×4 keypad (Keypad library): getKey() returns the next key tapped on the keypad part wired to these row / column pins
  class Keypad {
    constructor(map, rowPins, colPins, rows = 4, cols = 4) { this.map = map; this.rows = [...rowPins].slice(0, rows).map(PN); this.cols = [...colPins].slice(0, cols).map(PN); this.last = ''; }
    getKey() { const k = host.keypad?.(this.rows, this.cols); if (!k) return ''; const ch = this.map?.[k.r]?.[k.c] ?? ''; this.last = ch; return ch; }
    getState() { return 0; } setDebounceTime() { } setHoldTime() { } isPressed(ch) { return this.last === ch; }
  }
  const Wire = { begin() { }, setClock() { }, beginTransmission() { }, endTransmission: () => 0, write() { }, requestFrom: () => 0, available: () => 0, read: () => 0 };
  const api = {
    HIGH: 1, LOW: 0, INPUT: 'in', OUTPUT: 'out', INPUT_PULLUP: 'pu', INPUT_PULLDOWN: 'pd', LED_BUILTIN: esp ? 2 : 13, PI: Math.PI, DEC: 10, HEX: 16, BIN: 2,
    A0: esp ? 36 : 'A0', A1: esp ? 37 : 'A1', A2: esp ? 38 : 'A2', A3: esp ? 39 : 'A3', A4: esp ? 32 : 'A4', A5: esp ? 33 : 'A5', A6: esp ? 34 : 'A6', A7: esp ? 35 : 'A7',
    __ops: { n: 0 },
    int: (x) => Math.trunc(x), float: (x) => +x,
    pinMode(pin, m) { const n = PN(pin); setMode(n, m === 'out' ? { mode: host.pins[n]?.mode === 'high' ? 'high' : 'low' } : m === 'in' ? null : { mode: m }); },
    // a 2nd write to the same pin in one circuit step waits for the next step, so the circuit sees the pulse (clock lines, shiftOut)
    *digitalWrite(pin, v) { const n = PN(pin); if (touched.has(n)) yield -1; touched.add(n); writePin(n, v); },
    *shiftOut(dataPin, clockPin, order, val) {
      for (let i = 0; i < 8; i++) {
        const bit = order === 0 ? (val >> i) & 1 : (val >> (7 - i)) & 1;
        yield* api.digitalWrite(dataPin, bit); yield* api.digitalWrite(clockPin, 1); yield* api.digitalWrite(clockPin, 0);
      }
    },
    MSBFIRST: 1, LSBFIRST: 0,
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
    Serial: { begin() { }, available: () => rx.length, read() { if (!rx.length) return -1; const ch = rx.charCodeAt(0); rx = rx.slice(1); return ch; }, peek: () => (rx.length ? rx.charCodeAt(0) : -1),
      readStringUntil(c) { const ch = typeof c === 'number' ? String.fromCharCode(c) : String(c), k = rx.indexOf(ch); const out = k < 0 ? rx : rx.slice(0, k); rx = k < 0 ? '' : rx.slice(k + 1); return out; },
      readString() { const out = rx; rx = ''; return out; },
      parseInt() { const m = rx.match(/^[^-\d]*(-?\d+)/); if (!m) { rx = ''; return 0; } rx = rx.slice(m[0].length); return +m[1]; },
      parseFloat() { const m = rx.match(/^[^-\d.]*(-?\d*\.?\d+)/); if (!m) { rx = ''; return 0; } rx = rx.slice(m[0].length); return +m[1]; },
      setTimeout() { }, print(x, f) { say(fmt(x, f)); }, println(x = '', f) { say(fmt(x, f)); endLine(); }, printf(f, ...a) { let i = 0; const t = String(f).replace(/%[-+0 #]*\d*(?:\.(\d+))?[dilufsxXc%]/g, (m, d) => m === '%%' ? '%' : /[xX]/.test(m) ? Math.trunc(a[i++]).toString(16) : /f/.test(m) ? (+a[i++]).toFixed(d ? +d : 6) : /[dilu]/.test(m) ? String(Math.trunc(a[i++])) : String(a[i++])); const parts = t.split('\n'); parts.forEach((x, k) => { if (x) say(x); if (k < parts.length - 1) endLine(); }); }, flush() { } },
    RISING: 3, FALLING: 2, CHANGE: 4, NOT_AN_INTERRUPT: -1,
    digitalPinToInterrupt(pin) { if (esp) return pin; const n = PN(pin); return n === 'D2' ? 0 : n === 'D3' ? 1 : -1; },
    attachInterrupt(num, fn, mode) {
      const n = esp ? PN(num) : num === 0 ? 'D2' : num === 1 ? 'D3' : null;
      if (!n) throw new Error('attachInterrupt: on the UNO only D2 (interrupt 0) and D3 (interrupt 1) have interrupts. Use attachInterrupt(digitalPinToInterrupt(2), …)');
      if (typeof fn !== 'function') throw new Error('attachInterrupt: the 2nd argument must be the name of your function, without ()');
      isrs.set(n, { fn, mode, last: level(n) });
    },
    detachInterrupt(num) { isrs.delete(esp ? PN(num) : num === 0 ? 'D2' : 'D3'); },
    interrupts() { intOn = true; }, noInterrupts() { intOn = false; },
    __no: (n) => () => { throw new Error(`${n}() is not an Arduino function` + (n === 'print' || n === 'println' ? `. Use Serial.${n}() or lcd.${n}().` : '.')); },
    Keypad, makeKeymap: (m) => m, NO_KEY: '', Adafruit_SSD1306, ...OLED_CONST,
    Servo, LiquidCrystal_I2C, Wire, DHT, DHT11: 11, DHT22: 22, DHT21: 21, pulseIn, pulseInLong: pulseIn, isnan: Number.isNaN, NAN: NaN, yieldNow: 0,
  };
  let main;
  try { main = new Function('__api', js)(api); } catch (e) { throw new Error('Code error: ' + e.message); }
  const gen = main();
  let wake = 0, err = null, done = false;
  return {
    lines, displays, oleds, send(txt) { rx += txt; if (rx.length > 4096) rx = rx.slice(-4096); }, get err() { return err; },
    // run the sketch up to circuit time t (call once per simulator step)
    step(t) {
      if (err) return;
      touched.clear();
      if (intOn && isrs.size) {
        try {
          for (const [n, q] of isrs) {
            const lv = level(n), m = q.mode, hit = m === 4 ? lv !== q.last : m === 3 ? !q.last && lv : m === 2 ? q.last && !lv : m === 0 ? !lv : m === 1 ? !!lv : false;
            q.last = lv; if (hit) runIsr(q.fn);
          }
        } catch (e) { err = 'Runtime error in interrupt: ' + e.message; return; }
      }
      if (done || t + 1e-12 < wake) return;
      for (let k = 0; k < 4000; k++) {
        let r;
        try { r = gen.next(); } catch (e) { err = 'Runtime error: ' + e.message; return; }
        if (r.done) { done = true; return; }
        if (r.value === -1) return;               // a pin changes twice: let the circuit see this level first
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
  relays595: { name: '74HC595 x2: 10 relays by Serial / binary', esp: '// 10 relay modules on 3 wires: two 74HC595 shift registers in a chain (cascade)\n// Serial Monitor commands (type below, press Send):\n//   3          toggle relay 3\n//   on 3 / off 3\n//   on 1,3,5   off 2,4   (pick several)\n//   all on / all off\n//   1000000001 binary, one digit per relay (relay 1 first), 1 = ON\n//   time 5     reset time: each relay switches itself OFF 5 s after it went ON (time 0 = stays ON)\n\nconst int DATA  = 19;   // 74HC595 pin 14 SER   (only to the 1st chip)\nconst int CLOCK = 18;   // 74HC595 pin 11 SRCLK (both chips)\nconst int LATCH = 5;    // 74HC595 pin 12 RCLK  (both chips)\nconst int OE    = 4;    // 74HC595 pin 13 OE    (both chips): HIGH = all outputs off\nconst int NRELAYS = 10;\nconst bool ACTIVE_LOW = true;   // most relay modules switch ON when IN is LOW\n\nunsigned int relays = 0;     // bit 0 = relay 1 ... bit 9 = relay 10\nunsigned int before = 0;     // what writeRelays() sent last time\nunsigned long onSince[10];   // millis() when each relay went ON\nunsigned long resetMs = 0;   // reset time in ms (0 = relays stay ON)\n\nvoid writeRelays() {\n  for (int i = 0; i < NRELAYS; i++)\n    if (((relays >> i) & 1) && !((before >> i) & 1)) onSince[i] = millis();   // just went ON: start its timer\n  before = relays;\n  unsigned int out = relays;\n  if (ACTIVE_LOW) out = ~relays;              // flip: ON = LOW\n  digitalWrite(LATCH, LOW);\n  shiftOut(DATA, CLOCK, MSBFIRST, (out >> 8) & 0xFF);   // the LAST chip\'s byte goes first\n  shiftOut(DATA, CLOCK, MSBFIRST, out & 0xFF);          // the 1st chip\'s byte\n  digitalWrite(LATCH, HIGH);                             // all outputs change at the same moment\n}\n\n// "1,3,5" → switch those relays on or off\nvoid setList(String list, bool on) {\n  list += ",";\n  int start = 0;\n  for (int i = 0; i < list.length(); i++) {\n    if (list.charAt(i) == \',\') {\n      int n = list.substring(start, i).toInt();\n      if (n >= 1 && n <= NRELAYS) {\n        if (on) relays |= (1 << (n - 1));\n        else relays &= ~(1 << (n - 1));\n      }\n      start = i + 1;\n    }\n  }\n}\n\nvoid printRelays() {\n  Serial.print("Relays 1-10: ");\n  for (int i = 0; i < NRELAYS; i++) Serial.print((relays >> i) & 1);\n  Serial.println();\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(DATA, OUTPUT);\n  pinMode(CLOCK, OUTPUT);\n  pinMode(LATCH, OUTPUT);\n  pinMode(OE, OUTPUT);\n  digitalWrite(OE, HIGH);           // outputs off while we load "all OFF"\n  writeRelays();                    // all OFF first\n  digitalWrite(OE, LOW);            // now the chips drive the relays\n\n  // test: click each relay once, 1 to 10\n  for (int i = 0; i < NRELAYS; i++) {\n    relays = 1 << i;\n    writeRelays();\n    delay(250);\n  }\n  relays = 0;\n  writeRelays();\n  Serial.println("Ready. Type 3, on 1,3,5, off 2, all on, all off, 1000000001 or time 5");\n}\n\nvoid loop() {\n  if (Serial.available()) {\n    String cmd = Serial.readStringUntil(\'\\n\');\n    cmd.trim();\n    cmd.toLowerCase();\n\n    if (cmd == "all on") relays = (1 << NRELAYS) - 1;\n    else if (cmd == "all off") relays = 0;\n    else if (cmd.startsWith("time ")) {\n      resetMs = cmd.substring(5).toFloat() * 1000;\n      Serial.print("Reset time: ");\n      if (resetMs == 0) Serial.println("off");\n      else {\n        Serial.print(resetMs / 1000.0, 1);\n        Serial.println(" s");\n      }\n    }\n    else if (cmd.startsWith("on ")) setList(cmd.substring(3), true);\n    else if (cmd.startsWith("off ")) setList(cmd.substring(4), false);\n    else if (cmd.length() == NRELAYS && cmd.indexOf(\'2\') < 0) {   // binary\n      relays = 0;\n      for (int i = 0; i < NRELAYS; i++) if (cmd.charAt(i) == \'1\') relays |= (1 << i);\n    } else {\n      int n = cmd.toInt();\n      if (n >= 1 && n <= NRELAYS) relays ^= (1 << (n - 1));   // toggle\n      else Serial.println("?? " + cmd);\n    }\n    writeRelays();\n    printRelays();\n  }\n\n  // reset time: switch OFF every relay that has been ON long enough\n  if (resetMs > 0) {\n    unsigned int was = relays;\n    for (int i = 0; i < NRELAYS; i++)\n      if (((relays >> i) & 1) && millis() - onSince[i] >= resetMs) relays &= ~(1 << i);\n    if (relays != was) {\n      writeRelays();\n      printRelays();\n    }\n  }\n}\n',
    uno: '// 10 relay modules on 3 wires: two 74HC595 shift registers in a chain (cascade)\n// Serial Monitor commands (type below, press Send):\n//   3          toggle relay 3\n//   on 3 / off 3\n//   on 1,3,5   off 2,4   (pick several)\n//   all on / all off\n//   1000000001 binary, one digit per relay (relay 1 first), 1 = ON\n//   time 5     reset time: each relay switches itself OFF 5 s after it went ON (time 0 = stays ON)\n\nconst int DATA  = 11;   // 74HC595 pin 14 SER   (only to the 1st chip)\nconst int CLOCK = 12;   // 74HC595 pin 11 SRCLK (both chips)\nconst int LATCH = 8;    // 74HC595 pin 12 RCLK  (both chips)\nconst int OE    = 7;    // 74HC595 pin 13 OE    (both chips): HIGH = all outputs off\nconst int NRELAYS = 10;\nconst bool ACTIVE_LOW = true;   // most relay modules switch ON when IN is LOW\n\nunsigned int relays = 0;     // bit 0 = relay 1 ... bit 9 = relay 10\nunsigned int before = 0;     // what writeRelays() sent last time\nunsigned long onSince[10];   // millis() when each relay went ON\nunsigned long resetMs = 0;   // reset time in ms (0 = relays stay ON)\n\nvoid writeRelays() {\n  for (int i = 0; i < NRELAYS; i++)\n    if (((relays >> i) & 1) && !((before >> i) & 1)) onSince[i] = millis();   // just went ON: start its timer\n  before = relays;\n  unsigned int out = relays;\n  if (ACTIVE_LOW) out = ~relays;              // flip: ON = LOW\n  digitalWrite(LATCH, LOW);\n  shiftOut(DATA, CLOCK, MSBFIRST, (out >> 8) & 0xFF);   // the LAST chip\'s byte goes first\n  shiftOut(DATA, CLOCK, MSBFIRST, out & 0xFF);          // the 1st chip\'s byte\n  digitalWrite(LATCH, HIGH);                             // all outputs change at the same moment\n}\n\n// "1,3,5" → switch those relays on or off\nvoid setList(String list, bool on) {\n  list += ",";\n  int start = 0;\n  for (int i = 0; i < list.length(); i++) {\n    if (list.charAt(i) == \',\') {\n      int n = list.substring(start, i).toInt();\n      if (n >= 1 && n <= NRELAYS) {\n        if (on) relays |= (1 << (n - 1));\n        else relays &= ~(1 << (n - 1));\n      }\n      start = i + 1;\n    }\n  }\n}\n\nvoid printRelays() {\n  Serial.print("Relays 1-10: ");\n  for (int i = 0; i < NRELAYS; i++) Serial.print((relays >> i) & 1);\n  Serial.println();\n}\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(DATA, OUTPUT);\n  pinMode(CLOCK, OUTPUT);\n  pinMode(LATCH, OUTPUT);\n  pinMode(OE, OUTPUT);\n  digitalWrite(OE, HIGH);           // outputs off while we load "all OFF"\n  writeRelays();                    // all OFF first\n  digitalWrite(OE, LOW);            // now the chips drive the relays\n\n  // test: click each relay once, 1 to 10\n  for (int i = 0; i < NRELAYS; i++) {\n    relays = 1 << i;\n    writeRelays();\n    delay(250);\n  }\n  relays = 0;\n  writeRelays();\n  Serial.println("Ready. Type 3, on 1,3,5, off 2, all on, all off, 1000000001 or time 5");\n}\n\nvoid loop() {\n  if (Serial.available()) {\n    String cmd = Serial.readStringUntil(\'\\n\');\n    cmd.trim();\n    cmd.toLowerCase();\n\n    if (cmd == "all on") relays = (1 << NRELAYS) - 1;\n    else if (cmd == "all off") relays = 0;\n    else if (cmd.startsWith("time ")) {\n      resetMs = cmd.substring(5).toFloat() * 1000;\n      Serial.print("Reset time: ");\n      if (resetMs == 0) Serial.println("off");\n      else {\n        Serial.print(resetMs / 1000.0, 1);\n        Serial.println(" s");\n      }\n    }\n    else if (cmd.startsWith("on ")) setList(cmd.substring(3), true);\n    else if (cmd.startsWith("off ")) setList(cmd.substring(4), false);\n    else if (cmd.length() == NRELAYS && cmd.indexOf(\'2\') < 0) {   // binary\n      relays = 0;\n      for (int i = 0; i < NRELAYS; i++) if (cmd.charAt(i) == \'1\') relays |= (1 << i);\n    } else {\n      int n = cmd.toInt();\n      if (n >= 1 && n <= NRELAYS) relays ^= (1 << (n - 1));   // toggle\n      else Serial.println("?? " + cmd);\n    }\n    writeRelays();\n    printRelays();\n  }\n\n  // reset time: switch OFF every relay that has been ON long enough\n  if (resetMs > 0) {\n    unsigned int was = relays;\n    for (int i = 0; i < NRELAYS; i++)\n      if (((relays >> i) & 1) && millis() - onSince[i] >= resetMs) relays &= ~(1 << i);\n    if (relays != was) {\n      writeRelays();\n      printRelays();\n    }\n  }\n}\n' },
  encoder: { name: 'Rotary encoder + interrupt (count in Serial)', esp: '// Rotary encoder (KY-040) with an interrupt: the count changes the instant you turn\nconst int CLK = 32;   // must be an interrupt pin\nconst int DT  = 33;\nconst int SW  = 25;\n\nvolatile int count = 0;\n\nvoid IRAM_ATTR readEncoder() {\n  if (digitalRead(DT) == HIGH) count++;   // turned right\n  else count--;                           // turned left\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(CLK, INPUT);\n  pinMode(DT, INPUT);\n  pinMode(SW, INPUT_PULLUP);\n  attachInterrupt(digitalPinToInterrupt(CLK), readEncoder, FALLING);\n}\n\nint last = 0;\n\nvoid loop() {\n  if (count != last) {\n    last = count;\n    Serial.print("Count: ");\n    Serial.println(last);\n  }\n  if (digitalRead(SW) == LOW) {\n    count = 0;\n    Serial.println("Reset");\n    delay(300);\n  }\n  delay(10);\n}\n',
    uno: '// Rotary encoder (KY-040) with an interrupt: the count changes the instant you turn\nconst int CLK = 2  ;   // UNO: only D2 / D3 have interrupts\nconst int DT  = 3;\nconst int SW  = 4;\n\nvolatile int count = 0;\n\nvoid readEncoder() {\n  if (digitalRead(DT) == HIGH) count++;   // turned right\n  else count--;                           // turned left\n}\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(CLK, INPUT);\n  pinMode(DT, INPUT);\n  pinMode(SW, INPUT_PULLUP);\n  attachInterrupt(digitalPinToInterrupt(CLK), readEncoder, FALLING);\n}\n\nint last = 0;\n\nvoid loop() {\n  if (count != last) {\n    last = count;\n    Serial.print("Count: ");\n    Serial.println(last);\n  }\n  if (digitalRead(SW) == LOW) {\n    count = 0;\n    Serial.println("Reset");\n    delay(300);\n  }\n  delay(10);\n}\n' },
  oled: { name: 'OLED 128x64 SSD1306: text, bar and live graph', esp: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n\n#define SCREEN_WIDTH 128\n#define SCREEN_HEIGHT 64\nAdafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);   // SDA = GPIO21, SCL = GPIO22\n\nint graph[128];   // last 128 readings for the moving graph\n\nvoid setup() {\n  Serial.begin(115200);\n  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n    Serial.println("OLED not found");\n    for (;;);\n  }\n  for (int i = 0; i < 128; i++) graph[i] = 63;\n  display.clearDisplay();\n  display.setTextSize(2);\n  display.setTextColor(SSD1306_WHITE);\n  display.setCursor(4, 24);\n  display.println("Hello migo");\n  display.display();\n  delay(1500);\n}\n\nvoid loop() {\n  float v = analogRead(34) * 3.3 / 4095;\n\n  for (int i = 0; i < 127; i++) graph[i] = graph[i + 1];\n  graph[127] = 63 - int(v / 3.3 * 28);\n\n  display.clearDisplay();\n  display.setTextSize(1);\n  display.setCursor(0, 0);\n  display.print("Pot voltage");\n  display.setTextSize(2);\n  display.setCursor(0, 14);\n  display.print(v, 2);\n  display.print(" V");\n  display.drawRect(84, 16, 44, 10, SSD1306_WHITE);\n  display.fillRect(86, 18, int(v / 3.3 * 40), 6, SSD1306_WHITE);\n  display.drawFastHLine(0, 34, 128, SSD1306_WHITE);\n  for (int x = 1; x < 128; x++) display.drawLine(x - 1, graph[x - 1], x, graph[x], SSD1306_WHITE);\n  display.display();\n  delay(100);\n}\n',
    uno: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n\n#define SCREEN_WIDTH 128\n#define SCREEN_HEIGHT 64\nAdafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);   // SDA = A4, SCL = A5\n\nint graph[128];   // last 128 readings for the moving graph\n\nvoid setup() {\n  Serial.begin(9600);\n  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n    Serial.println("OLED not found");\n    for (;;);\n  }\n  for (int i = 0; i < 128; i++) graph[i] = 63;\n  display.clearDisplay();\n  display.setTextSize(2);\n  display.setTextColor(SSD1306_WHITE);\n  display.setCursor(4, 24);\n  display.println("Hello migo");\n  display.display();\n  delay(1500);\n}\n\nvoid loop() {\n  float v = analogRead(A0) * 5.0 / 1023;\n\n  for (int i = 0; i < 127; i++) graph[i] = graph[i + 1];\n  graph[127] = 63 - int(v / 5.0 * 28);\n\n  display.clearDisplay();\n  display.setTextSize(1);\n  display.setCursor(0, 0);\n  display.print("Pot voltage");\n  display.setTextSize(2);\n  display.setCursor(0, 14);\n  display.print(v, 2);\n  display.print(" V");\n  display.drawRect(84, 16, 44, 10, SSD1306_WHITE);\n  display.fillRect(86, 18, int(v / 5.0 * 40), 6, SSD1306_WHITE);\n  display.drawFastHLine(0, 34, 128, SSD1306_WHITE);\n  for (int x = 1; x < 128; x++) display.drawLine(x - 1, graph[x - 1], x, graph[x], SSD1306_WHITE);\n  display.display();\n  delay(100);\n}\n' },
  lcd: { name: 'LCD 16x2 I2C: show the pot voltage', esp: '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\n\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // SDA = GPIO21, SCL = GPIO22\n\nvoid setup() {\n  lcd.init();\n  lcd.backlight();\n  lcd.print("Hello migo!");\n}\n\nvoid loop() {\n  float v = analogRead(34) * 3.3 / 4095;\n  lcd.setCursor(0, 1);\n  lcd.print("Pot: ");\n  lcd.print(v, 2);\n  lcd.print(" V   ");\n  delay(200);\n}\n',
    uno: '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\n\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // SDA = A4, SCL = A5\n\nvoid setup() {\n  lcd.init();\n  lcd.backlight();\n  lcd.print("Hello migo!");\n}\n\nvoid loop() {\n  float v = analogRead(A0) * 5.0 / 1023;\n  lcd.setCursor(0, 1);\n  lcd.print("A0: ");\n  lcd.print(v, 2);\n  lcd.print(" V   ");\n  delay(200);\n}\n' },
  thermo: { name: 'DHT22 thermostat: fan on above 30 °C', esp: '#include <DHT.h>\n\nDHT dht(4, DHT22);        // DATA on GPIO4\nconst int FAN = 23;\n\nvoid setup() {\n  Serial.begin(115200);\n  dht.begin();\n  pinMode(FAN, OUTPUT);\n}\n\nvoid loop() {\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  if (isnan(t)) {\n    Serial.println("DHT not found!");\n    delay(1000);\n    return;\n  }\n  digitalWrite(FAN, t > 30 ? HIGH : LOW);\n  Serial.printf("%.1f C  %.0f %%  fan %s\\n", t, h, t > 30 ? "ON" : "OFF");\n  delay(1000);\n}\n',
    uno: '#include <DHT.h>\n\nDHT dht(2, DHT22);        // DATA on D2\nconst int FAN = 13;\n\nvoid setup() {\n  Serial.begin(9600);\n  dht.begin();\n  pinMode(FAN, OUTPUT);\n}\n\nvoid loop() {\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  if (isnan(t)) {\n    Serial.println("DHT not found!");\n    delay(1000);\n    return;\n  }\n  digitalWrite(FAN, t > 30 ? HIGH : LOW);\n  Serial.print(t, 1); Serial.print(" C  ");\n  Serial.print(h, 0); Serial.println(" %");\n  delay(1000);\n}\n' },
  sonar: { name: 'HC-SR04 distance: LED when closer than 20 cm', esp: 'const int TRIG = 5, ECHO = 18, LED = 23;   // ECHO is 5 V: use a divider into the ESP32!\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  long us = pulseIn(ECHO, HIGH, 30000);\n  float cm = us / 58.0;\n  digitalWrite(LED, cm > 0 && cm < 20 ? HIGH : LOW);\n  Serial.print("Distance: ");\n  Serial.print(cm, 1);\n  Serial.println(" cm");\n  delay(200);\n}\n',
    uno: 'const int TRIG = 9, ECHO = 10, LED = 13;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  long us = pulseIn(ECHO, HIGH, 30000);   // echo time in microseconds\n  float cm = us / 58.0;\n  digitalWrite(LED, cm > 0 && cm < 20 ? HIGH : LOW);\n  Serial.print("Distance: ");\n  Serial.print(cm, 1);\n  Serial.println(" cm");\n  delay(200);\n}\n' },
  servo: { name: 'Servo sweep', esp: '#include <ESP32Servo.h>\n\nServo arm;\n\nvoid setup() {\n  arm.attach(18);\n}\n\nvoid loop() {\n  for (int a = 0; a <= 180; a += 10) {\n    arm.write(a);\n    delay(100);\n  }\n  for (int a = 180; a >= 0; a -= 10) {\n    arm.write(a);\n    delay(100);\n  }\n}\n',
    uno: '#include <Servo.h>\n\nServo arm;\n\nvoid setup() {\n  arm.attach(9);\n}\n\nvoid loop() {\n  for (int a = 0; a <= 180; a += 10) {\n    arm.write(a);\n    delay(100);\n  }\n  for (int a = 180; a >= 0; a -= 10) {\n    arm.write(a);\n    delay(100);\n  }\n}\n' },
};
