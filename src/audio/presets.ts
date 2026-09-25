/** Shared transport tempo for all looped presets. */
export const BPM = 112;

/** Sixteenth-note steps per bar (4/4). */
export const STEPS_PER_BAR = 16;

export type DrumHitKind = 'kick' | 'snare' | 'hat' | 'rim';

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

export type BassPreset = {
  readonly id: string;
  readonly label: string;
  readonly notes: readonly BassNote[];
  /** 0 = sine sub, 1 = saw acid, 2 = square pulse */
  readonly voice: 0 | 1 | 2;
};

export const DRUM_PRESETS: readonly DrumPreset[] = [
  {
    id: 'kick-pulse',
    label: 'KICK PULSE',
    hits: [
      { step: 0, kind: 'kick', velocity: 1 },
      { step: 4, kind: 'kick', velocity: 0.9 },
      { step: 8, kind: 'kick', velocity: 1 },
      { step: 12, kind: 'kick', velocity: 0.9 },
      { step: 2, kind: 'hat', velocity: 0.35 },
      { step: 6, kind: 'hat', velocity: 0.4 },
      { step: 10, kind: 'hat', velocity: 0.35 },
      { step: 14, kind: 'hat', velocity: 0.45 },
      { step: 4, kind: 'snare', velocity: 0.55 },
      { step: 12, kind: 'snare', velocity: 0.6 },
    ],
  },
  {
    id: 'break-grid',
    label: 'BREAK GRID',
    hits: [
      { step: 0, kind: 'kick', velocity: 1 },
      { step: 3, kind: 'kick', velocity: 0.7 },
      { step: 6, kind: 'kick', velocity: 0.85 },
      { step: 10, kind: 'kick', velocity: 0.75 },
      { step: 4, kind: 'snare', velocity: 0.9 },
      { step: 12, kind: 'snare', velocity: 0.95 },
      { step: 7, kind: 'snare', velocity: 0.4 },
      { step: 1, kind: 'hat', velocity: 0.3 },
      { step: 2, kind: 'hat', velocity: 0.45 },
      { step: 5, kind: 'hat', velocity: 0.35 },
      { step: 8, kind: 'hat', velocity: 0.5 },
      { step: 9, kind: 'hat', velocity: 0.3 },
      { step: 11, kind: 'hat', velocity: 0.4 },
      { step: 13, kind: 'hat', velocity: 0.35 },
      { step: 15, kind: 'hat', velocity: 0.55 },
      { step: 14, kind: 'rim', velocity: 0.45 },
    ],
  },
  {
    id: 'soft-haze',
    label: 'SOFT HAZE',
    hits: [
      { step: 0, kind: 'kick', velocity: 0.7 },
      { step: 8, kind: 'kick', velocity: 0.65 },
      { step: 4, kind: 'rim', velocity: 0.4 },
      { step: 12, kind: 'rim', velocity: 0.45 },
      { step: 2, kind: 'hat', velocity: 0.25 },
      { step: 3, kind: 'hat', velocity: 0.2 },
      { step: 6, kind: 'hat', velocity: 0.28 },
      { step: 7, kind: 'hat', velocity: 0.22 },
      { step: 10, kind: 'hat', velocity: 0.25 },
      { step: 11, kind: 'hat', velocity: 0.2 },
      { step: 14, kind: 'hat', velocity: 0.3 },
      { step: 15, kind: 'hat', velocity: 0.22 },
    ],
  },
  {
    id: 'iron-march',
    label: 'IRON MARCH',
    hits: [
      { step: 0, kind: 'kick', velocity: 1 },
      { step: 4, kind: 'kick', velocity: 1 },
      { step: 8, kind: 'kick', velocity: 1 },
      { step: 12, kind: 'kick', velocity: 1 },
      { step: 2, kind: 'rim', velocity: 0.7 },
      { step: 6, kind: 'rim', velocity: 0.65 },
      { step: 10, kind: 'rim', velocity: 0.7 },
      { step: 14, kind: 'rim', velocity: 0.75 },
      { step: 4, kind: 'snare', velocity: 0.85 },
      { step: 12, kind: 'snare', velocity: 0.9 },
      { step: 1, kind: 'hat', velocity: 0.5 },
      { step: 5, kind: 'hat', velocity: 0.45 },
      { step: 9, kind: 'hat', velocity: 0.5 },
      { step: 13, kind: 'hat', velocity: 0.55 },
      { step: 7, kind: 'hat', velocity: 0.35 },
      { step: 15, kind: 'hat', velocity: 0.4 },
    ],
  },
];

export const BASS_PRESETS: readonly BassPreset[] = [
  {
    id: 'sub-root',
    label: 'SUB ROOT',
    voice: 0,
    notes: [
      { step: 0, midi: 36, durationSteps: 4, velocity: 0.85 },
      { step: 8, midi: 36, durationSteps: 4, velocity: 0.8 },
      { step: 12, midi: 31, durationSteps: 4, velocity: 0.75 },
    ],
  },
  {
    id: 'acid-slide',
    label: 'ACID SLIDE',
    voice: 1,
    notes: [
      { step: 0, midi: 36, durationSteps: 2, velocity: 0.8 },
      { step: 2, midi: 43, durationSteps: 2, velocity: 0.7 },
      { step: 4, midi: 36, durationSteps: 1, velocity: 0.75 },
      { step: 5, midi: 38, durationSteps: 1, velocity: 0.65 },
      { step: 6, midi: 41, durationSteps: 2, velocity: 0.7 },
      { step: 8, midi: 36, durationSteps: 2, velocity: 0.85 },
      { step: 10, midi: 48, durationSteps: 2, velocity: 0.55 },
      { step: 12, midi: 43, durationSteps: 2, velocity: 0.7 },
      { step: 14, midi: 41, durationSteps: 2, velocity: 0.65 },
    ],
  },
  {
    id: 'fifth-walk',
    label: 'FIFTH WALK',
    voice: 2,
    notes: [
      { step: 0, midi: 36, durationSteps: 2, velocity: 0.75 },
      { step: 4, midi: 43, durationSteps: 2, velocity: 0.7 },
      { step: 8, midi: 38, durationSteps: 2, velocity: 0.72 },
      { step: 12, midi: 41, durationSteps: 2, velocity: 0.7 },
      { step: 14, midi: 43, durationSteps: 2, velocity: 0.65 },
    ],
  },
  {
    id: 'pulse-drone',
    label: 'PULSE DRONE',
    voice: 2,
    notes: [
      { step: 0, midi: 33, durationSteps: 3, velocity: 0.7 },
      { step: 4, midi: 33, durationSteps: 3, velocity: 0.65 },
      { step: 8, midi: 36, durationSteps: 3, velocity: 0.75 },
      { step: 12, midi: 31, durationSteps: 4, velocity: 0.7 },
    ],
  },
];

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function secondsPerStep(bpm: number): number {
  return 60 / bpm / 4;
}
