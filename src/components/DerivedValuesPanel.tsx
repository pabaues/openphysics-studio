import { Crosshair, Sigma } from 'lucide-react'
import { deriveValues } from '@/lib/fem/derived'
import type { AnySimulationResult } from '@/lib/fem/types'

function format(value: number) {
  return Math.abs(value) >= 10000 || (Math.abs(value) < 0.01 && value !== 0) ? value.toExponential(3) : value.toFixed(4)
}

export function DerivedValuesPanel({ result, frameIndex, onFrameChange }: {
  result: AnySimulationResult
  frameIndex: number
  onFrameChange: (index: number) => void
}) {
  const values = deriveValues(result)
  const unit = result.physics === 'heat' ? '°C' : result.physics === 'electrostatics' ? 'V' : 'm'
  const frames = result.physics === 'heat' ? result.transient?.frames : undefined
  return <section className="derived-panel" aria-label="Derived values">
    <div className="derived-title"><Sigma size={14} /><strong>Derived values</strong><span>{result.physics === 'elasticity' ? 'Nodal displacement magnitude · P1 interpolation' : 'Exact P1 domain integration'}</span></div>
    {frames && <label className="time-control"><span>Time <b>{format(frames[frameIndex]?.time ?? 0)} s</b></span><input aria-label="Time frame" type="range" min="0" max={frames.length - 1} step="1" value={frameIndex} onChange={(event) => onFrameChange(Number(event.target.value))} /></label>}
    <div className="derived-grid">
      <div><span>Domain average</span><strong>{format(values.average)} {unit}</strong></div>
      <div><span>Domain integral</span><strong>{format(values.integral)} {unit}·m²</strong></div>
      <div><span>Center probe</span><strong><Crosshair size={11} />{format(values.centerProbe)} {unit}</strong></div>
      <div><span>Area</span><strong>{format(values.area)} m²</strong></div>
    </div>
  </section>
}
