// Tiny procedural sound engine (no audio assets required)
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = false;

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.ctx.resume?.();
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', q = 0.7, delay = 0, freqEnd?: number) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  rifle() {
    this.noise(0.14, 0.7, 4200, 'lowpass', 0.8, 0, 900);
    this.noise(0.04, 0.35, 7000, 'highpass');
    this.tone(180, 45, 0.13, 0.6, 'sine');
  }
  shotgun() {
    this.noise(0.45, 1.0, 3000, 'lowpass', 0.7, 0, 400);
    this.noise(0.08, 0.5, 6000, 'highpass');
    this.tone(120, 30, 0.35, 0.9, 'sine');
    this.noise(0.05, 0.4, 1800, 'bandpass', 3, 0.42); // pump
    this.noise(0.05, 0.4, 1200, 'bandpass', 3, 0.52);
  }
  reload(long = false) {
    this.noise(0.04, 0.5, 2500, 'bandpass', 4, 0.1);
    this.noise(0.05, 0.6, 1500, 'bandpass', 4, long ? 0.9 : 0.7);
    this.tone(500, 300, 0.05, 0.15, 'square', long ? 1.2 : 1.0);
  }
  empty() {
    this.noise(0.03, 0.4, 3000, 'bandpass', 5);
  }
  switchWeapon() {
    this.noise(0.05, 0.35, 2000, 'bandpass', 3);
    this.noise(0.04, 0.3, 1000, 'bandpass', 3, 0.09);
  }
  hit() {
    this.tone(1300, 900, 0.05, 0.25, 'square');
  }
  headshot() {
    this.tone(1900, 1400, 0.09, 0.3, 'square');
    this.tone(2800, 2200, 0.12, 0.18, 'sine', 0.03);
  }
  kill() {
    this.tone(700, 1400, 0.12, 0.28, 'triangle');
    this.tone(1000, 2000, 0.16, 0.2, 'triangle', 0.07);
  }
  enemyDie(vol = 1) {
    this.noise(0.4, 0.5 * vol, 1500, 'lowpass', 1, 0, 150);
    this.tone(220, 40, 0.35, 0.35 * vol, 'sawtooth');
  }
  enemyShot(vol = 1) {
    this.tone(900, 200, 0.22, 0.3 * vol, 'sawtooth');
    this.noise(0.12, 0.25 * vol, 2500, 'bandpass', 2, 0, 600);
  }
  enemyCharge(vol = 1) {
    this.tone(300, 900, 0.35, 0.1 * vol, 'sine');
  }
  melee() {
    this.noise(0.15, 0.6, 600, 'lowpass');
    this.tone(120, 60, 0.15, 0.5, 'square');
  }
  hurt() {
    this.tone(150, 60, 0.25, 0.7, 'sawtooth');
    this.noise(0.2, 0.6, 900, 'lowpass');
  }
  pickup() {
    this.tone(520, 520, 0.08, 0.25, 'triangle');
    this.tone(780, 780, 0.12, 0.25, 'triangle', 0.08);
  }
  wave() {
    this.tone(220, 220, 0.25, 0.3, 'sawtooth');
    this.tone(330, 330, 0.25, 0.3, 'sawtooth', 0.18);
    this.tone(440, 440, 0.45, 0.3, 'sawtooth', 0.36);
  }
  clear() {
    this.tone(523, 523, 0.15, 0.25, 'triangle');
    this.tone(659, 659, 0.15, 0.25, 'triangle', 0.13);
    this.tone(784, 784, 0.15, 0.25, 'triangle', 0.26);
    this.tone(1046, 1046, 0.35, 0.25, 'triangle', 0.39);
  }
  jump() {
    this.noise(0.08, 0.15, 800, 'bandpass', 1);
  }
  land() {
    this.noise(0.1, 0.3, 300, 'lowpass');
  }
  over() {
    this.tone(300, 40, 1.2, 0.6, 'sawtooth');
    this.noise(1.0, 0.5, 800, 'lowpass', 1, 0, 80);
  }
}
