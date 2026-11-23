import type { WeatherId } from './config';

type Voice = { stop: () => void; level: GainNode };

const tones: Record<WeatherId, { wind: number; rain: number; color: number; drift: number }> = {
  sunny: { wind: 0.73, rain: 0, color: 720, drift: 0.10 },
  cloudy: { wind: 0.82, rain: 0, color: 410, drift: 0.15 },
  rainy: { wind: 0.3, rain: 0.85, color: 710, drift: 0.21 },
  snow: { wind: 0.63, rain: 0, color: 225, drift: 0.07 },
};

function noiseBuffer(context: AudioContext, brown: boolean): AudioBuffer {
  const buffer = context.createBuffer(2, Math.floor(context.sampleRate * 5), context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    let movingAverage = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      movingAverage = (movingAverage + white * 0.024) / 1.024;
      const seam = Math.min(1, index / 512, (samples.length - 1 - index) / 512);
      samples[index] = (brown ? movingAverage * 2 : white * 0.38) * seam;
    }
  }
  return buffer;
}

/** Keeps environmental sound outside the music analyser. */
export class Ambience {
  private readonly gain: GainNode;
  private wind?: AudioBuffer;
  private rain?: AudioBuffer;
  private active?: Voice;
  private retiring?: Voice;
  private retireTimer?: number;
  private weather?: WeatherId;

  constructor(private readonly context: AudioContext) {
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(context.destination);
  }

  configure(weather: WeatherId, enabled: boolean, volume: number, duck: boolean): void {
    const now = this.context.currentTime;
    this.gain.gain.setTargetAtTime(enabled ? volume * (duck ? 0.65 : 1) : 0, now, 0.18);
    if (!enabled && !this.active) return;
    if (enabled && this.weather === weather && this.active) return;

    if (this.retiring) this.retiring.stop();
    window.clearTimeout(this.retireTimer);

    const oldVoice = this.active;
    this.weather = weather;
    this.active = enabled ? this.createVoice(weather) : undefined;
    if (this.active) this.active.level.gain.setTargetAtTime(1, now, 0.25);

    this.retiring = oldVoice;
    if (oldVoice) {
      oldVoice.level.gain.setTargetAtTime(0, now, 0.22);
      this.retireTimer = window.setTimeout(() => {
        oldVoice.stop();
        this.retiring = undefined;
      }, 1200);
    }
  }

  private createVoice(weather: WeatherId): Voice {
    const context = this.context;
    const tone = tones[weather];
    const level = context.createGain();
    level.gain.value = 0;
    level.connect(this.gain);

    this.wind ??= noiseBuffer(context, true);
    const wind = context.createBufferSource();
    wind.buffer = this.wind;
    wind.loop = true;
    const windColor = context.createBiquadFilter();
    windColor.type = 'lowpass';
    windColor.frequency.value = tone.color;
    const windVolume = context.createGain();
    windVolume.gain.value = tone.wind;
    wind.connect(windColor).connect(windVolume).connect(level);

    const gust = context.createOscillator();
    const gustDepth = context.createGain();
    gust.frequency.value = tone.drift;
    gustDepth.gain.value = tone.wind * 0.18;
    gust.connect(gustDepth).connect(windVolume.gain);
    wind.start(0, Math.random() * this.wind.duration);
    gust.start();

    let rain: AudioBufferSourceNode | undefined;
    let rainColor: BiquadFilterNode | undefined;
    let rainVolume: GainNode | undefined;
    if (tone.rain) {
      this.rain ??= noiseBuffer(context, false);
      rain = context.createBufferSource();
      rain.buffer = this.rain;
      rain.loop = true;
      rainColor = context.createBiquadFilter();
      rainColor.type = 'bandpass';
      rainColor.frequency.value = 2650;
      rainColor.Q.value = 0.48;
      rainVolume = context.createGain();
      rainVolume.gain.value = tone.rain;
      rain.connect(rainColor).connect(rainVolume).connect(level);
      rain.start();
    }

    return {
      level,
      stop: () => {
        wind.stop();
        gust.stop();
        rain?.stop();
        for (const node of [wind, windColor, windVolume, gust, gustDepth, rain, rainColor, rainVolume, level]) {
          node?.disconnect();
        }
      },
    };
  }

  dispose(): void {
    window.clearTimeout(this.retireTimer);
    this.active?.stop();
    this.retiring?.stop();
    this.gain.disconnect();
  }
}
