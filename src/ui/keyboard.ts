/** Computer-keyboard bass map — QWERTY piano layout, base MIDI 36 (C2). */

export type BassKeyKind = 'white' | 'black';

export type BassKeyDef = {
  readonly key: string;
  readonly label: string;
  readonly midi: number;
  readonly kind: BassKeyKind;
  /**
   * White: left→right index 0…7.
   * Black: white-slot boundary after this index (1 = after first white).
   */
  readonly slot: number;
};

/** White A→K = C2…C3; black W E T Y U with piano gaps (no R / no between E–F, B–C). */
export const BASS_KEYS: readonly BassKeyDef[] = [
  { key: 'a', label: 'A', midi: 36, kind: 'white', slot: 0 },
  { key: 'w', label: 'W', midi: 37, kind: 'black', slot: 1 },
  { key: 's', label: 'S', midi: 38, kind: 'white', slot: 1 },
  { key: 'e', label: 'E', midi: 39, kind: 'black', slot: 2 },
  { key: 'd', label: 'D', midi: 40, kind: 'white', slot: 2 },
  { key: 'f', label: 'F', midi: 41, kind: 'white', slot: 3 },
  { key: 't', label: 'T', midi: 42, kind: 'black', slot: 4 },
  { key: 'g', label: 'G', midi: 43, kind: 'white', slot: 4 },
  { key: 'y', label: 'Y', midi: 44, kind: 'black', slot: 5 },
  { key: 'h', label: 'H', midi: 45, kind: 'white', slot: 5 },
  { key: 'u', label: 'U', midi: 46, kind: 'black', slot: 6 },
  { key: 'j', label: 'J', midi: 47, kind: 'white', slot: 6 },
  { key: 'k', label: 'K', midi: 48, kind: 'white', slot: 7 },
];

const MIDI_BY_KEY = new Map(
  BASS_KEYS.map((def) => [def.key, def.midi] as const),
);

export function midiForBassKey(key: string): number | undefined {
  return MIDI_BY_KEY.get(key.toLowerCase());
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
};

/** Compact piano strip — mapped keys only; labels = physical letters. */
export function createKeyStrip(): KeyStripApi {
  const root = document.createElement('div');
  root.className = 'key-strip';

  const caption = document.createElement('span');
  caption.className = 'field-label';
  caption.textContent = 'ROOT · KEYS';

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
  root.append(caption, piano);

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
  };
}
