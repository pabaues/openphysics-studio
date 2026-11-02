import { deriveValues } from './derived'
import { materialForDomain } from './properties'
import type { SweepReport } from './sweep'
import type { AnySimulationResult, HeatModel } from './types'

function field(result: AnySimulationResult) {
  if (result.physics === 'heat') return { values: result.temperature, name: 'temperature_C', title: 'temperature field', unit: '°C' }
  if (result.physics === 'electrostatics') return { values: result.potential, name: 'potential_V', title: 'electric potential field', unit: 'V' }
  if (result.physics === 'custom') return { values: result.values, name: 'scalar_u', title: 'custom scalar field', unit: 'u' }
  return { values: result.displacement.map((value) => value.magnitude), name: 'displacement_m', title: 'displacement magnitude field', unit: 'm' }
}

export function toCsv(result: AnySimulationResult): string {
  if (result.physics === 'elasticity') {
    const rows = result.mesh.nodes.map((node, index) => {
      const displacement = result.displacement[index]!
      return [node.x, node.y, displacement.x, displacement.y, displacement.magnitude].join(',')
    })
    return ['x_m,y_m,ux_m,uy_m,displacement_m', ...rows].join('\n')
  }
  const { values, name } = field(result)
  const is3D = result.mesh.kind === 'tetrahedral'
  const rows = result.mesh.nodes.map((node, index) => is3D
    ? [node.x, node.y, node.z ?? 0, values[index]].join(',')
    : [node.x, node.y, values[index]].join(','))
  return [is3D ? `x_m,y_m,z_m,${name}` : `x_m,y_m,${name}`, ...rows].join('\n')
}

export function toVtk(result: AnySimulationResult): string {
  const { mesh } = result
  const { values, name, title } = field(result)
  const is3D = mesh.kind === 'tetrahedral'
  const cells = is3D ? mesh.tetrahedra : mesh.triangles
  const cellSize = is3D ? 4 : 3
  const domains = is3D ? mesh.tetrahedronDomains : mesh.triangles.map((_, index) => mesh.triangleDomains?.[index] ?? 0)
  const points = mesh.nodes.map((node) => `${node.x} ${node.y} ${node.z ?? 0}`).join('\n')
  const cellRows = cells.map((cell) => `${cellSize} ${cell.join(' ')}`).join('\n')
  const cellTypes = cells.map(() => is3D ? '10' : '5').join('\n')
  const structuralData = result.physics === 'elasticity' ? `VECTORS displacement_m double
${result.displacement.map((value) => `${value.x} ${value.y} 0`).join('\n')}` : ''
  const cellData = `CELL_DATA ${cells.length}
SCALARS domain_id int 1
LOOKUP_TABLE default
${domains.join('\n')}
${result.physics === 'elasticity' ? `SCALARS von_mises_stress_Pa double 1
LOOKUP_TABLE default
${result.vonMises.join('\n')}` : ''}`
  return `# vtk DataFile Version 3.0
OpenPhysics Studio ${title}
ASCII
DATASET UNSTRUCTURED_GRID
POINTS ${mesh.nodes.length} double
${points}
CELLS ${cells.length} ${cells.length * (cellSize + 1)}
${cellRows}
CELL_TYPES ${cells.length}
${cellTypes}
POINT_DATA ${mesh.nodes.length}
SCALARS ${name} double 1
LOOKUP_TABLE default
${values.join('\n')}
${structuralData}
${cellData}`
}

export function toDerivedCsv(result: AnySimulationResult): string {
  const values = deriveValues(result)
  const { unit } = field(result)
  const is3D = result.mesh.kind === 'tetrahedral'
  const measure = is3D ? 'volume' : 'area'
  const measureUnit = is3D ? 'm^3' : 'm^2'
  const header = is3D ? 'quantity,value,unit,x_m,y_m,z_m' : 'quantity,value,unit,x_m,y_m'
  const location = (point: { x: number; y: number; z?: number }) => is3D ? `${point.x},${point.y},${point.z ?? 0}` : `${point.x},${point.y}`
  const emptyLocation = is3D ? ',,' : ','
  return [
    header,
    `domain_${measure},${values.area},${measureUnit},${emptyLocation}`,
    `domain_integral,${values.integral},${unit}*${measureUnit},${emptyLocation}`,
    `${measure}_weighted_average,${values.average},${unit},${emptyLocation}`,
    `minimum,${values.minimum.value},${unit},${location(values.minimum.location)}`,
    `maximum,${values.maximum.value},${unit},${location(values.maximum.location)}`,
    `center_probe,${values.centerProbe},${unit},${location(result.mesh.centroid)}`,
    ...values.domains.flatMap((domain) => [
      `domain_${domain.domain + 1}_${measure},${domain.area},${measureUnit},${emptyLocation}`,
      `domain_${domain.domain + 1}_integral,${domain.integral},${unit}*${measureUnit},${emptyLocation}`,
      `domain_${domain.domain + 1}_average,${domain.average},${unit},${emptyLocation}`,
    ]),
  ].join('\n')
}

export function toSweepCsv(report: SweepReport): string {
  const rows = report.cases.map((entry) => [entry.value, entry.derived.average, entry.result.minimum, entry.result.maximum, entry.result.iterations, entry.result.relativeResidual].join(','))
  return [`parameter_${report.parameter},average,minimum,maximum,iterations,relative_residual`, ...rows].join('\n')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function toHtmlReport(model: HeatModel, result: AnySimulationResult): string {
  const values = deriveValues(result)
  const { title, unit } = field(result)
  const is3D = result.mesh.kind === 'tetrahedral'
  const measure = is3D ? 'volume' : 'area'
  const measureSymbol = is3D ? 'm³' : 'm²'
  const measureUnit = is3D ? 'm^3' : 'm^2'
  const row = (name: string, value: string) => `<tr><th>${name}</th><td>${escapeHtml(value)}</td></tr>`
  const location = (point: { x: number; y: number; z?: number }) => `(${point.x}, ${point.y}${is3D ? `, ${point.z ?? 0}` : ''}) m`
  const domainRows = model.geometry.domains.map((domain, domainIndex) => {
    const material = materialForDomain(model, domainIndex)
    const derived = values.domains.find((entry) => entry.domain === domainIndex)
    return row(domain.name, `k = ${material.conductivity} W/(m·K); εᵣ = ${material.relativePermittivity}; E = ${material.youngsModulus} Pa; ${measure} = ${derived?.area ?? 0} ${measureSymbol}; average = ${derived?.average ?? 0} ${unit}`)
  }).join('')
  const meshDescription = is3D && result.mesh.kind === 'tetrahedral'
    ? `${result.mesh.nodes.length} nodes; ${result.mesh.tetrahedra.length} P1 tetrahedra`
    : `${result.mesh.nodes.length} nodes; ${result.mesh.triangles.length} P1 triangles`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(model.name)} · OpenPhysics report</title><style>body{font:15px system-ui;max-width:820px;margin:40px auto;padding:0 24px;color:#172033}h1{margin-bottom:4px}small{color:#64748b}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dbe3ec}th{width:45%}footer{color:#64748b;font-size:12px}</style></head><body><h1>${escapeHtml(model.name)}</h1><small>OpenPhysics Studio · ${title} · ${model.study.type}</small><table>${row('Physics', result.physics)}${row('Mesh', meshDescription)}${row('Linear solver', `${result.converged ? 'Converged' : 'Not converged'}; ${result.iterations} iterations; residual ${result.relativeResidual}`)}${row(`Domain ${measure}`, `${values.area} ${measureSymbol}`)}${row('Domain integral', `${values.integral} ${unit}·${measureSymbol}`)}${row(`${measure === 'volume' ? 'Volume' : 'Area'}-weighted average`, `${values.average} ${unit}`)}${row('Minimum', `${values.minimum.value} ${unit} at ${location(values.minimum.location)}`)}${row('Maximum', `${values.maximum.value} ${unit} at ${location(values.maximum.location)}`)}${row('Center probe', `${values.centerProbe} ${unit}`)}${domainRows}</table><footer>Generated locally. Integrals use exact integration of the piecewise-linear finite-element field over ${measureUnit}. This report is not a certified engineering validation.</footer></body></html>`
}

export function downloadText(filename: string, content: string, type = 'text/plain'): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
