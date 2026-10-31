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
    id: 'delay555', title: '555 power-on delay', example: 'delay555', tag: 'Timer',
    intro: 'Turn the power on and the output waits about 1 second before switching ON. Used to delay a relay, a speaker (no "pop" at switch-on) or a motor until the supply is steady.',
    parts: [['U1', 'NE555 timer'], ['C1', '10 µF from +12 V to TRIG + THR'], ['R1', '100 kΩ from TRIG + THR to ground'], ['C2', '10 nF on CTRL (pin 5), noise filter'], ['R2 + ON', '1 kΩ + green LED on the output'], ['POWER', 'switch to try it']],
    steps: [
      ['1. How a 555 thinks', 'Inside are two comparators and a memory (latch). A divider of three 5 kΩ resistors makes ⅓ Vcc and ⅔ Vcc.<br><b>TRIG (pin 2) below ⅓ Vcc → output HIGH.</b> <b>THR (pin 6) above ⅔ Vcc → output LOW.</b> In between, it remembers the last state.'],
      ['2. The moment power comes on', 'C1 is empty, and an empty capacitor acts like a wire. So TRIG and THR jump up to the full 12 V with the supply. THR is above ⅔ Vcc (8 V) → <b>output LOW</b>, LED off.'],
      ['3. The wait', 'C1 now charges through R1. Its bottom end (TRIG + THR) slides down from 12 V toward 0 V with time constant τ = R1 × C1 = 100 kΩ × 10 µF = <b>1 s</b>.'],
      ['4. The switch', 'When TRIG drops below ⅓ Vcc (4 V), the output flips <b>HIGH</b> and stays there.<br>Time to fall from 12 V to 4 V: t = R × C × ln(3) = <b>1.1 × R × C ≈ 1.1 s</b>. The simulator switches at 1.09 s. ✔'],
      ['5. Changing the delay', 't ≈ 1.1 × R1 × C1. 470 kΩ + 10 µF ≈ 5 s, 1 MΩ + 47 µF ≈ 52 s. Keep R1 under about 1 MΩ (electrolytic leakage), and use a good capacitor for long delays.'],
      ['6. Driving a load', 'An NE555 output can source about 200 mA, so it drives an LED or a small 12 V relay straight away (add a 1N4148 across the coil). For anything bigger use a transistor or MOSFET. With an NE555 on 12 V the HIGH output is about 10.3 V (Vcc − 1.7 V); a TLC555 (CMOS) goes almost to 12 V.'],
      ['7. Fast reset when power goes off', 'After the delay C1 is full (12 V across it). When power is cut, its bottom end swings to about −12 V and C1 empties only slowly through R1, so a quick off-on gives a shorter delay.<br>Fix: a <b>1N4148 across R1, anode to ground, cathode to TRIG/THR</b>. While running it is reversed and does nothing; at switch-off it clamps the negative swing and empties C1 at once.'],
    ],
    tryit: ['Flip POWER on and watch the scope: blue = capacitor (TRIG/THR) falling, yellow = output stepping up after ≈ 1.1 s.', 'Change C1 to 47 µF: about 5 s.', 'Change the 555 to TLC555: the output HIGH goes to almost 12 V.', 'Flip POWER off and on again quickly: the delay is shorter because C1 did not empty. That is why the reset diode helps.'],
  },
  {
    id: 'esp32io', title: 'ESP32 / Arduino pins: what is safe', example: 'esp32io', tag: 'Microcontroller',
    intro: 'The board part has no program: you set each pin the way your code would (OUTPUT HIGH, INPUT_PULLUP, analogRead…) and the simulator shows what the circuit around it does. Tap a pin on the drawing to set it.',
    parts: [['ESP32', 'DevKit 30-pin, USB powered, 3.3 V logic'], ['R1 + LED1', 'D23 OUTPUT HIGH → 330 Ω → red LED'], ['BTN', 'D15 INPUT_PULLUP, button to GND'], ['RV1', '10 kΩ pot on 3.3 V, wiper → D34 analogRead']],
    steps: [
      ['1. An output pin is a small battery with a resistor', 'OUTPUT HIGH ≈ 3.3 V (ESP32) or 5 V (UNO) through about 25–30 Ω inside. The more current you take, the more the voltage sags.<br>LED: (3.3 − 1.8) ÷ (330 + 30) ≈ <b>4 mA</b>. Keep each pin ≤ <b>20 mA</b> (40 mA is the absolute max). Bigger loads → transistor or MOSFET.'],
      ['2. Never more than the supply on a pin', '5 V on an ESP32 pin kills it. From a 5 V sensor use a divider (10 kΩ / 20 kΩ → 3.33 V) or a level shifter. The panel warns in red.'],
      ['3. Inputs need a defined level', 'An input with nothing on it "floats" and reads random HIGH/LOW. INPUT_PULLUP adds ≈ 45 kΩ (ESP32) / 35 kΩ (UNO) to the supply inside: the pin reads HIGH, and a button to GND pulls it LOW (pressed = LOW).'],
      ['4. HIGH and LOW thresholds', 'ESP32: LOW below ≈ 0.8 V, HIGH above ≈ 2.5 V. UNO: LOW below 1.5 V, HIGH above 3 V. In between the reading is unreliable.'],
      ['5. analogRead', 'ESP32: 12 bits, 0–4095 for 0–3.3 V (GPIO32–39 = ADC1; ADC2 pins don\'t work while WiFi is on). UNO: 10 bits, 0–1023 for 0–5 V on A0–A5.<br>Pot in the middle: 1.65 V → 2047.'],
      ['6. ESP32 pins to be careful with', '<b>GPIO34, 35, 36 (VP), 39 (VN)</b>: input only, no pull-ups. <b>GPIO0, 2, 5, 12, 15</b>: boot strapping, the wrong level at power-up stops booting or flashing (GPIO12 HIGH is the classic one). <b>TX0 / RX0</b>: USB serial.'],
      ['7. Power pins', 'ESP32 3V3 comes from its regulator (keep extra loads to a few hundred mA), VIN ≈ 4.7 V from USB. UNO 3V3 only 50 mA, 5V about 500 mA from USB. Motors, solenoids and relay banks need their own supply (common GND).'],
    ],
    tryit: ['Hold BTN: D15 reads LOW.', 'Turn RV1: D34 analogRead follows (0–4095).', 'Change R1 to 47 Ω: the D23 panel warns about the current.', 'Set D2 to PWM 50 %: the scope appears (time simulation).', 'Open 🟫 PCB: the DevKit footprint is ready for a carrier board.'],
    build: ['Parts: ESP32 DevKit (30 pin) + USB cable, 330 Ω resistor, red LED, push button, 10 kΩ pot, breadboard, jumper wires.', 'LED: D23 → 330 Ω → LED long leg (+); LED short leg (−) → GND.', 'Button: D15 → button → GND (no resistor: INPUT_PULLUP is inside).', 'Pot: outer legs to 3V3 and GND, middle leg (wiper) → D34.', 'Arduino IDE → board "ESP32 Dev Module" → upload the code below → Serial Monitor at 115200.'],
    code: "const int LED = 23;\nconst int BTN = 15;\nconst int POT = 34;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);   // pressed = LOW\n  // D34 is input-only: analogRead works without pinMode\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BTN) == LOW;\n  int pot = analogRead(POT);    // 0 ... 4095\n  digitalWrite(LED, pressed ? LOW : HIGH);   // LED on, off while pressed\n  Serial.print(\"button: \"); Serial.print(pressed ? \"PRESSED\" : \"up\");\n  Serial.print(\"   pot: \"); Serial.println(pot);\n  delay(200);\n}",
    note2: 'In the simulator no program runs: pins stay as you set them, so the LED does not react to the button by itself. The code joins them on the real board: it reads D15 and switches D23.',
  },
  {
    id: 'unoio', title: 'Arduino UNO: LED, button, pot', example: 'unoio', tag: 'Microcontroller',
    intro: 'The same idea as the ESP32 page on a 5 V board: D13 drives an LED, D2 reads a button with the internal pull-up, A0 reads a pot.',
    parts: [['UNO', 'Arduino UNO, USB powered, 5 V logic'], ['R1 + LED1', 'D13 OUTPUT HIGH → 220 Ω → red LED'], ['BTN', 'D2 INPUT_PULLUP, button to GND'], ['RV1', '10 kΩ pot on 5 V, wiper → A0']],
    steps: [
      ['LED current', '(5 − 1.8) ÷ (220 + 25) ≈ <b>12.5 mA</b> (the simulator shows 12.4 mA). Under the 20 mA a pin likes. D13 also has the small on-board "L" LED.'],
      ['Button', 'INPUT_PULLUP (≈ 35 kΩ inside) holds D2 at 5 V = HIGH. Pressed → 0 V = LOW. D0 and D1 are the USB serial pins: keep them free.'],
      ['Pot', 'A0 reads 0–1023 for 0–5 V. Middle = 2.5 V → about 511.'],
      ['PWM', 'Only D3, D5, D6, D9, D10, D11 (marked ~) can do analogWrite.'],
    ],
    tryit: ['Hold BTN: D2 reads LOW.', 'Turn RV1: A0 follows 0–1023.', 'Change R1 to 100 Ω: about 26 mA, the D13 panel warns.', 'Set D9 to PWM and add an LED + 220 Ω: dimming.'],
    build: ['Parts: Arduino UNO + USB cable, 220 Ω resistor, red LED, push button, 10 kΩ pot, breadboard, jumper wires.', 'LED: D13 → 220 Ω → LED long leg (+); LED short leg (−) → GND.', 'Button: D2 → button → GND.', 'Pot: outer legs to 5V and GND, middle leg → A0.', 'Arduino IDE → board "Arduino Uno" → upload → Serial Monitor at 9600.'],
    code: "const int LED = 13;\nconst int BTN = 2;\nconst int POT = A0;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(LED, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);   // pressed = LOW\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BTN) == LOW;\n  int pot = analogRead(POT);    // 0 ... 1023\n  digitalWrite(LED, pressed ? LOW : HIGH);   // LED on, off while pressed\n  Serial.print(\"button: \"); Serial.print(pressed ? \"PRESSED\" : \"up\");\n  Serial.print(\"   pot: \"); Serial.println(pot);\n  delay(200);\n}",
    note2: 'In the simulator no program runs: pins stay as you set them. On the real board the code reads D2 and switches D13.',
  },
  {
    id: 'servo', title: 'Servo motor (SG90 / MG996R)', example: 'servo', tag: 'Motor',
    intro: 'A hobby servo turns its arm to an angle set by the length of a pulse that repeats every 20 ms. Inside: a small motor, gears, a potentiometer and a little control board that keeps the arm where the pulse says.',
    parts: [['ESP32', 'D18 = PWM 50 Hz'], ['SERVO', 'SG90: SIG (orange), V+ (red), GND (brown)'], ['Power', 'servo V+ from VIN (USB 5 V)']],
    steps: [
      ['1. The pulse', 'Every 20 ms (50 Hz) one pulse: <b>0.5 ms = 0°</b>, <b>1.5 ms = 90°</b>, <b>2.5 ms = 180°</b>. Some servos use 1–2 ms for 0–180°: check yours.'],
      ['2. As PWM duty', 'Duty = pulse ÷ 20 ms: 2.5 % = 0°, 7.5 % = 90°, 12.5 % = 180°. Angle = (pulse − 0.5 ms) ÷ 2 ms × 180°.'],
      ['3. Power', 'Servos want 5–6 V and pull 250 mA (SG90) to 2.5 A (MG996R, stall) while moving. Never from the 3.3 V pin. One SG90 from VIN/USB is OK; bigger or several servos → separate 5–6 V supply, GND joined with the ESP32.'],
      ['4. 3.3 V signal', 'The ESP32\'s 3.3 V pulse is enough for almost all servos even when they run on 5 V.'],
    ],
    tryit: ['Tap the ESP32, pick D18, set Duty to 2.5 % → the arm swings to 0°. 12.5 % → 180°.', 'Watch the arm move at the servo\'s real speed (about 0.1 s per 60° for an SG90).', 'Change the servo to MG996R: the panel warns about its stall current.'],
    build: ['Parts: ESP32 DevKit, SG90 servo, USB cable (for big servos: 5–6 V 2 A supply).', 'Servo orange / yellow → D18.', 'Servo red → VIN (or + of the 5–6 V supply).', 'Servo brown / black → GND (and − of the supply: common ground!).', 'Arduino IDE → install the library "ESP32Servo" → upload.'],
    code: "#include <ESP32Servo.h>   // Library Manager: \"ESP32Servo\"\n\nServo servo;\n\nvoid setup() {\n  servo.attach(18, 500, 2500);   // pin, 0.5 ms = 0\u00b0, 2.5 ms = 180\u00b0\n}\n\nvoid loop() {\n  servo.write(0);   delay(1000);\n  servo.write(90);  delay(1000);\n  servo.write(180); delay(1000);\n}",
    note2: 'In the simulator you set the PWM duty by hand; on the real board servo.write(angle) makes the same pulse.',
  },
  {
    id: 'stepper', title: 'Stepper motor with an A4988 driver', example: 'stepper', tag: 'Motor',
    intro: 'A stepper turns a fixed angle for every pulse: 1.8° for a NEMA 17, so 200 pulses = 1 turn. The A4988 driver does the hard part (switching coil currents); the microcontroller only gives STEP and DIR.',
    parts: [['ESP32', 'D18 = STEP (PWM 200 Hz), D5 = DIR (HIGH)'], ['A4988', 'VDD from 3V3, EN open = on, RST + SLP joined'], ['Motor', 'NEMA 17, 200 steps per turn'], ['VMOT', '12 V supply + 100 µF capacitor at the module']],
    steps: [
      ['1. Speed', '<b>RPM = step rate × 60 ÷ (200 × microsteps)</b>. 200 steps/s, full step → 60 RPM. The simulator shows 60 RPM. ✔'],
      ['2. Direction', 'DIR HIGH = one way, LOW = the other. Change DIR only while STEP is not pulsing.'],
      ['3. Microstepping', 'MS1–MS3 pins: 1/2, 1/4, 1/8, 1/16 steps. Smoother and quieter, but you need more pulses for the same speed.'],
      ['4. Current limit (important!)', 'Set it on the module\'s trimpot before connecting the motor: Vref = I × 8 × Rsense. With Rsense 0.1 Ω (common): Vref = 0.8 × I. For 1 A → 0.8 V. Too high = hot driver and motor. Above about 1.2 A use a heatsink.'],
      ['5. Power', 'VMOT 8–35 V (12 V typical) with a 100 µF electrolytic right at the module: voltage spikes from the motor can kill the A4988. Never unplug the motor while powered.'],
      ['6. Wiring the coils', 'The two coils go to 1A/1B and 2A/2B. Find the pairs with a multimeter: two wires that beep (a few Ω) are one coil.'],
    ],
    tryit: ['Tap the ESP32, pick D18 and change the PWM frequency: 400 Hz → 120 RPM.', 'Set D5 to OUTPUT LOW: the rotor turns the other way (negative RPM).', 'Tap the stepper and choose 1/16 microstep: same pulses, 16× slower.', 'Set the VMOT battery to 6 V: the driver shuts down (below 8 V).'],
    build: ['Parts: ESP32 DevKit, A4988 module (+ heatsink), NEMA 17 stepper, 12 V 2 A supply, 100 µF 25 V capacitor.', 'A4988 STEP → D18, DIR → D5, VDD → 3V3, GND → GND, EN not connected, RST joined to SLP.', 'VMOT → +12 V, the GND next to it → −12 V and ESP32 GND, 100 µF across VMOT and GND.', 'Motor coil A → 1A / 1B, coil B → 2A / 2B.', 'Set the current limit (Vref) with the trimpot, then upload the code.'],
    code: "const int STEP = 18;\nconst int DIR  = 5;\n\nvoid setup() {\n  pinMode(STEP, OUTPUT);\n  pinMode(DIR, OUTPUT);\n}\n\nvoid turn(bool forward) {\n  digitalWrite(DIR, forward ? HIGH : LOW);\n  for (int i = 0; i < 200; i++) {      // 200 full steps = 1 turn\n    digitalWrite(STEP, HIGH); delayMicroseconds(2500);\n    digitalWrite(STEP, LOW);  delayMicroseconds(2500);   // 5 ms per step = 60 RPM\n  }\n}\n\nvoid loop() {\n  turn(true);  delay(500);\n  turn(false); delay(500);\n}",
    note2: 'In the simulator the STEP pulses come from a PWM pin you set by hand; on the real board the code makes them, and can count exact steps.',
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
  function codeBox(code) {
    const b = el('button', { class: 'btn', type: 'button', text: '📋 Copy code', onclick: async () => { try { await navigator.clipboard.writeText(code); b.textContent = '✓ Copied'; } catch { const r = document.createRange(); r.selectNodeContents(pre); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Selected: copy it'; } setTimeout(() => (b.textContent = '📋 Copy code'), 1800); } });
    const pre = el('pre', { class: 'steps learn-code', text: code });
    return el('div', { class: 'learn-step' }, el('div', { class: 'row wrap', style: 'justify-content:space-between;align-items:center' }, el('h3', { text: '💻 Code (Arduino IDE)' }), b), pre);
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
      a.tryit ? el('div', { class: 'learn-try' }, el('h3', { text: '🧪 Try it in the simulator' }), el('ul', {}, a.tryit.map(t => el('li', { text: t })))) : null,
      a.note2 ? el('p', { class: 'note', text: a.note2 }) : null,
      a.build ? el('div', { class: 'learn-step' }, el('h3', { text: '🔧 Build it for real' }), el('ol', { class: 'learn-ol' }, a.build.map(t => el('li', { text: t })))) : null,
      a.code ? codeBox(a.code) : null);
    view.append(card);
  }
  show(store.get('learn.cur', 'preamp'));
}
