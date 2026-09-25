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

1. Choose a **DRUM**, **BASS**, and **PAD** mode (HOLD / ARP / GATE / IMS).
2. Set **BPM**, then press **START**, or press the pad (transport starts on first pad engage).
3. Drag on the pad:
   - **HOLD** — X pitch, Y filter
   - **ARP** — X chord root, Y octave span (1–3), 16th-synced
   - **GATE** — X pitch, Y gate rate (synced to transport)
   - **IMS** — iMS-20 performance Kaoss: X scale note (Aeolian), Y gate (legato → 25%), MS-20-ish dual-osc voice
   Release ends the voice.

Aesthetic is sparse HUD — cool near-black ground, hairline grid, pale amber accent.

## Stack

Node ≥ 24, strict TypeScript, ESLint `strictTypeChecked`, Vite on port 2222.
