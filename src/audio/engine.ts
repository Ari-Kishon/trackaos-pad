import {
  BASS_PRESETS,
  DEFAULT_BPM,
  DRUM_PRESETS,
  STEPS_PER_BAR,
  clampBpm,
  midiToHz,
  secondsPerStep,
  type BassPreset,
  type BassVoice,
  type DrumHitKind,
  type DrumPreset,
} from './presets';
import { DEFAULT_KEY_PC } from './scale';
import { PadSynth } from './pad-synth';

const LOOKAHEAD_S = 0.12;
const SCHEDULER_MS = 25;

/** Default lane bus levels (absolute gain into master). */
export const DEFAULT_DRUM_VOLUME = 0.72;
export const DEFAULT_BASS_VOLUME = 0.5;
/** Keyboard bass relative to sequenced bass bus. */
const KEYBOARD_TO_BASS = 0.34 / DEFAULT_BASS_VOLUME;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class AudioEngine {
  readonly pad: PadSynth;

  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly drumBus: GainNode;
  private readonly bassBus: GainNode;
  private readonly keyboardBus: GainNode;
  private readonly keyboardFilter: BiquadFilterNode;
  private readonly keyboardAmp: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private keyboardOsc: OscillatorNode | null = null;

  private drumPreset: DrumPreset;
  private bassPreset: BassPreset;
  /** Pitch-class transpose for sequenced bass (presets authored in C). */
  private keyPc = DEFAULT_KEY_PC;
  private bpm = DEFAULT_BPM;
  private playing = false;
  private currentStep = 0;
  private nextNoteTime = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.drumBus = this.ctx.createGain();
    this.drumBus.gain.value = DEFAULT_DRUM_VOLUME;
    this.drumBus.connect(this.master);

    this.bassBus = this.ctx.createGain();
    this.bassBus.gain.value = DEFAULT_BASS_VOLUME;
    this.bassBus.connect(this.master);

    this.keyboardBus = this.ctx.createGain();
    this.keyboardBus.gain.value = DEFAULT_BASS_VOLUME * KEYBOARD_TO_BASS;
    this.keyboardBus.connect(this.master);

    this.keyboardFilter = this.ctx.createBiquadFilter();
    this.keyboardFilter.type = 'lowpass';
    this.keyboardFilter.Q.value = 2.8;
    this.keyboardFilter.frequency.value = 1600;

    this.keyboardAmp = this.ctx.createGain();
    this.keyboardAmp.gain.value = 0;
    this.keyboardFilter.connect(this.keyboardAmp);
    this.keyboardAmp.connect(this.keyboardBus);

    this.noiseBuffer = createNoiseBuffer(this.ctx);
    this.pad = new PadSynth(this.ctx, this.master);
    this.pad.setBpm(this.bpm);

    const firstDrum = DRUM_PRESETS[0];
    const firstBass = BASS_PRESETS[0];
    if (!firstDrum || !firstBass) {
      throw new Error('Missing presets');
    }
    this.drumPreset = firstDrum;
    this.bassPreset = firstBass;
  }

  get context(): AudioContext {
    return this.ctx;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentBpm(): number {
    return this.bpm;
  }

  get drumPresetId(): string {
    return this.drumPreset.id;
  }

  get bassPresetId(): string {
    return this.bassPreset.id;
  }

  get songKeyPc(): number {
    return this.keyPc;
  }

  get drumVolume(): number {
    return this.drumBus.gain.value;
  }

  get bassVolume(): number {
    return this.bassBus.gain.value;
  }

  get synthVolume(): number {
    return this.pad.volume;
  }

  setDrumVolume(value: number): void {
    this.drumBus.gain.value = clamp01(value);
  }

  setBassVolume(value: number): void {
    const level = clamp01(value);
    this.bassBus.gain.value = level;
    this.keyboardBus.gain.value = level * KEYBOARD_TO_BASS;
  }

  setSynthVolume(value: number): void {
    this.pad.setVolume(value);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Fire-and-forget resume for first gesture (non-blocking hot path). */
  unlock(): void {
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setBpm(value: number): void {
    this.bpm = clampBpm(value);
    this.pad.setBpm(this.bpm);
  }

  setDrumPreset(id: string): void {
    const found = DRUM_PRESETS.find((p) => p.id === id);
    if (found) {
      this.drumPreset = found;
    }
  }

  setBassPreset(id: string): void {
    const found = BASS_PRESETS.find((p) => p.id === id);
    if (found) {
      this.bassPreset = found;
    }
  }

  /** Shared mix key — transposes the bassline; pad/keyboard follow via UI. */
  setKeyPc(pc: number): void {
    this.keyPc = ((pc % 12) + 12) % 12;
  }

  start(): void {
    if (this.playing) {
      return;
    }
    this.playing = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerId = setInterval(() => {
      this.schedule();
    }, SCHEDULER_MS);
    this.schedule();
  }

  stop(): void {
    this.playing = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  toggle(): boolean {
    if (this.playing) {
      this.stop();
    } else {
      this.start();
    }
    return this.playing;
  }

  /** Pad engage — layers over drums + bass (no lane takeover). */
  padNoteOn(xNorm: number, yNorm: number): void {
    this.pad.noteOn(xNorm, yNorm);
  }

  padNoteMove(xNorm: number, yNorm: number): void {
    this.pad.noteMove(xNorm, yNorm);
  }

  padNoteOff(): void {
    this.pad.noteOff();
  }

  /**
   * Independent monophonic voice (held while key is down).
   * Does not touch the pad or start transport.
   */
  keyboardNoteOn(midi: number): void {
    this.unlock();
    const now = this.ctx.currentTime;
    const hz = midiToHz(midi);
    this.ensureKeyboardOsc();
    const osc = this.keyboardOsc;
    if (!osc) {
      return;
    }
    osc.frequency.setValueAtTime(Math.max(hz, 20), now);
    this.keyboardFilter.frequency.setValueAtTime(
      Math.min(Math.max(hz * 7, 400), 2800),
      now,
    );
    const g = this.keyboardAmp.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.exponentialRampToValueAtTime(0.82, now + 0.012);
  }

  /** Legato retarget while another key remains held. */
  keyboardNoteMove(midi: number): void {
    if (!this.keyboardOsc) {
      return;
    }
    const now = this.ctx.currentTime;
    const hz = midiToHz(midi);
    this.keyboardOsc.frequency.setTargetAtTime(Math.max(hz, 20), now, 0.01);
    this.keyboardFilter.frequency.setTargetAtTime(
      Math.min(Math.max(hz * 7, 400), 2800),
      now,
      0.015,
    );
  }

  keyboardNoteOff(): void {
    if (!this.keyboardOsc) {
      return;
    }
    const now = this.ctx.currentTime;
    const g = this.keyboardAmp.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.exponentialRampToValueAtTime(0.0001, now + 0.08);
  }

  private ensureKeyboardOsc(): void {
    if (this.keyboardOsc) {
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.connect(this.keyboardFilter);
    osc.start();
    this.keyboardOsc = osc;
  }

  private schedule(): void {
    while (this.nextNoteTime < this.ctx.currentTime + LOOKAHEAD_S) {
      const stepDur = secondsPerStep(this.bpm);
      this.scheduleStep(this.currentStep, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.currentStep = (this.currentStep + 1) % STEPS_PER_BAR;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): void {
    for (const hit of this.drumPreset.hits) {
      if (hit.step === step) {
        this.playDrum(hit.kind, time, hit.velocity);
      }
    }
    for (const note of this.bassPreset.notes) {
      if (note.step === step) {
        this.playBass(
          note.midi + this.keyPc,
          time,
          note.durationSteps * stepDur,
          note.velocity,
          this.bassPreset.voice,
        );
      }
    }
    this.pad.onTransportStep(step, time, stepDur);
  }

  private playDrum(kind: DrumHitKind, time: number, velocity: number): void {
    switch (kind) {
      case 'kick':
        this.playKick(time, velocity);
        break;
      case 'clap':
        this.playClap(time, velocity);
        break;
      case 'hat':
        this.playHat(time, velocity, false);
        break;
      case 'openhat':
        this.playHat(time, velocity, true);
        break;
      case 'rim':
        this.playRim(time, velocity);
        break;
    }
  }

  /** Techno kick: click transient + deep sine pitch drop. */
  private playKick(time: number, velocity: number): void {
    const body = this.ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(180, time);
    body.frequency.exponentialRampToValueAtTime(48, time + 0.045);
    body.frequency.exponentialRampToValueAtTime(38, time + 0.18);
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.exponentialRampToValueAtTime(1.05 * velocity, time + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    body.connect(bodyGain);
    bodyGain.connect(this.drumBus);
    body.start(time);
    body.stop(time + 0.34);

    const click = this.ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = 2400;
    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 1200;
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, time);
    clickGain.gain.exponentialRampToValueAtTime(0.35 * velocity, time + 0.0008);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.018);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.drumBus);
    click.start(time);
    click.stop(time + 0.025);
  }

  /** Stacked noise clap on 2 and 4. */
  private playClap(time: number, velocity: number): void {
    const offsets = [0, 0.012, 0.024, 0.038];
    for (const [i, offset] of offsets.entries()) {
      const t = time + offset;
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400 + i * 220;
      filter.Q.value = 1.1;
      const gain = this.ctx.createGain();
      const peak = (0.42 - i * 0.05) * velocity;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumBus);
      noise.start(t);
      noise.stop(t + 0.11);
    }

    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 420;
    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, time);
    toneGain.gain.exponentialRampToValueAtTime(0.12 * velocity, time + 0.002);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    tone.connect(toneGain);
    toneGain.connect(this.drumBus);
    tone.start(time);
    tone.stop(time + 0.06);
  }

  private playHat(time: number, velocity: number, open: boolean): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = open ? 6200 : 9000;
    filter.Q.value = open ? 0.6 : 1.2;
    const gain = this.ctx.createGain();
    const peak = (open ? 0.32 : 0.26) * velocity;
    const release = open ? 0.18 : 0.028;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + release);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumBus);
    noise.start(time);
    noise.stop(time + release + 0.02);
  }

  private playRim(time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 980;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.22 * velocity, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumBus);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  private playBass(
    midi: number,
    time: number,
    duration: number,
    velocity: number,
    voice: BassVoice,
  ): void {
    if (voice === 'reese') {
      this.playReeseBass(midi, time, duration, velocity);
      return;
    }

    const osc = this.ctx.createOscillator();
    osc.type =
      voice === 'sub'
        ? 'sine'
        : voice === 'acid'
          ? 'sawtooth'
          : voice === 'pluck'
            ? 'triangle'
            : 'square';
    osc.frequency.value = midiToHz(midi);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value =
      voice === 'acid' ? 9 : voice === 'pluck' ? 4.5 : voice === 'pulse' ? 2.4 : 0.9;
    const startCut =
      voice === 'sub'
        ? 180
        : voice === 'acid'
          ? 1600
          : voice === 'pluck'
            ? 2200
            : 520;
    filter.frequency.setValueAtTime(startCut, time);
    if (voice === 'acid' || voice === 'pluck') {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(120, startCut * (voice === 'pluck' ? 0.08 : 0.12)),
        time + Math.max(duration * (voice === 'pluck' ? 0.35 : 0.65), 0.04),
      );
    }

    const gain = this.ctx.createGain();
    const peak =
      (voice === 'sub'
        ? 0.78
        : voice === 'acid'
          ? 0.42
          : voice === 'pluck'
            ? 0.48
            : 0.4) * velocity;
    const attack = voice === 'acid' || voice === 'pluck' ? 0.004 : 0.01;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    const releaseStart = Math.max(
      time + duration * (voice === 'pluck' ? 0.25 : 0.5),
      time + attack + 0.02,
    );
    gain.gain.setValueAtTime(peak * (voice === 'pluck' ? 0.45 : 0.8), releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bassBus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  /** Detuned dual saw — thick mid-bass bed. */
  private playReeseBass(
    midi: number,
    time: number,
    duration: number,
    velocity: number,
  ): void {
    const f = midiToHz(midi);
    const merge = this.ctx.createGain();
    merge.gain.value = 0.72;

    const a = this.ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.setValueAtTime(f, time);

    const b = this.ctx.createOscillator();
    b.type = 'sawtooth';
    b.frequency.setValueAtTime(f * 1.007, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(380, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + Math.max(duration * 0.8, 0.08));

    const gain = this.ctx.createGain();
    const peak = 0.55 * velocity;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.02);
    gain.gain.setValueAtTime(peak * 0.85, time + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    a.connect(merge);
    b.connect(merge);
    merge.connect(filter);
    filter.connect(gain);
    gain.connect(this.bassBus);
    a.start(time);
    b.start(time);
    a.stop(time + duration + 0.02);
    b.stop(time + duration + 0.02);
  }
}
