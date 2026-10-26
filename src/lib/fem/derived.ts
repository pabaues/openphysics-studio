import { triangleGeometry } from './scalar'
import { resultValues } from './study'
import type { AnySimulationResult, MeshNode } from './types'

export interface Extremum {
  value: number
  location: MeshNode
}

export interface DerivedValues {
  area: number
  integral: number
  average: number
  minimum: Extremum
  maximum: Extremum
  centerProbe: number
}

function extremum(values: number[], nodes: MeshNode[], maximum: boolean): Extremum {
  let index = 0
  for (let i = 1; i < values.length; i += 1) {
    if (maximum ? values[i]! > values[index]! : values[i]! < values[index]!) index = i
  }
  return { value: values[index]!, location: { ...nodes[index]! } }
}

/** Exact domain integration and point evaluation for piecewise-linear P1 fields. */
export function deriveValues(result: AnySimulationResult): DerivedValues {
  const values = resultValues(result)
  const { mesh } = result
  let area = 0
  let integral = 0
  for (const triangle of mesh.triangles) {
    const elementArea = triangleGeometry(mesh, triangle).area
    area += elementArea
    integral += elementArea * triangle.reduce((sum, node) => sum + values[node]!, 0) / 3
  }
  const x = mesh.width / 2
  const y = mesh.height / 2
  let centerProbe = Number.NaN
  for (const triangle of mesh.triangles) {
    const [ia, ib, ic] = triangle
    const a = mesh.nodes[ia]!
    const b = mesh.nodes[ib]!
    const c = mesh.nodes[ic]!
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
    const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator
    const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator
    const wc = 1 - wa - wb
    const tolerance = 1e-10
    if (wa >= -tolerance && wb >= -tolerance && wc >= -tolerance) {
      centerProbe = wa * values[ia]! + wb * values[ib]! + wc * values[ic]!
      break
    }
  }
  if (!Number.isFinite(centerProbe)) throw new Error('The domain center could not be evaluated.')
  return {
    area,
    integral,
    average: integral / area,
    minimum: extremum(values, mesh.nodes, false),
    maximum: extremum(values, mesh.nodes, true),
    centerProbe,
  }
}
