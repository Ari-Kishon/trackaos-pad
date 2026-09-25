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
2. Set **KEY** and **SCALE** — these own absolute pitch (iMS-20-style). Pad X only picks a degree in that pitch world.
3. Set **BPM**, then press **START**, or press the pad (transport starts on first pad engage).
4. Drag on the pad (X is always scale-quantized). While the pad is held it **owns the melodic lane** — the bass pattern ducks/stops (iMS-20-style: Kaoss performs the synth, not a second voice beside it):
   - **HOLD** — X note, Y filter
   - **ARP** — X root degree, Y octave span (1–3), walks the scale, 16th-synced
   - **GATE** — X note, Y gate rate (synced to transport)
   - **IMS** — iMS-20 performance Kaoss: X note, Y gate (legato → 25%), MS-20-ish dual-osc voice
   Release ends the pad voice and the bass pattern returns.
5. Computer **KEYS** play an independent monophonic voice (chromatic). They do not move the pad.

Aesthetic is sparse HUD — cool near-black ground, hairline grid, pale amber accent.

## Stack

Node ≥ 24, strict TypeScript, ESLint `strictTypeChecked`, Vite on port 2222.
