import { AudioEngine } from '../audio/engine';
import { PAD_MODES, type PadMode } from '../audio/pad-synth';
import {
  BASS_PRESETS,
  BPM_MAX,
  BPM_MIN,
  DEFAULT_BPM,
  DRUM_PRESETS,
  SYNTH_VOICES,
  type SynthVoiceId,
} from '../audio/presets';
import {
  DEFAULT_KEY_PC,
  DEFAULT_SCALE_ID,
  KEY_OPTIONS,
  OCTAVE_OFFSET_DEFAULT,
  OCTAVE_OFFSET_MAX,
  OCTAVE_OFFSET_MIN,
  SCALE_OCTAVES,
  SCALE_OCTAVES_MAX,
  SCALE_OCTAVES_MIN,
  SCALES,
  clampOctaveOffset,
  clampScaleOctaves,
  rootMidiFromKeyPc,
  type ScaleId,
} from '../audio/scale';
import {
  createKeyStrip,
  isTypingTarget,
  midiForBassKey,
  clampOctave,
  OCTAVE_DOWN_KEY,
  OCTAVE_UP_KEY,
} from './keyboard';
import { createPad } from './pad';

export function mountApp(root: HTMLElement): void {
  const engine = new AudioEngine();

  const unlockAudio = (): void => {
    engine.unlock();
  };

  root.replaceChildren();
  root.className = 'shell';

  const header = el('header', 'shell-header');
  const brand = el('div', 'brand');
  brand.innerHTML =
    '<span class="brand-mark">TRACKAOS</span><span class="brand-sub">PAD</span>';

  const status = el('p', 'status-line');

  header.append(brand, status);

  const songBar = el('div', 'song-bar');

  const keyField = fieldSelect(
    'KEY',
    'song-key',
    KEY_OPTIONS.map((k) => ({ value: String(k.pc), label: k.label })),
    String(engine.songKeyPc),
  );
  const drumField = fieldSelect(
    'DRUM',
    'drum-preset',
    DRUM_PRESETS.map((p) => ({ value: p.id, label: p.label })),
    engine.drumPresetId,
  );
  const bassField = fieldSelect(
    'BASS',
    'bass-preset',
    BASS_PRESETS.map((p) => ({ value: p.id, label: p.label })),
    engine.bassPresetId,
  );
  const bpmField = fieldBpm(engine.currentBpm);

  const transport = el('button', 'transport') as HTMLButtonElement;
  transport.type = 'button';
  transport.textContent = 'START';
  transport.setAttribute('aria-pressed', 'false');

  songBar.append(
    keyField.root,
    drumField.root,
    bassField.root,
    bpmField.root,
    transport,
  );

  const mainRow = el('div', 'main-row');

  const padRail = el('aside', 'pad-rail');

  const scaleField = fieldSelect(
    'SCALE',
    'pad-scale',
    SCALES.map((s) => ({ value: s.id, label: s.label })),
    DEFAULT_SCALE_ID,
  );
  const synthField = fieldSelect(
    'SYNTH',
    'synth-voice',
    SYNTH_VOICES.map((v) => ({ value: v.id, label: v.label })),
    engine.pad.synthVoiceId,
  );
  const modeField = fieldSelect(
    'PAD',
    'pad-mode',
    PAD_MODES.map((p) => ({ value: p.id, label: p.label })),
    engine.pad.padMode,
  );

  let octRange = SCALE_OCTAVES;
  let octOffset = OCTAVE_OFFSET_DEFAULT;

  const stage = el('section', 'pad-stage');
  const padFrame = el('div', 'pad-frame');
  const padSurface = el('div', 'xy-pad');
  padSurface.setAttribute('role', 'application');
  padSurface.setAttribute('aria-label', 'XY performance pad');
  padSurface.tabIndex = 0;

  const padMeta = el('div', 'pad-meta');
  const padMetaX = el('span', 'pad-meta-axis');
  const padMetaRule = el('span', 'pad-meta-rule');
  const padMetaY = el('span', 'pad-meta-axis');
  padMeta.append(padMetaX, padMetaRule, padMetaY);

  const syncPadMeta = (mode: PadMode): void => {
    if (mode === 'hold') {
      padMetaX.textContent = 'X · NOTE';
      padMetaY.textContent = 'Y · FILTER';
    } else if (mode === 'arp') {
      padMetaX.textContent = 'X · ROOT';
      padMetaY.textContent = 'Y · OCTAVE';
    } else if (mode === 'ims') {
      padMetaX.textContent = 'X · NOTE';
      padMetaY.textContent = 'Y · GATE';
    } else {
      padMetaX.textContent = 'X · NOTE';
      padMetaY.textContent = 'Y · RATE';
    }
  };
  syncPadMeta(engine.pad.padMode);

  padFrame.append(padSurface, padMeta);
  stage.append(padFrame);

  /** Most-recently-pressed held keys (last = sounding). */
  const heldKeys: string[] = [];
  let bassOctave = 0;
  let bassKeyPc = DEFAULT_KEY_PC;

  const voiceFromHeld = (): void => {
    const top = heldKeys[heldKeys.length - 1];
    if (!top) {
      engine.keyboardNoteOff();
      return;
    }
    const midi = midiForBassKey(top, bassOctave, bassKeyPc);
    if (midi === undefined) {
      return;
    }
    engine.keyboardNoteMove(midi);
  };

  const applyOctave = (next: number): void => {
    const clamped = clampOctave(next);
    if (clamped === bassOctave) {
      return;
    }
    bassOctave = clamped;
    keyStrip.setOctave(bassOctave);
    voiceFromHeld();
  };

  const keyStrip = createKeyStrip({
    onOctaveDown: () => {
      applyOctave(bassOctave - 1);
    },
    onOctaveUp: () => {
      applyOctave(bassOctave + 1);
    },
  });
  keyStrip.setKeyPc(bassKeyPc);
  stage.append(keyStrip.root);

  const applyKeyScale = (): void => {
    const pc = Number(keyField.select.value);
    const scaleId = scaleField.select.value as ScaleId;
    const root = rootMidiFromKeyPc(pc) + octOffset * 12;
    engine.setKeyPc(pc);
    engine.pad.setKeyScale(root, scaleId, octRange);

    if (pc !== bassKeyPc) {
      bassKeyPc = pc;
      keyStrip.setKeyPc(bassKeyPc);
      voiceFromHeld();
    }
  };

  const octRangeField = fieldStepper(
    'OCT RANGE',
    'pad-oct-range',
    octRange,
    SCALE_OCTAVES_MIN,
    SCALE_OCTAVES_MAX,
    (next) => {
      unlockAudio();
      octRange = clampScaleOctaves(next);
      octRangeField.setValue(octRange);
      applyKeyScale();
    },
  );

  const octOffsetField = fieldStepper(
    'OCT OFFSET',
    'pad-oct-offset',
    octOffset,
    OCTAVE_OFFSET_MIN,
    OCTAVE_OFFSET_MAX,
    (next) => {
      unlockAudio();
      octOffset = clampOctaveOffset(next);
      octOffsetField.setValue(octOffset);
      applyKeyScale();
    },
    (value) => (value > 0 ? `+${String(value)}` : String(value)),
  );

  padRail.append(
    scaleField.root,
    synthField.root,
    modeField.root,
    octRangeField.root,
    octOffsetField.root,
  );

  mainRow.append(padRail, stage);
  root.append(header, songBar, mainRow);

  const setStatus = (playing: boolean, padLive: boolean): void => {
    const transportLabel = playing ? 'TRANSPORT ON' : 'STANDBY';
    const padLabel = padLive ? ' ·  PAD LIVE' : '';
    status.textContent = `${transportLabel}${padLabel}  ·  ${String(engine.currentBpm)} BPM`;
    status.classList.toggle('is-live', playing || padLive);
  };

  const syncTransportUi = (): void => {
    const playing = engine.isPlaying;
    transport.textContent = playing ? 'STOP' : 'START';
    transport.setAttribute('aria-pressed', playing ? 'true' : 'false');
    transport.classList.toggle('is-on', playing);
    setStatus(playing, engine.pad.isActive);
  };

  const applyBpm = (raw: number): void => {
    engine.setBpm(raw);
    const bpm = engine.currentBpm;
    bpmField.slider.value = String(bpm);
    bpmField.number.value = String(bpm);
    setStatus(engine.isPlaying, engine.pad.isActive);
  };

  // Unlock AudioContext on first user gesture anywhere in the shell.
  root.addEventListener('pointerdown', unlockAudio, { once: true });
  root.addEventListener('keydown', unlockAudio, { once: true });

  drumField.select.addEventListener('change', () => {
    unlockAudio();
    engine.setDrumPreset(drumField.select.value);
  });

  bassField.select.addEventListener('change', () => {
    unlockAudio();
    engine.setBassPreset(bassField.select.value);
  });

  synthField.select.addEventListener('change', () => {
    unlockAudio();
    engine.pad.setSynthVoice(synthField.select.value as SynthVoiceId);
  });

  modeField.select.addEventListener('change', () => {
    unlockAudio();
    const mode = modeField.select.value as PadMode;
    engine.pad.setMode(mode);
    syncPadMeta(mode);
  });

  keyField.select.addEventListener('change', () => {
    unlockAudio();
    applyKeyScale();
  });

  scaleField.select.addEventListener('change', () => {
    unlockAudio();
    applyKeyScale();
  });

  bpmField.slider.addEventListener('input', () => {
    applyBpm(Number(bpmField.slider.value));
  });

  bpmField.number.addEventListener('change', () => {
    applyBpm(Number(bpmField.number.value));
  });

  transport.addEventListener('click', () => {
    unlockAudio();
    engine.toggle();
    syncTransportUi();
  });

  createPad(padSurface, {
    onEngage: (norm) => {
      unlockAudio();
      if (!engine.isPlaying) {
        engine.start();
        syncTransportUi();
      }
      engine.padNoteOn(norm.x, norm.y);
      setStatus(engine.isPlaying, true);
    },
    onMove: (norm) => {
      engine.padNoteMove(norm.x, norm.y);
    },
    onRelease: () => {
      engine.padNoteOff();
      setStatus(engine.isPlaying, false);
    },
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat || isTypingTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();

    if (key === OCTAVE_DOWN_KEY) {
      event.preventDefault();
      applyOctave(bassOctave - 1);
      return;
    }
    if (key === OCTAVE_UP_KEY) {
      event.preventDefault();
      applyOctave(bassOctave + 1);
      return;
    }

    const midi = midiForBassKey(key, bassOctave, bassKeyPc);
    if (midi === undefined) {
      return;
    }
    event.preventDefault();
    if (heldKeys.includes(key)) {
      return;
    }
    heldKeys.push(key);
    keyStrip.setPressed(key, true);
    unlockAudio();
    engine.keyboardNoteOn(midi);
  });

  window.addEventListener('keyup', (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === OCTAVE_DOWN_KEY || key === OCTAVE_UP_KEY) {
      return;
    }
    const midi = midiForBassKey(key, bassOctave, bassKeyPc);
    if (midi === undefined) {
      return;
    }
    event.preventDefault();
    const idx = heldKeys.indexOf(key);
    if (idx === -1) {
      return;
    }
    heldKeys.splice(idx, 1);
    keyStrip.setPressed(key, false);
    voiceFromHeld();
  });

  window.addEventListener('blur', () => {
    if (heldKeys.length === 0) {
      return;
    }
    heldKeys.length = 0;
    keyStrip.clearPressed();
    engine.keyboardNoteOff();
  });

  applyKeyScale();
  applyBpm(DEFAULT_BPM);
  syncTransportUi();
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function fieldSelect(
  labelText: string,
  id: string,
  options: readonly { value: string; label: string }[],
  selected: string,
): { root: HTMLElement; select: HTMLSelectElement } {
  const root = document.createElement('label');
  root.className = 'field';
  root.htmlFor = id;

  const caption = el('span', 'field-label');
  caption.textContent = labelText;

  const select = document.createElement('select');
  select.id = id;
  select.className = 'field-select';

  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === selected) {
      option.selected = true;
    }
    select.append(option);
  }

  root.append(caption, select);
  return { root, select };
}

function fieldStepper(
  labelText: string,
  id: string,
  initial: number,
  min: number,
  max: number,
  onChange: (next: number) => void,
  format: (value: number) => string = String,
): { root: HTMLElement; setValue: (value: number) => void } {
  const root = el('div', 'field field-stepper');
  root.id = id;

  const caption = el('span', 'field-label');
  caption.textContent = labelText;

  const row = el('div', 'octave-row stepper-row');

  const valueLabel = el('span', 'octave-label stepper-value');
  valueLabel.textContent = format(initial);

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'octave-btn';
  downBtn.textContent = '−';
  downBtn.setAttribute('aria-label', `${labelText} down`);

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'octave-btn';
  upBtn.textContent = '+';
  upBtn.setAttribute('aria-label', `${labelText} up`);

  let current = initial;

  const sync = (): void => {
    valueLabel.textContent = format(current);
    downBtn.disabled = current <= min;
    upBtn.disabled = current >= max;
  };
  sync();

  downBtn.addEventListener('click', () => {
    if (current <= min) {
      return;
    }
    onChange(current - 1);
  });
  upBtn.addEventListener('click', () => {
    if (current >= max) {
      return;
    }
    onChange(current + 1);
  });

  row.append(valueLabel, downBtn, upBtn);
  root.append(caption, row);

  return {
    root,
    setValue: (value) => {
      current = value;
      sync();
    },
  };
}

function fieldBpm(initial: number): {
  root: HTMLElement;
  slider: HTMLInputElement;
  number: HTMLInputElement;
} {
  const root = el('div', 'field field-bpm');

  const caption = el('span', 'field-label');
  caption.textContent = 'BPM';

  const row = el('div', 'bpm-row');

  const number = document.createElement('input');
  number.type = 'number';
  number.id = 'bpm-value';
  number.className = 'bpm-number';
  number.min = String(BPM_MIN);
  number.max = String(BPM_MAX);
  number.step = '1';
  number.value = String(initial);
  number.setAttribute('aria-label', 'BPM');

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'bpm-slider';
  slider.className = 'bpm-slider';
  slider.min = String(BPM_MIN);
  slider.max = String(BPM_MAX);
  slider.step = '1';
  slider.value = String(initial);
  slider.setAttribute('aria-label', 'BPM slider');

  row.append(number, slider);
  root.append(caption, row);
  return { root, slider, number };
}
