import type { SimulationResult } from './types'

export function toCsv(result: SimulationResult): string {
  const rows = result.mesh.nodes.map((node, index) =>
    [node.x, node.y, result.temperature[index]].join(','),
  )
  return ['x_m,y_m,temperature_C', ...rows].join('\n')
}

export function toVtk(result: SimulationResult): string {
  const { mesh, temperature } = result
  const points = mesh.nodes.map((node) => `${node.x} ${node.y} 0`).join('\n')
  const cells = mesh.triangles.map((cell) => `3 ${cell.join(' ')}`).join('\n')
  const cellTypes = mesh.triangles.map(() => '5').join('\n')
  return `# vtk DataFile Version 3.0
OpenPhysics Studio temperature field
ASCII
DATASET UNSTRUCTURED_GRID
POINTS ${mesh.nodes.length} double
${points}
CELLS ${mesh.triangles.length} ${mesh.triangles.length * 4}
${cells}
CELL_TYPES ${mesh.triangles.length}
${cellTypes}
POINT_DATA ${mesh.nodes.length}
SCALARS temperature_C double 1
LOOKUP_TABLE default
${temperature.join('\n')}
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
