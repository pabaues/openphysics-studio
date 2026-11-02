import { triangleGeometry } from './scalar'
import { tetraGeometry } from './mesh3d'
import { interpolateMesh } from './mesh'
import { resultValues } from './study'
import type { AnySimulationResult, MeshNode } from './types'

export interface Extremum {
  value: number
  location: MeshNode
}

export interface DerivedValues {
  /** Domain measure: area in 2D, volume in 3D. */
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
  let centerProbe = 0
  const domainValues = new Map<number, { area: number; integral: number }>()
  const addDomain = (domain: number, measure: number, elementIntegral: number) => {
    const current = domainValues.get(domain) ?? { area: 0, integral: 0 }
    current.area += measure
    current.integral += elementIntegral
    domainValues.set(domain, current)
  }
  if (mesh.kind === 'tetrahedral') {
    const target = { x: 0, y: 0, z: 0 }
    let closestDistance = Number.POSITIVE_INFINITY
    mesh.tetrahedra.forEach((tetrahedron, elementIndex) => {
      const { volume } = tetraGeometry(mesh.nodes, tetrahedron)
      const elementIntegral = volume * tetrahedron.reduce((sum, node) => sum + values[node]!, 0) / 4
      const centroid = tetrahedron.reduce((point, node) => {
        const position = mesh.nodes[node]!
        return { x: point.x + position.x / 4, y: point.y + position.y / 4, z: point.z + position.z! / 4 }
      }, { x: 0, y: 0, z: 0 })
      target.x += centroid.x * volume
      target.y += centroid.y * volume
      target.z += centroid.z * volume
      area += volume
      integral += elementIntegral
      addDomain(mesh.tetrahedronDomains[elementIndex]!, volume, elementIntegral)
    })
    target.x /= area
    target.y /= area
    target.z /= area
    mesh.tetrahedra.forEach((tetrahedron) => {
      const centroid = tetrahedron.reduce((point, node) => {
        const position = mesh.nodes[node]!
        return { x: point.x + position.x / 4, y: point.y + position.y / 4, z: point.z + position.z! / 4 }
      }, { x: 0, y: 0, z: 0 })
      const distance = Math.hypot(centroid.x - target.x, centroid.y - target.y, centroid.z - target.z)
      if (distance < closestDistance) {
        closestDistance = distance
        centerProbe = tetrahedron.reduce((sum, node) => sum + values[node]!, 0) / 4
      }
    })
  } else {
    mesh.triangles.forEach((triangle, elementIndex) => {
      const elementArea = triangleGeometry(mesh, triangle).area
      const elementIntegral = elementArea * triangle.reduce((sum, node) => sum + values[node]!, 0) / 3
      area += elementArea
      integral += elementIntegral
      addDomain(mesh.triangleDomains?.[elementIndex] ?? 0, elementArea, elementIntegral)
    })
    centerProbe = interpolateMesh(mesh, values, mesh.centroid)
  }
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
