import { AudioEngine } from '../audio/engine';
import { BASS_PRESETS, BPM, DRUM_PRESETS } from '../audio/presets';
import { createPad } from './pad';

export function mountApp(root: HTMLElement): void {
  const engine = new AudioEngine();

  root.replaceChildren();
  root.className = 'shell';

  const header = el('header', 'shell-header');
  const brand = el('div', 'brand');
  brand.innerHTML =
    '<span class="brand-mark">TRACKAOS</span><span class="brand-sub">PAD</span>';

  const status = el('p', 'status-line');
  status.textContent = `STANDBY  ·  ${String(BPM)} BPM`;

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

  const transport = el('button', 'transport') as HTMLButtonElement;
  transport.type = 'button';
  transport.textContent = 'START';
  transport.setAttribute('aria-pressed', 'false');

  controls.append(drumField.root, bassField.root, transport);

  const stage = el('section', 'pad-stage');
  const padFrame = el('div', 'pad-frame');
  const padSurface = el('div', 'xy-pad');
  padSurface.setAttribute('role', 'application');
  padSurface.setAttribute('aria-label', 'XY performance pad');
  padSurface.tabIndex = 0;

  const padMeta = el('div', 'pad-meta');
  padMeta.innerHTML =
    '<span>X · PITCH</span><span class="pad-meta-rule"></span><span>Y · FILTER</span>';

  padFrame.append(padSurface, padMeta);
  stage.append(padFrame);

  root.append(header, controls, stage);

  const setStatus = (playing: boolean, padLive: boolean): void => {
    const transportLabel = playing ? 'TRANSPORT ON' : 'STANDBY';
    const padLabel = padLive ? ' ·  PAD LIVE' : '';
    status.textContent = `${transportLabel}${padLabel}  ·  ${String(BPM)} BPM`;
    status.classList.toggle('is-live', playing || padLive);
  };

  const syncTransportUi = (): void => {
    const playing = engine.isPlaying;
    transport.textContent = playing ? 'STOP' : 'START';
    transport.setAttribute('aria-pressed', playing ? 'true' : 'false');
    transport.classList.toggle('is-on', playing);
    setStatus(playing, engine.pad.isActive);
  };

  const ensureAudio = async (): Promise<void> => {
    await engine.resume();
  };

  drumField.select.addEventListener('change', () => {
    engine.setDrumPreset(drumField.select.value);
  });

  bassField.select.addEventListener('change', () => {
    engine.setBassPreset(bassField.select.value);
  });

  transport.addEventListener('click', () => {
    void (async () => {
      await ensureAudio();
      engine.toggle();
      syncTransportUi();
    })();
  });

  createPad(padSurface, {
    onEngage: (norm) => {
      void (async () => {
        await ensureAudio();
        if (!engine.isPlaying) {
          engine.start();
          syncTransportUi();
        }
        engine.pad.noteOn(norm.x, norm.y);
        setStatus(engine.isPlaying, true);
      })();
    },
    onMove: (norm) => {
      engine.pad.noteMove(norm.x, norm.y);
    },
    onRelease: () => {
      engine.pad.noteOff();
      setStatus(engine.isPlaying, false);
    },
  });

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
