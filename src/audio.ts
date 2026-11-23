import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine, initialPlayback, type AudioBands, type AudioTrack, type Playable } from './audioEngine';
import { WEATHER, type WeatherId } from './config';
import { deleteTrack, readTracks, setTrackWeather, storeTracks, type LocalTrack, type StoredTrack } from './musicDB';

export type { LocalTrack } from './musicDB';

type Selection = Partial<Record<WeatherId, string>>;

const preference = {
  music: 'aura.sound.music-volume',
  ambient: 'aura.sound.ambient-volume',
  enabled: 'aura.sound.ambient-enabled',
  selection: 'aura.sound.selected-tracks',
};

function readPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* Audio works without saved preferences. */ }
}

function volumeValue(level: number): number {
  return Math.max(0, Math.min(1, level));
}

function savedVolume(key: string, fallback: number): number {
  const value = readPreference(key);
  return value !== null && Number.isFinite(Number(value)) ? volumeValue(Number(value)) : fallback;
}

function savedSelection(): Selection {
  try {
    const stored = JSON.parse(readPreference(preference.selection) ?? '{}') as unknown;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored as Selection;
  } catch { /* A cleared or invalid preference can be recreated from the playlist. */ }
  return {};
}

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function fileIsAudio(file: File): boolean {
  return file.size > 0 && (file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|aiff|aif|weba|webm|mp4)$/i.test(file.name));
}

function storageError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '浏览器的本地存储空间不足，请先移除一些曲目。';
  return '无法访问本地曲库，请检查浏览器是否允许此站点保存数据。';
}

export function useSoundscape(weather: WeatherId) {
  const [library, setLibrary] = useState<StoredTrack[]>([]);
  const [selection, setSelection] = useState<Selection>(savedSelection);
  const [libraryError, setLibraryError] = useState('');
  const [reading, setReading] = useState(true);
  const [pending, setPending] = useState(0);
  const [playback, setPlayback] = useState(initialPlayback);
  const [musicVolume, changeMusicVolume] = useState(() => savedVolume(preference.music, 0.8));
  const [ambientVolume, changeAmbientVolume] = useState(() => savedVolume(preference.ambient, 0.08));
  const [ambientEnabled, changeAmbientEnabled] = useState(() => readPreference(preference.enabled) === 'true');
  const engine = useRef<AudioEngine | null>(null);
  const jobQueue = useRef<Promise<void>>(Promise.resolve());
  const nextTrack = useRef<() => boolean>(() => false);
  const bands = useRef<AudioBands>({ low: 0, mid: 0, high: 0, energy: 0 });

  const localPlaylist = useMemo(() => library.filter((track) => track.weathers.includes(weather)), [library, weather]);
  const tracks = useMemo<LocalTrack[]>(() => library.map(({ id, title, weathers }) => ({ id, title, weathers })), [library]);
  const audioTrack = useMemo<AudioTrack | null>(() => {
    const local = localPlaylist.find(({ id }) => id === selection[weather]) ?? localPlaylist[0];
    if (local) return { id: local.id, title: local.title, source: 'local', file: local.file };

    const builtin = WEATHER[weather].builtin;
    if (builtin) return { id: `builtin:${weather}`, title: builtin.title, source: 'builtin', file: builtin.src };
    return null;
  }, [localPlaylist, selection, weather]);
  const current: Playable | null = audioTrack && { id: audioTrack.id, title: audioTrack.title, source: audioTrack.source };
  const currentIndex = localPlaylist.findIndex(({ id }) => id === current?.id);
  const previous = currentIndex > 0 ? localPlaylist[currentIndex - 1] : undefined;
  const following = currentIndex >= 0 ? localPlaylist[currentIndex + 1] : undefined;

  useEffect(() => {
    let mounted = true;
    jobQueue.current = jobQueue.current.then(async () => {
      try {
        const stored = await readTracks();
        if (mounted) setLibrary(stored);
      } catch (error) {
        if (mounted) setLibraryError(storageError(error));
      } finally {
        if (mounted) setReading(false);
      }
    });

    const player = new AudioEngine(bands.current, setPlayback, () => nextTrack.current());
    engine.current = player;
    return () => {
      mounted = false;
      player.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    nextTrack.current = () => {
      if (!following) return false;
      setSelection((previous) => ({ ...previous, [weather]: following.id }));
      return true;
    };
    engine.current?.configure(weather, musicVolume, ambientVolume, ambientEnabled);
    if (!reading) engine.current?.setTrack(audioTrack);
  }, [weather, musicVolume, ambientVolume, ambientEnabled, audioTrack, following, reading]);

  useEffect(() => {
    writePreference(preference.music, String(musicVolume));
    writePreference(preference.ambient, String(ambientVolume));
    writePreference(preference.enabled, String(ambientEnabled));
    writePreference(preference.selection, JSON.stringify(selection));
  }, [musicVolume, ambientVolume, ambientEnabled, selection]);

  useEffect(() => {
    if (!ambientEnabled) return;
    const unlock = (event: Event) => {
      if (!event.isTrusted) return;
      engine.current?.activateAmbience();
      removeListeners();
    };
    const removeListeners = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return removeListeners;
  }, [ambientEnabled]);

  function enqueue(change: () => Promise<void>, success?: () => void, notice = ''): Promise<void> {
    setPending((value) => value + 1);
    setLibraryError('');
    const job = jobQueue.current.then(async () => {
      try {
        await change();
        setLibrary(await readTracks());
        success?.();
        setLibraryError(notice);
      } catch (error) {
        setLibraryError(storageError(error));
      } finally {
        setPending((value) => value - 1);
      }
    });
    jobQueue.current = job;
    return job;
  }

  async function upload(files: File[]): Promise<void> {
    if (!files.length) return;
    const accepted = files.filter(fileIsAudio);
    if (!accepted.length) {
      setLibraryError('请选择非空音频文件，例如 MP3、WAV 或 M4A。');
      return;
    }
    const now = Date.now();
    const additions = accepted.map((file, index): StoredTrack => ({
      id: newId(),
      title: file.name.replace(/\.[^.]+$/, '') || file.name,
      file,
      weathers: [weather],
      addedAt: now + index,
    }));
    const notice = accepted.length < files.length ? '已保存音频曲目，并跳过了空文件或非音频文件。' : '';
    await enqueue(() => storeTracks(additions), undefined, notice);
  }

  function forgetSelection(id: string, theme?: WeatherId): void {
    setSelection((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(next) as WeatherId[]) {
        if (next[key] === id && (!theme || theme === key)) delete next[key];
      }
      return next;
    });
  }

  function assign(id: string, theme: WeatherId, assigned: boolean): Promise<void> {
    return enqueue(() => setTrackWeather(id, theme, assigned), () => {
      if (!assigned) forgetSelection(id, theme);
    });
  }

  function remove(id: string): Promise<void> {
    return enqueue(() => deleteTrack(id), () => forgetSelection(id));
  }

  function select(id: string): void {
    const track = library.find((item) => item.id === id);
    if (!track) return;
    const choose = () => setSelection((previous) => ({ ...previous, [weather]: id }));
    if (track.weathers.includes(weather)) choose();
    else void enqueue(() => setTrackWeather(id, weather, true), choose);
  }

  function setAmbientEnabled(enabled: boolean): void {
    changeAmbientEnabled(enabled);
    engine.current?.configure(weather, musicVolume, ambientVolume, enabled);
    if (enabled) engine.current?.activateAmbience();
  }

  return {
    ...playback,
    tracks,
    current,
    musicVolume,
    ambientVolume,
    ambientEnabled,
    error: libraryError || playback.error,
    loading: reading || pending > 0,
    bands,
    previousTrack: previous ? () => select(previous.id) : undefined,
    nextTrack: following ? () => select(following.id) : undefined,
    togglePlay: () => engine.current?.toggle(),
    seek: (seconds: number) => engine.current?.seek(seconds),
    setMusicVolume: (volume: number) => { if (Number.isFinite(volume)) changeMusicVolume(volumeValue(volume)); },
    setAmbientVolume: (volume: number) => { if (Number.isFinite(volume)) changeAmbientVolume(volumeValue(volume)); },
    setAmbientEnabled,
    upload,
    assign,
    remove,
    select,
  };
}
