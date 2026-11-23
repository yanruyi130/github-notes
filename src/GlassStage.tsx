import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { SHAPES, type Material, type MaterialLayer, type ShapeId, type WeatherId } from './config'
import { clamp, createGlassRenderer, createInkSampler, type AudioBands } from './glassRenderer'
import { createWeatherRenderer } from './weather'

interface GlassStageProps {
  weather: WeatherId
  shape: ShapeId
  material: Material
  solo: MaterialLayer | null
  bands: RefObject<AudioBands>
}

type Position = { x: number; y: number }
type MotionBounds = { x: number; y: number; width: number; height: number; spareX: number; spareY: number }
type Drag = { id: number; start: Position; anchor: Position; moved: boolean }

const idleBands = { low: 0, high: 0 }
const materialKeys = ['shadow', 'blur', 'saturation', 'brightness', 'refraction', 'rimWidth', 'dispersion', 'tint', 'highlight'] as const
const smooth = (value: number) => value * value * (3 - 2 * value)
const canvasStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  pointerEvents: 'none',
} as const

export function GlassStage(props: GlassStageProps) {
  const stage = useRef<HTMLDivElement>(null)
  const background = useRef<HTMLCanvasElement>(null)
  const lenses = useRef<HTMLCanvasElement>(null)
  const hit = useRef<HTMLButtonElement>(null)
  const settings = useRef(props)
  const bounds = useRef<MotionBounds | null>(null)
  const position = useRef<Position>({ x: 0, y: 0 })
  const drag = useRef<Drag | null>(null)
  const lastTap = useRef({ time: -Infinity, x: 0, y: 0 })
  const needsFrame = useRef(true)
  const activeShape = SHAPES.find(({ id }) => id === props.shape) ?? SHAPES[0]

  useLayoutEffect(() => {
    settings.current = props
    needsFrame.current = true
  }, [props])

  useEffect(() => {
    const root = stage.current
    const weatherCanvas = background.current
    const glassCanvas = lenses.current
    const hitTarget = hit.current
    if (!root || !weatherCanvas || !glassCanvas || !hitTarget) return
    const weatherCtx = weatherCanvas.getContext('2d', { alpha: false })
    const glassCtx = glassCanvas.getContext('2d')
    const snapshot = document.createElement('canvas')
    const snapshotCtx = snapshot.getContext('2d', { alpha: false })
    if (!weatherCtx || !glassCtx || !snapshotCtx) return

    const scene = createWeatherRenderer()
    const lens = createGlassRenderer()
    const sampleInk = createInkSampler()
    const frameAnchor = performance.now()
    const viewport = root.closest('.experience') ?? root.parentElement
    const zone = viewport?.querySelector<HTMLElement>('[data-lens-zone]') ?? root
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const visibility = () => { needsFrame.current = true }
    media.addEventListener('change', visibility)
    document.addEventListener('visibilitychange', visibility)

    let animation = 0
    let width = 0
    let height = 0
    let startWidth = 0
    let startHeight = 0
    let lastFrame = -Infinity
    let lastInk = -Infinity
    let weather = settings.current.weather
    let fadingWeather = weather
    let weatherStart = -Infinity
    let shape = settings.current.shape
    let fadingShape = shape
    let shapeStart = -Infinity
    const easedMaterial = { ...settings.current.material }
    let stageRect: DOMRect | null = null
    let zoneRect: DOMRect | null = null
    let previousBox: { x: number; y: number; width: number; height: number } | null = null
    let resizeNeeded = true
    const requestMeasure = () => {
      resizeNeeded = true
      needsFrame.current = true
    }
    const watchLayout = new ResizeObserver(requestMeasure)
    watchLayout.observe(root)
    watchLayout.observe(zone)

    const paint = (now: number) => {
      animation = requestAnimationFrame(paint)
      if (document.hidden) return
      const reduced = media.matches
      const dirty = needsFrame.current
      if ((reduced || now - lastFrame < 29) && !dirty) return
      const elapsed = Math.max(0, now - lastFrame)
      const latest = settings.current
      lastFrame = now
      needsFrame.current = false

      if (resizeNeeded || !stageRect || !zoneRect) {
        stageRect = root.getBoundingClientRect()
        zoneRect = zone.getBoundingClientRect()
        resizeNeeded = false
      }
      width = stageRect.width
      height = stageRect.height
      if (width < 1 || height < 1) return
      const dpr = Math.min(devicePixelRatio || 1, 1.5, Math.max(1, 1800 / width))
      const physicalWidth = Math.max(1, Math.round(width * dpr))
      const physicalHeight = Math.max(1, Math.round(height * dpr))
      if (physicalWidth !== startWidth || physicalHeight !== startHeight) {
        startWidth = weatherCanvas.width = glassCanvas.width = snapshot.width = physicalWidth
        startHeight = weatherCanvas.height = glassCanvas.height = snapshot.height = physicalHeight
        weatherStart = -Infinity
      }
      if (weather !== latest.weather) {
        snapshotCtx.drawImage(weatherCanvas, 0, 0)
        fadingWeather = weather
        weather = latest.weather
        weatherStart = now
      }
      if (shape !== latest.shape) {
        fadingShape = shape
        shape = latest.shape
        shapeStart = now
      }
      const time = reduced ? 0 : (now - frameAnchor) / 1000
      const weatherBlend = reduced ? 1 : smooth(clamp((now - weatherStart) / 680, 0, 1))
      const shapeBlend = reduced ? 1 : smooth(clamp((now - shapeStart) / 300, 0, 1))

      weatherCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene(weatherCtx, width, height, weather, time, reduced)
      if (weatherBlend < 1) {
        weatherCtx.save()
        weatherCtx.globalAlpha = 1 - weatherBlend
        weatherCtx.drawImage(snapshot, 0, 0, width, height)
        weatherCtx.restore()
      }
      if (now - lastInk > 240 || dirty) {
        sampleInk(weatherCanvas, stageRect, viewport?.querySelectorAll<HTMLElement>('[data-weather-ink]') ?? [], latest.material.adaptive)
        lastInk = now
      }

      const isCompact = zoneRect.width < 580
      const boxWidth = Math.max(0, Math.min(715, zoneRect.width * (isCompact ? 0.935 : 0.89), zoneRect.height * 1.49))
      const boxHeight = boxWidth / 1.31
      // Movement uses the zone axes, independent of pixel density and page scrolling.
      const safeHeight = Math.min(boxHeight, Math.max(0, zoneRect.height * 0.89))
      const centerX = Math.max(0, (zoneRect.width - boxWidth) / 2)
      const centerY = Math.max(0, (zoneRect.height - safeHeight) / 2)
      const spareX = centerX + boxWidth * 0.04
      const spareY = centerY + safeHeight * 0.03
      const anchorX = zoneRect.left - stageRect.left + centerX
      const anchorY = zoneRect.top - stageRect.top + centerY
      bounds.current = { x: anchorX, y: anchorY, width: boxWidth, height: safeHeight, spareX, spareY }
      const x = anchorX + position.current.x * spareX
      const y = anchorY + position.current.y * spareY
      if (!previousBox || previousBox.width !== boxWidth || previousBox.height !== safeHeight) {
        hitTarget.style.width = `${boxWidth}px`
        hitTarget.style.height = `${safeHeight}px`
      }
      if (!previousBox || previousBox.x !== x || previousBox.y !== y) {
        hitTarget.style.transform = `translate3d(${x}px,${y}px,0)`
      }
      previousBox = { x, y, width: boxWidth, height: safeHeight }

      const materialBlend = reduced ? 1 : 1 - Math.exp(-elapsed / 62)
      for (const key of materialKeys) {
        easedMaterial[key] += (latest.material[key] - easedMaterial[key]) * materialBlend
      }
      easedMaterial.adaptive = latest.material.adaptive
      glassCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      glassCtx.clearRect(0, 0, width, height)
      const common = {
        ctx: glassCtx, background: weatherCanvas, stageWidth: width, stageHeight: height,
        box: previousBox, material: easedMaterial, solo: latest.solo,
        bands: reduced ? idleBands : latest.bands.current ?? idleBands, time, weather,
        previousWeather: fadingWeather, weatherBlend,
      }
      const drawShape = (id: ShapeId, opacity: number) => {
        const geometry = SHAPES.find((item) => item.id === id) ?? SHAPES[0]
        lens({ ...common, path: geometry.path, opacity })
      }
      if (shapeBlend < 1) drawShape(fadingShape, 1 - shapeBlend)
      drawShape(shape, shapeBlend)
      if (shapeBlend === 1) fadingShape = shape
      if (weatherBlend === 1) fadingWeather = weather
    }

    animation = requestAnimationFrame(paint)
    return () => {
      cancelAnimationFrame(animation)
      watchLayout.disconnect()
      media.removeEventListener('change', visibility)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  function move(x: number, y: number) {
    position.current = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }
    needsFrame.current = true
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || !bounds.current) return
    drag.current = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      anchor: { ...position.current },
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.style.setProperty('--lens-cursor', 'grabbing')
  }

  function dragLens(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current
    const area = bounds.current
    if (!gesture || !area || gesture.id !== event.pointerId) return
    const dx = event.clientX - gesture.start.x
    const dy = event.clientY - gesture.start.y
    gesture.moved ||= Math.hypot(dx, dy) > 4
    if (!gesture.moved) return
    move(gesture.anchor.x + dx / Math.max(1, area.spareX), gesture.anchor.y + dy / Math.max(1, area.spareY))
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current
    if (!gesture || gesture.id !== event.pointerId) return
    drag.current = null
    event.currentTarget.style.removeProperty('--lens-cursor')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (event.type === 'pointerup' && event.pointerType === 'touch' && !gesture.moved) {
      const now = performance.now()
      if (now - lastTap.current.time < 350 && Math.hypot(event.clientX - lastTap.current.x, event.clientY - lastTap.current.y) < 30) {
        move(0, 0)
        lastTap.current.time = -Infinity
      } else {
        lastTap.current = { time: now, x: event.clientX, y: event.clientY }
      }
    }
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.4 : 0.16
    const { x, y } = position.current
    switch (event.key) {
      case 'ArrowLeft': move(x - step, y); break
      case 'ArrowRight': move(x + step, y); break
      case 'ArrowUp': move(x, y - step); break
      case 'ArrowDown': move(x, y + step); break
      case 'Home':
      case 'Enter':
      case ' ': move(0, 0); break
      default: return
    }
    event.preventDefault()
  }

  return (
    <div ref={stage} className="weather-stage" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <canvas ref={background} className="weather-backdrop" aria-hidden="true" style={canvasStyle} />
      <canvas ref={lenses} className="weather-glass" aria-hidden="true" style={canvasStyle} />
      <button
        ref={hit}
        className="glass-hit"
        type="button"
        aria-label={`${activeShape.label}玻璃。方向键移动，按 Home 或双击复位`}
        title="拖动玻璃 · 双击复位"
        onPointerDown={startDrag}
        onPointerMove={dragLens}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onDoubleClick={() => move(0, 0)}
        onKeyDown={moveWithKeyboard}
        style={{ position: 'absolute', left: 0, top: 0, padding: 0, border: 0, background: 'transparent', pointerEvents: 'none' }}
      >
        <svg viewBox="0 0 400 340" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}>
          <path d={activeShape.path} fill="transparent" pointerEvents="fill" style={{ cursor: 'var(--lens-cursor, grab)' }} />
        </svg>
      </button>
    </div>
  )
}
