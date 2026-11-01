// SSD1306 128×64 OLED over I2C (Adafruit_SSD1306 + Adafruit_GFX). The sketch draws into a RAM buffer;
// display() copies it to the screen the schematic shows. Classic 5×7 font in 6×8 cells, like the real library.
const F = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5F, 0x00, 0x00, 0x00, 0x07, 0x00, 0x07, 0x00, 0x14, 0x7F, 0x14, 0x7F, 0x14, // sp ! " #
  0x24, 0x2A, 0x7F, 0x2A, 0x12, 0x23, 0x13, 0x08, 0x64, 0x62, 0x36, 0x49, 0x55, 0x22, 0x50, 0x00, 0x05, 0x03, 0x00, 0x00, // $ % & '
  0x00, 0x1C, 0x22, 0x41, 0x00, 0x00, 0x41, 0x22, 0x1C, 0x00, 0x08, 0x2A, 0x1C, 0x2A, 0x08, 0x08, 0x08, 0x3E, 0x08, 0x08, // ( ) * +
  0x00, 0x50, 0x30, 0x00, 0x00, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x60, 0x60, 0x00, 0x00, 0x20, 0x10, 0x08, 0x04, 0x02, // , - . /
  0x3E, 0x51, 0x49, 0x45, 0x3E, 0x00, 0x42, 0x7F, 0x40, 0x00, 0x42, 0x61, 0x51, 0x49, 0x46, 0x21, 0x41, 0x45, 0x4B, 0x31, // 0 1 2 3
  0x18, 0x14, 0x12, 0x7F, 0x10, 0x27, 0x45, 0x45, 0x45, 0x39, 0x3C, 0x4A, 0x49, 0x49, 0x30, 0x01, 0x71, 0x09, 0x05, 0x03, // 4 5 6 7
  0x36, 0x49, 0x49, 0x49, 0x36, 0x06, 0x49, 0x49, 0x29, 0x1E, 0x00, 0x36, 0x36, 0x00, 0x00, 0x00, 0x56, 0x36, 0x00, 0x00, // 8 9 : ;
  0x08, 0x14, 0x22, 0x41, 0x00, 0x14, 0x14, 0x14, 0x14, 0x14, 0x00, 0x41, 0x22, 0x14, 0x08, 0x02, 0x01, 0x51, 0x09, 0x06, // < = > ?
  0x32, 0x49, 0x79, 0x41, 0x3E, 0x7E, 0x11, 0x11, 0x11, 0x7E, 0x7F, 0x49, 0x49, 0x49, 0x36, 0x3E, 0x41, 0x41, 0x41, 0x22, // @ A B C
  0x7F, 0x41, 0x41, 0x22, 0x1C, 0x7F, 0x49, 0x49, 0x49, 0x41, 0x7F, 0x09, 0x09, 0x09, 0x01, 0x3E, 0x41, 0x49, 0x49, 0x7A, // D E F G
  0x7F, 0x08, 0x08, 0x08, 0x7F, 0x00, 0x41, 0x7F, 0x41, 0x00, 0x20, 0x40, 0x41, 0x3F, 0x01, 0x7F, 0x08, 0x14, 0x22, 0x41, // H I J K
  0x7F, 0x40, 0x40, 0x40, 0x40, 0x7F, 0x02, 0x0C, 0x02, 0x7F, 0x7F, 0x04, 0x08, 0x10, 0x7F, 0x3E, 0x41, 0x41, 0x41, 0x3E, // L M N O
  0x7F, 0x09, 0x09, 0x09, 0x06, 0x3E, 0x41, 0x51, 0x21, 0x5E, 0x7F, 0x09, 0x19, 0x29, 0x46, 0x46, 0x49, 0x49, 0x49, 0x31, // P Q R S
  0x01, 0x01, 0x7F, 0x01, 0x01, 0x3F, 0x40, 0x40, 0x40, 0x3F, 0x1F, 0x20, 0x40, 0x20, 0x1F, 0x3F, 0x40, 0x38, 0x40, 0x3F, // T U V W
  0x63, 0x14, 0x08, 0x14, 0x63, 0x07, 0x08, 0x70, 0x08, 0x07, 0x61, 0x51, 0x49, 0x45, 0x43, 0x00, 0x7F, 0x41, 0x41, 0x00, // X Y Z [
  0x02, 0x04, 0x08, 0x10, 0x20, 0x00, 0x41, 0x41, 0x7F, 0x00, 0x04, 0x02, 0x01, 0x02, 0x04, 0x40, 0x40, 0x40, 0x40, 0x40, // \ ] ^ _
  0x00, 0x01, 0x02, 0x04, 0x00, 0x20, 0x54, 0x54, 0x54, 0x78, 0x7F, 0x48, 0x44, 0x44, 0x38, 0x38, 0x44, 0x44, 0x44, 0x20, // ` a b c
  0x38, 0x44, 0x44, 0x48, 0x7F, 0x38, 0x54, 0x54, 0x54, 0x18, 0x08, 0x7E, 0x09, 0x01, 0x02, 0x0C, 0x52, 0x52, 0x52, 0x3E, // d e f g
  0x7F, 0x08, 0x04, 0x04, 0x78, 0x00, 0x44, 0x7D, 0x40, 0x00, 0x20, 0x40, 0x44, 0x3D, 0x00, 0x7F, 0x10, 0x28, 0x44, 0x00, // h i j k
  0x00, 0x41, 0x7F, 0x40, 0x00, 0x7C, 0x04, 0x18, 0x04, 0x78, 0x7C, 0x08, 0x04, 0x04, 0x78, 0x38, 0x44, 0x44, 0x44, 0x38, // l m n o
  0x7C, 0x14, 0x14, 0x14, 0x08, 0x08, 0x14, 0x14, 0x18, 0x7C, 0x7C, 0x08, 0x04, 0x04, 0x08, 0x48, 0x54, 0x54, 0x54, 0x20, // p q r s
  0x04, 0x3F, 0x44, 0x40, 0x20, 0x3C, 0x40, 0x40, 0x20, 0x7C, 0x1C, 0x20, 0x40, 0x20, 0x1C, 0x3C, 0x40, 0x30, 0x40, 0x3C, // t u v w
  0x44, 0x28, 0x10, 0x28, 0x44, 0x0C, 0x50, 0x50, 0x50, 0x3C, 0x44, 0x64, 0x54, 0x4C, 0x44, 0x00, 0x08, 0x36, 0x41, 0x00, // x y z {
  0x00, 0x00, 0x7F, 0x00, 0x00, 0x00, 0x41, 0x36, 0x08, 0x00, 0x08, 0x04, 0x08, 0x10, 0x08,                               // | } ~
];
const DEG = [0x00, 0x06, 0x09, 0x09, 0x06], BOX = [0x7F, 0x41, 0x41, 0x41, 0x7F];
const glyph = (code) => (code >= 32 && code <= 126 ? F.slice((code - 32) * 5, (code - 32) * 5 + 5) : code === 176 || code === 247 || code === 248 ? DEG : code === 32 ? null : BOX);

export const OLED_CONST = { SSD1306_WHITE: 1, SSD1306_BLACK: 0, SSD1306_INVERSE: 2, WHITE: 1, BLACK: 0, INVERSE: 2, SSD1306_SWITCHCAPVCC: 2, SSD1306_EXTERNALVCC: 1, SSD1306_DISPLAYOFF: 0xAE, SSD1306_DISPLAYON: 0xAF };

// fmt = the board's print formatter, list = where every display created by the sketch is registered
export function makeOled(fmt, list) {
  return class Adafruit_SSD1306 {
    constructor(w = 128, h = 64) {
      this.W = w === 128 || w === 64 ? w : 128; this.H = h === 32 ? 32 : 64;
      this.buf = new Uint8Array(this.W * this.H); this.shown = null; this.addr = 0x3C; this.on = false; this.inv = false; this.ver = 0;
      this.tx = 0; this.ty = 0; this.sx = 1; this.sy = 1; this.fg = 1; this.bg = -1; this.wrap = true; this.rot = 0;
      list.push(this);
    }
    // ----- control -----
    begin(vcc = 2, addr = 0x3C) { this.addr = addr; this.on = true; this.shown = new Uint8Array(this.W * this.H); this.ver++; return true; }
    display() { if (!this.shown) return; this.shown.set(this.buf); this.ver++; }
    clearDisplay() { this.buf.fill(0); }
    invertDisplay(i) { this.inv = !!i; this.ver++; }
    ssd1306_command(cmd) { if (cmd === 0xAE) { this.on = false; this.ver++; } else if (cmd === 0xAF) { this.on = !!this.shown; this.ver++; } }
    dim() { } cp437() { } startscrollright() { } startscrollleft() { } startscrolldiagright() { } startscrolldiagleft() { } stopscroll() { } setFont() { }
    width() { return this.rot & 1 ? this.H : this.W; }
    height() { return this.rot & 1 ? this.W : this.H; }
    setRotation(r) { this.rot = ((Math.trunc(r) % 4) + 4) % 4; }
    getRotation() { return this.rot; }
    getPixel(x, y) { const p = this.map(x, y); return p < 0 ? 0 : this.buf[p]; }
    getBuffer() { return this.buf; }
    // ----- pixels -----
    map(x, y) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.width() || y >= this.height()) return -1;
      const W = this.W, H = this.H;
      const [px, py] = this.rot === 1 ? [W - 1 - y, x] : this.rot === 2 ? [W - 1 - x, H - 1 - y] : this.rot === 3 ? [y, H - 1 - x] : [x, y];
      return py * W + px;
    }
    drawPixel(x, y, c = 1) { const p = this.map(x, y); if (p < 0) return; this.buf[p] = c === 2 ? this.buf[p] ^ 1 : c ? 1 : 0; }
    fillScreen(c) { if (c === 2) for (let i = 0; i < this.buf.length; i++) this.buf[i] ^= 1; else this.buf.fill(c ? 1 : 0); }
    drawFastHLine(x, y, w, c) { for (let i = 0; i < Math.round(w); i++) this.drawPixel(x + i, y, c); }
    drawFastVLine(x, y, h, c) { for (let i = 0; i < Math.round(h); i++) this.drawPixel(x, y + i, c); }
    drawLine(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
      for (let n = 0; n < 4096; n++) { this.drawPixel(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    }
    drawRect(x, y, w, h, c) { this.drawFastHLine(x, y, w, c); this.drawFastHLine(x, y + h - 1, w, c); this.drawFastVLine(x, y + 1, h - 2, c); this.drawFastVLine(x + w - 1, y + 1, h - 2, c); }
    fillRect(x, y, w, h, c) { for (let j = 0; j < Math.round(h); j++) this.drawFastHLine(x, y + j, w, c); }
    circleQ(x0, y0, r, corners, c) {      // quarter arcs (Adafruit drawCircleHelper)
      let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
      while (x < y) {
        if (f >= 0) { y--; ddy += 2; f += ddy; } x++; ddx += 2; f += ddx;
        if (corners & 4) { this.drawPixel(x0 + x, y0 + y, c); this.drawPixel(x0 + y, y0 + x, c); }
        if (corners & 2) { this.drawPixel(x0 + x, y0 - y, c); this.drawPixel(x0 + y, y0 - x, c); }
        if (corners & 8) { this.drawPixel(x0 - y, y0 + x, c); this.drawPixel(x0 - x, y0 + y, c); }
        if (corners & 1) { this.drawPixel(x0 - y, y0 - x, c); this.drawPixel(x0 - x, y0 - y, c); }
      }
    }
    fillQ(x0, y0, r, sides, delta, c) {   // Adafruit fillCircleHelper
      let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r, px = x, py = y; delta++;
      while (x < y) {
        if (f >= 0) { y--; ddy += 2; f += ddy; } x++; ddx += 2; f += ddx;
        if (x < y + 1) { if (sides & 1) this.drawFastVLine(x0 + x, y0 - y, 2 * y + delta, c); if (sides & 2) this.drawFastVLine(x0 - x, y0 - y, 2 * y + delta, c); }
        if (y !== py) { if (sides & 1) this.drawFastVLine(x0 + py, y0 - px, 2 * px + delta, c); if (sides & 2) this.drawFastVLine(x0 - py, y0 - px, 2 * px + delta, c); py = y; }
        px = x;
      }
    }
    drawCircle(x0, y0, r, c) { x0 = Math.round(x0); y0 = Math.round(y0); r = Math.round(r); this.drawPixel(x0, y0 + r, c); this.drawPixel(x0, y0 - r, c); this.drawPixel(x0 + r, y0, c); this.drawPixel(x0 - r, y0, c); this.circleQ(x0, y0, r, 15, c); }
    fillCircle(x0, y0, r, c) { x0 = Math.round(x0); y0 = Math.round(y0); r = Math.round(r); this.drawFastVLine(x0, y0 - r, 2 * r + 1, c); this.fillQ(x0, y0, r, 3, 0, c); }
    drawRoundRect(x, y, w, h, r, c) {
      r = Math.min(Math.round(r), Math.floor(Math.min(w, h) / 2));
      this.drawFastHLine(x + r, y, w - 2 * r, c); this.drawFastHLine(x + r, y + h - 1, w - 2 * r, c); this.drawFastVLine(x, y + r, h - 2 * r, c); this.drawFastVLine(x + w - 1, y + r, h - 2 * r, c);
      this.circleQ(x + r, y + r, r, 1, c); this.circleQ(x + w - r - 1, y + r, r, 2, c); this.circleQ(x + w - r - 1, y + h - r - 1, r, 4, c); this.circleQ(x + r, y + h - r - 1, r, 8, c);
    }
    fillRoundRect(x, y, w, h, r, c) {
      r = Math.min(Math.round(r), Math.floor(Math.min(w, h) / 2));
      this.fillRect(x + r, y, w - 2 * r, h, c); this.fillQ(x + w - r - 1, y + r, r, 1, h - 2 * r - 1, c); this.fillQ(x + r, y + r, r, 2, h - 2 * r - 1, c);
    }
    drawTriangle(x0, y0, x1, y1, x2, y2, c) { this.drawLine(x0, y0, x1, y1, c); this.drawLine(x1, y1, x2, y2, c); this.drawLine(x2, y2, x0, y0, c); }
    fillTriangle(x0, y0, x1, y1, x2, y2, c) {
      const xs = [x0, x1, x2].map(Math.round), ys = [y0, y1, y2].map(Math.round), ar = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        const w0 = (xs[1] - x) * (ys[2] - y) - (xs[2] - x) * (ys[1] - y), w1 = (xs[2] - x) * (ys[0] - y) - (xs[0] - x) * (ys[2] - y), w2 = (xs[0] - x) * (ys[1] - y) - (xs[1] - x) * (ys[0] - y);
        if (ar >= 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0) this.drawPixel(x, y, c);
      }
      this.drawTriangle(x0, y0, x1, y1, x2, y2, c);
    }
    // bitmaps: rows of bytes, MSB = leftmost pixel (drawBitmap) / LSB = leftmost (drawXBitmap, .xbm files)
    drawBitmap(x, y, bmp, w, h, c = 1, bg) {
      const bw = (w + 7) >> 3;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const on = (bmp[j * bw + (i >> 3)] ?? 0) & (0x80 >> (i & 7)); if (on) this.drawPixel(x + i, y + j, c); else if (bg != null) this.drawPixel(x + i, y + j, bg); }
    }
    drawXBitmap(x, y, bmp, w, h, c = 1) {
      const bw = (w + 7) >> 3;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((bmp[j * bw + (i >> 3)] ?? 0) & (1 << (i & 7))) this.drawPixel(x + i, y + j, c);
    }
    // ----- text -----
    setTextSize(s, sy) { this.sx = Math.max(1, Math.trunc(s) || 1); this.sy = sy == null ? this.sx : Math.max(1, Math.trunc(sy) || 1); }
    setTextColor(c, bg) { this.fg = c; this.bg = bg == null ? -1 : bg; }
    setCursor(x, y) { this.tx = Math.trunc(x); this.ty = Math.trunc(y); }
    getCursorX() { return this.tx; } getCursorY() { return this.ty; }
    setTextWrap(w) { this.wrap = !!w; }
    drawChar(x, y, ch, c, bg, sx, sy = sx) {
      const g = glyph(typeof ch === 'number' ? ch : ch.codePointAt(0));
      for (let i = 0; i < 6; i++) {
        const col = i < 5 && g ? g[i] : 0;
        for (let j = 0; j < 8; j++) {
          const on = (col >> j) & 1;
          if (!on && (bg == null || bg < 0 || bg === c)) continue;
          if (sx === 1 && sy === 1) this.drawPixel(x + i, y + j, on ? c : bg); else this.fillRect(x + i * sx, y + j * sy, sx, sy, on ? c : bg);
        }
      }
    }
    write(ch) {
      if (typeof ch === 'number') ch = String.fromCharCode(ch);
      for (const k of String(ch)) {
        if (k === '\n') { this.tx = 0; this.ty += this.sy * 8; continue; }
        if (k === '\r') continue;
        if (this.wrap && this.tx + this.sx * 6 > this.width()) { this.tx = 0; this.ty += this.sy * 8; }
        this.drawChar(this.tx, this.ty, k, this.fg, this.bg, this.sx, this.sy); this.tx += this.sx * 6;
      }
      return 1;
    }
    print(x, f) { this.write(fmt(x, f)); return 1; }
    println(x = '', f) { this.write(fmt(x, f) + '\n'); return 1; }
    printf(f, ...a) { let i = 0; this.write(String(f).replace(/%[-+0 #]*\d*(?:\.(\d+))?[dilufsxXc%]/g, (m, d) => m === '%%' ? '%' : /f/.test(m) ? (+a[i++]).toFixed(d ? +d : 6) : /[dilu]/.test(m) ? String(Math.trunc(a[i++])) : /[xX]/.test(m) ? Math.trunc(a[i++]).toString(16) : String(a[i++]))); }
    getTextBounds() { }
  };
}
