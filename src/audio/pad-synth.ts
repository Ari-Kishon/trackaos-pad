import { DEFAULT_BPM, secondsPerStep } from './presets';

/** Continuous techno-friendly pitch range across pad X (≈ A1–A4). */
const FREQ_MIN = 55;
const FREQ_MAX = 440;

/** Semitone offsets from the X root for the arp chord. */
const ARP_SEMIS = [0, 3, 7, 12] as const;

/** Steps between triggers, top→bottom of pad (fast → slow). */
const RATE_STEPS = [0.5, 1, 2, 4] as const;

/** Mid filter Y used when Y drives rate instead of cutoff. */
const RHYTHM_FILTER_Y = 0.35;

export type PadMode = 'hold' | 'arp' | 'gate';

export const PAD_MODES: readonly { id: PadMode; label: string }[] = [
  { id: 'hold', label: 'HOLD' },
  { id: 'arp', label: 'ARP' },
  { id: 'gate', label: 'GATE' },
];

export class PadSynth {
  private readonly ctx: AudioContext;
  private readonly output: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly amp: GainNode;
  private osc: OscillatorNode | null = null;
  private active = false;
  private mode: PadMode = 'hold';
  private xNorm = 0.5;
  private yNorm = 0.5;
  private bpm = DEFAULT_BPM;
  private arpIndex = 0;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.38;
    this.output.connect(destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 3.2;
    this.filter.frequency.value = 1400;

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    this.filter.connect(this.amp);
    this.amp.connect(this.output);
  }

  get isActive(): boolean {
    return this.active;
  }

  get padMode(): PadMode {
    return this.mode;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  setMode(mode: PadMode): void {
    if (this.mode === mode) {
      return;
    }
    const wasActive = this.active;
    if (wasActive) {
      this.silence(this.ctx.currentTime);
    }
    this.mode = mode;
    this.arpIndex = 0;
    if (wasActive) {
      this.beginVoice(this.xNorm, this.yNorm);
    }
  }

  /**
   * @param xNorm 0–1 left→right → pitch / root
   * @param yNorm 0–1 top→bottom → filter (hold) or rate (arp/gate)
   */
  noteOn(xNorm: number, yNorm: number): void {
    this.xNorm = clamp01(xNorm);
    this.yNorm = clamp01(yNorm);
    this.arpIndex = 0;
    this.beginVoice(this.xNorm, this.yNorm);
  }

  noteMove(xNorm: number, yNorm: number): void {
    if (!this.active) {
      return;
    }
    this.xNorm = clamp01(xNorm);
    this.yNorm = clamp01(yNorm);
    if (this.mode === 'hold') {
      this.setParams(this.xNorm, this.yNorm, this.ctx.currentTime, false);
    } else if (this.mode === 'gate') {
      this.setParams(this.xNorm, RHYTHM_FILTER_Y, this.ctx.currentTime, false);
    }
  }

  noteOff(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.silence(this.ctx.currentTime);
  }

  /** Transport sixteenth-note tick — drives ARP and GATE while held. */
  onTransportStep(step: number, time: number, stepDur: number): void {
    if (!this.active || this.mode === 'hold') {
      return;
    }
    const rate = rateFromY(this.yNorm);
    if (rate >= 1) {
      if (step % rate !== 0) {
        return;
      }
      this.fireRhythmEvent(time, stepDur * Math.min(rate, 2) * 0.55);
      return;
    }
    const half = stepDur * 0.5;
    this.fireRhythmEvent(time, half * 0.55);
    this.fireRhythmEvent(time + half, half * 0.55);
  }

  private beginVoice(xNorm: number, yNorm: number): void {
    const now = this.ctx.currentTime;
    this.ensureOsc();
    this.active = true;

    if (this.mode === 'hold') {
      this.setParams(xNorm, yNorm, now, true);
      this.openAmp(now, 0.85, 0.012);
      return;
    }

    this.setParams(xNorm, RHYTHM_FILTER_Y, now, true);
    const g = this.amp.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0.0001, now);

    const stepDur = secondsPerStep(this.bpm);
    const rate = rateFromY(yNorm);
    const noteDur = stepDur * Math.min(rate >= 1 ? rate : 0.5, 2) * 0.55;
    this.fireRhythmEvent(now, noteDur);
  }

  private fireRhythmEvent(time: number, noteDur: number): void {
    this.ensureOsc();
    if (!this.osc) {
      return;
    }

    if (this.mode === 'arp') {
      const root = freqFromX(this.xNorm);
      const chord = ARP_SEMIS.map((semi) => root * 2 ** (semi / 12));
      const freq = chord[this.arpIndex % chord.length] ?? root;
      this.arpIndex += 1;
      this.osc.frequency.setValueAtTime(freq, time);
      this.filter.frequency.setValueAtTime(220 + (1 - RHYTHM_FILTER_Y) * 6800, time);
      this.pluckAmp(time, noteDur);
      return;
    }

    this.setParams(this.xNorm, RHYTHM_FILTER_Y, time, true);
    this.pluckAmp(time, noteDur * 0.85);
  }

  private openAmp(time: number, peak: number, attack: number): void {
    const g = this.amp.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(Math.max(g.value, 0.0001), time);
    g.exponentialRampToValueAtTime(peak, time + attack);
  }

  private pluckAmp(time: number, duration: number): void {
    const peak = 0.85;
    const attack = 0.008;
    const release = Math.max(duration - attack, 0.02);
    const g = this.amp.gain;
    g.setValueAtTime(0.0001, time);
    g.exponentialRampToValueAtTime(peak, time + attack);
    g.exponentialRampToValueAtTime(0.0001, time + attack + release);
  }

  private silence(time: number): void {
    const g = this.amp.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(Math.max(g.value, 0.0001), time);
    g.exponentialRampToValueAtTime(0.0001, time + 0.14);
  }

  private ensureOsc(): void {
    if (this.osc) {
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.connect(this.filter);
    osc.start();
    this.osc = osc;
  }

  private setParams(xNorm: number, yNorm: number, time: number, snap: boolean): void {
    if (!this.osc) {
      return;
    }
    const freq = freqFromX(xNorm);
    const cutoff = 220 + (1 - clamp01(yNorm)) * 6800;

    if (snap) {
      this.osc.frequency.setValueAtTime(freq, time);
      this.filter.frequency.setValueAtTime(cutoff, time);
    } else {
      this.osc.frequency.setTargetAtTime(freq, time, 0.012);
      this.filter.frequency.setTargetAtTime(cutoff, time, 0.018);
    }
  }
}

function freqFromX(xNorm: number): number {
  const x = clamp01(xNorm);
  return FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** x;
}

function rateFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  const idx = Math.min(RATE_STEPS.length - 1, Math.floor(y * RATE_STEPS.length));
  return RATE_STEPS[idx] ?? 1;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
