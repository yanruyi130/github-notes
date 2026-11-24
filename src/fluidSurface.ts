import {
  BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Mesh, PerspectiveCamera, Scene,
  ShaderMaterial, SRGBColorSpace, WebGLRenderer,
} from 'three'
import type { AudioInput } from './background'
import type { Climate, Rgb } from './climate'

export type FluidView = 'normal' | 'wireframe' | 'side'

interface FluidFrame {
  time: number
  phase: number
  climate: Climate
  audio: AudioInput
  detail: number
  view: FluidView
}

const COLUMNS = 168
const ROWS = 132

/** A single indexed surface, with more vertices in the region the camera sees up close. */
export function createFluidGeometry() {
  const positions = new Float32Array((COLUMNS + 1) * (ROWS + 1) * 3)
  const triangles: number[] = []
  for (let row = 0; row <= ROWS; row++) {
    const depth = row / ROWS
    const z = 13 - 20 * depth - 109 * depth ** 3
    for (let col = 0; col <= COLUMNS; col++) {
      const across = col / COLUMNS * 2 - 1
      const vertex = row * (COLUMNS + 1) + col
      positions[vertex * 3] = 20 * across + 64 * across ** 3
      positions[vertex * 3 + 2] = z
      if (col < COLUMNS && row < ROWS) {
        const below = vertex + COLUMNS + 1
        triangles.push(vertex, vertex + 1, below, vertex + 1, below + 1, below)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3).setUsage(DynamicDrawUsage))
  geometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(positions.length), 3).setUsage(DynamicDrawUsage))
  geometry.setIndex(triangles)
  return geometry
}

/** The same smooth height field is evaluated at every vertex. Phase is travel in world space. */
export function deformFluidGeometry(
  geometry: BufferGeometry, time: number, phase: number, waveAmplitude: number, music: Pick<AudioInput, 'low' | 'mid'>,
) {
  const positions = geometry.getAttribute('position')
  const values = positions.array
  const height = waveAmplitude * (1.23 + .45 * music.low)
  const bend = 1.45 + .63 * music.mid
  const travel = phase * 1.25
  const breathing = time * .24
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i] - travel
    const z = values[i + 2]
    const u = x + bend * Math.sin(.145 * x + .218 * z + breathing)
    const v = z + 1.55 * Math.sin(.203 * x - .138 * z - breathing * .77)
    const swell = Math.sin(.288 * u + .396 * v + .58 * Math.sin(.306 * u - .114 * v + .8))
    const trough = Math.sin(.523 * u - .178 * v + .44 * Math.sin(.18 * v - breathing * .83) + 1.9)
    const cross = Math.sin(.174 * u + .276 * v - breathing * .62 - 1.8)
    const field = .82 * swell + .51 * trough + .44 * cross
    const stretch = .92 + .13 * Math.sin(.126 * u + .186 * v + breathing * 1.2)
    values[i + 1] = height * stretch * (field + .1 * field ** 3)
  }
  positions.needsUpdate = true
  // Rebuild smooth vertex normals from the very triangles that are depth tested.
  geometry.computeVertexNormals()
}

const vertexShader = /* glsl */ `
  varying vec3 surfacePosition;
  varying vec3 surfaceNormal;

  void main() {
    surfacePosition = (modelMatrix * vec4(position, 1.0)).xyz;
    surfaceNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 depthColor;
  uniform vec3 bodyColor;
  uniform vec3 airColor;
  uniform vec3 glintColor;
  uniform vec3 horizonColor;
  uniform float daylight;
  uniform bool wireframeView;
  varying vec3 surfacePosition;
  varying vec3 surfaceNormal;

  void main() {
    vec3 N = normalize(surfaceNormal);
    vec3 toEye = cameraPosition - surfacePosition;
    vec3 V = normalize(toEye);
    vec3 L = normalize(vec3(0.55, 0.56, -0.62));
    vec3 R = reflect(-V, N);
    float facing = max(0.0, dot(N, V));
    float diffuse = max(0.0, dot(N, L));
    float trough = smoothstep(-2.25, 0.8, surfacePosition.y);
    float openSky = smoothstep(-0.38, 0.83, R.y);
    float fresnel = 0.14 + 0.48 * pow(1.0 - facing, 3.5);

    vec3 color = mix(depthColor * 0.75, bodyColor, 0.28 + 0.41 * diffuse + 0.22 * trough);
    color *= 0.72 + 0.28 * trough;
    vec3 reflection = mix(depthColor, airColor, 0.37 + 0.63 * openSky);
    color = mix(color, reflection, fresnel * (0.65 + 0.35 * trough));

    // A broad sky lobe and a smaller sun lobe are both evaluated from the moving normals.
    float skyLobe = pow(max(0.0, dot(R, normalize(vec3(-0.32, 0.82, -0.47)))), 5.0);
    float sunLobe = pow(max(0.0, dot(R, L)), 16.0);
    color += airColor * skyLobe * (0.19 + 0.08 * daylight);
    color += glintColor * sunLobe * (0.22 + 0.40 * daylight);

    float distanceHaze = smoothstep(32.0, 107.0, length(toEye));
    color = mix(color, horizonColor, distanceHaze * 0.67);
    if (wireframeView) color = mix(glintColor, color, 0.32 + 0.42 * distanceHaze);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

function usePalette(color: Color, rgb: Rgb) {
  color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace)
}

export function setupFluidCamera(camera: PerspectiveCamera, aspect: number, view: FluidView) {
  camera.aspect = aspect
  camera.fov = view === 'side' ? 39 : 43
  if (view === 'side') {
    camera.position.set(16.5, 3.3, 7.3)
    camera.lookAt(-5, -.15, -10)
  } else {
    camera.position.set(0, 4.65, 10.5)
    camera.lookAt(.4, 1.25, -9.2)
  }
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

/** Render the opaque mesh into a transparent canvas; the caller copies this exact frame over the sky. */
export function createFluidSurface() {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setClearColor(0x000000, 0)
  const geometry = createFluidGeometry()
  const uniforms = {
    depthColor: { value: new Color() }, bodyColor: { value: new Color() },
    airColor: { value: new Color() }, glintColor: { value: new Color() }, horizonColor: { value: new Color() },
    daylight: { value: 0 }, wireframeView: { value: false },
  }
  const material = new ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: true, depthWrite: true })
  const scene = new Scene()
  const fluid = new Mesh(geometry, material)
  fluid.frustumCulled = false
  scene.add(fluid)
  const camera = new PerspectiveCamera(43, 1, .12, 190)
  let lastTime = NaN, lastPhase = NaN, lastAmplitude = NaN, lastLow = NaN, lastMid = NaN
  let lastView: FluidView | null = null, lastAspect = 0

  function render(width: number, height: number, { time, phase, climate, audio, detail, view }: FluidFrame) {
    const scale = Math.min(1, 1600 / width, Math.sqrt(1_350_000 / (width * height)), .76 + .24 * detail)
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale))
    if (renderer.domElement.width !== w || renderer.domElement.height !== h) renderer.setSize(w, h, false)
    const aspect = width / height
    if (aspect !== lastAspect || view !== lastView) {
      setupFluidCamera(camera, aspect, view)
      material.wireframe = view === 'wireframe'
      uniforms.wireframeView.value = material.wireframe
      lastView = view
      lastAspect = aspect
    }
    if (time !== lastTime || phase !== lastPhase || climate.waveAmplitude !== lastAmplitude || audio.low !== lastLow || audio.mid !== lastMid) {
      deformFluidGeometry(geometry, time, phase, climate.waveAmplitude, audio)
      lastTime = time
      lastPhase = phase
      lastAmplitude = climate.waveAmplitude
      lastLow = audio.low
      lastMid = audio.mid
    }
    const { palette } = climate
    usePalette(uniforms.depthColor.value, palette.undertow[0])
    usePalette(uniforms.bodyColor.value, palette.cobalt[2])
    usePalette(uniforms.airColor.value, palette.light[1])
    usePalette(uniforms.glintColor.value, palette.foam[2])
    usePalette(uniforms.horizonColor.value, palette.distant[2])
    uniforms.daylight.value = climate.sunlight
    renderer.render(scene, camera)
  }

  function dispose() {
    geometry.dispose()
    material.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }

  return { canvas: renderer.domElement, render, dispose }
}
