import {
  BASS_PRESETS,
  BPM,
  DRUM_PRESETS,
  STEPS_PER_BAR,
  midiToHz,
  secondsPerStep,
  type BassPreset,
  type DrumHitKind,
  type DrumPreset,
} from './presets';
import { PadSynth } from './pad-synth';

const LOOKAHEAD_S = 0.12;
const SCHEDULER_MS = 25;

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
  private readonly noiseBuffer: AudioBuffer;

  private drumPreset: DrumPreset;
  private bassPreset: BassPreset;
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
    this.drumBus.gain.value = 0.7;
    this.drumBus.connect(this.master);

    this.bassBus = this.ctx.createGain();
    this.bassBus.gain.value = 0.55;
    this.bassBus.connect(this.master);

    this.noiseBuffer = createNoiseBuffer(this.ctx);
    this.pad = new PadSynth(this.ctx, this.master);

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

  get drumPresetId(): string {
    return this.drumPreset.id;
  }

  get bassPresetId(): string {
    return this.bassPreset.id;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
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

  private schedule(): void {
    const stepDur = secondsPerStep(BPM);
    while (this.nextNoteTime < this.ctx.currentTime + LOOKAHEAD_S) {
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
          note.midi,
          time,
          note.durationSteps * stepDur,
          note.velocity,
          this.bassPreset.voice,
        );
      }
    }
  }

  private playDrum(kind: DrumHitKind, time: number, velocity: number): void {
    switch (kind) {
      case 'kick':
        this.playKick(time, velocity);
        break;
      case 'snare':
        this.playSnare(time, velocity);
        break;
      case 'hat':
        this.playHat(time, velocity);
        break;
      case 'rim':
        this.playRim(time, velocity);
        break;
    }
  }

  private playKick(time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.9 * velocity, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
    osc.connect(gain);
    gain.connect(this.drumBus);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  private playSnare(time: number, velocity: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.7;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.55 * velocity, time + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);

    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 190;
    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, time);
    toneGain.gain.exponentialRampToValueAtTime(0.35 * velocity, time + 0.002);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.drumBus);
    tone.connect(toneGain);
    toneGain.connect(this.drumBus);

    noise.start(time);
    noise.stop(time + 0.16);
    tone.start(time);
    tone.stop(time + 0.12);
  }

  private playHat(time: number, velocity: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.28 * velocity, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumBus);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  private playRim(time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 820;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 4;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.25 * velocity, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumBus);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  private playBass(
    midi: number,
    time: number,
    duration: number,
    velocity: number,
    voice: BassPreset['voice'],
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = voice === 0 ? 'sine' : voice === 1 ? 'sawtooth' : 'square';
    osc.frequency.value = midiToHz(midi);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = voice === 1 ? 6 : 1.2;
    const cutoff = voice === 0 ? 220 : voice === 1 ? 900 : 480;
    filter.frequency.setValueAtTime(cutoff, time);
    if (voice === 1) {
      filter.frequency.exponentialRampToValueAtTime(180, time + duration * 0.7);
    }

    const gain = this.ctx.createGain();
    const peak = (voice === 0 ? 0.7 : 0.45) * velocity;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.01);
    const releaseStart = Math.max(time + duration * 0.55, time + 0.04);
    gain.gain.setValueAtTime(peak * 0.85, releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bassBus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }
}
