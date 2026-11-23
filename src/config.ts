export const WEATHER_IDS = ['sunny', 'cloudy', 'rainy', 'snow'] as const
export type WeatherId = typeof WEATHER_IDS[number]

interface WeatherTheme {
  label: string
  title: string
  english: string
  accent: string
  genre: string
  bpm: string
  builtin: { title: string; src: string } | null
}

export const WEATHER: Record<WeatherId, WeatherTheme> = {
  sunny: { label: '晴天', title: '晴空暖光', english: 'Golden Hour', accent: '#ffd698', genre: '轻钢琴、木吉他', bpm: '90–105', builtin: null },
  cloudy: { label: '阴天', title: '薄云低语', english: 'Cloud Drift', accent: '#d1dcff', genre: '柔和钢琴、氛围铺底', bpm: '65–80', builtin: null },
  rainy: { label: '雨天', title: '雨落湖面', english: 'After the Rain', accent: '#a8dbff', genre: 'Lo-fi 钢琴、轻柔节拍', bpm: '70–85', builtin: null },
  snow: { label: '下雪', title: '静雪微光', english: 'First Snow', accent: '#d6f5ff', genre: '音乐盒、钟琴、轻弦乐', bpm: '60–75', builtin: null },
}

export type ShapeId = 'slab' | 'cat' | 'rabbit' | 'dog'

export const SHAPES: { id: ShapeId; label: string; path: string }[] = [
  { id: 'slab', label: '圆角矩形', path: 'M 84 30 H 316 C 359 30 380 52 380 94 V 246 C 380 288 359 310 316 310 H 84 C 41 310 20 288 20 246 V 94 C 20 52 41 30 84 30 Z' },
  { id: 'cat', label: '猫咪', path: 'M 49 160 C 46 126 46 61 64 43 C 76 30 119 61 145 86 Q 200 70 255 86 C 281 61 324 30 336 43 C 354 61 354 126 351 160 Q 375 197 362 242 C 347 288 292 310 200 310 C 108 310 53 288 38 242 Q 25 197 49 160 Z' },
  { id: 'rabbit', label: '兔子', path: 'M 96 165 C 78 108 61 29 95 16 C 130 2 153 68 174 135 Q 200 130 226 135 C 247 68 270 2 305 16 C 339 29 322 108 304 165 Q 346 192 344 238 C 342 293 286 322 200 322 C 114 322 58 293 56 238 Q 54 192 96 165 Z' },
  { id: 'dog', label: '狗狗', path: 'M 102 72 C 130 48 164 41 200 41 C 236 41 270 48 298 72 C 333 75 352 111 373 155 C 393 201 379 229 357 233 Q 340 236 324 226 C 312 281 266 306 200 306 C 134 306 88 281 76 226 Q 60 236 43 233 C 21 229 7 201 27 155 C 48 111 67 75 102 72 Z' },
]

export type MaterialLayer = 'shadow' | 'blur' | 'refraction' | 'tint' | 'highlight' | 'text'

export interface Material {
  shadow: number
  blur: number
  saturation: number
  brightness: number
  refraction: number
  rimWidth: number
  dispersion: number
  tint: number
  highlight: number
  adaptive: boolean
}

export const DEFAULT_MATERIAL: Material = {
  shadow: 0.65, blur: 2, saturation: 1.65, brightness: 1.04, refraction: 1.1,
  rimWidth: 44, dispersion: 0.15, tint: 0.16, highlight: 0.8, adaptive: true,
}
