/** Computer-keyboard bass map — QWERTY piano layout, base MIDI 36 (C2). */

export type BassKeyKind = 'white' | 'black';

export type BassKeyDef = {
  readonly key: string;
  readonly label: string;
  /** Semitone offset from C of the current octave (0 = C). */
  readonly semi: number;
  readonly kind: BassKeyKind;
  /**
   * White: left→right index 0…7.
   * Black: white-slot boundary after this index (1 = after first white).
   */
  readonly slot: number;
};

/** Octave 0 = C2 (MIDI 36). Range keeps roots in a usable bass/mid band. */
export const OCTAVE_MIN = -1;
export const OCTAVE_MAX = 2;
export const BASE_OCTAVE_MIDI = 36;

/** Z / X — octave down / up (classic computer-piano). */
export const OCTAVE_DOWN_KEY = 'z';
export const OCTAVE_UP_KEY = 'x';

/** White A→K = C…C'; black W E T Y U with piano gaps (no R / no between E–F, B–C). */
export const BASS_KEYS: readonly BassKeyDef[] = [
  { key: 'a', label: 'A', semi: 0, kind: 'white', slot: 0 },
  { key: 'w', label: 'W', semi: 1, kind: 'black', slot: 1 },
  { key: 's', label: 'S', semi: 2, kind: 'white', slot: 1 },
  { key: 'e', label: 'E', semi: 3, kind: 'black', slot: 2 },
  { key: 'd', label: 'D', semi: 4, kind: 'white', slot: 2 },
  { key: 'f', label: 'F', semi: 5, kind: 'white', slot: 3 },
  { key: 't', label: 'T', semi: 6, kind: 'black', slot: 4 },
  { key: 'g', label: 'G', semi: 7, kind: 'white', slot: 4 },
  { key: 'y', label: 'Y', semi: 8, kind: 'black', slot: 5 },
  { key: 'h', label: 'H', semi: 9, kind: 'white', slot: 5 },
  { key: 'u', label: 'U', semi: 10, kind: 'black', slot: 6 },
  { key: 'j', label: 'J', semi: 11, kind: 'white', slot: 6 },
  { key: 'k', label: 'K', semi: 12, kind: 'white', slot: 7 },
];

const SEMI_BY_KEY = new Map(
  BASS_KEYS.map((def) => [def.key, def.semi] as const),
);

export function clampOctave(octave: number): number {
  return Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, Math.round(octave)));
}

export function midiForBassKey(
  key: string,
  octave = 0,
): number | undefined {
  const semi = SEMI_BY_KEY.get(key.toLowerCase());
  if (semi === undefined) {
    return undefined;
  }
  return BASE_OCTAVE_MIDI + clampOctave(octave) * 12 + semi;
}

/** MIDI C name for octave 0 = C2, e.g. octave −1 → C1. */
export function octaveRootLabel(octave: number): string {
  return `C${String(2 + clampOctave(octave))}`;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    return true;
  }
  return target.isContentEditable;
}

export type KeyStripApi = {
  readonly root: HTMLElement;
  setPressed: (key: string, pressed: boolean) => void;
  clearPressed: () => void;
  setOctave: (octave: number) => void;
};

export type KeyStripHandlers = {
  onOctaveDown: () => void;
  onOctaveUp: () => void;
};

/** Compact piano strip — mapped keys only; labels = physical letters. */
export function createKeyStrip(handlers: KeyStripHandlers): KeyStripApi {
  const root = document.createElement('div');
  root.className = 'key-strip';

  const head = document.createElement('div');
  head.className = 'key-strip-head';

  const caption = document.createElement('span');
  caption.className = 'field-label';
  caption.textContent = 'KEYS';

  const octaveRow = document.createElement('div');
  octaveRow.className = 'octave-row';

  const octaveLabel = document.createElement('span');
  octaveLabel.className = 'octave-label';
  octaveLabel.textContent = octaveRootLabel(0);

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'octave-btn';
  downBtn.textContent = 'Z −';
  downBtn.setAttribute('aria-label', 'Octave down');
  downBtn.title = 'Octave down (Z)';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'octave-btn';
  upBtn.textContent = 'X +';
  upBtn.setAttribute('aria-label', 'Octave up');
  upBtn.title = 'Octave up (X)';

  downBtn.addEventListener('click', () => {
    handlers.onOctaveDown();
  });
  upBtn.addEventListener('click', () => {
    handlers.onOctaveUp();
  });

  octaveRow.append(octaveLabel, downBtn, upBtn);
  head.append(caption, octaveRow);

  const piano = document.createElement('div');
  piano.className = 'piano';
  piano.setAttribute('aria-hidden', 'true');

  const whites = document.createElement('div');
  whites.className = 'piano-whites';

  const blacks = document.createElement('div');
  blacks.className = 'piano-blacks';

  const nodes = new Map<string, HTMLElement>();

  for (const def of BASS_KEYS) {
    const keyEl = document.createElement('div');
    keyEl.className = `piano-key piano-key-${def.kind}`;
    keyEl.dataset.key = def.key;
    keyEl.textContent = def.label;

    if (def.kind === 'white') {
      whites.append(keyEl);
    } else {
      keyEl.style.setProperty('--slot', String(def.slot));
      blacks.append(keyEl);
    }
    nodes.set(def.key, keyEl);
  }

  piano.append(whites, blacks);
  root.append(head, piano);

  const syncOctaveButtons = (octave: number): void => {
    downBtn.disabled = octave <= OCTAVE_MIN;
    upBtn.disabled = octave >= OCTAVE_MAX;
  };
  syncOctaveButtons(0);

  return {
    root,
    setPressed: (key, pressed) => {
      const node = nodes.get(key.toLowerCase());
      if (node) {
        node.classList.toggle('is-pressed', pressed);
      }
    },
    clearPressed: () => {
      for (const node of nodes.values()) {
        node.classList.remove('is-pressed');
      }
    },
    setOctave: (octave) => {
      const o = clampOctave(octave);
      octaveLabel.textContent = octaveRootLabel(o);
      syncOctaveButtons(o);
    },
  };
}
