import type { WeatherId } from './config'

type Rgb = readonly [number, number, number]
type Ridge = readonly number[]

interface WeatherPalette {
  sky: readonly [string, string, string, string]
  glow: Rgb
  cloudLight: Rgb
  cloudShade: Rgb
  peaks: readonly [string, string, string, string, string]
  facet: Rgb
  water: readonly [string, string, string]
  glint: Rgb
}

const palettes: Record<WeatherId, WeatherPalette> = {
  sunny: {
    sky: ['#172839', '#437090', '#87b3c7', '#e7bf92'], glow: [255, 194, 115],
    cloudLight: [255, 222, 181], cloudShade: [175, 158, 157],
    peaks: ['#91a5ad', '#688a9e', '#466880', '#234759', '#142e3b'],
    facet: [208, 223, 224], water: ['#597f91', '#294e66', '#102832'], glint: [255, 216, 161],
  },
  cloudy: {
    sky: ['#222d41', '#4f6280', '#8795aa', '#bbc1cc'], glow: [172, 177, 205],
    cloudLight: [201, 207, 227], cloudShade: [67, 76, 103],
    peaks: ['#8a96ae', '#647b95', '#4c5e79', '#34455f', '#202f44'],
    facet: [179, 190, 220], water: ['#637991', '#364d66', '#182738'], glint: [168, 188, 225],
  },
  rainy: {
    sky: ['#111c32', '#2b4163', '#506c87', '#7b9aac'], glow: [102, 161, 195],
    cloudLight: [154, 181, 206], cloudShade: [28, 41, 67],
    peaks: ['#637e9b', '#4c6683', '#344f70', '#253d59', '#14273e'],
    facet: [138, 181, 212], water: ['#3f647f', '#23445e', '#101c30'], glint: [124, 185, 215],
  },
  snow: {
    sky: ['#2a4259', '#6687a1', '#bed5df', '#e2ebed'], glow: [218, 243, 254],
    cloudLight: [242, 250, 252], cloudShade: [129, 160, 183],
    peaks: ['#abbfcb', '#8aa6bb', '#6689a5', '#456a86', '#2b445f'],
    facet: [237, 250, 255], water: ['#91b4ca', '#4c7d9d', '#1e344b'], glint: [205, 234, 251],
  },
}

// Heights are measured downward from the sky. The five ridges converge on the lake.
const ridges: readonly Ridge[] = [
  [.64, .607, .565, .575, .542, .596, .538, .52, .578, .587, .565, .592, .555, .528, .56, .548, .588, .56, .603, .62, .592, .611, .58, .595, .616],
  [.646, .589, .56, .578, .595, .58, .612, .596, .617, .622, .648, .633, .645, .625, .641, .604, .587, .62, .598, .537, .52, .564, .551, .58, .562],
  [.626, .574, .539, .57, .592, .573, .602, .62, .609, .646, .66, .672, .673, .666, .661, .64, .653, .631, .638, .596, .613, .588, .545, .579, .584],
  [.688, .641, .604, .633, .618, .65, .674, .672, .691, .694, .698, .698, .7, .696, .688, .692, .679, .677, .657, .642, .615, .639, .595, .575, .606],
  [.667, .688, .687, .704, .712, .712, .72, .721, .723, .722, .721, .723, .726, .727, .732, .73, .725, .725, .708, .701, .697, .664, .656, .647, .631],
]

const rgba = (color: Rgb, alpha: number) => `rgba(${color.join(',')},${alpha})`
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount
const smooth = (value: number) => value * value * (3 - 2 * value)

function random(seed: number) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function hash(x: number, y: number, seed: number) {
  let value = Math.imul(x + seed, 374761393) + Math.imul(y, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  return lerp(
    lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), fx),
    lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), fx),
    fy,
  )
}

function turbulence(x: number, y: number, seed: number) {
  let detail = 0
  let weight = .53
  for (let octave = 0; octave < 5; octave += 1) {
    detail += noise(x, y, seed + octave * 23) * weight
    weight *= .5
    x *= 2.07
    y *= 2.07
  }
  return detail
}

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  return { canvas, ctx }
}

function halo(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: Rgb, alpha: number) {
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius)
  fill.addColorStop(0, rgba(color, alpha))
  fill.addColorStop(.38, rgba(color, alpha * .54))
  fill.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = fill
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number, theme: WeatherId) {
  const palette = palettes[theme]
  const sky = ctx.createLinearGradient(0, 0, width * .26, height * .69)
  for (const [index, stop] of [0, .33, .73, 1].entries()) sky.addColorStop(stop, palette.sky[index])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  const radius = Math.min(Math.max(height * .64, width * .34), width * .9)
  const sunX = width * (width < height ? .23 : .245)
  const sunY = height * .345
  halo(ctx, sunX, sunY + height * .07, radius, palette.glow, theme === 'sunny' ? .78 : .47)
  halo(ctx, width * .83, height * .51, radius * .82, theme === 'sunny' ? [102, 203, 236] : palette.glint, .25)

  if (theme === 'sunny') {
    halo(ctx, sunX, sunY, Math.min(width, height) * .158, [255, 222, 161], .9)
    halo(ctx, sunX, sunY, Math.min(width, height) * .053, [255, 224, 162], .76)
    const disk = Math.min(width, height) * .019
    const center = ctx.createRadialGradient(sunX, sunY, disk * .71, sunX, sunY, disk)
    center.addColorStop(0, '#fff5d8')
    center.addColorStop(.76, '#fff1cc')
    center.addColorStop(1, 'rgba(255,239,201,0)')
    ctx.fillStyle = center
    ctx.fillRect(sunX - disk, sunY - disk, disk * 2, disk * 2)
  }

  const edge = ctx.createLinearGradient(0, 0, 0, height * .23)
  edge.addColorStop(0, 'rgba(8,18,31,.26)')
  edge.addColorStop(1, 'rgba(8,18,31,0)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, width, height * .23)
}

function createCloud(theme: WeatherId, slot: number) {
  const { canvas, ctx } = surface(430, 158)
  const { width, height } = canvas
  const palette = palettes[theme]
  const image = ctx.createImageData(width, height)
  const thick = theme === 'cloudy' || theme === 'rainy'
  const seed = slot * 83 + 49

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width
      const v = y / height
      const wisp = turbulence(u * 7.4 + 14, v * (thick ? 4.1 : 6.6) + 7, seed)
      const rise = noise(u * 5 + 27, 19, seed) * .5 + .2
      const envelope = Math.sin(u * Math.PI) ** .75 * Math.max(0, 1 - (Math.abs(v - rise) / .55) ** 1.9)
      const density = clamp((wisp * .81 + envelope * .29 - (thick ? .43 : .49)) * (thick ? 5.8 : 5.3))
      const opacity = smooth(density) * smooth(clamp(u * 14)) * smooth(clamp((1 - u) * 14))
        * smooth(clamp(v * 9)) * smooth(clamp((1 - v) * 8))
      const light = thick ? clamp(.94 - v * .92 - density * .37) : clamp(.99 - v * .53 + (1 - density) * .13)
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c += 1) image.data[i + c] = lerp(palette.cloudShade[c], palette.cloudLight[c], light)
      image.data[i + 3] = opacity * 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function drawClouds(
  ctx: CanvasRenderingContext2D, width: number, height: number, theme: WeatherId,
  clouds: readonly HTMLCanvasElement[], time: number,
) {
  const thick = theme === 'cloudy' || theme === 'rainy'
  const presets = thick
    ? [[-.49, .035, 1.28, .38, .77, .0015], [.19, .06, 1.13, .37, .88, -.0018], [-.21, .21, 1.07, .26, .47, .0021], [.43, .29, .83, .19, .5, -.0014]]
    : [[.32, .055, .84, .20, .64, -.0017], [-.31, .135, .78, .17, .42, .0015], [.44, .275, .74, .19, .81, -.0013], [-.24, .403, .81, .145, .51, .0011]]

  ctx.save()
  const alpha = ctx.globalAlpha
  for (const [i, [x, y, w, h, opacity, drift]] of presets.entries()) {
    ctx.globalAlpha = alpha * opacity
    const glide = Math.sin(time * .042 + i) * drift * 45 - Math.sin(i) * drift * 45
    ctx.drawImage(clouds[i % clouds.length], (x + glide) * width, y * height, w * width, h * height)
  }
  ctx.restore()
}

function ridgeY(ridge: Ridge, amount: number, seed: number, height: number) {
  const u = clamp(amount) * (ridge.length - 1)
  const left = Math.min(ridge.length - 2, Math.floor(u))
  const part = u - left
  const edge = lerp(ridge[left], ridge[left + 1], lerp(part, smooth(part), .31))
  const gravel = (noise(amount * 124, 10, seed) - .5) * .009
    + (noise(amount * 247, 17, seed) - .5) * .003
    + (noise(amount * 53, 21, seed) - .5) * .014
  return (edge + gravel) * height
}

function drawRidge(ctx: CanvasRenderingContext2D, width: number, height: number, theme: WeatherId, index: number) {
  const palette = palettes[theme]
  const ridge = ridges[index]
  const seed = 537 + index * 17
  const lowEdge = [.675, .689, .709, .721, .737][index]
  const boundary = new Path2D()
  boundary.moveTo(-2, height * lowEdge)
  for (let i = 0; i <= 540; i += 1) boundary.lineTo(width * i / 540, ridgeY(ridge, i / 540, seed, height))
  for (let i = 120; i >= 0; i -= 1) {
    boundary.lineTo(width * i / 120, height * (lowEdge + (noise(i / 5, 20, seed) - .5) * (index > 2 ? .015 : .007)))
  }
  boundary.closePath()

  ctx.save()
  ctx.clip(boundary)
  ctx.fillStyle = palette.peaks[index]
  ctx.fillRect(0, 0, width, height)

  const upperAir = ctx.createLinearGradient(0, height * .51, width * .28, height * lowEdge)
  upperAir.addColorStop(0, rgba(palette.facet, index < 2 ? .35 : .18))
  upperAir.addColorStop(1, rgba(palette.facet, 0))
  ctx.fillStyle = upperAir
  ctx.fillRect(0, 0, width, height)

  const chance = random(seed)
  const facetCount = 150
  for (let i = 0; i < facetCount; i += 1) {
    const u = chance()
    const x = u * width
    const y = ridgeY(ridge, u, seed, height) + chance() ** 2.5 * height * .065
    const spread = (chance() ** 2.5 * .045 + .003) * width
    const slope = (chance() * .097 + .018) * height
    const light = i % 3 !== 1
    const color = light ? palette.facet : [7, 21, 40] as const
    const dust = light && (theme === 'snow' || index < 2) ? .17 : .075
    const shade = ctx.createLinearGradient(x, y, x - spread * .72, y + slope)
    shade.addColorStop(0, rgba(color, dust + chance() * .15))
    shade.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = shade
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + spread * .17, y + slope * .43)
    ctx.lineTo(x + spread * .71, y + slope * .64)
    ctx.lineTo(x + spread * .45, y + slope * .83)
    ctx.lineTo(x + spread * .87, y + slope * 1.27)
    ctx.lineTo(x - spread * 1.53, y + slope * 1.06)
    ctx.lineTo(x - spread * .66, y + slope * .65)
    ctx.lineTo(x - spread * .52, y + slope * .32)
    ctx.closePath()
    ctx.fill()
  }

  const haze = ctx.createLinearGradient(0, height * (lowEdge - .104), 0, height * lowEdge)
  haze.addColorStop(0, rgba(palette.glint, 0))
  haze.addColorStop(1, rgba(palette.glint, index < 3 ? .23 : .1))
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawTrees(ctx: CanvasRenderingContext2D, width: number, height: number, theme: WeatherId) {
  const chance = random(1187)
  const ridge = ridges[4]
  ctx.fillStyle = theme === 'snow' ? '#2b4960' : palettes[theme].peaks[4]

  for (let i = 0; i < 190; i += 1) {
    const bank = chance() ** 1.9 * .31
    const u = i % 2 ? bank : 1 - bank
    const x = u * width
    const y = ridgeY(ridge, u, 605, height) + chance() ** 2 * height * .015
    const h = (1.3 + chance() ** 2 * Math.min(19, height * .045)) * (1 - bank * 2.3)
    ctx.beginPath()
    ctx.moveTo(x, y - h)
    ctx.lineTo(x + h * .12, y - h * .57)
    ctx.lineTo(x + h * .07, y - h * .6)
    ctx.lineTo(x + h * .28, y)
    ctx.lineTo(x - h * .24, y)
    ctx.lineTo(x - h * .09, y - h * .55)
    ctx.lineTo(x - h * .13, y - h * .5)
    ctx.closePath()
    ctx.fill()
  }
}

function drawWater(ctx: CanvasRenderingContext2D, width: number, height: number, theme: WeatherId) {
  const palette = palettes[theme]
  const waterline = height * .657
  const water = ctx.createLinearGradient(0, waterline, width * .09, height)
  water.addColorStop(0, palette.water[0])
  water.addColorStop(.31, palette.water[1])
  water.addColorStop(1, palette.water[2])
  ctx.fillStyle = water
  ctx.fillRect(0, waterline, width, height - waterline)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, waterline, width, height - waterline)
  ctx.clip()
  ctx.translate(width * .255, height * .72)
  ctx.scale(1.28, .33)
  halo(ctx, 0, 0, Math.max(width * .35, height * .36), palette.glow, theme === 'sunny' ? .44 : .2)
  ctx.restore()

  const chance = random(8227)
  for (let i = 0; i < 470; i += 1) {
    const depth = chance() ** 1.52
    const y = waterline + depth * (height - waterline)
    const x = chance() * width
    const length = (chance() ** 1.8 * .11 + .003) * width * (.22 + depth * .8)
    const reflection = Math.max(0, 1 - Math.abs(x / width - .25) * 4.9)
    const color = i % 4 ? palette.glint : [4, 26, 40] as const
    ctx.fillStyle = rgba(color, (chance() * .07 + reflection * (theme === 'sunny' ? .16 : .075)) * (1 - depth * .72))
    ctx.fillRect(x, y, length, .5 + depth * 1.2)
  }
}

function drawLandscape(ctx: CanvasRenderingContext2D, width: number, height: number, theme: WeatherId) {
  drawWater(ctx, width, height, theme)
  ridges.forEach((_, i) => drawRidge(ctx, width, height, theme, i))
  drawTrees(ctx, width, height, theme)
}

interface Grain {
  x: number
  y: number
  size: number
  velocity: number
  phase: number
}

const chance = random(1679)
const grains: readonly Grain[] = Array.from({ length: 136 }, () => ({
  x: chance(), y: chance(), size: chance(), velocity: chance(), phase: chance() * Math.PI * 2,
}))

function wrap(value: number) {
  return value - Math.floor(value)
}

function drawRain(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  for (const { x, y, size, velocity } of grains) {
    const dropX = wrap(x - time * (.039 + velocity * .015)) * width
    const dropY = wrap(y + time * (.27 + velocity * .47)) * height
    const length = 7 + size * 24
    ctx.strokeStyle = `rgba(187,225,244,${.05 + size * .16})`
    ctx.lineWidth = .55 + size * .62
    ctx.beginPath()
    ctx.moveTo(dropX, dropY)
    ctx.lineTo(dropX - length * .27, dropY + length)
    ctx.stroke()
  }

  for (const { x, y, velocity, size } of grains.slice(0, 28)) {
    const life = wrap(velocity + time * (.26 + size * .25))
    const ring = 1.5 + life * (4 + size * 18)
    ctx.strokeStyle = `rgba(171,215,236,${.32 * (1 - life) * (1 - y * .55)})`
    ctx.lineWidth = .8
    ctx.beginPath()
    ctx.ellipse(x * width, (.738 + y * .253) * height, ring, ring * (.12 + y * .2), 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawSnow(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  for (const { x, y, size, velocity, phase } of grains) {
    const flakeX = wrap(x + Math.sin(time * .45 + phase) * (.015 + velocity * .029) + time * .007) * width
    const flakeY = wrap(y + time * (.012 + size * .077)) * height
    const radius = .5 + size ** 2.9 * 2.8
    ctx.fillStyle = `rgba(241,251,255,${.19 + size * .57})`
    ctx.beginPath()
    ctx.arc(flakeX, flakeY, radius, 0, Math.PI * 2)
    ctx.fill()
    if (size > .9) halo(ctx, flakeX, flakeY, radius * 2.8, [228, 253, 255], .25)
  }
}

function drawSunSpecks(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const unit = Math.min(width, height)
  for (const { x, y, size, velocity, phase } of grains.slice(0, 28)) {
    const speckX = wrap(x + time * (.005 + velocity * .002)) * width
    const speckY = (y * .55 + .12 + Math.sin(time * .18 + phase) * .018) * height
    const alpha = (.03 + velocity * .13) * (.66 + Math.sin(time * .48 + phase) * .32)
    halo(ctx, speckX, speckY, (1.1 + size ** 3 * 6) * Math.max(.65, unit / 900), [255, 235, 181], alpha)
  }

  for (const { x, y, size, velocity } of grains.slice(50, 81)) {
    const shimmer = .5 + Math.sin(time * (.4 + velocity) + y * 421) * .5
    ctx.fillStyle = `rgba(255,220,154,${shimmer * .12})`
    ctx.fillRect((.14 + x * .24) * width, (.742 + y * .23) * height, 1 + size * width * .025, 1)
  }
}

interface CachedWeather {
  sky: HTMLCanvasElement
  terrain: HTMLCanvasElement
}

/** Paints the weather scene in logical pixels. Animated details sit over cached scenery. */
export function createWeatherRenderer() {
  const cached = new Map<WeatherId, CachedWeather>()
  const cloudCache = new Map<WeatherId, readonly HTMLCanvasElement[]>()
  let previousWidth = 0
  let previousHeight = 0

  return function drawWeather(
    ctx: CanvasRenderingContext2D, width: number, height: number, theme: WeatherId, time: number, reduced: boolean,
  ) {
    if (width <= 0 || height <= 0) return
    if (width !== previousWidth || height !== previousHeight) {
      cached.clear()
      previousWidth = width
      previousHeight = height
    }

    let scenery = cached.get(theme)
    if (!scenery) {
      const scale = Math.min(1.22, 1700 / Math.max(width, height))
      const sky = surface(Math.ceil(width * scale), Math.ceil(height * scale))
      const terrain = surface(sky.canvas.width, sky.canvas.height)
      drawSky(sky.ctx, sky.canvas.width, sky.canvas.height, theme)
      drawLandscape(terrain.ctx, terrain.canvas.width, terrain.canvas.height, theme)
      scenery = { sky: sky.canvas, terrain: terrain.canvas }
      cached.set(theme, scenery)
    }

    let clouds = cloudCache.get(theme)
    if (!clouds) {
      clouds = [createCloud(theme, 0), createCloud(theme, 1)]
      cloudCache.set(theme, clouds)
    }

    const elapsed = reduced ? 0 : time
    ctx.save()
    ctx.drawImage(scenery.sky, 0, 0, width, height)
    drawClouds(ctx, width, height, theme, clouds, elapsed)
    ctx.drawImage(scenery.terrain, 0, 0, width, height)
    if (theme === 'sunny') drawSunSpecks(ctx, width, height, elapsed)
    if (theme === 'rainy') drawRain(ctx, width, height, elapsed)
    if (theme === 'snow') drawSnow(ctx, width, height, elapsed)
    ctx.restore()
  }
}
