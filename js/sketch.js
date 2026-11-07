// Arduino sketch runner: turns simple Arduino C++ (setup / loop, pinMode, digitalWrite, analogRead, delay, Serial, Servo, ledc…)
// into a JavaScript generator that the simulator steps through in circuit time. delay() pauses the sketch while the circuit runs on.
// Not a full C++ compiler: no classes / structs / pointers. attachInterrupt works: the ISR runs on the pin edge, between circuit steps. Ints divide like floats unless you use int().
import { BOARDS } from './sch-core.js';
import { makeOled, OLED_CONST } from './oled.js';

// ADS1X15 gains (library values) → full-scale volts; MUX values for startADCReading
const ADS_CONST = { GAIN_TWOTHIRDS: 0x0000, GAIN_ONE: 0x0200, GAIN_TWO: 0x0400, GAIN_FOUR: 0x0600, GAIN_EIGHT: 0x0800, GAIN_SIXTEEN: 0x0A00,
  RATE_ADS1115_8SPS: 0x0000, RATE_ADS1115_16SPS: 0x0020, RATE_ADS1115_32SPS: 0x0040, RATE_ADS1115_64SPS: 0x0060, RATE_ADS1115_128SPS: 0x0080, RATE_ADS1115_250SPS: 0x00A0, RATE_ADS1115_475SPS: 0x00C0, RATE_ADS1115_860SPS: 0x00E0,
  RATE_ADS1015_128SPS: 0x0000, RATE_ADS1015_1600SPS: 0x0080, RATE_ADS1015_3300SPS: 0x00C0,
  ADS1X15_REG_CONFIG_MUX_DIFF_0_1: 0x0000, ADS1X15_REG_CONFIG_MUX_DIFF_0_3: 0x1000, ADS1X15_REG_CONFIG_MUX_DIFF_1_3: 0x2000, ADS1X15_REG_CONFIG_MUX_DIFF_2_3: 0x3000,
  ADS1X15_REG_CONFIG_MUX_SINGLE_0: 0x4000, ADS1X15_REG_CONFIG_MUX_SINGLE_1: 0x5000, ADS1X15_REG_CONFIG_MUX_SINGLE_2: 0x6000, ADS1X15_REG_CONFIG_MUX_SINGLE_3: 0x7000 };
const ADS_FS = { 0x0000: 6.144, 0x0200: 4.096, 0x0400: 2.048, 0x0600: 1.024, 0x0800: 0.512, 0x0A00: 0.256 };
const ADS_MUX = { 0x0000: [0, 1], 0x1000: [0, 3], 0x2000: [1, 3], 0x3000: [2, 3], 0x4000: [0], 0x5000: [1], 0x6000: [2], 0x7000: [3] };
const TYPES = 'int|long|short|float|double|bool|boolean|byte|char|word|size_t|String|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t';
const API_NAMES = ['pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'analogReadMilliVolts', 'ledcSetup', 'ledcAttachPin', 'ledcAttach', 'ledcWrite', 'ledcDetachPin', 'ledcDetach',
  'tone', 'noTone', 'dacWrite', 'dacDisable', 'analogReadResolution', 'analogWriteResolution', 'analogSetAttenuation', 'analogWriteFrequency', 'millis', 'micros', 'Serial', 'Servo', 'LiquidCrystal_I2C', 'Wire', 'DHT', 'DHT11', 'DHT22', 'DHT21', 'pulseIn', 'pulseInLong', 'isnan', 'NAN', 'Keypad', 'makeKeymap', 'NO_KEY', 'Adafruit_SSD1306', ...Object.keys(OLED_CONST), 'Adafruit_ADS1115', 'Adafruit_ADS1015', ...Object.keys(ADS_CONST), 'attachInterrupt', 'detachInterrupt', 'digitalPinToInterrupt', 'interrupts', 'noInterrupts', 'shiftOut', 'MSBFIRST', 'LSBFIRST', 'RISING', 'FALLING', 'CHANGE', 'NOT_AN_INTERRUPT', 'map', 'constrain', 'random', 'randomSeed', 'abs', 'fabs', 'fmod', 'min', 'max', 'pow', 'sqrt', 'sq', 'sin', 'cos', 'tan', 'floor', 'ceil', 'round',
  'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'PI', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'DEC', 'HEX', 'BIN', '__ops', 'int', 'float', 'yieldNow', '__no',
  'WiFi', 'WiFiClient', 'PubSubClient', 'WL_CONNECTED', 'WL_DISCONNECTED', 'WL_IDLE_STATUS', 'WL_CONNECT_FAILED', 'WL_NO_SSID_AVAIL', 'WIFI_STA', 'WIFI_AP', 'WIFI_AP_STA', 'WIFI_OFF',
  'Adafruit_INA219', 'RTC_DS3231', 'DateTime', 'TimeSpan', '__DATE__', '__TIME__', 'Stepper', 'strcmp', 'strncmp', 'atoi', 'atof', 'strlen', 'dtostrf', 'snprintf', 'sprintf', 'SD', 'SPI', 'FILE_READ', 'FILE_WRITE', 'FILE_APPEND', 'O_READ', 'O_WRITE', 'CARD_NONE', 'CARD_MMC', 'CARD_SD', 'CARD_SDHC', 'CARD_UNKNOWN'];

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
  s = s.replace(/\b(Adafruit_ADS1[01]15)\s+(\w+)\s*(?:\(\s*\))?\s*;/g, 'let $2 = new $1();');
  s = s.replace(/\b(WiFiClient|RTC_DS3231)\s+(\w+)\s*(?:\(\s*\))?\s*;/g, 'let $2 = new $1();');
  // millis() / 1000 is whole-number division in C (unsigned long): keep it whole here too
  s = s.replace(/\b(millis|micros)\(\s*\)\s*\/\s*(\d+)(?![.\deEfF])/g, 'Math.trunc($1() / $2)');
  s = s.replace(/\bFile\s+(\w+)\s*=/g, 'let $1 =').replace(/\bFile\s+(\w+)\s*;/g, 'let $1 = null;');   // SD.h File
  s = s.replace(/\b(PubSubClient|Adafruit_INA219)\s+(\w+)\s*\(([^)]*)\)\s*;/g, 'let $2 = new $1($3);').replace(/\b(PubSubClient|Adafruit_INA219)\s+(\w+)\s*;/g, 'let $2 = new $1();');
  s = s.replace(/\b(DateTime|TimeSpan)\s+(\w+)\s*=/g, 'let $2 =').replace(/\b(DateTime|TimeSpan)\s+(\w+)\s*\(([^)]*)\)\s*;/g, 'let $2 = new $1($3);');
  s = s.replace(/(?<!new\s+|function\*?\s+)\b(DateTime|TimeSpan)\s*\(/g, 'new $1(');
  // Stepper.h: step() blocks (one coil change per 60 / (steps × rpm) s), so it runs as a generator in circuit time
  const steppers = []; s = s.replace(/\bStepper\s+(\w+)\s*\(([^)]*)\)\s*;/g, (_, n, a) => { steppers.push(n); return `let ${n} = new Stepper(${a});`; });
  for (const n of steppers) s = s.replace(new RegExp(`(?<![\\w.])${n}\\.step\\s*\\(`, 'g'), `yield* ${n}.step(`);
  s = s.replace(/\(\s*(?:const\s+)?(?:char|byte|uint8_t)\s*\*\s*\)/g, '');     // (char*) payload
  // C writes into the buffer: snprintf(buf, 20, …) / sprintf(buf, …) / dtostrf(x, 4, 1, buf) → buf = …
  s = s.replace(/(^|[;{}\s])(snprintf|sprintf)\s*\(\s*(\w+)\s*,/gm, '$1$3 = $2($3,').replace(/(^|[;{}\s])dtostrf\s*\(([^;]*?),\s*(\w+)\s*\)\s*;/gm, '$1$3 = dtostrf($2, $3);');
  s = s.replace(/\bAdafruit_SSD1306\s+(\w+)\s*\(([^)]*)\)\s*;/g, (_, n, a) => `let ${n} = new Adafruit_SSD1306(${a.replace(/&/g, '')});`).replace(/\bAdafruit_SSD1306\s+(\w+)\s*;/g, 'let $1 = new Adafruit_SSD1306();');
  s = s.replace(/\b(?:IRAM_ATTR|ICACHE_RAM_ATTR|ARDUINO_ISR_ATTR)\b/g, '');
  s = s.replace(/\bPROGMEM\b/g, '').replace(/\bstatic\s+(?=const\b)/g, '');
  s = s.replace(/(?<!\}\s*)\b((?:for|while)\s*\([^()]*(?:\([^()]*\)[^()]*)*\))\s*;/g, '$1 { }');   // for (;;); / while (1); → a loop the guard can pause
  s = s.replace(/\bKeypad\s+(\w+)\s*=\s*Keypad\s*\(/g, 'let $1 = new Keypad(').replace(/\bKeypad\s+(\w+)\s*\(/g, 'let $1 = new Keypad(');
  s = s.replace(/\.length\(\s*\)/g, '.length');
  s = s.replace(/\b(\w+)\.(trim|toUpperCase|toLowerCase)\(\s*\)\s*;/g, '$1 = $1.$2();');   // Arduino String changes itself; JS returns a new one      // Arduino String.length() → JS .length
  s = s.replace(/\bServo\s+(\w+(?:\s*,\s*\w+)*)\s*;/g, (_, names) => 'let ' + names.split(',').map(n => `${n.trim()} = new Servo()`).join(', ') + ';');
  // function definitions → generators (params lose their types)
  const fns = new Set(), intFns = [];
  // const char* name = "…" → const name = "…"
  s = s.replace(/\bconst\s+char\s*\*\s*(?:const\s+)?(?=[A-Za-z_]\w*\s*=)/g, 'const ').replace(/(^|[;{}\s])char\s*\*\s*(?=[A-Za-z_]\w*\s*=)/gm, '$1let ');
  const defRe = new RegExp(`\\b(?:static\\s+|inline\\s+)?(void|unsigned\\s+(?:${TYPES})|unsigned|${TYPES})\\s*([*&]?)\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
  s = s.replace(defRe, (_, type, ptr, name, params) => {
    fns.add(name);
    const ps = params.trim() === '' || params.trim() === 'void' ? [] : params.split(',').map(p => { const t = p.replace(/=.*$/, '').replace(/[&*\[\]]/g, ' ').trim().split(/\s+/); return t[t.length - 1]; });
    // int / long / byte … functions: C drops the fraction of the returned value
    if (!ptr && /^(?:unsigned\b.*|unsigned|int|long|short|byte|word|size_t|u?int\d+_t)$/.test(type)) { intFns.push([name, ps.length]); return `function* __i_${name}(${ps.join(', ')}) {`; }
    return `function* ${name}(${ps.join(', ')}) {`;
  });
  for (const [n] of intFns) s += `\nfunction* ${n}(...a) { const r = yield* __i_${n}(...a); return typeof r === 'number' ? Math.trunc(r) : r; }`;
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
  s = s.replace(/\bF\(\s*(__DATE__|__TIME__)\s*\)/g, '$1');
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
    if (typeof x === 'number') { if (Number.isInteger(x)) { if (typeof f === 'number' && ![2, 8, 10, 16].includes(f)) return x.toFixed(Math.min(10, f));   // print(1.0, 1) → "1.0" (a float that happens to be whole)
      if (f === 16) return x.toString(16).toUpperCase(); if (f === 2) return x.toString(2); if (f === 8) return x.toString(8); return String(x); } return x.toFixed(typeof f === 'number' ? Math.min(10, f) : 2); }   // print(float, n) = n decimals, print(int, HEX/BIN) = base
    if (typeof x === 'boolean') return x ? '1' : '0';
    return String(x);
  };
  // interrupts: attachInterrupt(digitalPinToInterrupt(pin), isr, RISING / FALLING / CHANGE / LOW / HIGH)
  const isrs = new Map(); let intOn = true;
  const level = (n) => { const v = host.v(n); return v == null ? 0 : v >= (B.vih + B.vil) / 2 ? 1 : 0; };
  const runIsr = (fn) => { const g = fn(); for (let k = 0; k < 100000; k++) if (g.next().done) return; throw new Error('the interrupt function never ends (no loops or delay() inside an ISR)'); };
  const writePin = (n, v) => { const m = host.pins[n]?.mode; if (v) lastHigh.set(n, host.t()); if (m == null || m === 'in' || m === 'pu' || m === 'pd') { setMode(n, v ? { mode: 'pu' } : null); return; } setMode(n, { mode: v ? 'high' : 'low' }); };
  const touched = new Set(); let rx = '';    // pins written in this circuit step · Serial input waiting to be read
  if (!String.prototype.toInt) Object.defineProperties(String.prototype, { toInt: { value() { return parseInt(this, 10) || 0; } }, toFloat: { value() { return parseFloat(this) || 0; } }, equals: { value(x) { return this == x; } }, equalsIgnoreCase: { value(x) { return this.toLowerCase() == String(x).toLowerCase(); } }, c_str: { value() { return String(this); } } });
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
  // ADS1115 / ADS1015 (Adafruit_ADS1X15 library): reads the module wired to this board's SDA / SCL at that address
  class Adafruit_ADS1X15 {
    constructor(bits) { this.bits = bits; this.gain = ADS_CONST.GAIN_TWOTHIRDS; this.addr = 0x48; this.rate = 0; this.last = 0; }
    begin(addr = 0x48) { this.addr = addr; return !!host.ads?.(addr); }
    setGain(g) { this.gain = g; } getGain() { return this.gain; }
    setDataRate(r) { this.rate = r; } getDataRate() { return this.rate; }
    fs() { return ADS_FS[this.gain] ?? 6.144; }
    conv(pos, neg) {
      const d = host.ads?.(this.addr);
      if (!d) return this.bits === 16 ? -1 : -1;               // no answer on the bus: the real library returns garbage too
      const pin = (k) => Math.max(-0.3, Math.min(d.vdd + 0.3, d.ain[k]));   // inputs are clamped by the chip's protection diodes
      const v = pin(pos) - (neg == null ? 0 : pin(neg)), full = 2 ** (this.bits - 1);
      this.last = Math.max(-full, Math.min(full - 1, Math.round(v / this.fs() * full)));
      return this.last;
    }
    readADC_SingleEnded(ch) { if (!(ch >= 0 && ch <= 3)) throw new Error(`readADC_SingleEnded(${ch}): channel must be 0–3`); return this.conv(ch); }
    readADC_Differential_0_1() { return this.conv(0, 1); } readADC_Differential_0_3() { return this.conv(0, 3); }
    readADC_Differential_1_3() { return this.conv(1, 3); } readADC_Differential_2_3() { return this.conv(2, 3); }
    computeVolts(counts) { return counts * this.fs() / 2 ** (this.bits - 1); }
    startADCReading(mux) { const m = ADS_MUX[mux]; if (m) this.conv(m[0], m[1]); } conversionComplete() { return true; } getLastConversionResults() { return this.last; }
    startComparator_SingleEnded() { } startComparator_Differential() { }
  }
  class Adafruit_ADS1115 extends Adafruit_ADS1X15 { constructor() { super(16); } }
  class Adafruit_ADS1015 extends Adafruit_ADS1X15 { constructor() { super(12); } }
  // ---- WiFi + MQTT (PubSubClient): a pretend WiFi and a broker inside the simulator (📡 MQTT panel on the board) ----
  const wifi = { mode: 0, ssid: '', t0: null, auto: true };
  const wifiUp = () => wifi.t0 != null && host.t() - wifi.t0 >= 1.2 && (host.mqtt?.wifiOn() ?? true);
  const WiFi = {
    mode(m) { wifi.mode = m; return true; }, begin(ssid = '', pass = '') { wifi.ssid = String(ssid); wifi.t0 = host.t(); return 1; },
    status() { return wifi.t0 == null ? 0 : wifiUp() ? 3 : host.mqtt?.wifiOn() === false ? 6 : host.t() - wifi.t0 < 1.2 ? 0 : 6; },
    isConnected() { return wifiUp(); }, disconnect() { wifi.t0 = null; return true; }, reconnect() { wifi.t0 = host.t(); return true; },
    setAutoReconnect(v) { wifi.auto = !!v; }, setHostname() { return true; }, setSleep() { }, persistent() { },
    localIP() { return { toString: () => (wifiUp() ? '192.168.254.' + (150 + (host.id ?? 0) % 50) : '0.0.0.0') }; },
    SSID() { return wifi.ssid; }, RSSI() { return wifiUp() ? -58 : 0; }, macAddress() { return '24:6F:28:9A:' + ((host.id ?? 0) % 100 + 10) + ':C3'; },
    softAP() { return true; }, softAPIP() { return { toString: () => '192.168.4.1' }; },
  };
  class WiFiClient { }
  class Payload extends Array { toString() { return this.join(''); } }
  const runSync = (fn, ...args) => { const g = fn(...args); if (!g || typeof g.next !== 'function') return; for (let k = 0; k < 200000; k++) if (g.next().done) return; throw new Error('the MQTT callback never ends (no endless loops inside it)'); };
  class PubSubClient {
    constructor() { this.st = -1; this.cb = null; this.server = null; this.id = null; }
    setServer(h, port = 1883) { this.server = String(h?.toString ? h.toString() : h); this.port = port; return this; }
    setCallback(fn) { this.cb = fn; return this; } setClient() { return this; } setKeepAlive() { return this; } setSocketTimeout() { return this; } setBufferSize() { return true; }
    connect(id, user, pass) {
      if (!wifiUp() || !this.server) { this.st = -2; return false; }
      this.id = String(id); this.st = host.mqtt?.connect(this.id, this.server) ? 0 : -2; return this.st === 0;
    }
    connected() { if (this.st === 0 && (!wifiUp() || !host.mqtt?.isUp())) { this.st = -3; host.mqtt?.drop(); } return this.st === 0; }
    state() { this.connected(); return this.st; }
    disconnect() { if (this.st === 0) host.mqtt?.drop(); this.st = -1; }
    subscribe(t) { if (!this.connected()) return false; host.mqtt.subscribe(String(t)); return true; }
    unsubscribe(t) { if (!this.connected()) return false; host.mqtt.unsubscribe(String(t)); return true; }
    publish(t, payload, retained = false) {
      if (!this.connected()) return false;
      const pl = Array.isArray(payload) ? payload.join('') : typeof payload === 'number' ? fmt(payload) : String(payload);
      host.mqtt.publish(String(t), pl, retained === true || retained === 1); return true;
    }
    loop() {
      if (!this.connected()) return false;
      for (const m of host.mqtt.inbox()) if (this.cb) { const pl = Payload.from([...m.payload]); runSync(this.cb, m.topic, pl, pl.length); }
      return true;
    }
  }
  // ---- INA219 (Adafruit_INA219): bus V on VIN−, shunt mV across the 0.1 Ω, current, power ----
  class Adafruit_INA219 {
    constructor(addr = 0x40) { this.addr = addr; this.range = { v: 32, mv: 320 }; }
    begin() { return !!host.ina?.(this.addr); }
    setCalibration_32V_2A() { this.range = { v: 32, mv: 320 }; } setCalibration_32V_1A() { this.range = { v: 32, mv: 130 }; } setCalibration_16V_400mA() { this.range = { v: 16, mv: 40 }; }
    d() { return host.ina?.(this.addr) ?? null; }
    getBusVoltage_V() { const d = this.d(); return d ? Math.round(Math.max(0, Math.min(this.range.v, d.vbus)) / 0.004) * 0.004 : 0; }
    getShuntVoltage_mV() { const d = this.d(); return d ? Math.round(Math.max(-this.range.mv, Math.min(this.range.mv, d.vshunt * 1000)) * 100) / 100 : 0; }
    getCurrent_mA() { return Math.round(this.getShuntVoltage_mV() / 0.1 * 10) / 10; }
    getPower_mW() { return Math.round(this.getBusVoltage_V() * this.getCurrent_mA() * 10) / 10; }
    success() { return !!this.d(); } powerSave() { }
  }
  // ---- DS3231 (RTClib): time = what the RTC part is set to + circuit time × its speed ----
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  class DateTime {
    constructor(a = 0, mo, d = 1, h = 0, mi = 0, s = 0) {
      if (a instanceof DateTime) this.u = a.u;
      else if (typeof a === 'string' && typeof mo === 'string') { const m = /(\w{3})\s+(\d+)\s+(\d{4})/.exec(a), t = mo.split(':').map(Number); this.u = Date.UTC(+m[3], MON.indexOf(m[1]), +m[2], t[0], t[1], t[2] || 0) / 1000; }
      else if (mo == null) this.u = Math.floor(+a);
      else this.u = Date.UTC(a < 100 ? 2000 + a : a, mo - 1, d, h, mi, s) / 1000;
    }
    get D() { return new Date(this.u * 1000); }
    year() { return this.D.getUTCFullYear(); } month() { return this.D.getUTCMonth() + 1; } day() { return this.D.getUTCDate(); }
    hour() { return this.D.getUTCHours(); } minute() { return this.D.getUTCMinutes(); } second() { return this.D.getUTCSeconds(); }
    dayOfTheWeek() { return this.D.getUTCDay(); } unixtime() { return this.u; } secondstime() { return this.u - 946684800; }
    twelveHour() { const h = this.hour() % 12; return h || 12; } isPM() { return this.hour() >= 12 ? 1 : 0; }
    timestamp() { return this.D.toISOString().slice(0, 19); } isValid() { return true; }
    operator_add(ts) { return new DateTime(this.u + (ts.s ?? ts)); }
  }
  class TimeSpan { constructor(d = 0, h = 0, m = 0, s = 0) { this.s = h == null ? d : d * 86400 + h * 3600 + m * 60 + s; } days() { return Math.floor(this.s / 86400); } hours() { return Math.floor(this.s / 3600) % 24; } minutes() { return Math.floor(this.s / 60) % 60; } seconds() { return this.s % 60; } totalseconds() { return this.s; } }
  // ---------- SD card (SD.h, SPI). The files live on the SD module part and are saved with the project. ----------
  // ESP32: FILE_WRITE starts the file again (like "w"), FILE_APPEND adds to it. UNO (SdFat-based SD.h): FILE_WRITE adds at the end.
  const SD_CONST = { FILE_READ: 'r', FILE_WRITE: esp ? 'w' : 'a', FILE_APPEND: 'a', O_READ: 'r', O_WRITE: 'a', CARD_NONE: 0, CARD_MMC: 1, CARD_SD: 2, CARD_SDHC: 3, CARD_UNKNOWN: 4 };
  const SD_MAX = 2e6;                                   // characters on the simulated card (keeps projects small)
  const sdNorm = (x) => String(cstr(x) ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  class SDFile {
    constructor(sd, path, mode, dir) { this.sd = sd; this._p = path; this.mode = mode; this.dir = dir; this.pos = 0; this.list = null; this.ok = true; }
    get data() { return this.sd.files()?.[this._p] ?? ''; }
    name() { const n = this._p.split('/').pop(); return esp ? n : n.toUpperCase(); }
    path() { return '/' + this._p; }
    isDirectory() { return this.dir; }
    size() { return this.dir ? 0 : this.data.length; }
    available() { return this.ok && !this.dir && this.mode === 'r' ? Math.max(0, this.data.length - this.pos) : 0; }
    read(buf, n) {
      if (buf != null && typeof buf === 'object') { let k = 0; while (k < n && this.available()) buf[k++] = this.data.charCodeAt(this.pos++) & 255; return k; }
      return this.available() ? this.data.charCodeAt(this.pos++) & 255 : -1;
    }
    peek() { return this.available() ? this.data.charCodeAt(this.pos) & 255 : -1; }
    readStringUntil(ch) { const d = this.data, c = typeof ch === 'number' ? String.fromCharCode(ch) : String(ch); let j = d.indexOf(c, this.pos); if (j < 0) j = d.length; const r = d.slice(this.pos, j); this.pos = Math.min(d.length, j + 1); return r; }
    readString() { const r = this.data.slice(this.pos); this.pos = this.data.length; return r; }
    parseInt() { const m = /^\s*(-?\d+)/.exec(this.data.slice(this.pos)); if (!m) return 0; this.pos += m[0].length; return +m[1]; }
    parseFloat() { const m = /^\s*(-?\d+\.?\d*)/.exec(this.data.slice(this.pos)); if (!m) return 0; this.pos += m[0].length; return +m[1]; }
    position() { return this.mode === 'r' ? this.pos : this.data.length; }
    seek(n) { this.pos = Math.max(0, Math.min(this.data.length, Math.trunc(n))); return true; }
    write(x, n) {
      if (!this.ok || this.dir || this.mode === 'r') return 0;
      const f = this.sd.files(); if (!f) { this.ok = false; return 0; }       // card pulled out
      let t = typeof x === 'number' ? String.fromCharCode(x & 255) : x != null && typeof x === 'object' ? Array.from(x).slice(0, n ?? x.length).map(b => String.fromCharCode(b & 255)).join('') : String(x);
      if (this.sd.used() + t.length > SD_MAX) return 0;
      f[this._p] = (f[this._p] ?? '') + t; this.sd.touch(this._p); return t.length;
    }
    print(x, f) { return this.write(fmt(x, f)); }
    println(x = '', f) { return this.write(fmt(x, f) + '\r\n'); }
    printf(f, ...a) { return this.write(sprintf(f, ...a)); }
    flush() { }
    close() { this.ok = false; }
    openNextFile() {
      if (!this.dir) return null;
      if (!this.list) this.list = this.sd.children(this._p);
      const n = this.list.shift(); return n == null ? null : this.sd.entry(n);
    }
    rewindDirectory() { this.list = null; }
  }
  class SDClass {
    constructor() { this.cs = null; }
    begin(cs = esp ? 5 : 10) { this.cs = Math.trunc(cs); const c = host.sd?.(this.cs); return !!(c && !c.err); }
    end() { this.cs = null; }
    files() { if (this.cs == null) return null; const c = host.sd?.(this.cs); return c && !c.err ? c.files() : null; }
    touch(path) { host.sd?.(this.cs)?.touch?.(path); }
    used() { const f = this.files(); return f ? Object.values(f).reduce((s, v) => s + v.length, 0) : 0; }
    isDir(path) { const f = this.files(); return path === '' || (!!f && (path + '/' in f || Object.keys(f).some(k => k.startsWith(path + '/')))); }
    exists(x) { const f = this.files(), path = sdNorm(x); return !!f && (path in f || this.isDir(path)); }
    entry(path) { return this.isDir(path) ? new SDFile(this, path, 'r', true) : new SDFile(this, path, 'r', false); }
    children(dir) {
      const f = this.files() ?? {}, pre = dir ? dir + '/' : '', out = new Set();
      for (const k of Object.keys(f).sort()) { if (!k.startsWith(pre) || k === pre) continue; const rest = k.slice(pre.length), i = rest.indexOf('/'); out.add(pre + (i < 0 ? rest : rest.slice(0, i))); }
      return [...out];
    }
    open(x, mode = 'r') {
      const f = this.files(); if (!f) return null;
      const path = sdNorm(x);
      if (this.isDir(path)) return new SDFile(this, path, 'r', true);
      if (mode === 'r' || mode === undefined) return path in f ? new SDFile(this, path, 'r', false) : null;
      const up = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (up && !this.isDir(up)) return null;            // the folder must exist (SD.mkdir first)
      if (!path || path.split('/').pop().length > (esp ? 255 : 12)) return null;   // UNO: 8.3 names only (LOG.CSV)
      if (mode === 'w' || !(path in f)) f[path] = '';
      this.touch(path);
      return new SDFile(this, path, 'a', false);
    }
    remove(x) { const f = this.files(), path = sdNorm(x); if (!f || !(path in f)) return false; delete f[path]; this.touch(path); return true; }
    mkdir(x) { const f = this.files(), path = sdNorm(x); if (!f || !path) return false; f[path + '/'] = ''; this.touch(path); return true; }
    rmdir(x) { const f = this.files(), path = sdNorm(x); if (!f || !(path + '/' in f) || this.children(path).length) return false; delete f[path + '/']; return true; }
    rename(a, b) { const f = this.files(); a = sdNorm(a); b = sdNorm(b); if (!f || !(a in f) || b in f) return false; f[b] = f[a]; delete f[a]; this.touch(b); return true; }
    cardType() { return this.files() ? 3 : 0; }
    cardSize() { return this.files() ? 7969177600 : 0; }
    totalBytes() { return this.files() ? 7958691840 : 0; }
    usedBytes() { return this.used(); }
  }
  const SD = new SDClass();
  class RTC_DS3231 {
    begin() { return !!host.rtc?.(); }
    now() { const r = host.rtc?.(); return new DateTime(r ? r.now() : 0); }
    adjust(dt) { host.rtc?.()?.set(dt.u); }
    lostPower() { return host.rtc?.()?.lost() ?? true; }
    getTemperature() { return 31.25; }
    disable32K() { } enable32K() { } writeSqwPinMode() { } clearAlarm() { } disableAlarm() { } setAlarm1() { return true; } alarmFired() { return false; }
  }
  const now0 = new Date(Date.now() + 8 * 3600e3);   // compile time, Philippine time
  const __DATE__ = `${MON[now0.getUTCMonth()]} ${String(now0.getUTCDate()).padStart(2, ' ')} ${now0.getUTCFullYear()}`, __TIME__ = now0.toISOString().slice(11, 19);
  // ---- Stepper.h (4 wires, e.g. 28BYJ-48 on ULN2003: Stepper s(2048, IN1, IN3, IN2, IN4)) ----
  class Stepper {
    constructor(steps, p1, p2, p3, p4) { this.steps = steps; this.n = [p1, p2, p3, p4].filter(x => x != null).map(PN); this.k = 0; this.rpm = 5; }
    setSpeed(rpm) { this.rpm = Math.max(0.01, +rpm); }
    out() { const seq = [[1, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1]][this.k]; this.n.forEach((n, i) => setMode(n, { mode: seq[i] ? 'high' : 'low' })); }
    *step(n) {   // keeps its own schedule so the average speed is exact even though each wait ends on a circuit time step
      const d = Math.sign(n), dt = 60 / this.steps / this.rpm;
      for (let i = 0; i < Math.abs(Math.trunc(n)); i++) {
        this.k = (this.k + d + 4) % 4; this.out();
        const now = host.t(); this.due = (this.due != null && now - this.due < 0.05 && this.due - now < dt ? this.due : now) + dt;
        yield Math.max(0, this.due - host.t());
      }
    }
  }
  const cstr = (s) => (Array.isArray(s) ? s.join('') : String(s));
  const sprintf = (f, ...a) => { let i = 0; return String(f).replace(/%[-+0 #]*(\d*)(?:\.(\d+))?([dilufsxXc%])/g, (m, w, d, t) => { if (t === '%') return '%'; const v = a[i++]; let o = t === 'f' ? (+v).toFixed(d == null ? 6 : +d) : /[xX]/.test(t) ? Math.trunc(v).toString(16) : t === 's' ? cstr(v) : t === 'c' ? (typeof v === 'number' ? String.fromCharCode(v) : String(v)) : String(Math.trunc(v)); if (t === 'X') o = o.toUpperCase(); return w ? o.padStart(+w, m.includes('0') && t !== 's' ? '0' : ' ') : o; }); };
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
    abs: Math.abs, fabs: Math.abs, fmod: (a, b) => a % b, min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt, sq: (x) => x * x, sin: Math.sin, cos: Math.cos, tan: Math.tan, floor: Math.floor, ceil: Math.ceil, round: Math.round,
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
    Keypad, makeKeymap: (m) => m, NO_KEY: '', Adafruit_SSD1306, ...OLED_CONST, Adafruit_ADS1115, Adafruit_ADS1015, ...ADS_CONST,
    WiFi, WiFiClient, PubSubClient, WL_CONNECTED: 3, WL_DISCONNECTED: 6, WL_IDLE_STATUS: 0, WL_CONNECT_FAILED: 4, WL_NO_SSID_AVAIL: 1, WIFI_STA: 1, WIFI_AP: 2, WIFI_AP_STA: 3, WIFI_OFF: 0,
    Adafruit_INA219, RTC_DS3231, DateTime, TimeSpan, __DATE__, __TIME__, Stepper, SD, SPI: { begin() { }, end() { }, beginTransaction() { }, endTransaction() { }, transfer: () => 0 }, ...SD_CONST,
    strcmp: (a, b) => { a = cstr(a); b = cstr(b); return a < b ? -1 : a > b ? 1 : 0; }, strncmp: (a, b, n) => { a = cstr(a).slice(0, n); b = cstr(b).slice(0, n); return a < b ? -1 : a > b ? 1 : 0; },
    atoi: (s) => parseInt(cstr(s), 10) || 0, atof: (s) => parseFloat(cstr(s)) || 0, strlen: (s) => cstr(s).length,
    dtostrf: (v, w, d) => (+v).toFixed(d).padStart(w, ' '), snprintf: (buf, n, f, ...a) => sprintf(f, ...a), sprintf: (buf, f, ...a) => sprintf(f, ...a),
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
  ads1115: { name: 'ADS1115 16-bit voltage sensor 0–25 V (+ LCD)', esp: '// 0-25 V voltage sensor: divider R1 68k / R2 10k -> ADS1115 A0 (16-bit), ESP32 reads it over I2C, LCD shows it\n#include <Wire.h>\n#include <Adafruit_ADS1X15.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_ADS1115 ads;                 // ADDR open = 0x48 (pull-down on the module)\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // both on SDA = GPIO21, SCL = GPIO22\n\nconst float R1 = 68000.0;             // top resistor: from the voltage you measure to A0\nconst float R2 = 10000.0;             // bottom resistor: A0 to GND\nconst float RATIO = (R1 + R2) / R2;   // 7.8: 25 V in -> 3.2 V on A0 (below VDD 3.3 V)\nconst float CAL = 1.000;              // fine trim: real volts / shown volts (measure once with a good meter)\n\nvoid setup() {\n  Serial.begin(115200);\n  lcd.init();\n  lcd.backlight();\n  if (!ads.begin(0x48)) {\n    Serial.println(\"ADS1115 not found! Check VDD, GND, SDA, SCL.\");\n    lcd.print(\"ADS1115 missing\");\n    while (true) {\n      delay(100);\n    }\n  }\n  ads.setGain(GAIN_ONE);              // +-4.096 V full scale, 1 bit = 0.125 mV on A0\n  lcd.print(\"Voltage sensor\");\n}\n\nvoid loop() {\n  // average 8 readings: less noise on a real board\n  long sum = 0;\n  for (int i = 0; i < 8; i++) sum += ads.readADC_SingleEnded(0);\n  int16_t raw = sum / 8;\n\n  float vA0 = ads.computeVolts(raw);    // volts on the A0 pin\n  float vin = vA0 * RATIO * CAL;        // volts before the divider\n\n  Serial.print(\"raw \");\n  Serial.print(raw);\n  Serial.print(\"  A0 \");\n  Serial.print(vA0, 4);\n  Serial.print(\" V  input \");\n  Serial.print(vin, 3);\n  Serial.println(\" V\");\n\n  lcd.setCursor(0, 0);\n  lcd.print(\"A0  \");\n  lcd.print(vA0, 4);\n  lcd.print(\" V     \");\n  lcd.setCursor(0, 1);\n  lcd.print(\"VIN \");\n  lcd.print(vin, 2);\n  lcd.print(\" V     \");\n  delay(250);\n}\n',
    uno: '// 0-25 V voltage sensor: divider R1 68k / R2 10k -> ADS1115 A0 (16-bit), ESP32 reads it over I2C, LCD shows it\n#include <Wire.h>\n#include <Adafruit_ADS1X15.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_ADS1115 ads;                 // ADDR open = 0x48 (pull-down on the module)\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // both on SDA = A4, SCL = A5\n\nconst float R1 = 30000.0;             // top resistor: from the voltage you measure to A0\nconst float R2 = 7500.0;              // bottom resistor: A0 to GND\nconst float RATIO = (R1 + R2) / R2;   // 5: 25 V in -> 5 V on A0 (VDD 5 V)\nconst float CAL = 1.000;              // fine trim: real volts / shown volts (measure once with a good meter)\n\nvoid setup() {\n  Serial.begin(9600);\n  lcd.init();\n  lcd.backlight();\n  if (!ads.begin(0x48)) {\n    Serial.println(\"ADS1115 not found! Check VDD, GND, SDA, SCL.\");\n    lcd.print(\"ADS1115 missing\");\n    while (true) {\n      delay(100);\n    }\n  }\n  ads.setGain(GAIN_TWOTHIRDS);        // +-6.144 V full scale, 1 bit = 0.1875 mV on A0\n  lcd.print(\"Voltage sensor\");\n}\n\nvoid loop() {\n  // average 8 readings: less noise on a real board\n  long sum = 0;\n  for (int i = 0; i < 8; i++) sum += ads.readADC_SingleEnded(0);\n  int16_t raw = sum / 8;\n\n  float vA0 = ads.computeVolts(raw);    // volts on the A0 pin\n  float vin = vA0 * RATIO * CAL;        // volts before the divider\n\n  Serial.print(\"raw \");\n  Serial.print(raw);\n  Serial.print(\"  A0 \");\n  Serial.print(vA0, 4);\n  Serial.print(\" V  input \");\n  Serial.print(vin, 3);\n  Serial.println(\" V\");\n\n  lcd.setCursor(0, 0);\n  lcd.print(\"A0  \");\n  lcd.print(vA0, 4);\n  lcd.print(\" V     \");\n  lcd.setCursor(0, 1);\n  lcd.print(\"VIN \");\n  lcd.print(vin, 2);\n  lcd.print(\" V     \");\n  delay(250);\n}\n' },
  sdlog: { name: 'SD card data logger: DHT22 → log.csv', esp: "// DHT22 data logger: the ESP32 adds temperature + humidity to /log.csv on the SD card every 2 s.\n// In the simulator: tap the SD module -> 📂 Files on the card to open or download log.csv.\n#include <SPI.h>\n#include <SD.h>\n#include <DHT.h>\n\nconst int SD_CS = 5;                       // SCK 18, MISO 19, MOSI 23 (VSPI), CS 5\nDHT dht(4, DHT22);                         // DATA on GPIO4\nunsigned long lastLog = 0;\nint lines = 0;\n\nvoid listFiles() {\n  File root = SD.open(\"/\");\n  File f = root.openNextFile();\n  while (f) {\n    Serial.print(\"  \");\n    Serial.print(f.name());\n    Serial.print(\"  \");\n    Serial.print(f.size());\n    Serial.println(\" bytes\");\n    f = root.openNextFile();\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  dht.begin();\n  if (!SD.begin(SD_CS)) {\n    Serial.println(\"SD card failed! Check: card in, VCC = 5 V, SCK 18, MISO 19, MOSI 23, CS 5\");\n    while (true) delay(1000);\n  }\n  Serial.print(\"SD card OK, \");\n  Serial.print(SD.cardSize() / (1024 * 1024));\n  Serial.println(\" MB\");\n  if (!SD.exists(\"/log.csv\")) {\n    File f = SD.open(\"/log.csv\", FILE_WRITE);   // new file + the header line\n    f.println(\"seconds,temp_C,humidity_pct\");\n    f.close();\n  }\n  Serial.println(\"Files:\");\n  listFiles();\n}\n\nvoid loop() {\n  if (millis() - lastLog >= 2000) {\n    lastLog = millis();\n    float t = dht.readTemperature();\n    float h = dht.readHumidity();\n    if (isnan(t)) {\n      Serial.println(\"DHT22 read failed\");\n      return;\n    }\n    File f = SD.open(\"/log.csv\", FILE_APPEND);  // FILE_APPEND adds a line (FILE_WRITE starts the file over on the ESP32)\n    if (!f) {\n      Serial.println(\"Can't open /log.csv (card pulled out?)\");\n      return;\n    }\n    f.print(millis() / 1000);\n    f.print(\",\");\n    f.print(t, 1);\n    f.print(\",\");\n    f.println(h, 1);\n    f.close();                                  // close() saves it: without it the line is lost at power off\n    lines++;\n    Serial.printf(\"logged #%d  %.1f C  %.1f %%\\n\", lines, t, h);\n  }\n}\n",
    uno: "// DHT22 data logger: the UNO adds temperature + humidity to LOG.CSV on the SD card every 2 s.\n// UNO SD library: 8.3 file names (LOG.CSV), FILE_WRITE adds at the end of the file.\n#include <SPI.h>\n#include <SD.h>\n#include <DHT.h>\n\nconst int SD_CS = 10;                      // SCK 13, MISO 12, MOSI 11, CS 10\nDHT dht(4, DHT22);                         // DATA on D4\nunsigned long lastLog = 0;\nint lines = 0;\n\nvoid setup() {\n  Serial.begin(9600);\n  dht.begin();\n  if (!SD.begin(SD_CS)) {\n    Serial.println(\"SD card failed! Check: card in, VCC = 5 V, SCK 13, MISO 12, MOSI 11, CS 10\");\n    while (true) delay(1000);\n  }\n  Serial.println(\"SD card OK\");\n  if (!SD.exists(\"LOG.CSV\")) {\n    File f = SD.open(\"LOG.CSV\", FILE_WRITE);\n    f.println(\"seconds,temp_C,humidity_pct\");\n    f.close();\n  }\n}\n\nvoid loop() {\n  if (millis() - lastLog >= 2000) {\n    lastLog = millis();\n    float t = dht.readTemperature();\n    float h = dht.readHumidity();\n    if (isnan(t)) {\n      Serial.println(\"DHT22 read failed\");\n      return;\n    }\n    File f = SD.open(\"LOG.CSV\", FILE_WRITE);\n    if (!f) {\n      Serial.println(\"Can't open LOG.CSV\");\n      return;\n    }\n    f.print(millis() / 1000);\n    f.print(\",\");\n    f.print(t, 1);\n    f.print(\",\");\n    f.println(h, 1);\n    f.close();\n    lines++;\n    Serial.print(\"logged #\");\n    Serial.print(lines);\n    Serial.print(\"  \");\n    Serial.print(t, 1);\n    Serial.print(\" C  \");\n    Serial.print(h, 1);\n    Serial.println(\" %\");\n  }\n}\n" },
  mqtt: { name: 'MQTT over WiFi: 2 relays + DHT22 (ESP32)', esp: "// ESP32 MQTT: 2 relays + DHT22 by topics (Mosquitto / Home Assistant / an MQTT phone app)\n// In the simulator: open the \"📡 MQTT\" box under the code to see the broker and send messages.\n#include <WiFi.h>\n#include <PubSubClient.h>\n#include <DHT.h>\n\nconst char* WIFI_SSID = \"YourWiFi\";\nconst char* WIFI_PASS = \"YourPassword\";\nconst char* BROKER = \"192.168.254.10\";    // IP of the PC / Pi running Mosquitto\n\nconst int RELAY1 = 19;                     // relay modules: LOW = ON\nconst int RELAY2 = 18;\nDHT dht(4, DHT22);                         // DATA on GPIO4\nWiFiClient espClient;\nPubSubClient client(espClient);\nunsigned long lastSend = 0;\nchar buf[16];\n\nvoid setRelay(int pin, const char* stateTopic, bool on) {\n  digitalWrite(pin, on ? LOW : HIGH);\n  client.publish(stateTopic, on ? \"ON\" : \"OFF\", true);   // retained: a new app sees the last state\n}\n\n// runs when a message arrives on a topic we subscribed to\nvoid callback(char* topic, byte* payload, unsigned int length) {\n  String msg = \"\";\n  for (int i = 0; i < length; i++) msg += (char)payload[i];\n  Serial.print(\"got \");\n  Serial.print(topic);\n  Serial.print(\" = \");\n  Serial.println(msg);\n  bool on = (msg == \"ON\" || msg == \"1\");\n  if (strcmp(topic, \"home/relay1/set\") == 0) setRelay(RELAY1, \"home/relay1/state\", on);\n  if (strcmp(topic, \"home/relay2/set\") == 0) setRelay(RELAY2, \"home/relay2/state\", on);\n}\n\nvoid connectMqtt() {\n  while (!client.connected()) {\n    Serial.print(\"MQTT connect... \");\n    if (client.connect(\"fox9-esp32\")) {\n      Serial.println(\"OK\");\n      client.subscribe(\"home/+/set\");      // + = any one word: relay1, relay2\n      client.publish(\"home/status\", \"online\", true);\n    } else {\n      Serial.print(\"failed, state \");\n      Serial.println(client.state());\n      delay(2000);\n    }\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(RELAY1, OUTPUT);\n  pinMode(RELAY2, OUTPUT);\n  digitalWrite(RELAY1, HIGH);              // both OFF at boot\n  digitalWrite(RELAY2, HIGH);\n  dht.begin();\n  WiFi.begin(WIFI_SSID, WIFI_PASS);\n  Serial.print(\"WiFi\");\n  while (WiFi.status() != WL_CONNECTED) {\n    delay(500);\n    Serial.print(\".\");\n  }\n  Serial.println();\n  Serial.print(\"IP \");\n  Serial.println(WiFi.localIP());\n  client.setServer(BROKER, 1883);\n  client.setCallback(callback);\n}\n\nvoid loop() {\n  if (!client.connected()) connectMqtt();\n  client.loop();                           // must run often: it delivers the messages\n\n  if (millis() - lastSend > 5000) {        // every 5 s\n    lastSend = millis();\n    float t = dht.readTemperature();\n    float h = dht.readHumidity();\n    if (!isnan(t)) {\n      dtostrf(t, 4, 1, buf);\n      client.publish(\"home/temp\", buf);\n      dtostrf(h, 4, 1, buf);\n      client.publish(\"home/hum\", buf);\n      Serial.print(\"sent temp \");\n      Serial.print(t, 1);\n      Serial.print(\" C  hum \");\n      Serial.print(h, 1);\n      Serial.println(\" %\");\n    }\n  }\n}\n",
    uno: "// The UNO has no WiFi: MQTT needs an ESP32 (or an ESP8266).\nvoid setup() {\n  Serial.begin(9600);\n  Serial.println(\"MQTT needs WiFi: pick the ESP32 board.\");\n}\n\nvoid loop() {\n}\n" },
  bank48: { name: '48 V LiFePO4 bank monitor: ADS1115 + ACS712 + LCD', esp: "// 48 V LiFePO4 bank monitor (16S, 51.2 V): ESP32 + ADS1115 + ACS712-30A + LCD 16x2\n// A0 = bank voltage through R1 200k / R2 10k (divide by 21: 60 V -> 2.86 V)\n// A1 = ACS712 OUT through R3 10k / R4 20k (x 2/3: keeps it under 3.3 V)\n#include <Wire.h>\n#include <Adafruit_ADS1X15.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_ADS1115 ads;                     // 0x48\nLiquidCrystal_I2C lcd(0x27, 16, 2);\n\nconst float VDIV = (200000.0 + 10000.0) / 10000.0;   // 21\nconst float IDIV = (10000.0 + 20000.0) / 20000.0;    // 1.5\nconst float SENS = 0.066;                            // ACS712-30A: 66 mV per amp\nfloat zeroV = 2.5;                                   // ACS712 output at 0 A (measured at boot)\nfloat ah = 0;                                        // amp-hours taken since boot\nunsigned long lastMs = 0;\n\n// resting voltage -> % for a 16S LiFePO4 bank (under load it reads a little lower)\nconst float VT[] = {40.0, 48.0, 51.2, 52.0, 52.4, 52.8, 53.2, 53.6, 54.4};\nconst int PT[] = {0, 10, 20, 30, 40, 70, 80, 90, 100};\n\nint soc(float v) {\n  if (v <= VT[0]) return 0;\n  for (int i = 1; i < 9; i++) {\n    if (v < VT[i]) return PT[i - 1] + (PT[i] - PT[i - 1]) * (v - VT[i - 1]) / (VT[i] - VT[i - 1]);\n  }\n  return 100;\n}\n\nfloat readV(int ch) {                      // average of 8 readings, in volts on the pin\n  long sum = 0;\n  for (int i = 0; i < 8; i++) sum += ads.readADC_SingleEnded(ch);\n  return ads.computeVolts(sum / 8);\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  lcd.init();\n  lcd.backlight();\n  if (!ads.begin(0x48)) {\n    Serial.println(\"ADS1115 not found!\");\n    lcd.print(\"ADS1115 missing\");\n    while (true) delay(100);\n  }\n  ads.setGain(GAIN_ONE);                   // +-4.096 V\n  lcd.print(\"Zero current...\");\n  zeroV = readV(1) * IDIV;                 // the LOAD must be OFF at boot\n  Serial.print(\"ACS712 zero = \");\n  Serial.print(zeroV, 3);\n  Serial.println(\" V\");\n  lastMs = millis();\n  delay(500);\n  lcd.clear();\n}\n\nvoid loop() {\n  float v = readV(0) * VDIV;\n  float amps = (readV(1) * IDIV - zeroV) / SENS;\n  if (fabs(amps) < 0.15) amps = 0;         // noise floor of the ACS712\n  float watts = v * amps;\n  unsigned long now = millis();\n  ah += amps * (now - lastMs) / 3600000.0;\n  lastMs = now;\n  int pct = soc(v);\n\n  lcd.setCursor(0, 0);                     // \"52.8V  5.2A  70%\"\n  lcd.print(v, 1);\n  lcd.print(\"V \");\n  lcd.print(amps, 1);\n  lcd.print(\"A \");\n  lcd.print(pct);\n  lcd.print(\"%   \");\n  lcd.setCursor(0, 1);                     // \"275W  0.012Ah\"\n  lcd.print(watts, 0);\n  lcd.print(\"W \");\n  lcd.print(ah, 3);\n  lcd.print(\"Ah\");\n  if (v < 48.0) lcd.print(\" LOW!\");\n  else lcd.print(\"     \");\n\n  Serial.print(v, 2);\n  Serial.print(\" V  \");\n  Serial.print(amps, 2);\n  Serial.print(\" A  \");\n  Serial.print(watts, 0);\n  Serial.print(\" W  \");\n  Serial.print(pct);\n  Serial.println(\" %\");\n  delay(500);\n}\n",
    uno: "// 48 V LiFePO4 bank monitor (16S, 51.2 V): ESP32 + ADS1115 + ACS712-30A + LCD 16x2\n// A0 = bank voltage through R1 200k / R2 10k (divide by 21: 60 V -> 2.86 V)\n// A1 = ACS712 OUT through R3 10k / R4 20k (x 2/3: keeps it under 3.3 V)\n#include <Wire.h>\n#include <Adafruit_ADS1X15.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_ADS1115 ads;                     // 0x48\nLiquidCrystal_I2C lcd(0x27, 16, 2);\n\nconst float VDIV = (200000.0 + 10000.0) / 10000.0;   // 21\nconst float IDIV = (10000.0 + 20000.0) / 20000.0;    // 1.5\nconst float SENS = 0.066;                            // ACS712-30A: 66 mV per amp\nfloat zeroV = 2.5;                                   // ACS712 output at 0 A (measured at boot)\nfloat ah = 0;                                        // amp-hours taken since boot\nunsigned long lastMs = 0;\n\n// resting voltage -> % for a 16S LiFePO4 bank (under load it reads a little lower)\nconst float VT[] = {40.0, 48.0, 51.2, 52.0, 52.4, 52.8, 53.2, 53.6, 54.4};\nconst int PT[] = {0, 10, 20, 30, 40, 70, 80, 90, 100};\n\nint soc(float v) {\n  if (v <= VT[0]) return 0;\n  for (int i = 1; i < 9; i++) {\n    if (v < VT[i]) return PT[i - 1] + (PT[i] - PT[i - 1]) * (v - VT[i - 1]) / (VT[i] - VT[i - 1]);\n  }\n  return 100;\n}\n\nfloat readV(int ch) {                      // average of 8 readings, in volts on the pin\n  long sum = 0;\n  for (int i = 0; i < 8; i++) sum += ads.readADC_SingleEnded(ch);\n  return ads.computeVolts(sum / 8);\n}\n\nvoid setup() {\n  Serial.begin(9600);\n  lcd.init();\n  lcd.backlight();\n  if (!ads.begin(0x48)) {\n    Serial.println(\"ADS1115 not found!\");\n    lcd.print(\"ADS1115 missing\");\n    while (true) delay(100);\n  }\n  ads.setGain(GAIN_ONE);                   // +-4.096 V\n  lcd.print(\"Zero current...\");\n  zeroV = readV(1) * IDIV;                 // the LOAD must be OFF at boot\n  Serial.print(\"ACS712 zero = \");\n  Serial.print(zeroV, 3);\n  Serial.println(\" V\");\n  lastMs = millis();\n  delay(500);\n  lcd.clear();\n}\n\nvoid loop() {\n  float v = readV(0) * VDIV;\n  float amps = (readV(1) * IDIV - zeroV) / SENS;\n  if (fabs(amps) < 0.15) amps = 0;         // noise floor of the ACS712\n  float watts = v * amps;\n  unsigned long now = millis();\n  ah += amps * (now - lastMs) / 3600000.0;\n  lastMs = now;\n  int pct = soc(v);\n\n  lcd.setCursor(0, 0);                     // \"52.8V  5.2A  70%\"\n  lcd.print(v, 1);\n  lcd.print(\"V \");\n  lcd.print(amps, 1);\n  lcd.print(\"A \");\n  lcd.print(pct);\n  lcd.print(\"%   \");\n  lcd.setCursor(0, 1);                     // \"275W  0.012Ah\"\n  lcd.print(watts, 0);\n  lcd.print(\"W \");\n  lcd.print(ah, 3);\n  lcd.print(\"Ah\");\n  if (v < 48.0) lcd.print(\" LOW!\");\n  else lcd.print(\"     \");\n\n  Serial.print(v, 2);\n  Serial.print(\" V  \");\n  Serial.print(amps, 2);\n  Serial.print(\" A  \");\n  Serial.print(watts, 0);\n  Serial.print(\" W  \");\n  Serial.print(pct);\n  Serial.println(\" %\");\n  delay(500);\n}\n" },
  ina219: { name: 'INA219 current + voltage + Wh on LCD', esp: "// INA219: current + voltage of a 12 V load, shown on the LCD 16x2 (both on SDA = GPIO21, SCL = GPIO22)\n#include <Wire.h>\n#include <Adafruit_INA219.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_INA219 ina219;                    // A0, A1 open = 0x40\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nfloat wh = 0;                              // energy used since boot\nunsigned long lastMs = 0;\n\nvoid setup() {\n  Serial.begin(115200);\n  lcd.init();\n  lcd.backlight();\n  if (!ina219.begin()) {\n    Serial.println(\"INA219 not found! Check VCC, GND, SDA, SCL.\");\n    lcd.print(\"INA219 missing\");\n    while (true) delay(100);\n  }\n  ina219.setCalibration_32V_2A();          // up to 26 V, 3.2 A with the 0.1 ohm shunt\n  lastMs = millis();\n}\n\nvoid loop() {\n  float busV = ina219.getBusVoltage_V();          // VIN- to GND (the load side)\n  float shuntmV = ina219.getShuntVoltage_mV();    // across the 0.1 ohm shunt\n  float mA = ina219.getCurrent_mA();\n  float loadV = busV + shuntmV / 1000.0;          // supply side\n  float watts = busV * mA / 1000.0;\n  unsigned long now = millis();\n  wh += watts * (now - lastMs) / 3600000.0;\n  lastMs = now;\n\n  lcd.setCursor(0, 0);                            // \"12.00V  1.583A\"\n  lcd.print(loadV, 2);\n  lcd.print(\"V  \");\n  lcd.print(mA / 1000.0, 3);\n  lcd.print(\"A  \");\n  lcd.setCursor(0, 1);                            // \"19.0W  0.005Wh\"\n  lcd.print(watts, 1);\n  lcd.print(\"W  \");\n  lcd.print(wh, 3);\n  lcd.print(\"Wh  \");\n\n  Serial.print(\"bus \");\n  Serial.print(busV, 3);\n  Serial.print(\" V  shunt \");\n  Serial.print(shuntmV, 2);\n  Serial.print(\" mV  \");\n  Serial.print(mA, 1);\n  Serial.print(\" mA  \");\n  Serial.print(watts, 2);\n  Serial.println(\" W\");\n  delay(500);\n}\n",
    uno: "// INA219: current + voltage of a 12 V load, shown on the LCD 16x2 (both on SDA = A4, SCL = A5)\n#include <Wire.h>\n#include <Adafruit_INA219.h>\n#include <LiquidCrystal_I2C.h>\n\nAdafruit_INA219 ina219;                    // A0, A1 open = 0x40\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nfloat wh = 0;                              // energy used since boot\nunsigned long lastMs = 0;\n\nvoid setup() {\n  Serial.begin(9600);\n  lcd.init();\n  lcd.backlight();\n  if (!ina219.begin()) {\n    Serial.println(\"INA219 not found! Check VCC, GND, SDA, SCL.\");\n    lcd.print(\"INA219 missing\");\n    while (true) delay(100);\n  }\n  ina219.setCalibration_32V_2A();          // up to 26 V, 3.2 A with the 0.1 ohm shunt\n  lastMs = millis();\n}\n\nvoid loop() {\n  float busV = ina219.getBusVoltage_V();          // VIN- to GND (the load side)\n  float shuntmV = ina219.getShuntVoltage_mV();    // across the 0.1 ohm shunt\n  float mA = ina219.getCurrent_mA();\n  float loadV = busV + shuntmV / 1000.0;          // supply side\n  float watts = busV * mA / 1000.0;\n  unsigned long now = millis();\n  wh += watts * (now - lastMs) / 3600000.0;\n  lastMs = now;\n\n  lcd.setCursor(0, 0);                            // \"12.00V  1.583A\"\n  lcd.print(loadV, 2);\n  lcd.print(\"V  \");\n  lcd.print(mA / 1000.0, 3);\n  lcd.print(\"A  \");\n  lcd.setCursor(0, 1);                            // \"19.0W  0.005Wh\"\n  lcd.print(watts, 1);\n  lcd.print(\"W  \");\n  lcd.print(wh, 3);\n  lcd.print(\"Wh  \");\n\n  Serial.print(\"bus \");\n  Serial.print(busV, 3);\n  Serial.print(\" V  shunt \");\n  Serial.print(shuntmV, 2);\n  Serial.print(\" mV  \");\n  Serial.print(mA, 1);\n  Serial.print(\" mA  \");\n  Serial.print(watts, 2);\n  Serial.println(\" W\");\n  delay(500);\n}\n" },
  rtc: { name: 'DS3231 clock: relay ON 18:00–06:00 (RTClib)', esp: "// DS3231 clock: the lights relay is ON from 18:00 to 06:00, the LCD shows the time\n// In the simulator the clock runs x60 (1 s = 1 min, set in the DS3231 panel) so you see it switch.\n#include <Wire.h>\n#include <RTClib.h>\n#include <LiquidCrystal_I2C.h>\n\nRTC_DS3231 rtc;                            // 0x68, SDA = GPIO21, SCL = GPIO22\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nconst int RELAY = 26;                      // relay module: LOW = ON\nconst int ON_HOUR = 18;                    // lights ON at 18:00\nconst int OFF_HOUR = 6;                    // lights OFF at 06:00\nchar line[17];\nint lastMin = -1;\n\nbool lightsOn(int h) {\n  if (ON_HOUR > OFF_HOUR) return h >= ON_HOUR || h < OFF_HOUR;   // over midnight\n  return h >= ON_HOUR && h < OFF_HOUR;\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(RELAY, OUTPUT);\n  digitalWrite(RELAY, HIGH);               // OFF at boot\n  lcd.init();\n  lcd.backlight();\n  if (!rtc.begin()) {\n    Serial.println(\"DS3231 not found!\");\n    lcd.print(\"RTC missing\");\n    while (true) delay(100);\n  }\n  if (rtc.lostPower()) {                   // new coin cell: set it once from the PC time\n    Serial.println(\"RTC lost power, setting the time\");\n    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));\n  }\n}\n\nvoid loop() {\n  DateTime now = rtc.now();\n  bool on = lightsOn(now.hour());\n  digitalWrite(RELAY, on ? LOW : HIGH);\n\n  snprintf(line, 17, \"%02d:%02d:%02d  %s\", now.hour(), now.minute(), now.second(), on ? \"ON \" : \"OFF\");\n  lcd.setCursor(0, 0);\n  lcd.print(line);\n  snprintf(line, 17, \"%04d-%02d-%02d\", now.year(), now.month(), now.day());\n  lcd.setCursor(0, 1);\n  lcd.print(line);\n\n  if (now.minute() != lastMin) {           // log once a minute\n    lastMin = now.minute();\n    Serial.print(now.timestamp());\n    Serial.println(on ? \"  lights ON\" : \"  lights OFF\");\n  }\n  delay(200);\n}\n",
    uno: "// DS3231 clock: the lights relay is ON from 18:00 to 06:00, the LCD shows the time\n// In the simulator the clock runs x60 (1 s = 1 min, set in the DS3231 panel) so you see it switch.\n#include <Wire.h>\n#include <RTClib.h>\n#include <LiquidCrystal_I2C.h>\n\nRTC_DS3231 rtc;                            // 0x68, SDA = A4, SCL = A5\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nconst int RELAY = 7;                      // relay module: LOW = ON\nconst int ON_HOUR = 18;                    // lights ON at 18:00\nconst int OFF_HOUR = 6;                    // lights OFF at 06:00\nchar line[17];\nint lastMin = -1;\n\nbool lightsOn(int h) {\n  if (ON_HOUR > OFF_HOUR) return h >= ON_HOUR || h < OFF_HOUR;   // over midnight\n  return h >= ON_HOUR && h < OFF_HOUR;\n}\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(RELAY, OUTPUT);\n  digitalWrite(RELAY, HIGH);               // OFF at boot\n  lcd.init();\n  lcd.backlight();\n  if (!rtc.begin()) {\n    Serial.println(\"DS3231 not found!\");\n    lcd.print(\"RTC missing\");\n    while (true) delay(100);\n  }\n  if (rtc.lostPower()) {                   // new coin cell: set it once from the PC time\n    Serial.println(\"RTC lost power, setting the time\");\n    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));\n  }\n}\n\nvoid loop() {\n  DateTime now = rtc.now();\n  bool on = lightsOn(now.hour());\n  digitalWrite(RELAY, on ? LOW : HIGH);\n\n  snprintf(line, 17, \"%02d:%02d:%02d  %s\", now.hour(), now.minute(), now.second(), on ? \"ON \" : \"OFF\");\n  lcd.setCursor(0, 0);\n  lcd.print(line);\n  snprintf(line, 17, \"%04d-%02d-%02d\", now.year(), now.month(), now.day());\n  lcd.setCursor(0, 1);\n  lcd.print(line);\n\n  if (now.minute() != lastMin) {           // log once a minute\n    lastMin = now.minute();\n    Serial.print(now.timestamp());\n    Serial.println(on ? \"  lights ON\" : \"  lights OFF\");\n  }\n  delay(200);\n}\n" },
  byj: { name: '28BYJ-48 + ULN2003 stepper (Stepper.h)', esp: "// 28BYJ-48 5 V stepper on a ULN2003 board: one turn forward, one turn back\n// Stepper.h wants the pins in the order IN1, IN3, IN2, IN4 for this motor.\n#include <Stepper.h>\n\nconst int STEPS = 2048;                    // steps per turn (32 x 64 gearbox)\nStepper motor(STEPS, 19, 5, 18, 17);       // IN1 = 19, IN2 = 18, IN3 = 5, IN4 = 17\n\nvoid setup() {\n  Serial.begin(115200);\n  motor.setSpeed(10);                      // rpm, 28BYJ-48 tops out near 15\n}\n\nvoid loop() {\n  Serial.println(\"forward 1 turn\");\n  motor.step(STEPS);\n  delay(1000);\n  Serial.println(\"back 1 turn\");\n  motor.step(-STEPS);\n  delay(1000);\n}\n",
    uno: "// 28BYJ-48 5 V stepper on a ULN2003 board: one turn forward, one turn back\n// Stepper.h wants the pins in the order IN1, IN3, IN2, IN4 for this motor.\n#include <Stepper.h>\n\nconst int STEPS = 2048;                    // steps per turn (32 x 64 gearbox)\nStepper motor(STEPS, 8, 10, 9, 11);        // IN1 = 8, IN2 = 9, IN3 = 10, IN4 = 11\n\nvoid setup() {\n  Serial.begin(9600);\n  motor.setSpeed(10);                      // rpm, 28BYJ-48 tops out near 15\n}\n\nvoid loop() {\n  Serial.println(\"forward 1 turn\");\n  motor.step(STEPS);\n  delay(1000);\n  Serial.println(\"back 1 turn\");\n  motor.step(-STEPS);\n  delay(1000);\n}\n" },
  thermo: { name: 'DHT22 thermostat: fan on above 30 °C', esp: '#include <DHT.h>\n\nDHT dht(4, DHT22);        // DATA on GPIO4\nconst int FAN = 23;\n\nvoid setup() {\n  Serial.begin(115200);\n  dht.begin();\n  pinMode(FAN, OUTPUT);\n}\n\nvoid loop() {\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  if (isnan(t)) {\n    Serial.println("DHT not found!");\n    delay(1000);\n    return;\n  }\n  digitalWrite(FAN, t > 30 ? HIGH : LOW);\n  Serial.printf("%.1f C  %.0f %%  fan %s\\n", t, h, t > 30 ? "ON" : "OFF");\n  delay(1000);\n}\n',
    uno: '#include <DHT.h>\n\nDHT dht(2, DHT22);        // DATA on D2\nconst int FAN = 13;\n\nvoid setup() {\n  Serial.begin(9600);\n  dht.begin();\n  pinMode(FAN, OUTPUT);\n}\n\nvoid loop() {\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  if (isnan(t)) {\n    Serial.println("DHT not found!");\n    delay(1000);\n    return;\n  }\n  digitalWrite(FAN, t > 30 ? HIGH : LOW);\n  Serial.print(t, 1); Serial.print(" C  ");\n  Serial.print(h, 0); Serial.println(" %");\n  delay(1000);\n}\n' },
  sonar: { name: 'HC-SR04 distance: LED when closer than 20 cm', esp: 'const int TRIG = 5, ECHO = 18, LED = 23;   // ECHO is 5 V: use a divider into the ESP32!\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  long us = pulseIn(ECHO, HIGH, 30000);\n  float cm = us / 58.0;\n  digitalWrite(LED, cm > 0 && cm < 20 ? HIGH : LOW);\n  Serial.print("Distance: ");\n  Serial.print(cm, 1);\n  Serial.println(" cm");\n  delay(200);\n}\n',
    uno: 'const int TRIG = 9, ECHO = 10, LED = 13;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  long us = pulseIn(ECHO, HIGH, 30000);   // echo time in microseconds\n  float cm = us / 58.0;\n  digitalWrite(LED, cm > 0 && cm < 20 ? HIGH : LOW);\n  Serial.print("Distance: ");\n  Serial.print(cm, 1);\n  Serial.println(" cm");\n  delay(200);\n}\n' },
  servo: { name: 'Servo sweep', esp: '#include <ESP32Servo.h>\n\nServo arm;\n\nvoid setup() {\n  arm.attach(18);\n}\n\nvoid loop() {\n  for (int a = 0; a <= 180; a += 10) {\n    arm.write(a);\n    delay(100);\n  }\n  for (int a = 180; a >= 0; a -= 10) {\n    arm.write(a);\n    delay(100);\n  }\n}\n',
    uno: '#include <Servo.h>\n\nServo arm;\n\nvoid setup() {\n  arm.attach(9);\n}\n\nvoid loop() {\n  for (int a = 0; a <= 180; a += 10) {\n    arm.write(a);\n    delay(100);\n  }\n  for (int a = 180; a >= 0; a -= 10) {\n    arm.write(a);\n    delay(100);\n  }\n}\n' },
};
