import { deriveValues } from './derived'
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
  const rows = result.mesh.nodes.map((node, index) => [node.x, node.y, values[index]].join(','))
  return [`x_m,y_m,${name}`, ...rows].join('\n')
}

export function toVtk(result: AnySimulationResult): string {
  const { mesh } = result
  const { values, name, title } = field(result)
  const points = mesh.nodes.map((node) => `${node.x} ${node.y} 0`).join('\n')
  const cells = mesh.triangles.map((cell) => `3 ${cell.join(' ')}`).join('\n')
  const cellTypes = mesh.triangles.map(() => '5').join('\n')
  const structuralData = result.physics === 'elasticity' ? `VECTORS displacement_m double
${result.displacement.map((value) => `${value.x} ${value.y} 0`).join('\n')}
CELL_DATA ${mesh.triangles.length}
SCALARS von_mises_stress_Pa double 1
LOOKUP_TABLE default
${result.vonMises.join('\n')}
` : ''
  return `# vtk DataFile Version 3.0
OpenPhysics Studio ${title}
ASCII
DATASET UNSTRUCTURED_GRID
POINTS ${mesh.nodes.length} double
${points}
CELLS ${mesh.triangles.length} ${mesh.triangles.length * 4}
${cells}
CELL_TYPES ${mesh.triangles.length}
${cellTypes}
POINT_DATA ${mesh.nodes.length}
SCALARS ${name} double 1
LOOKUP_TABLE default
${values.join('\n')}
${structuralData}`
}

export function toDerivedCsv(result: AnySimulationResult): string {
  const values = deriveValues(result)
  const { unit } = field(result)
  return [
    'quantity,value,unit,x_m,y_m',
    `domain_area,${values.area},m^2,,`,
    `domain_integral,${values.integral},${unit}*m^2,,`,
    `area_weighted_average,${values.average},${unit},,`,
    `minimum,${values.minimum.value},${unit},${values.minimum.location.x},${values.minimum.location.y}`,
    `maximum,${values.maximum.value},${unit},${values.maximum.location.x},${values.maximum.location.y}`,
    `center_probe,${values.centerProbe},${unit},${result.mesh.width / 2},${result.mesh.height / 2}`,
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
  const row = (name: string, value: string) => `<tr><th>${name}</th><td>${escapeHtml(value)}</td></tr>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(model.name)} · OpenPhysics report</title><style>body{font:15px system-ui;max-width:820px;margin:40px auto;padding:0 24px;color:#172033}h1{margin-bottom:4px}small{color:#64748b}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dbe3ec}th{width:45%}footer{color:#64748b;font-size:12px}</style></head><body><h1>${escapeHtml(model.name)}</h1><small>OpenPhysics Studio · ${title} · ${model.study.type}</small><table>${row('Physics', result.physics)}${row('Mesh', `${result.mesh.nodes.length} nodes; ${result.mesh.triangles.length} P1 triangles`)}${row('Linear solver', `${result.converged ? 'Converged' : 'Not converged'}; ${result.iterations} iterations; residual ${result.relativeResidual}`)}${row('Domain area', `${values.area} m²`)}${row('Domain integral', `${values.integral} ${unit}·m²`)}${row('Area-weighted average', `${values.average} ${unit}`)}${row('Minimum', `${values.minimum.value} ${unit} at (${values.minimum.location.x}, ${values.minimum.location.y}) m`)}${row('Maximum', `${values.maximum.value} ${unit} at (${values.maximum.location.x}, ${values.maximum.location.y}) m`)}${row('Center probe', `${values.centerProbe} ${unit}`)}</table><footer>Generated locally. Integrals use exact integration of the piecewise-linear finite-element field. This report is not a certified engineering validation.</footer></body></html>`
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
