/*
  Fox9ner Relays: ESP32 + 2 x 74HCT595 + 10 relay modules (LOW trigger)
  Control from your phone by Bluetooth LE, or by WiFi (WebSocket) at http://relays.local
  © Fox9ner. All rights reserved.

  Arduino IDE:
    Board            : ESP32 Dev Module   (Boards Manager: "esp32" by Espressif, 3.x)
    Partition Scheme : Huge APP (3MB No OTA/1MB SPIFFS)   <- Bluetooth + WiFi need the big app space
    Library Manager  : "WebSockets" by Markus Sattler

  Wiring (same as the Fox9nertron example "10 relay modules on 3 wires"):
    GPIO19 -> U1 pin 14 SER            GPIO18 -> U1 + U2 pin 11 SRCLK
    GPIO5  -> U1 + U2 pin 12 RCLK      GPIO4  -> U1 + U2 pin 13 OE, plus 10k from pin 13 to 3.3 V
    U1 pin 9 QH' -> U2 pin 14 SER      U1 + U2: pin 16 VCC = 5 V, pin 10 SRCLR = 5 V, pin 8 GND
    U1 QA..QH (15,1..7) -> relay 1..8 IN     U2 QA, QB (15, 1) -> relay 9, 10 IN
    Relays: VCC 5 V, GND. 5 V supply >= 1 A, its GND joined to the ESP32 GND.
    The 10k on OE keeps every relay OFF while the ESP32 boots (595 outputs switched off).

  Commands (Bluetooth, WiFi page or Serial Monitor 115200):
    3            toggle relay 3
    on 1,3,5     off 2,4
    all on       all off
    1010000001   one digit per relay, relay 1 first (1 = ON)
    time 5       reset time: each relay switches itself OFF 5 s after it went ON (0 = stays ON)
    status       reply with the state
  Every change answers "S1010000001 T5" (relay 1 first, reset time in s).
*/
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Preferences.h>

// ---------- your WiFi (leave WIFI_SSID empty to use only the ESP32's own hotspot) ----------
const char* WIFI_SSID = "";
const char* WIFI_PASS = "";
// the ESP32's own hotspot, used when WIFI_SSID is empty or cannot be reached
const char* AP_SSID = "Fox9ner-Relays";
const char* AP_PASS = "fox9ner123";        // at least 8 characters
const char* HOSTNAME = "relays";           // http://relays.local
const char* BLE_NAME = "Fox9ner Relays";

// ---------- pins ----------
const int DATA = 19, CLOCK = 18, LATCH = 5, OE = 4;
const int NRELAYS = 10;
const bool ACTIVE_LOW = true;              // most relay modules: IN LOW = relay ON

// ---------- relay state ----------
uint32_t relays = 0, before = 0;           // bit 0 = relay 1
unsigned long onSince[NRELAYS];
unsigned long resetMs = 0;
Preferences prefs;

void writeRelays() {
  for (int i = 0; i < NRELAYS; i++)
    if (((relays >> i) & 1) && !((before >> i) & 1)) onSince[i] = millis();   // just went ON: start its timer
  before = relays;
  uint32_t out = ACTIVE_LOW ? ~relays : relays;
  digitalWrite(LATCH, LOW);
  shiftOut(DATA, CLOCK, MSBFIRST, (out >> 8) & 0xFF);   // the last chip's byte first
  shiftOut(DATA, CLOCK, MSBFIRST, out & 0xFF);
  digitalWrite(LATCH, HIGH);
}

String stateText() {
  String s = "S";
  for (int i = 0; i < NRELAYS; i++) s += ((relays >> i) & 1) ? '1' : '0';
  s += " T";
  s += String(resetMs / 1000.0, resetMs % 1000 ? 1 : 0);
  return s;
}

// ---------- Bluetooth LE: Nordic UART service (works with Web Bluetooth and "Serial Bluetooth Terminal") ----------
#define NUS_SERVICE "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
BLECharacteristic* txChar = nullptr;
volatile bool bleConnected = false;
QueueHandle_t cmdQueue;                    // commands from the Bluetooth task, handled in loop()
struct Cmd { char text[64]; };

void queueText(const String& in) {         // split into lines, queue each
  int start = 0;
  String s = in + "\n";
  for (int i = 0; i < (int)s.length(); i++) {
    if (s[i] == '\n' || s[i] == '\r') {
      String line = s.substring(start, i);
      line.trim();
      if (line.length()) { Cmd c; line.toCharArray(c.text, sizeof(c.text)); xQueueSend(cmdQueue, &c, 0); }
      start = i + 1;
    }
  }
}

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { bleConnected = true; }
  void onDisconnect(BLEServer*) override { bleConnected = false; BLEDevice::startAdvertising(); }
};
String bleBuf;
class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    bleBuf += String(c->getValue().c_str());           // phones send in 20-byte pieces: wait for the newline
    int nl = bleBuf.lastIndexOf('\n');
    if (nl >= 0) { queueText(bleBuf.substring(0, nl)); bleBuf = bleBuf.substring(nl + 1); }
    else if (bleBuf.length() > 60) { queueText(bleBuf); bleBuf = ""; }
  }
};

void bleSend(const String& s) {
  if (!bleConnected || !txChar) return;
  String t = s + "\n";
  for (int i = 0; i < (int)t.length(); i += 20) {      // 20 bytes fit every phone
    String part = t.substring(i, i + 20);
    txChar->setValue((uint8_t*)part.c_str(), part.length());
    txChar->notify();
    delay(5);
  }
}

void setupBle() {
  BLEDevice::init(BLE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  BLEService* svc = server->createService(NUS_SERVICE);
  txChar = svc->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic* rx = svc->createCharacteristic(NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCB());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

// ---------- WiFi: web page on port 80, WebSocket on port 81 ----------
WebServer web(80);
WebSocketsServer ws(81);
extern const char PAGE[];

void wsEvent(uint8_t id, WStype_t type, uint8_t* payload, size_t len) {
  if (type == WStype_CONNECTED) { String s = stateText(); ws.sendTXT(id, s); }
  else if (type == WStype_TEXT) queueText(String((const char*)payload, len));
}

void setupWifi() {
  WiFi.setHostname(HOSTNAME);
  bool joined = false;
  if (strlen(WIFI_SSID)) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.print("Joining WiFi ");
    Serial.print(WIFI_SSID);
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(250); Serial.print('.'); }
    Serial.println();
    joined = WiFi.status() == WL_CONNECTED;
  }
  if (joined) { Serial.print("WiFi OK, open http://"); Serial.print(HOSTNAME); Serial.print(".local or http://"); Serial.println(WiFi.localIP()); }
  else {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);
    Serial.print("Hotspot \""); Serial.print(AP_SSID); Serial.print("\" password "); Serial.print(AP_PASS);
    Serial.print(", open http://"); Serial.println(WiFi.softAPIP());
  }
  MDNS.begin(HOSTNAME);
  MDNS.addService("http", "tcp", 80);
  web.on("/", []() { web.send_P(200, "text/html", PAGE); });
  web.onNotFound([]() { web.sendHeader("Location", "/"); web.send(302, "text/plain", ""); });
  web.begin();
  ws.begin();
  ws.onEvent(wsEvent);
}

// ---------- commands ----------
void broadcast() {
  String s = stateText();
  Serial.println(s);
  bleSend(s);
  ws.broadcastTXT(s);
}

void setList(String list, bool on) {       // "1,3,5"
  list += ",";
  int start = 0;
  for (int i = 0; i < (int)list.length(); i++) {
    if (list[i] == ',' || list[i] == ' ') {
      int n = list.substring(start, i).toInt();
      if (n >= 1 && n <= NRELAYS) { if (on) relays |= (1UL << (n - 1)); else relays &= ~(1UL << (n - 1)); }
      start = i + 1;
    }
  }
}

void handle(String cmd) {
  cmd.trim();
  cmd.toLowerCase();
  if (!cmd.length()) return;
  bool binary = cmd.length() == NRELAYS;
  for (int i = 0; i < (int)cmd.length() && binary; i++) if (cmd[i] != '0' && cmd[i] != '1') binary = false;

  if (cmd == "status") { broadcast(); return; }
  else if (cmd == "all on") relays = (1UL << NRELAYS) - 1;
  else if (cmd == "all off") relays = 0;
  else if (cmd.startsWith("time ")) {
    float s = cmd.substring(5).toFloat();
    resetMs = s > 0 ? (unsigned long)(s * 1000) : 0;
    prefs.putULong("resetMs", resetMs);    // remembered after power loss
  }
  else if (cmd.startsWith("on ")) setList(cmd.substring(3), true);
  else if (cmd.startsWith("off ")) setList(cmd.substring(4), false);
  else if (binary) {
    relays = 0;
    for (int i = 0; i < NRELAYS; i++) if (cmd[i] == '1') relays |= (1UL << i);
  }
  else {
    int n = cmd.toInt();
    if (n >= 1 && n <= NRELAYS) relays ^= (1UL << (n - 1));
    else { String e = "?? " + cmd; Serial.println(e); bleSend(e); ws.broadcastTXT(e); return; }
  }
  writeRelays();
  broadcast();
}

// ---------- setup / loop ----------
void setup() {
  Serial.begin(115200);
  pinMode(OE, OUTPUT);
  digitalWrite(OE, HIGH);                  // outputs off while we load "all OFF"
  pinMode(DATA, OUTPUT);
  pinMode(CLOCK, OUTPUT);
  pinMode(LATCH, OUTPUT);
  relays = 0;
  writeRelays();
  digitalWrite(OE, LOW);                   // now drive the relays (all OFF)

  prefs.begin("relays", false);
  resetMs = prefs.getULong("resetMs", 0);

  cmdQueue = xQueueCreate(16, sizeof(Cmd));
  setupBle();
  setupWifi();
  Serial.println("Fox9ner Relays ready. Bluetooth name: \"Fox9ner Relays\"");
  broadcast();
}

String serialBuf;
unsigned long lastBeat = 0;

void loop() {
  web.handleClient();
  ws.loop();

  Cmd c;
  while (xQueueReceive(cmdQueue, &c, 0) == pdTRUE) handle(String(c.text));

  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') { handle(serialBuf); serialBuf = ""; }
    else if (serialBuf.length() < 60) serialBuf += ch;
  }

  // reset time: switch OFF every relay that has been ON long enough
  if (resetMs > 0) {
    uint32_t was = relays;
    for (int i = 0; i < NRELAYS; i++)
      if (((relays >> i) & 1) && millis() - onSince[i] >= resetMs) relays &= ~(1UL << i);
    if (relays != was) { writeRelays(); broadcast(); }
  }

  // every 5 s: send the state again, so a phone that just connected always shows the truth
  if (millis() - lastBeat > 5000) { lastBeat = millis(); String s = stateText(); bleSend(s); ws.broadcastTXT(s); }
  delay(2);
}

// ---------- the phone page (same as relays.html on GitHub) ----------
const char PAGE[] PROGMEM = R"FOX9(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B1016">
<title>Fox9ner Relays</title>
<style>
  :root { --bg: #0B1016; --card: #141B23; --line: #26313D; --fg: #E6EDF3; --dim: #8B98A5; --on: #FF1744; --acc: #4FC3F7; --ok: #66BB6A; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: max(14px, env(safe-area-inset-top)) 16px 28px; display: grid; gap: 14px; }
  h1 { font-size: 20px; margin: 4px 0 0; display: flex; align-items: center; gap: 8px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: grid; gap: 10px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  button { font: inherit; color: var(--fg); background: #1C2630; border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; cursor: pointer; }
  button:active { transform: scale(0.97); }
  button.primary { background: #0D47A1; border-color: #1976D2; }
  button:disabled { opacity: 0.45; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .relay { aspect-ratio: 1; font-size: 20px; font-weight: 700; padding: 0; position: relative; display: grid; place-items: center; }
  .relay small { position: absolute; bottom: 5px; left: 0; right: 0; font-size: 10px; font-weight: 600; color: var(--dim); }
  .relay.on { background: #4A0E18; border-color: var(--on); box-shadow: 0 0 14px rgba(255, 23, 68, 0.45) inset; }
  .relay.on small { color: #FF8A9B; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #555; display: inline-block; }
  .dot.ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot.wait { background: #FFB300; }
  #status { color: var(--dim); font-size: 14px; }
  input { font: inherit; width: 6em; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--line); background: #0F151C; color: var(--fg); }
  .note { color: var(--dim); font-size: 13px; }
  #log { font: 12px/1.4 ui-monospace, monospace; color: #8BE38B; background: #071007; border-radius: 10px; padding: 8px; max-height: 120px; overflow: auto; white-space: pre-wrap; margin: 0; }
  footer { color: var(--dim); font-size: 12px; text-align: center; }
</style>
</head>
<body>
<main>
  <h1>🔌 Fox9ner Relays</h1>

  <div class="card">
    <div class="row"><span class="dot" id="dot"></span><span id="status">Not connected</span></div>
    <div class="row">
      <button class="primary" id="bleBtn">🔵 Connect Bluetooth</button>
      <button id="wsBtn">📶 Connect WiFi</button>
    </div>
    <div class="note" id="how"></div>
  </div>

  <div class="card">
    <div class="grid" id="grid"></div>
    <div class="row">
      <button id="allOn">All ON</button>
      <button id="allOff">All OFF</button>
    </div>
    <div class="note">Tap a number to switch that relay ON / OFF. Red = ON.</div>
  </div>

  <div class="card">
    <div class="row">
      <span>⏱ Reset time</span><input id="tIn" type="number" min="0" step="0.5" inputmode="decimal" value="0"><span>s</span>
      <button id="tSet">Set</button>
    </div>
    <div class="note">Each relay switches itself OFF this many seconds after it went ON. 0 = stays ON. Kept by the ESP32 after power loss.</div>
  </div>

  <pre id="log"></pre>
  <footer>© Fox9ner. All rights reserved.</footer>
</main>

<script>
'use strict';
const N = 10;
// Nordic UART service: the ESP32 receives on RX (we write), answers on TX (notify)
const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e', RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e', TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const $ = (id) => document.getElementById(id);
let state = '0'.repeat(N), link = null;     // link = { kind: 'ble' | 'ws', send(text) }

// ---------- UI ----------
const btns = [];
for (let k = 0; k < N; k++) {
  const b = document.createElement('button');
  b.className = 'relay'; b.innerHTML = `${k + 1}<small>OFF</small>`;
  b.onclick = () => send(String(k + 1));
  $('grid').append(b); btns.push(b);
}
function show() {
  btns.forEach((b, k) => { const on = state[k] === '1'; b.classList.toggle('on', on); b.querySelector('small').textContent = on ? 'ON' : 'OFF'; });
  const can = !!link;
  [...btns, $('allOn'), $('allOff'), $('tSet')].forEach(b => { b.disabled = !can; });
}
function setStatus(text, kind) { $('status').textContent = text; $('dot').className = 'dot' + (kind ? ' ' + kind : ''); }
function log(t) { const el = $('log'); el.textContent += t + '\n'; const lines = el.textContent.split('\n'); if (lines.length > 60) el.textContent = lines.slice(-60).join('\n'); el.scrollTop = el.scrollHeight; }
$('allOn').onclick = () => send('all on');
$('allOff').onclick = () => send('all off');
$('tSet').onclick = () => send('time ' + Math.max(0, +$('tIn').value || 0));

// messages from the ESP32: "S0010000000 T5" = relay states (relay 1 first) + reset time
function onText(t) {
  for (const line of t.split('\n')) {
    const m = line.match(/^S([01]+)(?:\s+T([\d.]+))?/);
    if (m) { state = m[1].padEnd(N, '0').slice(0, N); if (m[2] != null && document.activeElement !== $('tIn')) $('tIn').value = m[2]; show(); }
    else if (line.trim()) log('← ' + line.trim());
  }
}
function send(cmd) {
  if (!link) return;
  log('→ ' + cmd);
  link.send(cmd + '\n').catch(e => log('send failed: ' + e.message));
}

// ---------- Bluetooth LE (Chrome on Android, Edge / Chrome on PC, Bluefy on iPhone) ----------
let dev = null;
async function connectBle() {
  if (!navigator.bluetooth) { setStatus('This browser has no Bluetooth. Android: Chrome. iPhone: the free "Bluefy" app.', ''); return; }
  try {
    setStatus('Choose "Fox9ner Relays" in the list…', 'wait');
    dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Fox9ner' }], optionalServices: [NUS] });
    dev.addEventListener('gattserverdisconnected', () => { link = null; show(); setStatus('Bluetooth disconnected. Tap Connect again.', ''); });
    setStatus('Connecting…', 'wait');
    const srv = await dev.gatt.connect(), svc = await srv.getPrimaryService(NUS);
    const rx = await svc.getCharacteristic(RX), tx = await svc.getCharacteristic(TX);
    let buf = '';
    tx.addEventListener('characteristicvaluechanged', (e) => { buf += new TextDecoder().decode(e.target.value); const i = buf.lastIndexOf('\n'); if (i >= 0) { onText(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    await tx.startNotifications();
    const enc = new TextEncoder();
    link = { kind: 'ble', send: async (t) => { const d = enc.encode(t); for (let i = 0; i < d.length; i += 20) await rx.writeValueWithResponse(d.slice(i, i + 20)); } };
    setStatus('🔵 Connected by Bluetooth: ' + (dev.name || 'Fox9ner Relays'), 'ok');
    show(); send('status');
  } catch (e) { link = null; show(); setStatus(e.name === 'NotFoundError' ? 'No device chosen.' : 'Bluetooth: ' + e.message, ''); }
}
$('bleBtn').onclick = connectBle;

// ---------- WiFi WebSocket (page opened from the ESP32: http://relays.local or its IP) ----------
let ws = null, wsTimer = 0;
function connectWs(host) {
  clearTimeout(wsTimer);
  try { ws?.close(); } catch { }
  setStatus('Connecting to ' + host + '…', 'wait');
  ws = new WebSocket(`ws://${host}:81/`);
  ws.onopen = () => { link = { kind: 'ws', send: async (t) => ws.send(t) }; setStatus('📶 Connected by WiFi: ' + host, 'ok'); show(); send('status'); };
  ws.onmessage = (e) => onText(String(e.data));
  ws.onclose = () => { if (link?.kind === 'ws') link = null; show(); setStatus('WiFi connection lost, retrying…', 'wait'); wsTimer = setTimeout(() => connectWs(host), 2000); };
}
const fromEsp = location.protocol === 'http:' && location.hostname && location.hostname !== 'localhost';
$('wsBtn').onclick = () => {
  if (fromEsp) return connectWs(location.hostname);
  setStatus('WiFi works when you open this page from the ESP32: type http://relays.local (or its IP) in the browser while on the same WiFi.', '');
};
$('how').textContent = fromEsp
  ? 'Opened from the ESP32: connecting over WiFi. (Bluetooth works from the GitHub page.)'
  : 'Bluetooth: tap Connect and pick "Fox9ner Relays". Android: Chrome · iPhone: Bluefy app. WiFi: open http://relays.local while on the same WiFi.';
if (fromEsp) { $('bleBtn').hidden = true; connectWs(location.hostname); }
show();
</script>
</body>
</html>

)FOX9";
