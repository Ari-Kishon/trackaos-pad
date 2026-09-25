import { DEFAULT_BPM, midiToHz, secondsPerStep } from './presets';
import {
  DEFAULT_KEY_PC,
  DEFAULT_SCALE_ID,
  degreeFromXNorm,
  midiFromDegree,
  rootMidiFromKeyPc,
  scaleById,
  type ScaleId,
} from './scale';

/** Gate rate: steps between hits, top→bottom (fast → slow). */
const GATE_RATE_STEPS = [0.5, 1, 2, 4] as const;

/** Fixed arp subdivision (one hit per sixteenth). */
const ARP_STEPS_PER_HIT = 1;

/** Top→bottom: LEGATO, 100%, 75%, 50%, 25% of a sixteenth. */
const IMS_GATE_FRACS = [Number.POSITIVE_INFINITY, 1, 0.75, 0.5, 0.25] as const;

export type PadMode = 'hold' | 'arp' | 'gate' | 'ims';

export const PAD_MODES: readonly { id: PadMode; label: string }[] = [
  { id: 'hold', label: 'HOLD' },
  { id: 'arp', label: 'ARP' },
  { id: 'gate', label: 'GATE' },
  { id: 'ims', label: 'IMS' },
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
  /** Last scale degree (−1 = none). */
  private lastDegree = -1;
  /** Audio time when the next IMS one-shot may re-fire while held. */
  private imsRetriggerAt = 0;
  /** Key/Scale pitch world — pad X only picks a degree within this. */
  private rootMidi = rootMidiFromKeyPc(DEFAULT_KEY_PC);
  private scaleId: ScaleId = DEFAULT_SCALE_ID;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    // Hot enough to sit with kick/bass once the pattern ducks under the pad.
    this.output.gain.value = 0.95;
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

  get keyRootMidi(): number {
    return this.rootMidi;
  }

  get keyScaleId(): ScaleId {
    return this.scaleId;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  /**
   * Own absolute pitch via Key/Scale. Live pad voice retargets if held.
   */
  setKeyScale(rootMidi: number, scaleId: ScaleId): void {
    this.rootMidi = rootMidi;
    this.scaleId = scaleId;
    if (!this.active) {
      this.lastDegree = -1;
      return;
    }
    const now = this.ctx.currentTime;
    if (this.mode === 'hold') {
      this.setHoldParams(this.xNorm, this.yNorm, now, true);
      return;
    }
    if (this.mode === 'ims') {
      this.fireImsVoice(now, true);
    }
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
    this.lastDegree = -1;
    this.imsRetriggerAt = 0;
    if (wasActive) {
      this.beginVoice(this.xNorm, this.yNorm);
    }
  }

  /**
   * HOLD: X scale note, Y filter.
   * ARP: X scale root degree, Y octave span.
   * GATE: X scale note, Y rate.
   * IMS: X scale note, Y gate (iMS-20 performance Kaoss).
   */
  noteOn(xNorm: number, yNorm: number): void {
    this.xNorm = clamp01(xNorm);
    this.yNorm = clamp01(yNorm);
    this.arpIndex = 0;
    this.lastDegree = -1;
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
      return;
    }
    if (this.mode === 'ims') {
      this.handleImsMove(this.ctx.currentTime);
    }
  }

  noteOff(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.lastDegree = -1;
    this.imsRetriggerAt = 0;
    this.silenceHold(this.ctx.currentTime);
  }

  /** Transport sixteenth-note tick — drives ARP, GATE, and IMS while held. */
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

    if (this.mode === 'ims') {
      if (time + 1e-4 >= this.imsRetriggerAt) {
        this.fireImsVoice(time, false);
      }
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
      this.filter.Q.setValueAtTime(3.2, now);
      this.setHoldParams(xNorm, yNorm, now, true);
      this.openHoldAmp(now, 0.95, 0.012);
      return;
    }

    // Rhythmic / IMS modes use one-shots (or IMS legato); park the hold voice.
    this.silenceHold(now);
    const stepDur = secondsPerStep(this.bpm);

    if (this.mode === 'ims') {
      // IMS schedules its own re-triggers via imsRetriggerAt — no engage suppress.
      this.suppressUntil = 0;
      this.fireImsVoice(now, true);
      return;
    }

    this.suppressUntil = now + stepDur * 0.55;

    if (this.mode === 'arp') {
      this.fireArpNote(now, stepDur * 0.7);
      return;
    }

    const rate = gateRateFromY(yNorm);
    const noteDur = stepDur * Math.min(rate >= 1 ? rate : 0.5, 2) * 0.45;
    this.fireGateNote(now, noteDur);
  }

  private handleImsMove(time: number): void {
    const degree = degreeFromXNorm(this.xNorm, this.scaleId);
    const legato = imsGateIsLegato(this.yNorm);

    if (legato) {
      if (degree !== this.lastDegree) {
        this.fireImsVoice(time, true);
      }
      return;
    }

    // Leaving legato: cut sustain and seed a gated note.
    if (this.imsRetriggerAt === Number.POSITIVE_INFINITY) {
      this.silenceHold(time);
      this.fireImsVoice(time, true);
      return;
    }

    if (degree !== this.lastDegree) {
      this.fireImsVoice(time, true);
    }
  }

  private fireImsVoice(time: number, force: boolean): void {
    const degree = degreeFromXNorm(this.xNorm, this.scaleId);
    const frac = imsGateFracFromY(this.yNorm);
    const stepDur = secondsPerStep(this.bpm);
    const freq = this.freqFromDegree(degree);

    this.lastDegree = degree;

    if (!Number.isFinite(frac)) {
      // LEGATO — dual-osc MS-20-ish sustain while held.
      this.ensureHoldOsc();
      if (this.osc) {
        this.osc.type = 'sawtooth';
        this.osc.frequency.setValueAtTime(freq, time);
      }
      this.filter.Q.setValueAtTime(8.5, time);
      this.filter.frequency.setValueAtTime(Math.min(freq * 8, 4200), time);
      this.openHoldAmp(time, 0.95, force ? 0.008 : 0.004);
      this.imsRetriggerAt = Number.POSITIVE_INFINITY;
      return;
    }

    // Gated one-shots: duration + re-fire interval from Y (iMS-20 gate %).
    this.silenceHold(time);
    const duration = Math.max(stepDur * frac * 0.92, 0.025);
    this.playImsOneShot(freq, time, duration);
    this.imsRetriggerAt = time + Math.max(duration, stepDur * frac);
  }

  private fireArpNote(time: number, duration: number): void {
    const startDegree = degreeFromXNorm(this.xNorm, this.scaleId);
    const octaves = octaveSpanFromY(this.yNorm);
    const chord = buildArpDegrees(this.rootMidi, this.scaleId, startDegree, octaves);
    const freq = chord[this.arpIndex % chord.length] ?? this.freqFromDegree(startDegree);
    this.arpIndex += 1;
    const cutoff = Math.min(freq * 6, 5200);
    this.playOneShot(freq, time, duration, cutoff);
  }

  private fireGateNote(time: number, duration: number): void {
    const freq = this.freqFromDegree(degreeFromXNorm(this.xNorm, this.scaleId));
    const cutoff = Math.min(freq * 5.5, 4800);
    this.playOneShot(freq, time, duration, cutoff);
  }

  private freqFromDegree(degree: number): number {
    return midiToHz(midiFromDegree(this.rootMidi, this.scaleId, degree));
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
    const peak = 0.95;
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

  /** Dual VCO + HPF→LPF cascade — aggressive MS-20 flavour for IMS. */
  private playImsOneShot(freq: number, time: number, duration: number): void {
    const f = Math.max(freq, 20);
    const merge = this.ctx.createGain();
    merge.gain.value = 0.9;

    const saw = this.ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(f, time);

    const square = this.ctx.createOscillator();
    square.type = 'square';
    square.frequency.setValueAtTime(f * 1.003, time);
    const squareGain = this.ctx.createGain();
    squareGain.gain.value = 0.7;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.Q.value = 3.4;
    hp.frequency.setValueAtTime(Math.min(f * 0.85, 900), time);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 9.5;
    lp.frequency.setValueAtTime(Math.min(f * 7.5, 4800), time);
    lp.frequency.exponentialRampToValueAtTime(
      Math.max(f * 1.8, 180),
      time + Math.max(duration * 0.7, 0.04),
    );

    const gain = this.ctx.createGain();
    const peak = 0.92;
    const attack = 0.003;
    const releaseAt = time + Math.max(duration, attack + 0.02);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);

    saw.connect(merge);
    square.connect(squareGain);
    squareGain.connect(merge);
    merge.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(this.output);

    saw.start(time);
    square.start(time);
    saw.stop(releaseAt + 0.03);
    square.stop(releaseAt + 0.03);
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
    const degree = degreeFromXNorm(xNorm, this.scaleId);
    const freq = this.freqFromDegree(degree);
    const cutoff = 220 + (1 - clamp01(yNorm)) * 6800;
    this.lastDegree = degree;

    if (snap) {
      this.osc.frequency.setValueAtTime(freq, time);
      this.filter.frequency.setValueAtTime(cutoff, time);
    } else {
      this.osc.frequency.setTargetAtTime(freq, time, 0.012);
      this.filter.frequency.setTargetAtTime(cutoff, time, 0.018);
    }
  }
}

/** Top of pad = 3 octaves, bottom = 1. */
function octaveSpanFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  return Math.min(3, 1 + Math.floor((1 - y) * 3));
}

/** Walk scale degrees from startDegree across `octaves` of the scale. */
function buildArpDegrees(
  rootMidi: number,
  scaleId: ScaleId,
  startDegree: number,
  octaves: number,
): number[] {
  const perOct = scaleById(scaleId).semis.length;
  const count = Math.max(1, perOct * octaves);
  const freqs: number[] = [];
  for (let i = 0; i < count; i += 1) {
    freqs.push(midiToHz(midiFromDegree(rootMidi, scaleId, startDegree + i)));
  }
  return freqs;
}

function gateRateFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  const idx = Math.min(
    GATE_RATE_STEPS.length - 1,
    Math.floor(y * GATE_RATE_STEPS.length),
  );
  return GATE_RATE_STEPS[idx] ?? 1;
}

function imsGateFracFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  const idx = Math.min(
    IMS_GATE_FRACS.length - 1,
    Math.floor(y * IMS_GATE_FRACS.length),
  );
  return IMS_GATE_FRACS[idx] ?? 0.5;
}

function imsGateIsLegato(yNorm: number): boolean {
  return !Number.isFinite(imsGateFracFromY(yNorm));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
