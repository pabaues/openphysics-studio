import { AlertTriangle, Box, Grid3X3, Maximize2 } from 'lucide-react'
import { createRectangularMesh } from '@/lib/fem/mesh'
import { resultValues } from '@/lib/fem/study'
import type { AnySimulationResult, HeatModel } from '@/lib/fem/types'

export type ViewMode = 'geometry' | 'mesh' | 'results'
export type ResultQuantity = 'temperature' | 'flux' | 'potential' | 'electricField' | 'displacement' | 'vonMises'

interface SimulationCanvasProps {
  model: HeatModel
  result: AnySimulationResult | null
  view: ViewMode
  quantity: ResultQuantity
  showMesh: boolean
  stale: boolean
}

const WIDTH = 900
const HEIGHT = 520
const COLORS = ['#253494', '#225ea8', '#1d91c0', '#41b6c4', '#a1dab4', '#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026']
const RGB_COLORS = COLORS.map((color) => [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16)))

function colorAt(value: number, min: number, max: number): string {
  if (max - min <= Math.max(1, Math.abs(min), Math.abs(max)) * 1e-7) return COLORS[5]!
  const position = Math.max(0, Math.min(1, (value - min) / (max - min))) * (COLORS.length - 1)
  const lower = Math.floor(position)
  const upper = Math.min(COLORS.length - 1, lower + 1)
  const fraction = position - lower
  const rgb = RGB_COLORS[lower]!.map((channel, index) => Math.round(channel + fraction * (RGB_COLORS[upper]![index]! - channel)))
  return `rgb(${rgb.join(',')})`
}

function scientific(value: number): string {
  if (value === 0) return '0'
  return Math.abs(value) >= 10000 || Math.abs(value) < 0.01 ? value.toExponential(2) : value.toFixed(2)
}

export function SimulationCanvas({ model, result, view, quantity, showMesh, stale }: SimulationCanvasProps) {
  const domain = view === 'results' && result ? result.mesh : model.geometry
  const scale = Math.min(680 / domain.width, 350 / domain.height)
  const originX = (WIDTH - domain.width * scale) / 2 - 35
  const originY = (HEIGHT + domain.height * scale) / 2
  const px = (x: number) => originX + x * scale
  const py = (y: number) => originY - y * scale
  const mesh = view === 'mesh'
    ? createRectangularMesh(model.geometry.width, model.geometry.height, model.mesh.nx, model.mesh.ny)
    : result?.mesh
  const structural = result?.physics === 'elasticity' ? result : null
  const deformationScale = structural && structural.maximum > 0 ? 0.12 * Math.max(domain.width, domain.height) / structural.maximum : 1
  const displayPoint = (index: number) => {
    const node = mesh!.nodes[index]!
    if (!structural || view !== 'results') return node
    const displacement = structural.displacement[index]!
    return { x: node.x + deformationScale * displacement.x, y: node.y + deformationScale * displacement.y }
  }
  const nodal = quantity === 'temperature' || quantity === 'potential' || quantity === 'displacement'
  const values = !result ? undefined : nodal ? resultValues(result)
    : result.physics === 'heat' ? result.flux.map((item) => item.magnitude)
      : result.physics === 'electrostatics' ? result.electricField.map((item) => item.magnitude)
        : result.vonMises
  const vectors = !result ? [] : result.physics === 'heat' ? result.flux : result.physics === 'electrostatics' ? result.electricField : []
  const min = values ? Math.min(...values) : 0
  const max = values ? Math.max(...values) : 1
  const unit = result?.physics === 'electrostatics' ? nodal ? 'V' : 'V/m'
    : result?.physics === 'elasticity' ? nodal ? 'm' : 'Pa'
      : nodal ? '°C' : 'W/m²'
  const fieldName = result?.physics === 'electrostatics' ? nodal ? 'Electric potential' : 'Electric field magnitude'
    : result?.physics === 'elasticity' ? nodal ? 'Displacement magnitude' : 'von Mises stress'
      : nodal ? 'Temperature field' : 'Heat flux magnitude'

  return <div className="canvas-wrap">
    <svg className="simulation-canvas" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${view} visualization`}>
      <defs>
        <pattern id="smallGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e8edf3" strokeWidth="0.7" /></pattern>
        <linearGradient id="colorScale" x1="0" x2="0" y1="1" y2="0">{COLORS.map((color, index) => <stop key={color} offset={`${(index / (COLORS.length - 1)) * 100}%`} stopColor={color} />)}</linearGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="#f8fafc" /><rect width={WIDTH} height={HEIGHT} fill="url(#smallGrid)" />
      <line x1="55" y1="455" x2="825" y2="455" stroke="#cbd5e1" markerEnd="url(#arrow)" /><line x1="55" y1="455" x2="55" y2="55" stroke="#cbd5e1" markerEnd="url(#arrow)" />
      <text x="830" y="460" className="axis-label">x</text><text x="48" y="45" className="axis-label">y</text>

      {view === 'geometry' && <g>
        <rect x={px(0)} y={py(model.geometry.height)} width={model.geometry.width * scale} height={model.geometry.height * scale} rx="2" fill="#dcecff" stroke="#3b82f6" strokeWidth="2" />
        {[[0, 0], [model.geometry.width, 0], [model.geometry.width, model.geometry.height], [0, model.geometry.height]].map(([x, y], i) => <circle key={i} cx={px(x!)} cy={py(y!)} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />)}
        <text x={px(model.geometry.width / 2)} y={py(model.geometry.height / 2)} className="domain-label">Domain 1</text>
      </g>}

      {(view === 'mesh' || view === 'results') && mesh && <g>
        {structural && view === 'results' && <rect x={px(0)} y={py(domain.height)} width={domain.width * scale} height={domain.height * scale} fill="none" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth="1" />}
        {mesh.triangles.map((triangle, index) => {
          const points = triangle.map((node) => { const point = displayPoint(node); return `${px(point.x)},${py(point.y)}` }).join(' ')
          const value = view === 'results' && values ? nodal ? triangle.reduce((sum, node) => sum + values[node]!, 0) / 3 : values[index]! : 0
          const fill = view === 'results' ? colorAt(value, min, max) : '#f8fbff'
          return <polygon key={index} points={points} fill={fill} stroke={view === 'mesh' || showMesh ? '#64748b' : fill} strokeWidth={view === 'mesh' ? 0.75 : showMesh ? 0.45 : 0.15}><title>{view === 'results' ? `${fieldName}: ${scientific(value)} ${unit}` : `Triangle ${index + 1}`}</title></polygon>
        })}
        {!structural && <rect x={px(0)} y={py(domain.height)} width={domain.width * scale} height={domain.height * scale} fill="none" stroke="#334155" strokeWidth="1.4" />}
        {view === 'results' && quantity !== 'vonMises' && quantity !== 'displacement' && !nodal && vectors.map((vector, index) => {
          if (index % Math.max(1, Math.floor(vectors.length / 45)) !== 0) return null
          const triangle = mesh.triangles[index]!
          const cx = triangle.reduce((sum, node) => sum + mesh.nodes[node]!.x, 0) / 3
          const cy = triangle.reduce((sum, node) => sum + mesh.nodes[node]!.y, 0) / 3
          const length = vector.magnitude > 0 ? 13 : 0
          const dx = (vector.x / vector.magnitude) * length
          const dy = (vector.y / vector.magnitude) * length
          return <line key={`vector-${index}`} x1={px(cx) - dx / 2} y1={py(cy) + dy / 2} x2={px(cx) + dx / 2} y2={py(cy) - dy / 2} stroke="#172033" strokeWidth="1.2" markerEnd="url(#arrow)" opacity="0.8" />
        })}
      </g>}

      {view !== 'results' && <g className="dimensions"><line x1={px(0)} y1={py(0) + 28} x2={px(model.geometry.width)} y2={py(0) + 28} /><text x={px(model.geometry.width / 2)} y={py(0) + 46}>{model.geometry.width} m</text><text x={px(0) - 12} y={py(model.geometry.height / 2)} transform={`rotate(-90 ${px(0) - 12} ${py(model.geometry.height / 2)})`}>{model.geometry.height} m</text></g>}
      {view === 'results' && result && <g><rect x="825" y="110" width="13" height="270" fill="url(#colorScale)" stroke="#94a3b8" strokeWidth="0.6" /><text x="849" y="115" className="scale-text">{scientific(max)}</text><text x="849" y="385" className="scale-text">{scientific(min)}</text><text x="831" y="94" className="scale-title">{unit}</text></g>}
      {structural && view === 'results' && <text x={px(domain.width / 2)} y={py(0) + 46} className="scale-text">Deformed shape · automatic scale ×{scientific(deformationScale)}</text>}
      <text x={px(domain.width / 2)} y={py(domain.height) - 18} className="boundary-text top">TOP</text><text x={px(domain.width / 2)} y={py(0) + 20} className="boundary-text">BOTTOM</text>
      <text x={px(0) + 10} y={py(domain.height / 2)} className="boundary-text" transform={`rotate(-90 ${px(0) + 10} ${py(domain.height / 2)})`}>LEFT</text><text x={px(domain.width) - 10} y={py(domain.height / 2)} className="boundary-text" transform={`rotate(90 ${px(domain.width) - 10} ${py(domain.height / 2)})`}>RIGHT</text>
    </svg>
    <div className="viewport-label">{view === 'geometry' ? <Box size={14} /> : <Grid3X3 size={14} />}{view === 'geometry' ? 'Geometry 1' : view === 'mesh' ? 'Mesh 1' : fieldName}</div>
    <button className="viewport-expand" title="Fit view"><Maximize2 size={15} /></button>
    {stale && view === 'results' && <div className="stale-banner"><AlertTriangle size={14} />Parameters changed — compute to update</div>}
  </div>
}
