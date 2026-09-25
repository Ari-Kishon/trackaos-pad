import { midiToHz } from './presets';

/** Minor pentatonic MIDI range mapped across pad X. */
const PAD_NOTES = [48, 51, 53, 55, 58, 60, 63, 65, 67, 70, 72] as const;

/** Scale-degree offsets from the X root for the arp chord. */
const ARP_OFFSETS = [0, 2, 4, 6] as const;

/** Steps between triggers, top→bottom of pad (fast → slow). */
const RATE_STEPS = [0.5, 1, 2, 4] as const;

export type PadMode = 'hold' | 'arp' | 'gate';

export const PAD_MODES: readonly { id: PadMode; label: string }[] = [
  { id: 'hold', label: 'HOLD' },
  { id: 'arp', label: 'ARP' },
  { id: 'gate', label: 'GATE' },
] as const;

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
  private arpIndex = 0;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.4;
    this.output.connect(destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2.5;
    this.filter.frequency.value = 1200;

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
      this.setPitchFilter(this.xNorm, 0.35, this.ctx.currentTime, false);
    }
  }

  noteOff(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.silence(this.ctx.currentTime);
  }

  /**
   * Transport sixteenth-note tick. Drives ARP and GATE while the pad is held.
   */
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
    // Double-time: two hits per sixteenth.
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
      this.openAmp(now, 0.85, 0.02);
      return;
    }

    // Arp/gate wait for the next transport tick; keep amp closed until then.
    this.setPitchFilter(xNorm, 0.35, now, true);
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(0.0001, now);
  }

  private fireRhythmEvent(time: number, noteDur: number): void {
    this.ensureOsc();
    if (this.mode === 'arp') {
      const chord = chordFromX(this.xNorm);
      const midi = chord[this.arpIndex % chord.length] ?? 60;
      this.arpIndex += 1;
      const freq = midiToHz(midi);
      if (this.osc) {
        this.osc.frequency.setValueAtTime(freq, time);
      }
      this.filter.frequency.setValueAtTime(1800, time);
      this.pluckAmp(time, noteDur);
      return;
    }

    // gate
    this.setPitchFilter(this.xNorm, 0.35, time, true);
    this.pluckAmp(time, noteDur * 0.85);
  }

  private openAmp(time: number, peak: number, attack: number): void {
    this.amp.gain.cancelScheduledValues(time);
    this.amp.gain.setValueAtTime(Math.max(this.amp.gain.value, 0.0001), time);
    this.amp.gain.exponentialRampToValueAtTime(peak, time + attack);
  }

  private pluckAmp(time: number, duration: number): void {
    const peak = 0.85;
    const attack = 0.008;
    const release = Math.max(duration - attack, 0.02);
    // Do not cancelScheduledValues here — lookahead may queue multiple hits.
    this.amp.gain.setValueAtTime(0.0001, time);
    this.amp.gain.exponentialRampToValueAtTime(peak, time + attack);
    this.amp.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
  }

  private silence(time: number): void {
    this.amp.gain.cancelScheduledValues(time);
    this.amp.gain.setValueAtTime(Math.max(this.amp.gain.value, 0.0001), time);
    this.amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
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
    const cutoff = 280 + (1 - clamp01(yNorm)) * 5200;
    this.setPitchFilter(xNorm, clamp01(yNorm), time, snap, cutoff);
  }

  private setPitchFilter(
    xNorm: number,
    yNorm: number,
    time: number,
    snap: boolean,
    cutoffOverride?: number,
  ): void {
    const x = clamp01(xNorm);
    const noteIndex = Math.min(PAD_NOTES.length - 1, Math.floor(x * PAD_NOTES.length));
    const midi = PAD_NOTES[noteIndex] ?? 60;
    const freq = midiToHz(midi);
    const cutoff = cutoffOverride ?? 280 + (1 - clamp01(yNorm)) * 5200;

    if (!this.osc) {
      return;
    }

    if (snap) {
      this.osc.frequency.setValueAtTime(freq, time);
      this.filter.frequency.setValueAtTime(cutoff, time);
    } else {
      this.osc.frequency.setTargetAtTime(freq, time, 0.03);
      this.filter.frequency.setTargetAtTime(cutoff, time, 0.04);
    }
  }
}

function chordFromX(xNorm: number): number[] {
  const rootIdx = Math.min(
    PAD_NOTES.length - 1,
    Math.floor(clamp01(xNorm) * PAD_NOTES.length),
  );
  return ARP_OFFSETS.map((offset) => {
    const idx = Math.min(PAD_NOTES.length - 1, rootIdx + offset);
    return PAD_NOTES[idx] ?? 60;
  });
}

function rateFromY(yNorm: number): number {
  const y = clamp01(yNorm);
  const idx = Math.min(RATE_STEPS.length - 1, Math.floor(y * RATE_STEPS.length));
  return RATE_STEPS[idx] ?? 1;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
