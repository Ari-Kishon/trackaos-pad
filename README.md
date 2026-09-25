# Trackaos Pad

Minimal browser music tool in the spirit of a Kaoss Pad: synced drum and bass loops plus an XY performance synth. Vanilla TypeScript + Vite, Web Audio only (no sample assets).

## Run

```bash
npm install
npm run dev        # Vite on :2222
npm run typecheck
npm run lint
npm run build      # static site → build/
npm run start      # build + preview
```

## Play

1. Top **song** bar: **DRUM**, **BASS**, **BPM**, **START**. Left **pad** rail: **KEY**, **SCALE**, **SYNTH**, **PAD** mode, **OCT RANGE**, **OCT OFFSET**.
2. **KEY** / **SCALE** own absolute pitch (iMS-20-style). Pad X only picks a degree in that pitch world. **OCT RANGE** (1–4, default 3) sets how many octaves the pad spans; **OCT OFFSET** (−2…+2) shifts the pad register in whole octaves.
3. Changing **KEY** also retargets the computer-keyboard bass baseline (A = key root at the current octave).
4. Set **BPM**, then press **START**, or press the pad (transport starts on first pad engage).
5. Drag on the pad (X is always scale-quantized). The pad layers over the running drum and bass loops:
   - **HOLD** — X note, Y filter
   - **ARP** — X root degree, Y octave span (1–3), walks the scale, 16th-synced
   - **GATE** — X note, Y gate rate (synced to transport)
   - **IMS** — iMS-20 performance Kaoss: X note, Y gate (legato → 25%)
   **SYNTH** sets the pad timbre (SAW / SQUARE / MS-20 / SINE / PULSE) across all modes.
   Release ends the pad voice; the groove keeps playing.
6. Computer **KEYS** play an independent monophonic voice (chromatic from the selected key). They do not move the pad.

Aesthetic is sparse HUD — cool near-black ground, hairline grid, pale amber accent.

## Stack

Node ≥ 24, strict TypeScript, ESLint `strictTypeChecked`, Vite on port 2222.
