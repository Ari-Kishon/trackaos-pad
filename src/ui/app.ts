import { AudioEngine } from '../audio/engine';
import { PAD_MODES, type PadMode } from '../audio/pad-synth';
import {
  BASS_PRESETS,
  BPM_MAX,
  BPM_MIN,
  DEFAULT_BPM,
  DRUM_PRESETS,
} from '../audio/presets';
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

  const controls = el('div', 'controls');

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
  const modeField = fieldSelect(
    'PAD',
    'pad-mode',
    PAD_MODES.map((p) => ({ value: p.id, label: p.label })),
    engine.pad.padMode,
  );

  const bpmField = fieldBpm(engine.currentBpm);

  const transport = el('button', 'transport') as HTMLButtonElement;
  transport.type = 'button';
  transport.textContent = 'START';
  transport.setAttribute('aria-pressed', 'false');

  controls.append(drumField.root, bassField.root, modeField.root, bpmField.root, transport);

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
      padMetaX.textContent = 'X · PITCH';
      padMetaY.textContent = 'Y · FILTER';
    } else if (mode === 'arp') {
      padMetaX.textContent = 'X · ROOT';
      padMetaY.textContent = 'Y · RATE';
    } else {
      padMetaX.textContent = 'X · PITCH';
      padMetaY.textContent = 'Y · RATE';
    }
  };
  syncPadMeta(engine.pad.padMode);

  padFrame.append(padSurface, padMeta);
  stage.append(padFrame);

  root.append(header, controls, stage);

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

  modeField.select.addEventListener('change', () => {
    unlockAudio();
    const mode = modeField.select.value as PadMode;
    engine.pad.setMode(mode);
    syncPadMeta(mode);
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
      engine.pad.noteOn(norm.x, norm.y);
      setStatus(engine.isPlaying, true);
    },
    onMove: (norm) => {
      engine.pad.noteMove(norm.x, norm.y);
    },
    onRelease: () => {
      engine.pad.noteOff();
      setStatus(engine.isPlaying, false);
    },
  });

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
