// Sonido de ¡Oído, Cocina!, sintetizado con Web Audio (sin archivos que cargar ni mapear en Discord).
// Estilo: marimba y campanillas suaves, cálido y minimalista, con una música tranquila que se
// acelera en la hora punta (últimos segundos de la ronda).

export type Sfx =
  | 'pick'
  | 'drop'
  | 'cooked'
  | 'filled'
  | 'warn'
  | 'burnt'
  | 'part'
  | 'served'
  | 'perfect'
  | 'coin'
  | 'wrong'
  | 'lost'
  | 'newOrder'
  | 'taken'
  | 'denied'
  | 'given'
  | 'trash'
  | 'tick'
  | 'click'
  | 'start'
  | 'levelUp'
  | 'runOver'
  | 'perk';

export type MusicMode = 'menu' | 'kitchen' | null;

/** Todo, solo efectos, o nada. */
export type SoundSetting = 'todo' | 'efectos' | 'nada';

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Fa mayor: Fmaj7 · Rem7 · Sibmaj7 · Do (I-vi-IV-V), un acorde por compás.
const CHORDS: { bass: number; tones: number[] }[] = [
  { bass: 41, tones: [53, 57, 60, 64] },
  { bass: 38, tones: [50, 53, 57, 60] },
  { bass: 46, tones: [53, 57, 58, 62] },
  { bass: 36, tones: [52, 55, 60, 62] },
];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
// Melodía de 8 compases en pentatónica de fa (corcheas; -1 = silencio).
const MELODY = [
  72, -1, 74, 72, 69, -1, -1, -1,
  69, -1, 72, 69, 67, -1, 65, -1,
  67, -1, 69, 72, 74, -1, 72, -1,
  74, -1, -1, 72, 79, -1, -1, -1,
  77, -1, 74, 72, 74, -1, 72, -1,
  69, -1, 72, -1, 74, 72, 69, -1,
  67, -1, 65, 67, 69, -1, 72, -1,
  67, -1, 69, -1, 67, -1, -1, -1,
];
// Escala para el sonido de apilar: cada capa, una nota más aguda.
const STACK_NOTES = [72, 74, 77, 79, 81, 84, 86, 89, 91, 93, 96, 98];

class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private sizzle?: { gain: GainNode };
  private bubble?: { gain: GainNode };

  setting: SoundSetting = load();
  private mode: MusicMode = null;
  private intensity = 0;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  /** Los navegadores solo dejan sonar después de un toque o una tecla. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = (this.ctx = new Ctx());
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      // Un compresor suave para que nada pegue picos.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.buildAmbience();
      this.applySetting();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.mode && this.timer === null) this.startScheduler();
  }

  /** Cambia entre todo → solo efectos → nada. */
  cycleSetting(): SoundSetting {
    this.setting = this.setting === 'todo' ? 'efectos' : this.setting === 'efectos' ? 'nada' : 'todo';
    save(this.setting);
    this.applySetting();
    return this.setting;
  }

  private applySetting(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.setting === 'nada' ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.setting === 'todo' ? 1 : 0, t, 0.1);
  }

  // ---------------------------------------------------------------- música

  music(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    if (!mode) {
      this.stopScheduler();
      return;
    }
    if (this.ctx && this.timer === null) this.startScheduler();
  }

  /** 0 = tranquilo; 1 = hora punta (más rápido y con platillo). */
  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  private startScheduler(): void {
    if (!this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  private stopScheduler(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.mode) return;
    const kitchen = this.mode === 'kitchen';
    const bpm = kitchen ? 92 + 22 * this.intensity : 76;
    const eighth = 60 / bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const t = this.nextTime;
      const s = this.step;
      const bar = Math.floor(s / 8);
      const chord = CHORDS[bar % CHORDS.length];
      const beat = s % 8;
      if (beat === 0 || beat === 4) this.tone(midi(chord.bass + (beat === 4 ? 7 : 0)), t, eighth * 3.5, 0.11, 'sine', this.musicBus);
      // Arpegio suave (en el menú, solo en los tiempos fuertes)
      if (kitchen || beat % 2 === 0) this.pluck(midi(chord.tones[ARP[beat]]), t, eighth * 2, kitchen ? 0.045 : 0.04, this.musicBus);
      if (kitchen) {
        const note = MELODY[s % MELODY.length];
        if (note > 0) this.marimba(midi(note), t, 0.055, this.musicBus);
        if (this.intensity > 0.5 && beat % 2 === 1) this.noise(t, 0.03, 0.025, 7000, 'highpass', this.musicBus);
      }
      this.nextTime += eighth;
      this.step++;
    }
  }

  // ---------------------------------------------------------------- ambiente

  private buildAmbience(): void {
    const ctx = this.ctx!;
    const mk = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.sfxBus);
      src.start();
      return { gain, f };
    };
    // Chisporroteo de la plancha: ruido agudo que tiembla.
    const sizzle = mk('bandpass', 4200, 0.8);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 1800;
    lfo.connect(lfoGain).connect(sizzle.f.frequency);
    lfo.start();
    this.sizzle = sizzle;
    // Burbujeo de la freidora: ruido grave.
    this.bubble = mk('lowpass', 500, 4);
  }

  /** Cuántas planchas y freidoras están en marcha (el volumen del ambiente sube con ellas). */
  setAmbience(grills: number, fryers: number): void {
    if (!this.ctx || !this.sizzle || !this.bubble) return;
    const t = this.ctx.currentTime;
    this.sizzle.gain.gain.setTargetAtTime(Math.min(3, grills) * 0.018, t, 0.2);
    this.bubble.gain.gain.setTargetAtTime(Math.min(2, fryers) * 0.05, t, 0.2);
  }

  // ---------------------------------------------------------------- efectos

  sfx(name: Sfx, n = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.setting === 'nada') return;
    const t = ctx.currentTime + 0.005;
    const bus = this.sfxBus;
    switch (name) {
      case 'pick':
        this.tone(520, t, 0.07, 0.12, 'sine', bus, 820);
        break;
      case 'drop':
        this.tone(300, t, 0.08, 0.13, 'sine', bus, 190);
        break;
      case 'cooked':
        this.bell(midi(84), t, 0.12);
        this.bell(midi(91), t + 0.09, 0.1);
        break;
      case 'filled':
        [0, 0.05, 0.1].forEach((d, i) => this.tone(500 + i * 220, t + d, 0.04, 0.07, 'sine', bus, 700 + i * 220));
        break;
      case 'warn':
        this.tone(1250, t, 0.03, 0.06, 'square', bus, undefined, 2500);
        break;
      case 'burnt':
        this.noise(t, 0.4, 0.12, 900, 'bandpass', bus);
        this.tone(220, t, 0.35, 0.12, 'triangle', bus, 100);
        break;
      case 'part':
        this.marimba(midi(81 + n), t, 0.16, bus);
        break;
      case 'served':
        [72, 76, 79, 84].forEach((m, i) => this.marimba(midi(m), t + i * 0.06, 0.15, bus));
        break;
      case 'perfect':
        [72, 76, 79, 84].forEach((m, i) => this.marimba(midi(m), t + i * 0.06, 0.15, bus));
        this.bell(midi(91), t + 0.26, 0.09);
        this.bell(midi(96), t + 0.32, 0.06);
        break;
      case 'coin':
        this.bell(midi(88), t, 0.1);
        this.bell(midi(95), t + 0.07, 0.09);
        break;
      case 'wrong':
        this.tone(220, t, 0.13, 0.12, 'triangle', bus, undefined, 900);
        this.tone(207, t + 0.13, 0.2, 0.12, 'triangle', bus, undefined, 900);
        break;
      case 'lost':
        [76, 72, 67].forEach((m, i) => this.marimba(midi(m), t + i * 0.14, 0.14, bus));
        break;
      case 'newOrder':
        this.bell(midi(88), t, 0.08);
        this.bell(midi(84), t + 0.16, 0.08);
        break;
      case 'taken':
        this.noise(t, 0.03, 0.05, 5000, 'highpass', bus);
        this.noise(t + 0.06, 0.03, 0.05, 5000, 'highpass', bus);
        this.pluck(midi(86), t + 0.1, 0.12, 0.08, bus);
        break;
      case 'denied':
        this.tone(160, t, 0.09, 0.08, 'square', bus, undefined, 600);
        break;
      case 'given':
        this.tone(midi(76), t, 0.1, 0.1, 'triangle', bus, midi(83));
        break;
      case 'trash':
        this.noise(t, 0.15, 0.1, 400, 'lowpass', bus);
        this.tone(130, t, 0.12, 0.1, 'sine', bus, 80);
        break;
      case 'tick':
        this.tone(1000, t, 0.03, 0.07, 'sine', bus);
        this.tone(1500, t, 0.02, 0.04, 'sine', bus);
        break;
      case 'click':
        this.pluck(midi(84), t, 0.05, 0.06, bus);
        break;
      case 'start':
        [84, 88, 91].forEach((m, i) => this.bell(midi(m), t + i * 0.08, 0.08));
        break;
      case 'levelUp':
        [72, 76, 79, 84, 88].forEach((m, i) => this.marimba(midi(m), t + i * 0.08, 0.15, bus));
        [84, 88, 91].forEach((m) => this.bell(midi(m), t + 0.45, 0.07));
        break;
      case 'runOver':
        [76, 74, 72, 67, 65].forEach((m, i) => this.marimba(midi(m), t + i * 0.18, 0.13, bus));
        break;
      case 'perk':
        [91, 96, 100, 103].forEach((m, i) => this.bell(midi(m), t + i * 0.05, 0.06));
        break;
    }
  }

  /** Apilar una capa: cada una suena un poco más aguda. */
  stack(height: number): void {
    if (!this.ctx || this.setting === 'nada') return;
    this.marimba(midi(STACK_NOTES[Math.min(STACK_NOTES.length - 1, height)]), this.ctx.currentTime + 0.005, 0.14, this.sfxBus);
  }

  // ---------------------------------------------------------------- instrumentos

  private env(t: number, dur: number, vol: number, attack = 0.005): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private tone(
    freq: number,
    t: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    bus: AudioNode,
    slideTo?: number,
    lowpass?: number,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.env(t, dur, vol);
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      o.connect(f).connect(g);
    } else o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Marimba: fundamental redonda y un parcial agudo que se apaga enseguida. */
  private marimba(freq: number, t: number, vol: number, bus: AudioNode): void {
    this.tone(freq, t, 0.45, vol, 'sine', bus);
    this.tone(freq * 4, t, 0.06, vol * 0.25, 'sine', bus);
  }

  /** Campanilla: parciales inarmónicos con cola larga. */
  private bell(freq: number, t: number, vol: number): void {
    this.tone(freq, t, 0.9, vol, 'sine', this.sfxBus);
    this.tone(freq * 2.01, t, 0.5, vol * 0.35, 'sine', this.sfxBus);
    this.tone(freq * 3.02, t, 0.25, vol * 0.15, 'sine', this.sfxBus);
  }

  /** Cuerda pulsada suave (triangular con filtro que se cierra). */
  private pluck(freq: number, t: number, dur: number, vol: number, bus: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + dur);
    const g = this.env(t, dur + 0.15, vol);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  private noise(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, bus: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.env(t, dur, vol, 0.003);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

function load(): SoundSetting {
  try {
    const v = localStorage.getItem('horaPunta.sonido');
    if (v === 'todo' || v === 'efectos' || v === 'nada') return v;
  } catch {
    // sin almacenamiento
  }
  return 'todo';
}

function save(v: SoundSetting): void {
  try {
    localStorage.setItem('horaPunta.sonido', v);
  } catch {
    // sin almacenamiento
  }
}

export const audio = new GameAudio();
