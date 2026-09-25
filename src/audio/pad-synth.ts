/** Continuous techno-friendly pitch range across pad X (≈ A1–A4). */
const FREQ_MIN = 55;
const FREQ_MAX = 440;

export class PadSynth {
  private readonly ctx: AudioContext;
  private readonly output: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly amp: GainNode;
  private osc: OscillatorNode | null = null;
  private active = false;

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

  /**
   * @param xNorm 0–1 left→right → continuous pitch
   * @param yNorm 0–1 top→bottom → brighter when higher on pad (invert Y)
   */
  noteOn(xNorm: number, yNorm: number): void {
    const now = this.ctx.currentTime;
    this.ensureOsc();
    this.active = true;
    this.setParams(xNorm, yNorm, now, true);
    const g = this.amp.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.exponentialRampToValueAtTime(0.85, now + 0.012);
  }

  noteMove(xNorm: number, yNorm: number): void {
    if (!this.active || !this.osc) {
      return;
    }
    this.setParams(xNorm, yNorm, this.ctx.currentTime, false);
  }

  noteOff(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    const now = this.ctx.currentTime;
    const g = this.amp.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.exponentialRampToValueAtTime(0.0001, now + 0.14);
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
    const x = clamp01(xNorm);
    const y = clamp01(yNorm);
    const freq = FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** x;
    const cutoff = 220 + (1 - y) * 6800;

    if (snap) {
      this.osc.frequency.setValueAtTime(freq, time);
      this.filter.frequency.setValueAtTime(cutoff, time);
    } else {
      this.osc.frequency.setTargetAtTime(freq, time, 0.012);
      this.filter.frequency.setTargetAtTime(cutoff, time, 0.018);
    }
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
