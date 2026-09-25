/** Performance Key/Scale layer — pad X maps to degrees; absolute pitch lives here. */

/** MIDI base for Key C = C2 (matches the computer-keyboard strip). */
export const KEY_BASE_MIDI = 36;

/** Default Key = A (A2), matching prior IMS root. */
export const DEFAULT_KEY_PC = 9;

export type ScaleId =
  | 'chromatic'
  | 'ionian'
  | 'aeolian'
  | 'dorian'
  | 'minor_pent';

export type ScaleDef = {
  readonly id: ScaleId;
  readonly label: string;
  /** Semitone offsets from root within one octave. */
  readonly semis: readonly number[];
};

export const SCALES: readonly ScaleDef[] = [
  {
    id: 'chromatic',
    label: 'CHROMATIC',
    semis: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
  { id: 'ionian', label: 'IONIAN', semis: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'aeolian', label: 'AEOLIAN', semis: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', label: 'DORIAN', semis: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'minor_pent', label: 'MIN PENT', semis: [0, 3, 5, 7, 10] },
];

export const DEFAULT_SCALE_ID: ScaleId = 'aeolian';

/** Pad spans this many octaves of the scale. */
export const SCALE_OCTAVES = 3;

const SCALE_BY_ID = new Map(SCALES.map((s) => [s.id, s] as const));

const DEFAULT_SCALE: ScaleDef = (() => {
  for (const s of SCALES) {
    if (s.id === DEFAULT_SCALE_ID) {
      return s;
    }
  }
  throw new Error('DEFAULT_SCALE_ID missing from SCALES');
})();

export const KEY_OPTIONS: readonly { pc: number; label: string }[] = [
  { pc: 0, label: 'C' },
  { pc: 1, label: 'C#' },
  { pc: 2, label: 'D' },
  { pc: 3, label: 'D#' },
  { pc: 4, label: 'E' },
  { pc: 5, label: 'F' },
  { pc: 6, label: 'F#' },
  { pc: 7, label: 'G' },
  { pc: 8, label: 'G#' },
  { pc: 9, label: 'A' },
  { pc: 10, label: 'A#' },
  { pc: 11, label: 'B' },
];

export function scaleById(id: ScaleId): ScaleDef {
  return SCALE_BY_ID.get(id) ?? DEFAULT_SCALE;
}

/** Key pitch-class (0–11) → MIDI root at KEY_BASE_MIDI octave. */
export function rootMidiFromKeyPc(pc: number): number {
  const p = ((pc % 12) + 12) % 12;
  return KEY_BASE_MIDI + p;
}

export function degreeCount(scaleId: ScaleId): number {
  return scaleById(scaleId).semis.length * SCALE_OCTAVES;
}

export function degreeFromXNorm(xNorm: number, scaleId: ScaleId): number {
  const n = degreeCount(scaleId);
  const idx = Math.floor(clamp01(xNorm) * n);
  return Math.min(n - 1, Math.max(0, idx));
}

export function midiFromDegree(
  rootMidi: number,
  scaleId: ScaleId,
  degree: number,
): number {
  const semis = scaleById(scaleId).semis;
  const perOct = semis.length;
  const d = Math.max(0, degree);
  const oct = Math.floor(d / perOct);
  const semi = semis[d % perOct] ?? 0;
  return rootMidi + oct * 12 + semi;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
