import earcut from 'earcut'
import { signedPolygonArea } from './geometry'
import type { HeatModel, Mesh, MeshNode, RectangularMesh, Triangle } from './types'

function areaCentroid(nodes: MeshNode[], triangles: Triangle[], fallback: MeshNode): MeshNode {
  let area = 0
  let x = 0
  let y = 0
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map((index) => nodes[index]!)
    const weight = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
    area += weight
    x += weight * (a.x + b.x + c.x) / 3
    y += weight * (a.y + b.y + c.y) / 3
  }
  return area > 0 ? { x: x / area, y: y / area } : fallback
}

export function createRectangularMesh(width: number, height: number, nx: number, ny: number): RectangularMesh {
  if (!(width > 0) || !(height > 0)) throw new Error('Geometry dimensions must be positive.')
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1) throw new Error('Mesh divisions must be positive integers.')
  const nodes = Array.from({ length: (nx + 1) * (ny + 1) }, (_, index) => ({
    x: ((index % (nx + 1)) / nx) * width,
    y: (Math.floor(index / (nx + 1)) / ny) * height,
  }))
  const triangles: Triangle[] = []
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const lowerLeft = j * (nx + 1) + i
      const lowerRight = lowerLeft + 1
      const upperLeft = lowerLeft + nx + 1
      const upperRight = upperLeft + 1
      triangles.push([lowerLeft, lowerRight, upperRight], [lowerLeft, upperRight, upperLeft])
    }
  }
  return { kind: 'mapped', nodes, triangles, nx, ny, width, height, centroid: { x: width / 2, y: height / 2 }, refinement: 0 }
}

function positiveTriangle(nodes: MeshNode[], triangle: Triangle): Triangle {
  const [a, b, c] = triangle.map((index) => nodes[index]!)
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0 ? triangle : [triangle[0], triangle[2], triangle[1]]
}

/** One-to-four red refinement. Existing node indices are preserved for nested-grid comparisons. */
export function refineMesh(mesh: Mesh): Mesh {
  const nodes = mesh.nodes.map((node) => ({ ...node }))
  const triangles: Triangle[] = []
  const midpoints = new Map<string, number>()
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const existing = midpoints.get(key)
    if (existing !== undefined) return existing
    const index = nodes.length
    nodes.push({ x: (mesh.nodes[a]!.x + mesh.nodes[b]!.x) / 2, y: (mesh.nodes[a]!.y + mesh.nodes[b]!.y) / 2 })
    midpoints.set(key, index)
    return index
  }
  for (const [a, b, c] of mesh.triangles) {
    const ab = midpoint(a, b)
    const bc = midpoint(b, c)
    const ca = midpoint(c, a)
    triangles.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca])
  }
  return {
    ...mesh, nodes, triangles, refinement: mesh.refinement + 1,
    centroid: areaCentroid(nodes, triangles, mesh.centroid),
  }
}

export function createPolygonMesh(vertices: MeshNode[], refinement = 1): Mesh {
  if (!Number.isInteger(refinement) || refinement < 0 || refinement > 5) throw new Error('Polygon refinement must be an integer between 0 and 5.')
  if ((vertices.length - 2) * 4 ** refinement > 100000) throw new Error('The polygon mesh exceeds 100,000 triangles. Reduce the refinement level.')
  const nodes = vertices.map((node) => ({ ...node }))
  const coordinates = vertices.flatMap((node) => [node.x, node.y])
  const indices = earcut(coordinates)
  if (indices.length === 0) throw new Error('The polygon could not be triangulated.')
  const triangles: Triangle[] = []
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = positiveTriangle(nodes, [indices[index]!, indices[index + 1]!, indices[index + 2]!])
    const [a, b, c] = triangle.map((node) => nodes[node]!)
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
    if (area > Math.abs(signedPolygonArea(vertices)) * 1e-14) triangles.push(triangle)
  }
  const width = Math.max(...nodes.map((node) => node.x)) - Math.min(...nodes.map((node) => node.x))
  const height = Math.max(...nodes.map((node) => node.y)) - Math.min(...nodes.map((node) => node.y))
  let mesh: Mesh = { kind: 'unstructured', nodes, triangles, width, height, refinement: 0, centroid: areaCentroid(nodes, triangles, vertices[0]!) }
  for (let level = 0; level < refinement; level += 1) mesh = refineMesh(mesh)
  if (mesh.triangles.length > 100000) throw new Error('The polygon mesh exceeds 100,000 triangles. Reduce the refinement level.')
  return mesh
}

export function createMultidomainMesh(model: HeatModel, extraRefinement = 0): Mesh {
  const refinement = (model.mesh.refinement ?? 1) + extraRefinement
  const nodes: MeshNode[] = []
  const triangles: Triangle[] = []
  const triangleDomains: number[] = []
  const shared = new Map<string, number>()
  const tolerance = Math.max(model.geometry.width, model.geometry.height) * 1e-9
  const key = (node: MeshNode) => `${Math.round(node.x / tolerance)}:${Math.round(node.y / tolerance)}`
  model.geometry.domains.forEach((domain, domainIndex) => {
    const local = createPolygonMesh(domain.vertices, refinement)
    const indices = local.nodes.map((node) => {
      const nodeKey = key(node)
      const existing = shared.get(nodeKey)
      if (existing !== undefined) return existing
      const index = nodes.length
      nodes.push({ ...node })
      shared.set(nodeKey, index)
      return index
    })
    local.triangles.forEach((triangle) => {
      triangles.push(triangle.map((node) => indices[node]!) as Triangle)
      triangleDomains.push(domainIndex)
    })
  })
  if (triangles.length > 100000) throw new Error('The multidomain mesh exceeds 100,000 triangles. Reduce the refinement level.')
  return {
    kind: 'unstructured', nodes, triangles, triangleDomains,
    width: model.geometry.width, height: model.geometry.height, refinement,
    centroid: areaCentroid(nodes, triangles, model.geometry.domains[0]!.vertices[0]!),
  }
}

export function createModelMesh(model: HeatModel, extraRefinement = 0): Mesh {
  if (model.geometry.domains.length > 1) return createMultidomainMesh(model, extraRefinement)
  if (model.geometry.shape === 'polygon') return createPolygonMesh(model.geometry.vertices, (model.mesh.refinement ?? 1) + extraRefinement)
  return createRectangularMesh(model.geometry.width, model.geometry.height, model.mesh.nx * 2 ** extraRefinement, model.mesh.ny * 2 ** extraRefinement)
}

export function maximumElementSize(mesh: Mesh): number {
  let maximum = 0
  for (const triangle of mesh.triangles) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = mesh.nodes[triangle[edge]!]!
      const b = mesh.nodes[triangle[(edge + 1) % 3]!]!
      maximum = Math.max(maximum, Math.hypot(a.x - b.x, a.y - b.y))
    }
  }
  return maximum
}

export function interpolateMesh(mesh: Mesh, values: number[], point: MeshNode): number {
  for (const triangle of mesh.triangles) {
    const [ia, ib, ic] = triangle
    const a = mesh.nodes[ia]!
    const b = mesh.nodes[ib]!
    const c = mesh.nodes[ic]!
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
    const wa = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator
    const wb = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator
    const wc = 1 - wa - wb
    if (wa >= -1e-10 && wb >= -1e-10 && wc >= -1e-10) return wa * values[ia]! + wb * values[ib]! + wc * values[ic]!
  }
  throw new Error('The requested point lies outside the computational domain.')
}
