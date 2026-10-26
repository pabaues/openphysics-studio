import type { AnySimulationResult } from './types'

function field(result: AnySimulationResult) {
  return result.physics === 'heat'
    ? { values: result.temperature, name: 'temperature_C', title: 'temperature field' }
    : { values: result.potential, name: 'potential_V', title: 'electric potential field' }
}

export function toCsv(result: AnySimulationResult): string {
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
`
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
