import type { Material, MaterialLayer, WeatherId } from './config'

export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const mix = (from: number, to: number, weight: number) => from + (to - from) * weight
type RGB = [number, number, number]
type Box = { x: number; y: number; width: number; height: number }
export type AudioBands = { low: number; high: number }

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const rgba = (color: RGB, alpha: number) => `rgba(${color.map(Math.round).join(',')},${clamp(alpha, 0, 1)})`
const blendColor = (a: RGB, b: RGB, amount: number): RGB => [
  mix(a[0], b[0], amount), mix(a[1], b[1], amount), mix(a[2], b[2], amount),
]

function bitmap(readable = false) {
  const canvas = document.createElement('canvas')
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: readable })! }
}

function resize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

interface Geometry {
  width: number
  height: number
  alpha: Uint8ClampedArray
  distance: Float32Array
  normalX: Float32Array
  normalY: Float32Array
  crystals: Array<{ x: number; y: number; radius: number; angle: number; opacity: number }>
}

function makeGeometry(path: Path2D, width: number, height: number): Geometry {
  const mask = bitmap(true)
  resize(mask.canvas, width, height)
  mask.ctx.scale(width / 400, height / 340)
  mask.ctx.fill(path)
  const maskData = mask.ctx.getImageData(0, 0, width, height).data
  const size = width * height
  const alpha = new Uint8ClampedArray(size)
  const distance = new Float32Array(size)
  const normalX = new Float32Array(size)
  const normalY = new Float32Array(size)
  const diagonal = Math.SQRT2
  for (let i = 0; i < size; i++) {
    alpha[i] = maskData[i * 4 + 3]
    distance[i] = alpha[i] > 128 ? width + height : 0
  }
  // Two chamfer passes approximate the distance to the nearest outline point.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - width] + 1,
        distance[i - width - 1] + diagonal, distance[i - width + 1] + diagonal)
    }
  }
  for (let y = height - 2; y >= 1; y--) {
    for (let x = width - 2; x >= 1; x--) {
      const i = y * width + x
      distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + width] + 1,
        distance[i + width - 1] + diagonal, distance[i + width + 1] + diagonal)
    }
  }
  const crystals: Geometry['crystals'] = []
  let seed = 41
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x
      if (!alpha[i]) continue
      const dx = distance[i + 2] - distance[i - 2]
      const dy = distance[i + 2 * width] - distance[i - 2 * width]
      const length = Math.hypot(dx, dy) || 1
      normalX[i] = dx / length
      normalY[i] = dy / length
      if (distance[i] > 1 && distance[i] < 13 && random() < 0.055) {
        crystals.push({
          x: x / width, y: y / height, radius: 0.6 + random() * 2.8,
          angle: random() * Math.PI, opacity: (1 - distance[i] / 15) * (0.25 + random() * 0.7),
        })
      }
    }
  }
  return { width, height, alpha, distance, normalX, normalY, crystals }
}

function measurePalette(
  data: Uint8ClampedArray, stride: number, geometry: Geometry, margin: number,
): { color: RGB; brightness: number; activity: number; warmLight: RGB } {
  const { width, height, alpha } = geometry
  let count = 0
  let totalR = 0
  let totalG = 0
  let totalB = 0
  let totalLight = 0
  let lightSquared = 0
  let brightest = -1
  let warmLight: RGB = [210, 225, 242]
  for (let y = Math.round(height * 0.08); y < height * 0.94; y += Math.max(4, Math.floor(height / 9))) {
    for (let x = Math.round(width * 0.08); x < width * 0.94; x += Math.max(4, Math.floor(width / 11))) {
      if (alpha[y * width + x] < 200) continue
      const i = ((y + margin) * stride + x + margin) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const level = luminance(r, g, b)
      count++
      totalR += r
      totalG += g
      totalB += b
      totalLight += level
      lightSquared += level * level
      const lightScore = level + (r - b) * 0.2
      if (lightScore > brightest) {
        brightest = lightScore
        warmLight = [r, g, b]
      }
    }
  }
  count = Math.max(count, 1)
  const brightness = totalLight / count
  const contrast = Math.sqrt(Math.max(0, lightSquared / count - brightness * brightness))
  return {
    color: [totalR / count, totalG / count, totalB / count],
    brightness,
    activity: clamp(contrast / 80, 0, 1),
    warmLight,
  }
}

interface LensFrame {
  ctx: CanvasRenderingContext2D
  background: HTMLCanvasElement
  stageWidth: number
  stageHeight: number
  box: Box
  path: string
  material: Material
  solo: MaterialLayer | null
  bands: AudioBands
  weather: WeatherId
  previousWeather: WeatherId
  weatherBlend: number
  time: number
  opacity: number
}

function drawTransformedPath(path: Path2D, box: Box) {
  const outline = new Path2D()
  outline.addPath(path, new DOMMatrix([box.width / 400, 0, 0, box.height / 340, box.x, box.y]))
  return outline
}

function drawShadow(
  ctx: CanvasRenderingContext2D, outline: Path2D, box: Box, amount: number, visibleAlone: boolean,
) {
  if (amount <= 0) return
  ctx.save()
  // Punch the silhouette out of the shadow so the center stays optically clear.
  const outside = new Path2D()
  outside.rect(box.x - 120, box.y - 140, box.width + 240, box.height + 300)
  outside.addPath(outline)
  if (!visibleAlone) ctx.clip(outside, 'evenodd')
  ctx.shadowColor = rgba([4, 11, 26], amount * 0.75)
  ctx.shadowBlur = 36
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = Math.min(28, box.height * 0.045)
  ctx.fillStyle = rgba([5, 15, 33], visibleAlone ? amount * 0.17 : 0.8)
  ctx.fill(outline)
  ctx.restore()
}

function drawRim(
  ctx: CanvasRenderingContext2D, outline: Path2D, box: Box, glow: RGB, fresnel: RGB,
  amount: number, time: number, treble: number,
) {
  if (amount <= 0) return
  const { x, y, width, height } = box
  const angle = ctx.createLinearGradient(x + width * 0.18, y + height * 0.11, x + width * 0.78, y + height)
  angle.addColorStop(0, rgba(glow, amount * 0.96))
  angle.addColorStop(0.17, rgba(glow, amount * (0.82 + treble * 0.08)))
  angle.addColorStop(0.41, rgba(fresnel, amount * 0.53))
  angle.addColorStop(0.58, rgba(fresnel, amount * 0.08))
  angle.addColorStop(0.76, rgba(fresnel, amount * 0.27))
  angle.addColorStop(1, rgba(fresnel, amount * 0.84))

  ctx.save()
  ctx.clip(outline)
  ctx.strokeStyle = angle
  ctx.globalAlpha *= 0.20
  ctx.lineWidth = Math.max(8, width * 0.027)
  ctx.stroke(outline)
  ctx.lineWidth = Math.max(6, width * 0.017)
  ctx.stroke(outline)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = rgba([18, 32, 52], amount * 0.26)
  ctx.lineWidth = 3.8
  ctx.stroke(outline)
  ctx.strokeStyle = angle
  ctx.lineWidth = Math.max(1.45, width / 310)
  ctx.stroke(outline)
  ctx.restore()

  ctx.save()
  ctx.clip(outline)
  const wave = 0.5 + Math.sin(time * 0.56) * 0.09
  const flare = ctx.createRadialGradient(
    x + width * wave, y + height * 0.07, 0,
    x + width * wave, y + height * 0.07, width * 0.45,
  )
  flare.addColorStop(0, rgba(glow, amount * 0.20))
  flare.addColorStop(0.45, rgba(glow, amount * 0.07))
  flare.addColorStop(1, rgba(glow, 0))
  ctx.fillStyle = flare
  ctx.fill(outline)
  ctx.restore()
}

function drawWater(
  ctx: CanvasRenderingContext2D, outline: Path2D, box: Box, light: RGB, amount: number, time: number,
) {
  if (amount < 0.01) return
  ctx.save()
  ctx.clip(outline)
  ctx.globalAlpha *= amount
  const scale = clamp(box.width / 550, 0.53, 1.4)
  ctx.lineCap = 'round'
  for (let i = 0; i < 37; i++) {
    const dropping = i % 4 !== 0
    // Some nearby pairs drift toward a shared channel as they descend.
    const pair = Math.floor(i / 3)
    const baseX = 0.08 + ((pair * 0.293 + 0.109) % 0.83)
    const progress = (time * (0.07 + (pair % 5) * 0.007) + pair * 0.193 + (i % 3) * 0.013) % 1
    const separation = (i % 3 - 1) * 0.023
    const converge = dropping ? Math.max(0, 1 - progress * 1.85) : 0.8
    const x = box.x + box.width * (baseX + separation * converge + Math.sin(progress * 5 + pair) * 0.005)
    const y = box.y + box.height * (dropping ? progress : 0.12 + (i * 0.379) % 0.76)
    const merged = dropping && converge < 0.08
    if (merged && i % 3 !== 1) continue
    const radius = (0.8 + (i * 1.69) % 2.85 + (merged ? 1.8 : 0)) * scale

    if (dropping) {
      const trail = radius * (3.4 + i % 5)
      const gradient = ctx.createLinearGradient(x, y - trail, x, y)
      gradient.addColorStop(0, rgba(light, 0))
      gradient.addColorStop(1, rgba(light, 0.37))
      ctx.strokeStyle = gradient
      ctx.lineWidth = Math.max(0.7, radius * 0.43)
      ctx.beginPath()
      ctx.moveTo(x - Math.sin(progress * 6 + pair) * radius, y - trail)
      ctx.quadraticCurveTo(x + radius * 0.5, y - trail * 0.23, x, y)
      ctx.stroke()
    }

    const drop = ctx.createLinearGradient(x, y - radius, x, y + radius)
    drop.addColorStop(0, rgba(light, 0.76))
    drop.addColorStop(0.36, rgba([13, 27, 46], 0.52))
    drop.addColorStop(0.72, rgba(light, 0.13))
    drop.addColorStop(1, rgba(light, 0.87))
    ctx.fillStyle = drop
    ctx.beginPath()
    ctx.ellipse(x, y, radius * 0.73, radius * (dropping ? 1.29 : 0.9), -0.08, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawFrost(
  ctx: CanvasRenderingContext2D, outline: Path2D, box: Box, geometry: Geometry, light: RGB, amount: number,
) {
  if (amount < 0.01) return
  ctx.save()
  ctx.clip(outline)
  ctx.globalAlpha *= amount
  ctx.strokeStyle = rgba(light, 0.12)
  ctx.lineWidth = 18
  ctx.stroke(outline)
  ctx.strokeStyle = rgba(light, 0.12)
  ctx.lineWidth = 10
  ctx.stroke(outline)
  ctx.lineWidth = 0.68
  for (const crystal of geometry.crystals) {
    const x = box.x + crystal.x * box.width
    const y = box.y + crystal.y * box.height
    ctx.strokeStyle = rgba(light, crystal.opacity * 0.78)
    ctx.beginPath()
    for (let arm = 0; arm < 3; arm++) {
      const angle = crystal.angle + arm * Math.PI / 3
      const dx = Math.cos(angle) * crystal.radius
      const dy = Math.sin(angle) * crystal.radius
      ctx.moveTo(x - dx, y - dy)
      ctx.lineTo(x + dx, y + dy)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export function createInkSampler() {
  const sample = bitmap(true)
  resize(sample.canvas, 7, 4)
  return (background: HTMLCanvasElement, stage: DOMRect, labels: Iterable<HTMLElement>, adaptive: boolean) => {
    for (const label of labels) {
      if (!adaptive) {
        label.style.removeProperty('--sample-ink')
        label.style.removeProperty('--sample-ink-shadow')
        continue
      }
      const rect = label.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2 || stage.width === 0 || stage.height === 0) continue
      const scaleX = background.width / stage.width
      const scaleY = background.height / stage.height
      const x = clamp((rect.x - stage.x) * scaleX, 0, background.width - 1)
      const y = clamp((rect.y - stage.y) * scaleY, 0, background.height - 1)
      const width = Math.min(rect.width * scaleX, background.width - x)
      const height = Math.min(rect.height * scaleY, background.height - y)
      sample.ctx.drawImage(background, x, y, width, height, 0, 0, 7, 4)
      const pixels = sample.ctx.getImageData(0, 0, 7, 4).data
      let light = 0
      let min = 255
      let max = 0
      for (let i = 0; i < pixels.length; i += 4) {
        const pixel = luminance(pixels[i], pixels[i + 1], pixels[i + 2])
        light += pixel
        min = Math.min(min, pixel)
        max = Math.max(max, pixel)
      }
      const previousInk = label.style.getPropertyValue('--sample-ink')
      const threshold = previousInk === '#142536' ? 151 : 167
      const useDarkInk = light / (pixels.length / 4) > threshold
      const color = useDarkInk ? '#142536' : '#f6fbff'
      const tint = useDarkInk ? '255,250,231' : '7,17,34'
      const strength = max - min > 65 ? 0.78 : 0.49
      label.style.setProperty('--sample-ink', color)
      label.style.setProperty('--sample-ink-shadow', `0 1px 8px rgba(${tint},${strength})`)
    }
  }
}

export function createGlassRenderer() {
  const sample = bitmap(true)
  const texture = bitmap()
  const shapes = new Map<string, { path: Path2D; geometry: Geometry }>()
  const supportsFilter = 'filter' in sample.ctx
  let output = texture.ctx.createImageData(1, 1)

  return (frame: LensFrame) => {
    const { ctx, background, box, material, solo, bands } = frame
    if (frame.opacity < 0.001 || box.width < 5 || box.height < 5) return
    const layer = (name: MaterialLayer) => solo === null || solo === name
    const width = Math.min(328, Math.ceil(box.width * 0.9))
    const height = Math.max(1, Math.round(width * box.height / box.width))
    const scale = width / box.width
    const key = `${frame.path}:${width}:${height}`
    let shape = shapes.get(key)
    if (!shape) {
      const path = new Path2D(frame.path)
      shape = { path, geometry: makeGeometry(path, width, height) }
      if (shapes.size >= 8) shapes.delete(shapes.keys().next().value!)
      shapes.set(key, shape)
    }
    const geometry = shape.geometry
    const outline = drawTransformedPath(shape.path, box)
    ctx.save()
    ctx.globalAlpha *= frame.opacity
    if (layer('shadow')) drawShadow(ctx, outline, box, material.shadow, solo === 'shadow')

    // Resample the exact composited backdrop at the glass position before drawing the glass.
    const margin = Math.ceil(clamp(material.rimWidth * (material.refraction + 0.5), 12, 115) * scale) + 2
    const sampleWidth = width + margin * 2
    const sampleHeight = height + margin * 2
    const sampleX = box.x * scale - margin
    const sampleY = box.y * scale - margin
    resize(sample.canvas, sampleWidth, sampleHeight)
    sample.ctx.clearRect(0, 0, sampleWidth, sampleHeight)
    if (supportsFilter) sample.ctx.filter = layer('blur') ? `blur(${material.blur * scale}px)` : 'none'
    sample.ctx.drawImage(background, -sampleX, -sampleY, frame.stageWidth * scale, frame.stageHeight * scale)
    const sampled = sample.ctx.getImageData(0, 0, sampleWidth, sampleHeight).data
    const palette = measurePalette(sampled, sampleWidth, geometry, margin)
    const glow = blendColor(palette.warmLight, [255, 253, 247], 0.68)
    const fresnel = blendColor(palette.color, [220, 238, 255], 0.74)
    const rain = (frame.weather === 'rainy' ? frame.weatherBlend : 0) +
      (frame.previousWeather === 'rainy' ? 1 - frame.weatherBlend : 0)
    const snow = (frame.weather === 'snow' ? frame.weatherBlend : 0) +
      (frame.previousWeather === 'snow' ? 1 - frame.weatherBlend : 0)
    const sun = (frame.weather === 'sunny' ? frame.weatherBlend : 0) +
      (frame.previousWeather === 'sunny' ? 1 - frame.weatherBlend : 0)

    if (solo !== 'shadow' && solo !== 'text') {
      if (texture.canvas.width !== width || texture.canvas.height !== height) {
        resize(texture.canvas, width, height)
        output = texture.ctx.createImageData(width, height)
      }
      const pixels = output.data
      const dark = material.adaptive ? 1 - clamp((palette.brightness - 95) / 95, 0, 1) : 0
      const tint = layer('tint') ? clamp(material.tint * (0.67 + palette.activity * 0.65 + dark * 0.45), 0, 0.65) : 0
      const environ = blendColor(palette.color, blendColor([255, 250, 235], [25, 31, 43], dark), 0.43)
      const rim = Math.max(1, Math.min(material.rimWidth, box.height * 0.29) * scale)
      const saturation = layer('blur') ? material.saturation : 1
      const brightness = layer('blur') ? material.brightness * (1 - dark * 0.10) : 1
      const strength = layer('refraction') ? material.refraction : 0
      const dispersion = layer('refraction') ? material.dispersion : 0
      const rimLight = layer('highlight') ? material.highlight : 0
      const boxBlurFallback = !supportsFilter && layer('blur') ? Math.round(material.blur * scale) : 0
      const clipLeft = Math.max(0, Math.ceil(-sampleX))
      const clipRight = Math.min(sampleWidth - 1, Math.floor(frame.stageWidth * scale - sampleX - 1))
      const clipTop = Math.max(0, Math.ceil(-sampleY))
      const clipBottom = Math.min(sampleHeight - 1, Math.floor(frame.stageHeight * scale - sampleY - 1))
      const rows = new Float32Array(height)
      const cols = new Float32Array(width)
      for (let y = 0; y < height; y++) rows[y] = Math.sin(y / height * 6.5 - frame.time * 1.15)
      for (let x = 0; x < width; x++) cols[x] = Math.sin(x / width * 8.2 + frame.time * 0.72)
      const low = clamp(bands.low, 0, 1)
      const high = clamp(bands.high, 0, 1)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x
          const target = index * 4
          const maskAlpha = geometry.alpha[index]
          pixels[target + 3] = maskAlpha
          if (!maskAlpha) continue

          const s = x + margin
          const t = y + margin
          const depth = geometry.distance[index]
          const edge = Math.max(0, 1 - depth / rim)
          const profile = edge * edge * (0.55 + edge * 0.45)
          const nx = geometry.normalX[index]
          const ny = geometry.normalY[index]
          const ripple = rows[y] * cols[x]
          const offset = strength * rim * profile * (1 + ripple * (0.09 + low * 0.28))
          const micromotion = strength * scale * (sun * 1.25 + low * 1.8) * ripple
          const sx = clamp(s + nx * offset + micromotion, clipLeft, clipRight)
          const sy = clamp(t + ny * offset + micromotion * 0.64, clipTop, clipBottom)
          const left = sx | 0, top = sy | 0
          const wx = sx - left, wy = sy - top
          const a = (top * sampleWidth + left) * 4
          const b = left < clipRight ? a + 4 : a
          const c = top < clipBottom ? a + sampleWidth * 4 : a
          const d = left < clipRight ? c + 4 : c
          const chroma = offset * dispersion
          let r = mix(mix(sampled[a], sampled[b], wx), mix(sampled[c], sampled[d], wx), wy)
          let g = mix(mix(sampled[a + 1], sampled[b + 1], wx), mix(sampled[c + 1], sampled[d + 1], wx), wy)
          let blue = mix(mix(sampled[a + 2], sampled[b + 2], wx), mix(sampled[c + 2], sampled[d + 2], wx), wy)

          if (chroma > 0.42) {
            const redX = clamp(Math.round(sx + nx * chroma), clipLeft, clipRight)
            const redY = clamp(Math.round(sy + ny * chroma), clipTop, clipBottom)
            const blueX = clamp(Math.round(sx - nx * chroma), clipLeft, clipRight)
            const blueY = clamp(Math.round(sy - ny * chroma), clipTop, clipBottom)
            const chromaWeight = Math.min(1, chroma * 0.68)
            r = mix(r, sampled[(redY * sampleWidth + redX) * 4], chromaWeight)
            blue = mix(blue, sampled[(blueY * sampleWidth + blueX) * 4 + 2], chromaWeight)
          }
          if (boxBlurFallback > 0) {
            const leftBlur = (top * sampleWidth + Math.max(clipLeft, left - boxBlurFallback)) * 4
            const rightBlur = (top * sampleWidth + Math.min(clipRight, left + boxBlurFallback)) * 4
            const topBlur = (Math.max(clipTop, top - boxBlurFallback) * sampleWidth + left) * 4
            const bottomBlur = (Math.min(clipBottom, top + boxBlurFallback) * sampleWidth + left) * 4
            r = (2 * r + sampled[leftBlur] + sampled[rightBlur] + sampled[topBlur] + sampled[bottomBlur]) / 6
            g = (2 * g + sampled[leftBlur + 1] + sampled[rightBlur + 1] + sampled[topBlur + 1] + sampled[bottomBlur + 1]) / 6
            blue = (2 * blue + sampled[leftBlur + 2] + sampled[rightBlur + 2] + sampled[topBlur + 2] + sampled[bottomBlur + 2]) / 6
          }
          const luma = luminance(r, g, blue)
          const viewLight = clamp(0.72 * ny + 0.60 * nx, -1, 1)
          const reflection = rimLight * profile * (0.06 + Math.max(0, viewLight) * 0.36 +
            (ripple + 1) * high * 0.07 + Math.max(0, -viewLight) * 0.13)
          const shade = 1 - rimLight * Math.max(0, -viewLight) * edge * (1 - edge) * 0.35
          const reflect = viewLight >= 0 ? glow : fresnel
          pixels[target] = mix(mix(luma + (r - luma) * saturation, environ[0], tint) * brightness * shade, reflect[0], reflection)
          pixels[target + 1] = mix(mix(luma + (g - luma) * saturation, environ[1], tint) * brightness * shade, reflect[1], reflection)
          pixels[target + 2] = mix(mix(luma + (blue - luma) * saturation, environ[2], tint) * brightness * shade, reflect[2], reflection)
        }
      }

      texture.ctx.putImageData(output, 0, 0)
      ctx.save()
      ctx.clip(outline)
      ctx.drawImage(texture.canvas, box.x, box.y, box.width, box.height)
      ctx.restore()
    }
    if (layer('highlight')) drawRim(ctx, outline, box, glow, fresnel, material.highlight, frame.time, bands.high)
    if (solo === null) {
      drawWater(ctx, outline, box, fresnel, rain, frame.time)
      drawFrost(ctx, outline, box, geometry, fresnel, snow)
    }
    if (solo === 'text') {
      // Keep the sample on the stage while the source backdrop stays fully visible.
      const darkInk = material.adaptive && palette.brightness > 161
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `600 ${Math.min(26, box.width / 16)}px system-ui, sans-serif`
      ctx.shadowColor = darkInk ? '#fff5dc' : '#102134'
      ctx.shadowBlur = 8
      ctx.fillStyle = darkInk ? '#142536' : '#f6fbff'
      ctx.fillText('自适应文字', box.x + box.width / 2, box.y + box.height * 0.54)
    }
    ctx.restore()
  }
}
