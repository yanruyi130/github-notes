import { Ambience } from './ambience';
import type { WeatherId } from './config';

export type AudioBands = { low: number; high: number };
export type Playable = { id: string; title: string; source: 'local' | 'builtin' };
export type AudioTrack = Playable & { file: Blob | string };

export const initialPlayback = { playing: false, progress: 0, duration: 0, error: '' };
export type Playback = typeof initialPlayback;

type Slot = {
  audio: HTMLAudioElement;
  objectUrl?: string;
  source?: MediaElementAudioSourceNode;
  fade?: GainNode;
  level: number;
  levelFrame?: number;
};

const fadeSeconds = 0.35;
const limit = (value: number) => Math.min(1, Math.max(0, value));

function ramp(gain: AudioParam, value: number, context: AudioContext, seconds: number): void {
  const now = context.currentTime;
  if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
  else {
    const current = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(current, now);
  }
  gain.linearRampToValueAtTime(value, now + seconds);
}

export class AudioEngine {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private analyser?: AnalyserNode;
  private ambience?: Ambience;
  private active?: Slot;
  private retiring?: Slot;
  private retireTimer?: number;
  private analysisFrame?: number;
  private trackId?: string;
  private intent = false;
  private playRequest = 0;
  private status: Playback = initialPlayback;
  private weather: WeatherId = 'sunny';
  private musicVolume = 0.8;
  private ambientVolume = 0.08;
  private ambientEnabled = false;

  constructor(
    private readonly bands: AudioBands,
    private readonly publish: (value: Playback) => void,
    private readonly nextTrack: () => boolean,
  ) {}

  configure(weather: WeatherId, music: number, ambient: number, enabled: boolean): void {
    this.weather = weather;
    this.musicVolume = music;
    this.ambientVolume = ambient;
    this.ambientEnabled = enabled;
    if (this.musicGain && this.context) ramp(this.musicGain.gain, music, this.context, 0.08);
    if (this.active && !this.active.fade) this.applySlotVolume(this.active);
    if (this.retiring && !this.retiring.fade) this.applySlotVolume(this.retiring);
    this.configureAmbience();
  }

  activateAmbience(): void {
    this.unlockAudio();
    this.configureAmbience();
  }

  setTrack(track: AudioTrack | null): void {
    if (this.trackId === track?.id) return;
    this.trackId = track?.id;
    this.playRequest += 1;
    const previous = this.active;
    this.active = undefined;
    this.retire(previous, this.intent && track !== null);

    if (!track) {
      this.intent = false;
      this.update(initialPlayback);
      return;
    }

    const audio = new Audio();
    audio.preload = 'metadata';
    const objectUrl = typeof track.file === 'string' ? undefined : URL.createObjectURL(track.file);
    const slot: Slot = { audio, objectUrl, level: this.intent ? 0 : 1 };
    this.active = slot;
    this.attachAudioGraph(slot);
    this.applySlotVolume(slot);
    this.addListeners(slot);
    this.update({ playing: this.intent, progress: 0, duration: 0, error: '' });
    audio.src = typeof track.file === 'string' ? track.file : objectUrl!;
    if (this.intent) this.play(slot);
  }

  toggle(): void {
    const slot = this.active;
    if (!slot) return;
    if (this.intent) {
      this.intent = false;
      this.playRequest += 1;
      slot.audio.pause();
      this.retire();
      this.update({ playing: false });
      return;
    }

    this.unlockAudio();
    this.attachAudioGraph(slot);
    if (slot.audio.ended) slot.audio.currentTime = 0;
    this.intent = true;
    this.update({ playing: true, error: '' });
    this.play(slot);
  }

  seek(seconds: number): void {
    const audio = this.active?.audio;
    if (!audio || !Number.isFinite(audio.duration) || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
    this.update({ progress: audio.currentTime });
  }

  private unlockAudio(): void {
    if (!this.context) {
      const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return;
      try {
        const context = new Constructor();
        const analyser = context.createAnalyser();
        const musicGain = context.createGain();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.72;
        musicGain.gain.value = this.musicVolume;
        analyser.connect(musicGain).connect(context.destination);
        this.context = context;
        this.analyser = analyser;
        this.musicGain = musicGain;
        this.ambience = new Ambience(context);
      } catch {
        return;
      }
    }
    if (this.context.state !== 'running') {
      void this.context.resume().catch(() => {});
    }
  }

  private attachAudioGraph(slot: Slot): void {
    const context = this.context;
    if (!context || !this.analyser || slot.fade) return;
    try {
      slot.fade = context.createGain();
      slot.fade.gain.value = slot.level;
      slot.source = context.createMediaElementSource(slot.audio);
      slot.source.connect(slot.fade).connect(this.analyser);
      slot.audio.volume = 1;
    } catch {
      slot.fade?.disconnect();
      slot.fade = undefined;
    }
  }

  private play(slot: Slot): void {
    const request = ++this.playRequest;
    void slot.audio.play().catch((error: unknown) => {
      if (this.active !== slot || this.playRequest !== request) return;
      this.intent = false;
      this.finishRetirement();
      const needsGesture = error instanceof DOMException && error.name === 'NotAllowedError';
      this.update({ playing: false, error: needsGesture ? '浏览器暂停了自动切歌，请按播放继续。' : '无法播放这首曲目，请检查文件格式或选择另一首。' });
    });
  }

  private addListeners(slot: Slot): void {
    const { audio } = slot;
    const updateTime = () => {
      if (this.active !== slot) return;
      this.update({ duration: Number.isFinite(audio.duration) ? audio.duration : 0, progress: audio.currentTime });
    };
    audio.ontimeupdate = updateTime;
    audio.ondurationchange = updateTime;
    audio.onplaying = () => {
      if (this.active !== slot || !this.intent || audio.paused) return;
      this.finishRetirement();
      this.fadeSlot(slot, 1);
      this.update({ playing: true, error: '' });
      this.analyse();
    };
    audio.onpause = () => {
      if (this.active !== slot || !audio.paused || audio.ended || !this.intent) return;
      this.intent = false;
      this.update({ playing: false });
    };
    audio.onended = () => {
      if (this.active !== slot || !audio.ended) return;
      if (this.intent && this.nextTrack()) return;
      this.intent = false;
      this.update({ playing: false });
    };
    audio.onerror = () => {
      if (this.active !== slot) return;
      this.intent = false;
      this.finishRetirement();
      this.update({ playing: false, error: '无法读取曲目，请确认文件可用且浏览器支持其格式。' });
    };
  }

  private configureAmbience(): void {
    this.ambience?.configure(this.weather, this.ambientEnabled, this.ambientVolume, this.status.playing);
  }

  private update(update: Partial<Playback>): void {
    const next = { ...this.status, ...update };
    const playingChanged = this.status.playing !== next.playing;
    if (!playingChanged && this.status.progress === next.progress && this.status.duration === next.duration && this.status.error === next.error) return;
    this.status = next;
    if (playingChanged) this.configureAmbience();
    this.publish(next);
  }

  private fadeSlot(slot: Slot, target: number): void {
    if (slot.fade && this.context) {
      slot.level = target;
      ramp(slot.fade.gain, target, this.context, fadeSeconds);
      return;
    }

    if (slot.levelFrame !== undefined) cancelAnimationFrame(slot.levelFrame);
    const from = slot.level;
    if (from === target) return;
    const start = performance.now();
    const frame = (now: number) => {
      const fraction = limit((now - start) / (fadeSeconds * 1000));
      slot.level = from + (target - from) * fraction;
      this.applySlotVolume(slot);
      slot.levelFrame = fraction < 1 ? requestAnimationFrame(frame) : undefined;
    };
    slot.levelFrame = requestAnimationFrame(frame);
  }

  private applySlotVolume(slot: Slot): void {
    if (!slot.fade) slot.audio.volume = limit(slot.level * this.musicVolume);
  }

  private retire(slot?: Slot, waitForIncoming = false): void {
    window.clearTimeout(this.retireTimer);
    if (this.retiring) this.destroySlot(this.retiring);
    this.retiring = undefined;
    if (!slot) return;
    if (slot.audio.paused) {
      this.destroySlot(slot);
      return;
    }
    if (slot.fade && this.musicGain) {
      slot.fade.disconnect();
      slot.fade.connect(this.musicGain);
    }
    this.retiring = slot;
    if (waitForIncoming) this.retireTimer = window.setTimeout(() => this.finishRetirement(), 900);
    else this.finishRetirement();
  }

  private finishRetirement(): void {
    const slot = this.retiring;
    if (!slot) return;
    window.clearTimeout(this.retireTimer);
    this.fadeSlot(slot, 0);
    this.retireTimer = window.setTimeout(() => {
      this.destroySlot(slot);
      this.retiring = undefined;
    }, (fadeSeconds + 0.05) * 1000);
  }

  private destroySlot(slot: Slot): void {
    if (slot.levelFrame !== undefined) cancelAnimationFrame(slot.levelFrame);
    const { audio } = slot;
    audio.ontimeupdate = audio.ondurationchange = audio.onplaying = audio.onpause = audio.onended = audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    slot.source?.disconnect();
    slot.fade?.disconnect();
    if (slot.objectUrl) URL.revokeObjectURL(slot.objectUrl);
  }

  private analyse(): void {
    const analyser = this.analyser;
    if (!analyser || !this.context || this.analysisFrame !== undefined) return;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const binHz = this.context.sampleRate / analyser.fftSize;
    const average = (lowHz: number, highHz: number) => {
      const start = Math.max(1, Math.floor(lowHz / binHz));
      const end = Math.max(start + 1, Math.min(bins.length, Math.ceil(highHz / binHz)));
      let sum = 0;
      for (let bin = start; bin < end; bin += 1) sum += bins[bin];
      return sum / ((end - start) * 255);
    };
    const frame = () => {
      const sounding = this.intent && this.active && !this.active.audio.paused && !this.active.audio.ended;
      if (sounding) analyser.getByteFrequencyData(bins);
      const low = sounding ? limit((average(45, 240) - 0.09) * 1.15) : 0;
      const high = sounding ? limit((average(550, 3800) - 0.07) * 1.1) : 0;
      this.bands.low += (low - this.bands.low) * (low > this.bands.low ? 0.19 : 0.1);
      this.bands.high += (high - this.bands.high) * (high > this.bands.high ? 0.16 : 0.1);
      if (sounding || this.bands.low + this.bands.high > 0.002) this.analysisFrame = requestAnimationFrame(frame);
      else {
        this.bands.low = 0;
        this.bands.high = 0;
        this.analysisFrame = undefined;
      }
    };
    this.analysisFrame = requestAnimationFrame(frame);
  }

  dispose(): void {
    this.intent = false;
    this.playRequest += 1;
    window.clearTimeout(this.retireTimer);
    if (this.analysisFrame !== undefined) cancelAnimationFrame(this.analysisFrame);
    if (this.active) this.destroySlot(this.active);
    if (this.retiring) this.destroySlot(this.retiring);
    this.bands.low = 0;
    this.bands.high = 0;
    this.ambience?.dispose();
    void this.context?.close().catch(() => {});
  }
}
