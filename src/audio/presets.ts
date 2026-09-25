/** Default techno tempo; engine holds the live mutable value. */
export const DEFAULT_BPM = 128;

export const BPM_MIN = 80;
export const BPM_MAX = 160;

/** Sixteenth-note steps per bar (4/4). */
export const STEPS_PER_BAR = 16;

export type DrumHitKind = 'kick' | 'clap' | 'hat' | 'openhat' | 'rim';

export type DrumHit = {
  readonly step: number;
  readonly kind: DrumHitKind;
  readonly velocity: number;
};

export type DrumPreset = {
  readonly id: string;
  readonly label: string;
  readonly hits: readonly DrumHit[];
};

export type BassNote = {
  readonly step: number;
  readonly midi: number;
  readonly durationSteps: number;
  readonly velocity: number;
};

/** Bass oscillator / filter character for sequenced notes. */
export type BassVoice = 'sub' | 'acid' | 'pulse' | 'reese' | 'pluck';

export type BassPreset = {
  readonly id: string;
  readonly label: string;
  readonly notes: readonly BassNote[];
  readonly voice: BassVoice;
};

/** Pad / Kaoss timbre — independent of HOLD / ARP / GATE / IMS mode. */
export type SynthVoiceId = 'saw' | 'square' | 'ms20' | 'sine' | 'pulse';

export type SynthVoice = {
  readonly id: SynthVoiceId;
  readonly label: string;
};

export const SYNTH_VOICES: readonly SynthVoice[] = [
  { id: 'saw', label: 'SAW' },
  { id: 'square', label: 'SQUARE' },
  { id: 'ms20', label: 'MS-20' },
  { id: 'sine', label: 'SINE' },
  { id: 'pulse', label: 'PULSE' },
];

export const DEFAULT_SYNTH_VOICE: SynthVoiceId = 'saw';

function fourOnFloor(): DrumHit[] {
  return [
    { step: 0, kind: 'kick', velocity: 1 },
    { step: 4, kind: 'kick', velocity: 1 },
    { step: 8, kind: 'kick', velocity: 1 },
    { step: 12, kind: 'kick', velocity: 1 },
  ];
}

function closedHats16th(vel = 0.42): DrumHit[] {
  const hits: DrumHit[] = [];
  for (let s = 0; s < STEPS_PER_BAR; s += 1) {
    hits.push({ step: s, kind: 'hat', velocity: s % 2 === 0 ? vel : vel * 0.72 });
  }
  return hits;
}

function offbeatHats(vel = 0.4): DrumHit[] {
  const hits: DrumHit[] = [];
  for (let s = 1; s < STEPS_PER_BAR; s += 2) {
    hits.push({ step: s, kind: 'hat', velocity: vel });
  }
  return hits;
}

export const DRUM_PRESETS: readonly DrumPreset[] = [
  {
    id: 'berlin-minimal',
    label: 'BERLIN MINIMAL',
    hits: [
      ...fourOnFloor(),
      { step: 4, kind: 'clap', velocity: 0.78 },
      { step: 12, kind: 'clap', velocity: 0.82 },
      ...closedHats16th(0.32).map((h) =>
        h.step === 2 || h.step === 6 || h.step === 10 || h.step === 14
          ? { ...h, velocity: h.velocity * 1.15 }
          : h,
      ),
      { step: 14, kind: 'openhat', velocity: 0.28 },
    ],
  },
  {
    id: 'detroit-drive',
    label: 'DETROIT DRIVE',
    hits: [
      ...fourOnFloor(),
      { step: 4, kind: 'clap', velocity: 0.9 },
      { step: 12, kind: 'clap', velocity: 0.95 },
      { step: 10, kind: 'clap', velocity: 0.35 },
      { step: 0, kind: 'hat', velocity: 0.5 },
      { step: 1, kind: 'hat', velocity: 0.28 },
      { step: 2, kind: 'hat', velocity: 0.48 },
      { step: 3, kind: 'hat', velocity: 0.3 },
      { step: 4, kind: 'hat', velocity: 0.55 },
      { step: 5, kind: 'hat', velocity: 0.32 },
      { step: 6, kind: 'hat', velocity: 0.5 },
      { step: 7, kind: 'hat', velocity: 0.34 },
      { step: 8, kind: 'hat', velocity: 0.52 },
      { step: 9, kind: 'hat', velocity: 0.3 },
      { step: 10, kind: 'hat', velocity: 0.48 },
      { step: 11, kind: 'hat', velocity: 0.36 },
      { step: 12, kind: 'hat', velocity: 0.55 },
      { step: 13, kind: 'hat', velocity: 0.32 },
      { step: 14, kind: 'openhat', velocity: 0.45 },
      { step: 15, kind: 'hat', velocity: 0.38 },
      { step: 7, kind: 'rim', velocity: 0.4 },
    ],
  },
  {
    id: 'peak-roll',
    label: 'PEAK ROLL',
    hits: [
      ...fourOnFloor(),
      { step: 4, kind: 'clap', velocity: 0.88 },
      { step: 12, kind: 'clap', velocity: 0.92 },
      ...closedHats16th(0.48),
      { step: 2, kind: 'openhat', velocity: 0.55 },
      { step: 6, kind: 'openhat', velocity: 0.5 },
      { step: 10, kind: 'openhat', velocity: 0.58 },
      { step: 14, kind: 'openhat', velocity: 0.62 },
      { step: 15, kind: 'rim', velocity: 0.35 },
    ],
  },
  {
    id: 'afterhours',
    label: 'AFTERHOURS',
    hits: [
      { step: 0, kind: 'kick', velocity: 1 },
      { step: 3, kind: 'kick', velocity: 0.55 },
      { step: 6, kind: 'kick', velocity: 0.85 },
      { step: 8, kind: 'kick', velocity: 0.95 },
      { step: 11, kind: 'kick', velocity: 0.5 },
      { step: 14, kind: 'kick', velocity: 0.7 },
      { step: 4, kind: 'clap', velocity: 0.75 },
      { step: 12, kind: 'clap', velocity: 0.7 },
      { step: 13, kind: 'clap', velocity: 0.4 },
      { step: 1, kind: 'hat', velocity: 0.28 },
      { step: 2, kind: 'hat', velocity: 0.4 },
      { step: 5, kind: 'hat', velocity: 0.32 },
      { step: 7, kind: 'hat', velocity: 0.45 },
      { step: 9, kind: 'hat', velocity: 0.3 },
      { step: 10, kind: 'openhat', velocity: 0.42 },
      { step: 15, kind: 'hat', velocity: 0.38 },
      { step: 6, kind: 'rim', velocity: 0.32 },
    ],
  },
  {
    id: 'dub-techno',
    label: 'DUB TECHNO',
    hits: [
      { step: 0, kind: 'kick', velocity: 1 },
      { step: 8, kind: 'kick', velocity: 0.92 },
      { step: 4, kind: 'clap', velocity: 0.55 },
      { step: 12, kind: 'clap', velocity: 0.62 },
      { step: 13, kind: 'clap', velocity: 0.28 },
      ...offbeatHats(0.28),
      { step: 6, kind: 'openhat', velocity: 0.22 },
      { step: 14, kind: 'openhat', velocity: 0.26 },
      { step: 3, kind: 'rim', velocity: 0.22 },
      { step: 11, kind: 'rim', velocity: 0.18 },
    ],
  },
  {
    id: 'industrial',
    label: 'INDUSTRIAL',
    hits: [
      { step: 0, kind: 'kick', velocity: 1 },
      { step: 3, kind: 'kick', velocity: 0.7 },
      { step: 4, kind: 'kick', velocity: 0.95 },
      { step: 7, kind: 'kick', velocity: 0.55 },
      { step: 8, kind: 'kick', velocity: 1 },
      { step: 10, kind: 'kick', velocity: 0.65 },
      { step: 12, kind: 'kick', velocity: 0.9 },
      { step: 15, kind: 'kick', velocity: 0.5 },
      { step: 4, kind: 'clap', velocity: 0.95 },
      { step: 12, kind: 'clap', velocity: 1 },
      { step: 6, kind: 'rim', velocity: 0.55 },
      { step: 14, kind: 'rim', velocity: 0.6 },
      { step: 2, kind: 'hat', velocity: 0.35 },
      { step: 5, kind: 'hat', velocity: 0.4 },
      { step: 9, kind: 'hat', velocity: 0.32 },
      { step: 11, kind: 'openhat', velocity: 0.48 },
      { step: 13, kind: 'hat', velocity: 0.38 },
    ],
  },
  {
    id: 'broken',
    label: 'BROKEN',
    hits: [
      { step: 0, kind: 'kick', velocity: 1 },
      { step: 5, kind: 'kick', velocity: 0.75 },
      { step: 8, kind: 'kick', velocity: 0.55 },
      { step: 11, kind: 'kick', velocity: 0.9 },
      { step: 3, kind: 'clap', velocity: 0.7 },
      { step: 7, kind: 'clap', velocity: 0.45 },
      { step: 10, kind: 'clap', velocity: 0.85 },
      { step: 14, kind: 'clap', velocity: 0.4 },
      { step: 1, kind: 'hat', velocity: 0.35 },
      { step: 2, kind: 'hat', velocity: 0.5 },
      { step: 4, kind: 'hat', velocity: 0.28 },
      { step: 6, kind: 'openhat', velocity: 0.4 },
      { step: 9, kind: 'hat', velocity: 0.42 },
      { step: 12, kind: 'hat', velocity: 0.3 },
      { step: 13, kind: 'hat', velocity: 0.48 },
      { step: 15, kind: 'rim', velocity: 0.38 },
    ],
  },
  {
    id: 'tribal',
    label: 'TRIBAL',
    hits: [
      ...fourOnFloor(),
      { step: 2, kind: 'rim', velocity: 0.55 },
      { step: 3, kind: 'rim', velocity: 0.35 },
      { step: 6, kind: 'rim', velocity: 0.5 },
      { step: 7, kind: 'rim', velocity: 0.32 },
      { step: 10, kind: 'rim', velocity: 0.58 },
      { step: 11, kind: 'rim', velocity: 0.38 },
      { step: 14, kind: 'rim', velocity: 0.52 },
      { step: 15, kind: 'rim', velocity: 0.4 },
      { step: 4, kind: 'clap', velocity: 0.65 },
      { step: 12, kind: 'clap', velocity: 0.7 },
      ...offbeatHats(0.36),
      { step: 8, kind: 'openhat', velocity: 0.35 },
    ],
  },
];

export const BASS_PRESETS: readonly BassPreset[] = [
  {
    id: 'acid-303',
    label: 'ACID 303',
    voice: 'acid',
    notes: [
      { step: 0, midi: 36, durationSteps: 1, velocity: 0.9 },
      { step: 1, midi: 36, durationSteps: 1, velocity: 0.55 },
      { step: 2, midi: 48, durationSteps: 1, velocity: 0.75 },
      { step: 3, midi: 36, durationSteps: 1, velocity: 0.5 },
      { step: 4, midi: 43, durationSteps: 1, velocity: 0.8 },
      { step: 5, midi: 41, durationSteps: 1, velocity: 0.6 },
      { step: 6, midi: 36, durationSteps: 1, velocity: 0.85 },
      { step: 7, midi: 48, durationSteps: 1, velocity: 0.45 },
      { step: 8, midi: 36, durationSteps: 1, velocity: 0.9 },
      { step: 9, midi: 38, durationSteps: 1, velocity: 0.55 },
      { step: 10, midi: 43, durationSteps: 1, velocity: 0.7 },
      { step: 11, midi: 36, durationSteps: 1, velocity: 0.5 },
      { step: 12, midi: 41, durationSteps: 1, velocity: 0.75 },
      { step: 13, midi: 43, durationSteps: 1, velocity: 0.55 },
      { step: 14, midi: 48, durationSteps: 1, velocity: 0.65 },
      { step: 15, midi: 36, durationSteps: 1, velocity: 0.7 },
    ],
  },
  {
    id: 'offbeat-roll',
    label: 'OFFBEAT ROLL',
    voice: 'pulse',
    notes: [
      { step: 2, midi: 36, durationSteps: 1, velocity: 0.8 },
      { step: 6, midi: 36, durationSteps: 1, velocity: 0.75 },
      { step: 10, midi: 36, durationSteps: 1, velocity: 0.8 },
      { step: 14, midi: 43, durationSteps: 1, velocity: 0.7 },
      { step: 3, midi: 36, durationSteps: 1, velocity: 0.35 },
      { step: 7, midi: 38, durationSteps: 1, velocity: 0.4 },
      { step: 11, midi: 36, durationSteps: 1, velocity: 0.35 },
      { step: 15, midi: 41, durationSteps: 1, velocity: 0.45 },
    ],
  },
  {
    id: 'dark-sub',
    label: 'DARK SUB',
    voice: 'sub',
    notes: [
      { step: 0, midi: 33, durationSteps: 3, velocity: 0.95 },
      { step: 4, midi: 33, durationSteps: 2, velocity: 0.7 },
      { step: 8, midi: 36, durationSteps: 3, velocity: 0.9 },
      { step: 12, midi: 31, durationSteps: 3, velocity: 0.85 },
    ],
  },
  {
    id: 'warehouse-pulse',
    label: 'WAREHOUSE',
    voice: 'pulse',
    notes: [
      { step: 0, midi: 36, durationSteps: 2, velocity: 0.85 },
      { step: 4, midi: 36, durationSteps: 1, velocity: 0.55 },
      { step: 5, midi: 43, durationSteps: 1, velocity: 0.7 },
      { step: 8, midi: 36, durationSteps: 2, velocity: 0.85 },
      { step: 11, midi: 41, durationSteps: 1, velocity: 0.6 },
      { step: 12, midi: 36, durationSteps: 1, velocity: 0.75 },
      { step: 14, midi: 48, durationSteps: 1, velocity: 0.5 },
      { step: 15, midi: 43, durationSteps: 1, velocity: 0.55 },
    ],
  },
  {
    id: 'reese-drone',
    label: 'REESE',
    voice: 'reese',
    notes: [
      { step: 0, midi: 31, durationSteps: 4, velocity: 0.9 },
      { step: 4, midi: 31, durationSteps: 4, velocity: 0.75 },
      { step: 8, midi: 34, durationSteps: 4, velocity: 0.88 },
      { step: 12, midi: 29, durationSteps: 4, velocity: 0.82 },
    ],
  },
  {
    id: 'pluck-stabs',
    label: 'PLUCK STABS',
    voice: 'pluck',
    notes: [
      { step: 0, midi: 36, durationSteps: 1, velocity: 0.85 },
      { step: 3, midi: 43, durationSteps: 1, velocity: 0.7 },
      { step: 4, midi: 36, durationSteps: 1, velocity: 0.6 },
      { step: 7, midi: 48, durationSteps: 1, velocity: 0.55 },
      { step: 8, midi: 36, durationSteps: 1, velocity: 0.85 },
      { step: 10, midi: 41, durationSteps: 1, velocity: 0.65 },
      { step: 12, midi: 43, durationSteps: 1, velocity: 0.75 },
      { step: 15, midi: 36, durationSteps: 1, velocity: 0.5 },
    ],
  },
  {
    id: 'fifth-gallop',
    label: 'FIFTH GALLOP',
    voice: 'pulse',
    notes: [
      { step: 0, midi: 36, durationSteps: 1, velocity: 0.9 },
      { step: 1, midi: 43, durationSteps: 1, velocity: 0.7 },
      { step: 2, midi: 36, durationSteps: 1, velocity: 0.55 },
      { step: 4, midi: 36, durationSteps: 1, velocity: 0.85 },
      { step: 5, midi: 43, durationSteps: 1, velocity: 0.65 },
      { step: 6, midi: 48, durationSteps: 1, velocity: 0.5 },
      { step: 8, midi: 36, durationSteps: 1, velocity: 0.9 },
      { step: 9, midi: 43, durationSteps: 1, velocity: 0.7 },
      { step: 10, midi: 36, durationSteps: 1, velocity: 0.55 },
      { step: 12, midi: 34, durationSteps: 1, velocity: 0.8 },
      { step: 13, midi: 41, durationSteps: 1, velocity: 0.6 },
      { step: 14, midi: 36, durationSteps: 1, velocity: 0.7 },
    ],
  },
  {
    id: 'sliding-acid',
    label: 'SLIDING ACID',
    voice: 'acid',
    notes: [
      { step: 0, midi: 36, durationSteps: 2, velocity: 0.95 },
      { step: 2, midi: 39, durationSteps: 1, velocity: 0.7 },
      { step: 3, midi: 41, durationSteps: 1, velocity: 0.75 },
      { step: 4, midi: 43, durationSteps: 2, velocity: 0.9 },
      { step: 6, midi: 41, durationSteps: 1, velocity: 0.55 },
      { step: 7, midi: 36, durationSteps: 1, velocity: 0.65 },
      { step: 8, midi: 48, durationSteps: 1, velocity: 0.85 },
      { step: 9, midi: 43, durationSteps: 1, velocity: 0.7 },
      { step: 10, midi: 41, durationSteps: 1, velocity: 0.6 },
      { step: 11, midi: 36, durationSteps: 1, velocity: 0.55 },
      { step: 12, midi: 34, durationSteps: 2, velocity: 0.88 },
      { step: 14, midi: 36, durationSteps: 1, velocity: 0.75 },
      { step: 15, midi: 43, durationSteps: 1, velocity: 0.5 },
    ],
  },
];

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function secondsPerStep(bpm: number): number {
  return 60 / bpm / 4;
}

export function clampBpm(value: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)));
}
