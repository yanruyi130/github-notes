import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSoundscape } from './audio'
import { DEFAULT_MATERIAL, SHAPES, WEATHER, WEATHER_IDS, type MaterialLayer, type WeatherId } from './config'
import { GlassStage } from './GlassStage'
import { Icon } from './Icon'
import { MaterialPanel, Slider } from './MaterialPanel'
import { usePreference } from './preferences'

const shapeIds = SHAPES.map(({ id }) => id)
type Panel = 'material' | 'sound' | 'library'
const panelTitles: Record<Panel, string> = { material: '玻璃材质', sound: '声音设置', library: '本地播放列表' }

function timestamp(seconds: number) {
  const whole = Math.floor(seconds || 0)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function Drawer({ panel, close, children }: { panel: Panel; close: () => void; children: ReactNode }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeButton.current?.focus({ preventScroll: true }) }, [panel])

  return <aside className={`drawer drawer--${panel}`} id="settings-drawer" aria-labelledby="drawer-title">
    <header className="drawer-head">
      <h2 id="drawer-title">{panelTitles[panel]}</h2>
      <button ref={closeButton} className="icon-button compact" title="关闭面板" aria-label="关闭面板" type="button" onClick={close}><Icon name="close" size={19} /></button>
    </header>
    <div className="drawer-body">{children}</div>
  </aside>
}

export function App() {
  const [weather, setWeather] = usePreference('weather', WEATHER_IDS, 'sunny')
  const [shape, setShape] = usePreference('shape', shapeIds, 'slab')
  const [material, setMaterial] = useState(DEFAULT_MATERIAL)
  const [solo, setSolo] = useState<MaterialLayer | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const panelTrigger = useRef<HTMLButtonElement | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const sound = useSoundscape(weather)
  const scene = WEATHER[weather]

  function togglePanel(next: Panel, trigger: HTMLButtonElement) {
    panelTrigger.current = trigger
    setPanel(panel === next ? null : next)
  }

  function closePanel() {
    setPanel(null)
    panelTrigger.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!panel) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(null)
        panelTrigger.current?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [panel])

  const candidates = sound.tracks.filter((track) => track.weathers.includes(weather))
  function stepTrack(step: number) {
    if (!candidates.length) return
    const current = candidates.findIndex((track) => track.id === sound.current?.id)
    const next = current === -1 ? 0 : (current + step + candidates.length) % candidates.length
    sound.select(candidates[next].id)
  }

  return <main className={`experience theme-${weather}`} style={{ '--accent': scene.accent } as CSSProperties}>
    <GlassStage weather={weather} shape={shape} material={material} solo={solo} bands={sound.bands} />
    <div className="interface">
      <header className="masthead">
        <div className="wordmark" aria-label="Weather Glass 天气玻璃">
          <div className="wordmark-icon"><Icon name="brand" size={24} /></div>
          <div><span>WEATHER GLASS</span><small>天气玻璃</small></div>
        </div>
        <div className="weather-nav" role="group" aria-label="天气场景">
          {WEATHER_IDS.map((id) => <button className="weather-button" type="button" key={id} aria-label={WEATHER[id].label}
            data-tooltip={WEATHER[id].label} aria-pressed={weather === id} onClick={() => setWeather(id)}><Icon name={id} /></button>)}
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="玻璃材质" title="玻璃材质" aria-expanded={panel === 'material'}
            aria-controls={panel === 'material' ? 'settings-drawer' : undefined} onClick={(event) => togglePanel('material', event.currentTarget)}><Icon name="sliders" /></button>
          <button className="icon-button" type="button" aria-label="声音设置" title="声音设置" aria-expanded={panel === 'sound'}
            aria-controls={panel === 'sound' ? 'settings-drawer' : undefined} onClick={(event) => togglePanel('sound', event.currentTarget)}><Icon name="headphones" /></button>
        </div>
      </header>

      <section className="stage" aria-label="天气舞台">
        <div className="stage-copy" key={weather}>
          <div className="scene-name" data-weather-ink><Icon name={weather} size={17} /><span lang="en">{scene.english}</span></div>
          <h1 data-weather-ink>{scene.title}</h1>
          <p className="drag-hint" data-weather-ink><Icon name="drag" size={16} />拖动玻璃探索折射 · 双击复位</p>
        </div>
        <div className="lens-zone" data-lens-zone aria-hidden="true" />
      </section>

      <div className="console">
        <section className="console-card shape-card" aria-labelledby="shape-label">
          <h2 id="shape-label">玻璃形状</h2>
          <div className="shape-grid" role="group" aria-label="玻璃形状">
            {SHAPES.map(({ id, label, path }) => <button className="shape-button" type="button" key={id} aria-pressed={shape === id} onClick={() => setShape(id)}>
              <svg viewBox="0 0 400 340" width="30" height="26" aria-hidden="true"><path d={path} fill="currentColor" fillOpacity=".17" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
              <span>{label}</span>
            </button>)}
          </div>
        </section>

        <section className="console-card player" aria-label="天气音乐播放器">
          <div className="player-row">
            <div className={`album-icon${sound.playing ? ' is-playing' : ''}`} aria-hidden="true"><Icon name="music" size={23} /></div>
            <div className="track-copy" key={sound.current?.id ?? weather} aria-live="polite">
              <h2>{sound.current?.title ?? '尚未添加内置曲目'}</h2>
              <p>{sound.current ? (sound.current.source === 'local' ? '本地曲目' : '内置曲目') : `${scene.genre} · ${scene.bpm} BPM`}</p>
            </div>
            <div className="player-actions">
              <button className="icon-button compact step-track" title="上一首" aria-label="上一首" type="button" disabled={candidates.length < 2} onClick={() => stepTrack(-1)}><Icon name="previous" size={16} /></button>
              <button className="play-button" type="button" disabled={!sound.current} aria-label={sound.playing ? '暂停' : '播放'} title={sound.playing ? '暂停' : '播放'} onClick={sound.togglePlay}><Icon name={sound.playing ? 'pause' : 'play'} size={22} /></button>
              <button className="icon-button compact step-track" title="下一首" aria-label="下一首" type="button" disabled={candidates.length < 2} onClick={() => stepTrack(1)}><Icon name="next" size={16} /></button>
              <button className="icon-button compact library-button" aria-label="播放列表" title="播放列表" type="button" aria-expanded={panel === 'library'} aria-controls={panel === 'library' ? 'settings-drawer' : undefined}
                onClick={(event) => togglePanel('library', event.currentTarget)}><Icon name="list" size={20} /></button>
              <button className="upload-button" type="button" aria-label="上传音乐" title="上传音乐" onClick={() => fileInput.current?.click()}><Icon name="upload" size={17} /><span>上传音乐</span></button>
            </div>
          </div>
          <label className="progress-row">
            <span aria-hidden="true">{timestamp(sound.progress)}</span>
            <input type="range" aria-label="播放进度" min={0} max={sound.duration || 1} step="any" disabled={!sound.duration} value={Math.min(sound.progress, sound.duration || 1)}
              style={{ '--fill': `${sound.duration > 0 ? Math.min(100, sound.progress / sound.duration * 100) : 0}%` } as CSSProperties} onChange={(event) => sound.seek(event.currentTarget.valueAsNumber)} />
            <span aria-hidden="true">{timestamp(sound.duration)}</span>
          </label>
          {sound.error && <p className="audio-error" role="status">{sound.error}</p>}
        </section>
      </div>

      <footer className="footer"><span><Icon name="volume" size={15} />{sound.ambientEnabled ? '天气氛围音已开启' : '天气氛围音已关闭'}</span><span>音乐仅保存在此浏览器</span></footer>
    </div>

    <input hidden ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus,.webm" multiple aria-label="选择本地音乐文件" onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? [])
      event.currentTarget.value = ''
      if (files.length > 0) void sound.upload(files)
    }} />

    {panel && <Drawer panel={panel} close={closePanel}>
      {panel === 'material' && <MaterialPanel material={material} onChange={setMaterial} solo={solo} onSolo={setSolo} reset={() => { setMaterial(DEFAULT_MATERIAL); setSolo(null) }} />}
      {panel === 'sound' && <div className="sound-settings">
        <Slider label="音乐音量" value={sound.musicVolume} display={`${Math.round(sound.musicVolume * 100)}%`} onChange={sound.setMusicVolume} />
        <label className="switch-row"><span><Icon name="wind" size={18} />天气氛围音</span><input type="checkbox" role="switch" checked={sound.ambientEnabled} onChange={(event) => sound.setAmbientEnabled(event.currentTarget.checked)} /></label>
        <Slider label="氛围音音量" value={sound.ambientVolume} display={`${Math.round(sound.ambientVolume * 100)}%`} onChange={sound.setAmbientVolume} />
      </div>}
      {panel === 'library' && <div className="library">
        <div className="library-header"><p>将曲目分配给一个或多个天气。</p><button className="upload-button" type="button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={17} /><span>上传音乐</span></button></div>
        {sound.tracks.length === 0 && <p className="empty-library">{sound.loading ? '正在读取本地曲目…' : '播放列表暂无本地曲目。'}</p>}
        <ul className="track-list">
          {sound.tracks.map((track) => <li key={track.id}>
            <div className="track-row">
              <button className="pick-track" type="button" aria-pressed={sound.current?.id === track.id} aria-label={`选择 ${track.title}`} onClick={() => sound.select(track.id)}><Icon name="music" size={17} /><span>{track.title}</span></button>
              <button className="icon-button compact" aria-label={`移除 ${track.title}`} title="移除曲目" type="button" onClick={() => void sound.remove(track.id)}><Icon name="trash" size={17} /></button>
            </div>
            <div className="assign-options" role="group" aria-label={`${track.title} 的天气分配`}>
              {WEATHER_IDS.map((id: WeatherId) => <button className="icon-button compact" type="button" key={id} aria-label={WEATHER[id].label} title={WEATHER[id].label}
                aria-pressed={track.weathers.includes(id)} onClick={() => void sound.assign(track.id, id, !track.weathers.includes(id))}><Icon name={id} size={16} /></button>)}
            </div>
          </li>)}
        </ul>
      </div>}
    </Drawer>}
  </main>
}
