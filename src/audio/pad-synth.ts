import { midiToHz } from './presets';

/** Minor pentatonic MIDI range mapped across pad X. */
const PAD_NOTES = [48, 51, 53, 55, 58, 60, 63, 65, 67, 70, 72] as const;

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

  /**
   * @param xNorm 0–1 left→right → pitch
   * @param yNorm 0–1 top→bottom → brighter when higher on pad (invert Y)
   */
  noteOn(xNorm: number, yNorm: number): void {
    const now = this.ctx.currentTime;
    this.ensureOsc();
    this.active = true;
    this.setParams(xNorm, yNorm, now, true);
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(Math.max(this.amp.gain.value, 0.0001), now);
    this.amp.gain.exponentialRampToValueAtTime(0.85, now + 0.02);
  }

  noteMove(xNorm: number, yNorm: number): void {
    if (!this.active) {
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
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(Math.max(this.amp.gain.value, 0.0001), now);
    this.amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
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
    const x = clamp01(xNorm);
    const y = clamp01(yNorm);
    const noteIndex = Math.min(
      PAD_NOTES.length - 1,
      Math.floor(x * PAD_NOTES.length),
    );
    const midi = PAD_NOTES[noteIndex] ?? 60;
    const freq = midiToHz(midi);
    const cutoff = 280 + (1 - y) * 5200;

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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
