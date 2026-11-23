import { RegionId } from '../types/game';

export class AcousticEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private streamGain: GainNode | null = null;
  private hearthGain: GainNode | null = null;
  private muted = false;
  private initialized = false;
  private musicTimer = 0;
  private breathTimer = 0;
  private noteIndex = 0;

  // Authentic Anatolian Hijaz / Hüseyni modal frequencies (D3 base)
  private readonly anatolianScale = [
    146.83, // D3
    155.56, // Eb3 (Hijaz)
    185.0,  // F#3
    196.0,  // G3
    220.0,  // A3
    233.08, // Bb3
    261.63, // C4
    293.66, // D4
  ];

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.72;
    this.masterGain.connect(this.ctx.destination);

    // 3-second organic pink-ish noise buffer
    const sampleRate = this.ctx.sampleRate;
    const len = sampleRate * 3;
    this.noiseBuffer = this.ctx.createBuffer(1, len, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    this.startAmbientLayers();
    this.initialized = true;
  }

  private startAmbientLayers(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    // 1. Mountain Wind
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 340;
    this.windFilter.Q.value = 1.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.09;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSrc.start();

    // 2. Alpine Creek Stream
    const streamSrc = this.ctx.createBufferSource();
    streamSrc.buffer = this.noiseBuffer;
    streamSrc.loop = true;
    const streamFilter = this.ctx.createBiquadFilter();
    streamFilter.type = 'bandpass';
    streamFilter.frequency.value = 1050;
    streamFilter.Q.value = 0.7;
    this.streamGain = this.ctx.createGain();
    this.streamGain.gain.value = 0.06;
    streamSrc.connect(streamFilter);
    streamFilter.connect(this.streamGain);
    this.streamGain.connect(this.masterGain);
    streamSrc.start();

    // 3. Forge Hearth Crackle Bed
    const hearthSrc = this.ctx.createBufferSource();
    hearthSrc.buffer = this.noiseBuffer;
    hearthSrc.loop = true;
    const hearthFilter = this.ctx.createBiquadFilter();
    hearthFilter.type = 'lowpass';
    hearthFilter.frequency.value = 260;
    this.hearthGain = this.ctx.createGain();
    this.hearthGain.gain.value = 0.08;
    hearthSrc.connect(hearthFilter);
    hearthFilter.connect(this.hearthGain);
    this.hearthGain.connect(this.masterGain);
    hearthSrc.start();
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.72, this.ctx.currentTime, 0.06);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateAmbience(
    dt: number,
    region: RegionId,
    hearthHeatNorm: number,
    distFromKeep: number,
    staminaRatio: number,
    healthRatio: number,
    inCombat: boolean
  ): void {
    if (!this.ctx || !this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    // Spatial wind & stream tuning by Toros region
    const isPeak = region === 'eagles_crag';
    const isMine = region === 'ore_mines';
    const targetWind = isPeak ? 0.28 : isMine ? 0.02 : 0.09 + Math.sin(now * 0.4) * 0.03;
    const targetWindFreq = isPeak ? 580 + Math.sin(now * 0.9) * 140 : 320 + Math.sin(now * 0.5) * 60;
    const streamProximity = Math.max(0, 1 - distFromKeep / 48);
    const targetStream = isMine ? 0.005 : 0.015 + streamProximity * 0.09;
    const targetHearth = isMine ? 0 : Math.max(0, 1 - distFromKeep / 22) * (0.04 + hearthHeatNorm * 0.12);

    this.windGain?.gain.setTargetAtTime(targetWind, now, 0.25);
    this.windFilter?.frequency.setTargetAtTime(targetWindFreq, now, 0.25);
    this.streamGain?.gain.setTargetAtTime(targetStream, now, 0.25);
    this.hearthGain?.gain.setTargetAtTime(targetHearth, now, 0.25);

    // Diegetic breathing & heartbeat when stamina or health is low
    if (staminaRatio < 0.45 || healthRatio < 0.45) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.playBreath(1 - Math.min(staminaRatio, healthRatio));
        this.breathTimer = 0.65 + staminaRatio * 0.7;
      }
    }

    // Subtle organic Anatolian Kopuz / Bağlama + Davul pulse
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      const freq = this.anatolianScale[this.noteIndex % this.anatolianScale.length];
      this.playKopuzPluck(freq, inCombat ? 0.14 : 0.075);
      if (inCombat && this.noteIndex % 2 === 0) {
        this.playDavulPulse(0.18);
      }
      // Authentic asymmetric Anatolian Aksak rhythm feel (7/8 or 9/8 cadence)
      const pattern = [0.65, 0.45, 0.85, 0.45, 0.65, 1.1, 0.5];
      const baseStep = pattern[this.noteIndex % pattern.length];
      this.musicTimer = inCombat ? baseStep * 0.72 : baseStep * 2.1;
      this.noteIndex = (this.noteIndex + 1 + (Math.random() > 0.65 ? 2 : 0)) % this.anatolianScale.length;
    }
  }

  private playKopuzPluck(freq: number, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Two slightly detuned strings (double-course bağlama/kopuz)
    [0, 1.004].forEach((ratio) => {
      if (!this.ctx || !this.masterGain) return;
      const f = ratio === 0 ? freq : freq * ratio;
      const osc = this.ctx.createOscillator();
      const harm = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      harm.type = 'sine';
      harm.frequency.setValueAtTime(f * 2, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 1.1);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);

      osc.connect(filter);
      harm.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      harm.start(now);
      osc.stop(now + 1.5);
      harm.stop(now + 1.5);
    });
  }

  private playDavulPulse(volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(98, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  private playBreath(intensity: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620, now);
    filter.Q.value = 2.4;
    const gain = this.ctx.createGain();
    const peak = 0.06 + intensity * 0.14;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, Math.random() * 1.5, 0.45);
  }

  public playAnvilStrike(tempNorm: number, power = 1, zoneIdx = 1): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Hot metal dampens ringing pitch slightly; cool steel rings crisp & bright
    const pitchScale = (1.06 - tempNorm * 0.18) * (0.94 + zoneIdx * 0.045);
    const partials = [
      { f: 640 * pitchScale, g: 0.28 * power, d: 0.95 },
      { f: 1410 * pitchScale, g: 0.22 * power, d: 0.72 },
      { f: 2380 * pitchScale, g: 0.16 * power, d: 0.55 },
      { f: 3690 * pitchScale, g: 0.1 * power, d: 0.35 },
    ];

    partials.forEach((p) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.f, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(p.g, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.d);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + p.d + 0.02);
    });

    // Hammer thud transient
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.35 * power, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(now, Math.random(), 0.1);
    }
  }

  public playBellowsPull(): void {
    this.init();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(520, now + 0.35);
    filter.frequency.exponentialRampToValueAtTime(190, now + 0.85);
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.34, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, Math.random() * 1.2, 0.95);
  }

  public playQuenchSizzle(tempNorm: number): void {
    this.init();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(3800, now + 0.4);
    filter.frequency.exponentialRampToValueAtTime(900, now + 1.5);

    const gain = this.ctx.createGain();
    const vol = 0.18 + tempNorm * 0.32;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, 0.2, 1.65);
  }

  public playSwordSwing(sharpness: number): void {
    this.init();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseF = 480 + sharpness * 620;
    filter.frequency.setValueAtTime(baseF * 0.6, now);
    filter.frequency.exponentialRampToValueAtTime(baseF * 1.5, now + 0.11);
    filter.frequency.exponentialRampToValueAtTime(baseF * 0.4, now + 0.24);
    filter.Q.value = 1.8 + sharpness * 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, Math.random(), 0.28);
  }

  public playParryClang(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [920, 1780, 2940, 4420].forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.24 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65 - idx * 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.7);
    });
  }

  public playArmorImpact(weakPoint: boolean): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(weakPoint ? 420 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.16);
    g.gain.setValueAtTime(weakPoint ? 0.32 : 0.22, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);

    if (weakPoint) {
      this.playParryClang();
    }
  }

  public playPickaxeOre(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [1340, 2680].forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(0.18 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  public playCatapultRelease(): void {
    this.init();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    this.playDavulPulse(0.45);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now, 0, 0.55);
  }

  public playGearRepair(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [320, 480, 640].forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.06);
      g.gain.setValueAtTime(0.14, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.14);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.15);
    });
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
