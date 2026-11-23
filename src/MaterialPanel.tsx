import type { Material, MaterialLayer } from './config'

type NumberKey = Exclude<keyof Material, 'adaptive'>
type Control = { key: NumberKey; label: string; min: number; max: number; step: number; unit?: 'px' | '%' }

const groups: { id: MaterialLayer; label: string; controls: Control[] }[] = [
  { id: 'shadow', label: '投影', controls: [{ key: 'shadow', label: '阴影强度', min: 0, max: 1, step: .01, unit: '%' }] },
  { id: 'blur', label: '模糊与色调', controls: [
    { key: 'blur', label: '模糊', min: 0, max: 14, step: .5, unit: 'px' },
    { key: 'saturation', label: '饱和度', min: .5, max: 2.4, step: .05, unit: '%' },
    { key: 'brightness', label: '亮度', min: .5, max: 1.4, step: .02, unit: '%' },
  ] },
  { id: 'refraction', label: '边缘折射', controls: [
    { key: 'rimWidth', label: '边宽', min: 8, max: 70, step: 1, unit: 'px' },
    { key: 'refraction', label: '位移倍率', min: 0, max: 1.8, step: .05 },
    { key: 'dispersion', label: '色散', min: 0, max: .35, step: .01, unit: '%' },
  ] },
  { id: 'tint', label: '环境着色', controls: [{ key: 'tint', label: '着色强度', min: 0, max: .45, step: .01, unit: '%' }] },
  { id: 'highlight', label: '边缘高光', controls: [{ key: 'highlight', label: '亮边强度', min: 0, max: 1.5, step: .01, unit: '%' }] },
  { id: 'text', label: '文字适配', controls: [] },
]

export function Slider({ label, value, min = 0, max = 1, step = .01, display, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; display: string; onChange: (n: number) => void
}) {
  return <label className="slider-row">
    <span><span>{label}</span><output aria-hidden="true">{display}</output></span>
    <input type="range" aria-label={label} aria-valuetext={display} min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
  </label>
}

export function MaterialPanel({ material, onChange, solo, onSolo, reset }: {
  material: Material; onChange: (value: Material) => void; solo: MaterialLayer | null; onSolo: (id: MaterialLayer | null) => void; reset: () => void
}) {
  return <>
    <div className="material-top"><span>选择一个材质层查看效果</span><button className="text-button" type="button" onClick={reset}>重置材质</button></div>
    <div className="layer-options" role="group" aria-label="单独查看材质层">
      <button type="button" aria-pressed={solo === null} onClick={() => onSolo(null)}>全部</button>
      {groups.map((group) => <button key={group.id} type="button" aria-pressed={solo === group.id} onClick={() => onSolo(group.id)}>{group.label}</button>)}
    </div>
    {groups.filter((group) => solo === null || solo === group.id).map((group) => <section className="material-group" key={group.id}>
      <h3>{group.label}</h3>
      {group.controls.map(({ key, label, min, max, step, unit }) => <Slider key={key} label={label} value={material[key]}
        min={min} max={max} step={step} display={unit === '%' ? `${Math.round(material[key] * 100)}%` : `${material[key]}${unit ?? '×'}`}
        onChange={(value) => onChange({ ...material, [key]: value })} />)}
      {group.id === 'text' && <label className="switch-row"><span>随背景明暗调整文字颜色</span><input type="checkbox" role="switch" checked={material.adaptive} onChange={(e) => onChange({ ...material, adaptive: e.currentTarget.checked })} /></label>}
    </section>)}
  </>
}
