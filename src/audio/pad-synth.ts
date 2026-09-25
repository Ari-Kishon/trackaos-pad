import { DEFAULT_BPM, secondsPerStep } from './presets';

/** Continuous techno-friendly pitch range across pad X (≈ A1–A4). */
const FREQ_MIN = 55;
const FREQ_MAX = 440;

/** Chord tones within one octave (minor 7), in semitones. */
const ARP_DEGREE_SEMIS = [0, 3, 7, 10] as const;

/** Gate rate: steps between hits, top→bottom (fast → slow). */
const GATE_RATE_STEPS = [0.5, 1, 2, 4] as const;

/** Fixed arp subdivision (one hit per sixteenth). */
const ARP_STEPS_PER_HIT = 1;

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
  /** Ignore transport ticks before this time (avoids double-hit with engage seed). */
  private suppressUntil = 0;

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
      this.silenceHold(this.ctx.currentTime);
      this.active = false;
    }
    this.mode = mode;
    this.arpIndex = 0;
    if (wasActive) {
      this.beginVoice(this.xNorm, this.yNorm);
    }
  }

  /**
   * HOLD: X pitch, Y filter.
   * ARP: X root, Y octave span.
   * GATE: X pitch, Y rate.
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
      this.setHoldParams(this.xNorm, this.yNorm, this.ctx.currentTime, false);
    }
  }

  noteOff(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.silenceHold(this.ctx.currentTime);
  }

  /** Transport sixteenth-note tick — drives ARP and GATE while held. */
  onTransportStep(step: number, time: number, stepDur: number): void {
    if (!this.active || this.mode === 'hold') {
      return;
    }
    if (time < this.suppressUntil) {
      return;
    }

    if (this.mode === 'arp') {
      if (step % ARP_STEPS_PER_HIT !== 0) {
        return;
      }
      this.fireArpNote(time, stepDur * 0.7);
      return;
    }

    const rate = gateRateFromY(this.yNorm);
    if (rate >= 1) {
      if (step % rate !== 0) {
        return;
      }
      this.fireGateNote(time, stepDur * Math.min(rate, 2) * 0.45);
      return;
    }
    const half = stepDur * 0.5;
    this.fireGateNote(time, half * 0.45);
    this.fireGateNote(time + half, half * 0.45);
  }

  private beginVoice(xNorm: number, yNorm: number): void {
    const now = this.ctx.currentTime;
    this.active = true;

    if (this.mode === 'hold') {
      this.ensureHoldOsc();
      this.setHoldParams(xNorm, yNorm, now, true);
      this.openHoldAmp(now, 0.85, 0.012);
      return;
    }

    // Rhythmic modes use one-shots; park the hold voice.
    this.silenceHold(now);
    const stepDur = secondsPerStep(this.bpm);
    this.suppressUntil = now + stepDur * 0.55;

    if (this.mode === 'arp') {
      this.fireArpNote(now, stepDur * 0.7);
    } else {
      const rate = gateRateFromY(yNorm);
      const noteDur = stepDur * Math.min(rate >= 1 ? rate : 0.5, 2) * 0.45;
      this.fireGateNote(now, noteDur);
    }
  }

  private fireArpNote(time: number, duration: number): void {
    const root = freqFromX(this.xNorm);
    const octaves = octaveSpanFromY(this.yNorm);
    const chord = buildArpChord(root, octaves);
    const freq = chord[this.arpIndex % chord.length] ?? root;
    this.arpIndex += 1;
    const cutoff = Math.min(freq * 6, 5200);
    this.playOneShot(freq, time, duration, cutoff);
  }

  private fireGateNote(time: number, duration: number): void {
    const freq = freqFromX(this.xNorm);
    const cutoff = Math.min(freq * 5.5, 4800);
    this.playOneShot(freq, time, duration, cutoff);
  }

  /** Independent voice — avoids shared-amp automation fights. */
  private playOneShot(
    freq: number,
    time: number,
    duration: number,
    cutoff: number,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(freq, 20), time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2.4;
    filter.frequency.setValueAtTime(Math.max(cutoff, 200), time);

    const gain = this.ctx.createGain();
    const peak = 0.72;
    const attack = 0.004;
    const releaseAt = time + Math.max(duration, attack + 0.02);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    osc.start(time);
    osc.stop(releaseAt + 0.03);
  }

  private openHoldAmp(time: number, peak: number, attack: number): void {
    const g = this.amp.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(Math.max(g.value, 0.0001), time);
    g.exponentialRampToValueAtTime(peak, time + attack);
  }

  private silenceHold(time: number): void {
    const g = this.amp.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(Math.max(g.value, 0.0001), time);
    g.exponentialRampToValueAtTime(0.0001, time + 0.08);
  }

  private ensureHoldOsc(): void {
    if (this.osc) {
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.connect(this.filter);
    osc.start();
    this.osc = osc;
  }

  private setHoldParams(
    xNorm: number,
    yNorm: number,
    time: number,
    snap: boolean,
  ): void {
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

/** Top of pad = 3 octaves, bottom = 1. */
function octaveSpanFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  return Math.min(3, 1 + Math.floor((1 - y) * 3));
}

function buildArpChord(rootHz: number, octaves: number): number[] {
  const notes: number[] = [];
  for (let oct = 0; oct < octaves; oct += 1) {
    for (const degree of ARP_DEGREE_SEMIS) {
      const hz = rootHz * 2 ** ((degree + oct * 12) / 12);
      if (hz <= FREQ_MAX * 4) {
        notes.push(hz);
      }
    }
  }
  return notes.length > 0 ? notes : [rootHz];
}

function gateRateFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  const idx = Math.min(
    GATE_RATE_STEPS.length - 1,
    Math.floor(y * GATE_RATE_STEPS.length),
  );
  return GATE_RATE_STEPS[idx] ?? 1;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
