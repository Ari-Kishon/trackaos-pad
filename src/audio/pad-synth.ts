import {
  DEFAULT_BPM,
  DEFAULT_SYNTH_VOICE,
  midiToHz,
  secondsPerStep,
  type SynthVoiceId,
} from './presets';
import {
  DEFAULT_KEY_PC,
  DEFAULT_SCALE_ID,
  SCALE_OCTAVES,
  clampScaleOctaves,
  degreeFromXNorm,
  midiFromDegree,
  rootMidiFromKeyPc,
  scaleById,
  type ScaleId,
} from './scale';

/** Gate rate: steps between hits, top→bottom (fast → slow). */
const GATE_RATE_STEPS = [0.5, 1, 2, 4] as const;

/** Top→bottom: LEGATO, 100%, 75%, 50%, 25% of a sixteenth. */
const IMS_GATE_FRACS = [Number.POSITIVE_INFINITY, 1, 0.75, 0.5, 0.25] as const;

export type PadMode = 'hold' | 'arp' | 'gate' | 'ims';

export const PAD_MODES: readonly { id: PadMode; label: string; shortcut: string }[] = [
  { id: 'hold', label: 'HOLD', shortcut: '1' },
  { id: 'arp', label: 'ARP', shortcut: '2' },
  { id: 'gate', label: 'GATE', shortcut: '3' },
  { id: 'ims', label: 'IMS', shortcut: '4' },
];

/** Logic-style arpeggio direction. */
export type ArpPattern = 'up' | 'down' | 'upDown' | 'downUp' | 'random';

export const ARP_PATTERNS: readonly {
  id: ArpPattern;
  label: string;
  shortcut: string;
}[] = [
  { id: 'up', label: 'UP', shortcut: '↑' },
  { id: 'down', label: 'DOWN', shortcut: '↓' },
  { id: 'upDown', label: 'UP-DN', shortcut: '→' },
  { id: 'downUp', label: 'DN-UP', shortcut: '←' },
  { id: 'random', label: 'RAND', shortcut: '/' },
];

/** Note value relative to the transport sixteenth grid. */
export type ArpRate = '1/4' | '1/8' | '1/16' | '1/32';

export const ARP_RATES: readonly { id: ArpRate; label: string; sixteenths: number }[] = [
  { id: '1/4', label: '1/4', sixteenths: 4 },
  { id: '1/8', label: '1/8', sixteenths: 2 },
  { id: '1/16', label: '1/16', sixteenths: 1 },
  { id: '1/32', label: '1/32', sixteenths: 0.5 },
];

export const ARP_OCT_MIN = 1;
export const ARP_OCT_MAX = 4;
export const DEFAULT_ARP_OCTAVES = 2;

/** Default pad bus level — sits under kick/bass in the mix. */
export const DEFAULT_SYNTH_VOLUME = 0.55;

export class PadSynth {
  private readonly ctx: AudioContext;
  private readonly output: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly amp: GainNode;
  private osc: OscillatorNode | null = null;
  /** Second VCO for MS-20 / pulse detuned hold voices. */
  private oscB: OscillatorNode | null = null;
  private active = false;
  private mode: PadMode = 'arp';
  private voice: SynthVoiceId = DEFAULT_SYNTH_VOICE;
  private xNorm = 0.5;
  private yNorm = yNormFromArpOctaves(DEFAULT_ARP_OCTAVES);
  private bpm = DEFAULT_BPM;
  private arpIndex = 0;
  private arpPattern: ArpPattern = 'up';
  private arpRate: ArpRate = '1/16';
  private arpOctaves = DEFAULT_ARP_OCTAVES;
  /** Ignore transport ticks before this time (avoids double-hit with engage seed). */
  private suppressUntil = 0;
  /** Last scale degree (−1 = none). */
  private lastDegree = -1;
  /** Audio time when the next IMS one-shot may re-fire while held. */
  private imsRetriggerAt = 0;
  /** Key/Scale pitch world — pad X only picks a degree within this. */
  private rootMidi = rootMidiFromKeyPc(DEFAULT_KEY_PC);
  private scaleId: ScaleId = DEFAULT_SCALE_ID;
  private scaleOctaves = SCALE_OCTAVES;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    // Sit under kick/bass so the pad layers without masking the groove.
    this.output.gain.value = DEFAULT_SYNTH_VOLUME;
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

  get arpPatternId(): ArpPattern {
    return this.arpPattern;
  }

  get arpRateId(): ArpRate {
    return this.arpRate;
  }

  get arpOctaveSpan(): number {
    return this.arpOctaves;
  }

  get synthVoiceId(): SynthVoiceId {
    return this.voice;
  }

  get volume(): number {
    return this.output.gain.value;
  }

  /** Bus level for the pad voice (0–1). */
  setVolume(value: number): void {
    this.output.gain.value = clamp01(value);
  }

  get keyRootMidi(): number {
    return this.rootMidi;
  }

  get keyScaleId(): ScaleId {
    return this.scaleId;
  }

  get keyScaleOctaves(): number {
    return this.scaleOctaves;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  /** Timbre for the pad voice — live retarget if held. */
  setSynthVoice(id: SynthVoiceId): void {
    if (this.voice === id) {
      return;
    }
    this.voice = id;
    if (!this.active) {
      this.teardownHoldOsc();
      return;
    }
    const now = this.ctx.currentTime;
    if (this.mode === 'hold' || (this.mode === 'ims' && this.imsRetriggerAt === Number.POSITIVE_INFINITY)) {
      this.teardownHoldOsc();
      this.ensureHoldOsc();
      this.applyHoldVoiceShape(now);
      this.setHoldParams(this.xNorm, this.yNorm, now, true);
      this.openHoldAmp(now, 0.95, 0.008);
    }
  }

  /**
   * Own absolute pitch via Key/Scale/octave span. Live pad voice retargets if held.
   */
  setKeyScale(rootMidi: number, scaleId: ScaleId, scaleOctaves = this.scaleOctaves): void {
    this.rootMidi = rootMidi;
    this.scaleId = scaleId;
    this.scaleOctaves = clampScaleOctaves(scaleOctaves);
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

  setArpPattern(pattern: ArpPattern): void {
    if (this.arpPattern === pattern) {
      return;
    }
    this.arpPattern = pattern;
    this.arpIndex = 0;
  }

  setArpRate(rate: ArpRate): void {
    if (this.arpRate === rate) {
      return;
    }
    this.arpRate = rate;
    this.arpIndex = 0;
  }

  /** Discrete arpeggio octave span (1–4). Also live-synced from pad Y in ARP. */
  setArpOctaves(octaves: number): void {
    const next = clampArpOctaves(octaves);
    if (this.arpOctaves === next) {
      return;
    }
    this.arpOctaves = next;
    this.arpIndex = 0;
    this.yNorm = yNormFromArpOctaves(next);
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
    if (this.mode === 'arp') {
      this.arpOctaves = octaveSpanFromY(this.yNorm);
    }
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
    if (this.mode === 'arp') {
      this.arpOctaves = octaveSpanFromY(this.yNorm);
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
      this.scheduleArpHits(step, time, stepDur);
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
      this.applyHoldVoiceShape(now);
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
      this.fireArpNote(now, arpNoteDuration(stepDur, this.arpRate));
      return;
    }

    const rate = gateRateFromY(yNorm);
    const noteDur = stepDur * Math.min(rate >= 1 ? rate : 0.5, 2) * 0.45;
    this.fireGateNote(now, noteDur);
  }

  private scheduleArpHits(step: number, time: number, stepDur: number): void {
    const sixteenths = arpSixteenths(this.arpRate);
    const noteDur = arpNoteDuration(stepDur, this.arpRate);

    if (sixteenths >= 1) {
      if (step % sixteenths !== 0) {
        return;
      }
      this.fireArpNote(time, noteDur);
      return;
    }

    // 1/32: two hits per sixteenth.
    const half = stepDur * 0.5;
    this.fireArpNote(time, noteDur);
    this.fireArpNote(time + half, noteDur);
  }

  private handleImsMove(time: number): void {
    const degree = degreeFromXNorm(this.xNorm, this.scaleId, this.scaleOctaves);
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
    const degree = degreeFromXNorm(this.xNorm, this.scaleId, this.scaleOctaves);
    const frac = imsGateFracFromY(this.yNorm);
    const stepDur = secondsPerStep(this.bpm);
    const freq = this.freqFromDegree(degree);

    this.lastDegree = degree;

    if (!Number.isFinite(frac)) {
      // LEGATO — sustain while held; timbre from synth voice.
      this.ensureHoldOsc();
      this.applyHoldVoiceShape(time);
      if (this.osc) {
        this.osc.frequency.setValueAtTime(freq, time);
      }
      if (this.oscB) {
        this.oscB.frequency.setValueAtTime(freq * detuneRatio(this.voice), time);
      }
      this.filter.Q.setValueAtTime(holdFilterQ(this.voice, true), time);
      this.filter.frequency.setValueAtTime(
        Math.min(freq * holdCutoffMul(this.voice, true), 4800),
        time,
      );
      this.openHoldAmp(time, 0.95, force ? 0.008 : 0.004);
      this.imsRetriggerAt = Number.POSITIVE_INFINITY;
      return;
    }

    // Gated one-shots: duration + re-fire interval from Y (iMS-20 gate %).
    this.silenceHold(time);
    const duration = Math.max(stepDur * frac * 0.92, 0.025);
    this.playVoiceOneShot(freq, time, duration, true);
    this.imsRetriggerAt = time + Math.max(duration, stepDur * frac);
  }

  private fireArpNote(time: number, duration: number): void {
    const startDegree = degreeFromXNorm(this.xNorm, this.scaleId, this.scaleOctaves);
    const chord = buildArpDegrees(
      this.rootMidi,
      this.scaleId,
      startDegree,
      this.arpOctaves,
    );
    const idx = arpChordIndex(this.arpPattern, this.arpIndex, chord.length);
    const freq = chord[idx] ?? this.freqFromDegree(startDegree);
    this.arpIndex += 1;
    this.playVoiceOneShot(freq, time, duration, false);
  }

  private fireGateNote(time: number, duration: number): void {
    const freq = this.freqFromDegree(
      degreeFromXNorm(this.xNorm, this.scaleId, this.scaleOctaves),
    );
    this.playVoiceOneShot(freq, time, duration, false);
  }

  private freqFromDegree(degree: number): number {
    return midiToHz(midiFromDegree(this.rootMidi, this.scaleId, degree));
  }

  /** Independent voice — avoids shared-amp automation fights. */
  private playVoiceOneShot(
    freq: number,
    time: number,
    duration: number,
    imsGate: boolean,
  ): void {
    const f = Math.max(freq, 20);
    const releaseAt = time + Math.max(duration, 0.024);

    if (this.voice === 'ms20') {
      this.playMs20OneShot(f, time, duration, releaseAt, imsGate);
      return;
    }

    if (this.voice === 'pulse') {
      this.playPulseOneShot(f, time, duration, releaseAt);
      return;
    }

    const osc = this.ctx.createOscillator();
    osc.type = oscTypeForVoice(this.voice);
    osc.frequency.setValueAtTime(f, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = this.voice === 'sine' ? 0.7 : imsGate ? 6.5 : 2.4;
    const cutoffMul = this.voice === 'sine' ? 3.2 : imsGate ? 7.5 : 5.5;
    filter.frequency.setValueAtTime(Math.min(Math.max(f * cutoffMul, 200), 5200), time);
    if (imsGate && this.voice !== 'sine') {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(f * 1.6, 160),
        time + Math.max(duration * 0.7, 0.04),
      );
    }

    const gain = this.ctx.createGain();
    const peak = this.voice === 'sine' ? 1.05 : 0.95;
    const attack = 0.004;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    osc.start(time);
    osc.stop(releaseAt + 0.03);
  }

  private playMs20OneShot(
    f: number,
    time: number,
    duration: number,
    releaseAt: number,
    aggressive: boolean,
  ): void {
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
    hp.Q.value = aggressive ? 3.4 : 2.2;
    hp.frequency.setValueAtTime(Math.min(f * 0.85, 900), time);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = aggressive ? 9.5 : 5.5;
    lp.frequency.setValueAtTime(Math.min(f * 7.5, 4800), time);
    lp.frequency.exponentialRampToValueAtTime(
      Math.max(f * 1.8, 180),
      time + Math.max(duration * 0.7, 0.04),
    );

    const gain = this.ctx.createGain();
    const peak = 0.92;
    const attack = 0.003;
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

  private playPulseOneShot(
    f: number,
    time: number,
    duration: number,
    releaseAt: number,
  ): void {
    const merge = this.ctx.createGain();
    merge.gain.value = 0.85;

    const a = this.ctx.createOscillator();
    a.type = 'square';
    a.frequency.setValueAtTime(f, time);

    const b = this.ctx.createOscillator();
    b.type = 'square';
    b.frequency.setValueAtTime(f * 2.01, time);
    const bGain = this.ctx.createGain();
    bGain.gain.value = 0.35;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4.2;
    filter.frequency.setValueAtTime(Math.min(f * 6, 4000), time);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(f * 2.2, 220),
      time + Math.max(duration * 0.55, 0.03),
    );

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.95, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);

    a.connect(merge);
    b.connect(bGain);
    bGain.connect(merge);
    merge.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    a.start(time);
    b.start(time);
    a.stop(releaseAt + 0.03);
    b.stop(releaseAt + 0.03);
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
      this.applyHoldVoiceShape(this.ctx.currentTime);
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.connect(this.filter);
    osc.start();
    this.osc = osc;
    this.applyHoldVoiceShape(this.ctx.currentTime);
  }

  private applyHoldVoiceShape(time: number): void {
    if (!this.osc) {
      return;
    }
    this.osc.type = oscTypeForVoice(this.voice);
    this.filter.Q.setValueAtTime(holdFilterQ(this.voice, false), time);

    const needsB = this.voice === 'ms20' || this.voice === 'pulse';
    if (needsB && !this.oscB) {
      const oscB = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      g.gain.value = this.voice === 'ms20' ? 0.7 : 0.35;
      oscB.connect(g);
      g.connect(this.filter);
      oscB.start();
      this.oscB = oscB;
    }
    if (!needsB && this.oscB) {
      try {
        this.oscB.stop();
      } catch {
        // already stopped
      }
      this.oscB.disconnect();
      this.oscB = null;
    }
    if (this.oscB) {
      this.oscB.type = 'square';
    }
  }

  private teardownHoldOsc(): void {
    if (this.osc) {
      try {
        this.osc.stop();
      } catch {
        // already stopped
      }
      this.osc.disconnect();
      this.osc = null;
    }
    if (this.oscB) {
      try {
        this.oscB.stop();
      } catch {
        // already stopped
      }
      this.oscB.disconnect();
      this.oscB = null;
    }
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
    const degree = degreeFromXNorm(xNorm, this.scaleId, this.scaleOctaves);
    const freq = this.freqFromDegree(degree);
    const y = clamp01(yNorm);
    const cutoff =
      this.voice === 'sine'
        ? 180 + (1 - y) * 2400
        : 220 + (1 - y) * 6800;
    this.lastDegree = degree;

    if (snap) {
      this.osc.frequency.setValueAtTime(freq, time);
      if (this.oscB) {
        this.oscB.frequency.setValueAtTime(freq * detuneRatio(this.voice), time);
      }
      this.filter.frequency.setValueAtTime(cutoff, time);
    } else {
      this.osc.frequency.setTargetAtTime(freq, time, 0.012);
      if (this.oscB) {
        this.oscB.frequency.setTargetAtTime(freq * detuneRatio(this.voice), time, 0.012);
      }
      this.filter.frequency.setTargetAtTime(cutoff, time, 0.018);
    }
  }
}

function oscTypeForVoice(voice: SynthVoiceId): OscillatorType {
  switch (voice) {
    case 'square':
    case 'pulse':
      return 'square';
    case 'sine':
      return 'sine';
    case 'ms20':
    case 'saw':
    default:
      return 'sawtooth';
  }
}

function detuneRatio(voice: SynthVoiceId): number {
  return voice === 'pulse' ? 2.01 : 1.003;
}

function holdFilterQ(voice: SynthVoiceId, imsLegato: boolean): number {
  if (voice === 'sine') {
    return 0.8;
  }
  if (voice === 'ms20') {
    return imsLegato ? 8.5 : 5.5;
  }
  if (voice === 'pulse') {
    return 4.5;
  }
  if (voice === 'square') {
    return 3.8;
  }
  return 3.2;
}

function holdCutoffMul(voice: SynthVoiceId, imsLegato: boolean): number {
  if (voice === 'sine') {
    return 3.5;
  }
  if (voice === 'ms20') {
    return imsLegato ? 8 : 6;
  }
  return 6;
}

/** Top of pad = ARP_OCT_MAX, bottom = ARP_OCT_MIN. */
function octaveSpanFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  const span = ARP_OCT_MAX - ARP_OCT_MIN + 1;
  return Math.min(ARP_OCT_MAX, ARP_OCT_MIN + Math.floor((1 - y) * span));
}

function yNormFromArpOctaves(octaves: number): number {
  const clamped = clampArpOctaves(octaves);
  const span = ARP_OCT_MAX - ARP_OCT_MIN;
  if (span <= 0) {
    return 0.5;
  }
  // Center of the band for this octave count (top = more octaves).
  return 1 - (clamped - ARP_OCT_MIN + 0.5) / (span + 1);
}

function clampArpOctaves(octaves: number): number {
  return Math.min(ARP_OCT_MAX, Math.max(ARP_OCT_MIN, Math.round(octaves)));
}

function arpSixteenths(rate: ArpRate): number {
  return ARP_RATES.find((r) => r.id === rate)?.sixteenths ?? 1;
}

function arpNoteDuration(stepDur: number, rate: ArpRate): number {
  const sixteenths = arpSixteenths(rate);
  const hitDur = stepDur * (sixteenths >= 1 ? sixteenths : 0.5);
  return hitDur * 0.7;
}

/** Map step counter → index in the chord for Logic-style directions. */
function arpChordIndex(pattern: ArpPattern, step: number, length: number): number {
  if (length <= 1) {
    return 0;
  }
  if (pattern === 'random') {
    return Math.floor(Math.random() * length);
  }
  if (pattern === 'up') {
    return step % length;
  }
  if (pattern === 'down') {
    return (length - 1 - (step % length) + length) % length;
  }

  // Bounce without doubling the turning points: 0..n-1..1 then repeat.
  const period = (length - 1) * 2;
  const pos = ((step % period) + period) % period;
  if (pattern === 'upDown') {
    return pos < length ? pos : period - pos;
  }
  // downUp: mirror of upDown.
  const upIdx = pos < length ? pos : period - pos;
  return length - 1 - upIdx;
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
