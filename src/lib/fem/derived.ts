import { triangleGeometry } from './scalar'
import { interpolateMesh } from './mesh'
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
  domains: Array<{ domain: number; area: number; integral: number; average: number }>
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
  const domainValues = new Map<number, { area: number; integral: number }>()
  mesh.triangles.forEach((triangle, elementIndex) => {
    const elementArea = triangleGeometry(mesh, triangle).area
    const elementIntegral = elementArea * triangle.reduce((sum, node) => sum + values[node]!, 0) / 3
    area += elementArea
    integral += elementIntegral
    const domain = mesh.triangleDomains?.[elementIndex] ?? 0
    const current = domainValues.get(domain) ?? { area: 0, integral: 0 }
    current.area += elementArea
    current.integral += elementIntegral
    domainValues.set(domain, current)
  })
  const centerProbe = interpolateMesh(mesh, values, mesh.centroid)
  return {
    area,
    integral,
    average: integral / area,
    minimum: extremum(values, mesh.nodes, false),
    maximum: extremum(values, mesh.nodes, true),
    centerProbe,
    domains: [...domainValues.entries()].sort(([a], [b]) => a - b).map(([domain, value]) => ({ domain, ...value, average: value.integral / value.area })),
  }
}
