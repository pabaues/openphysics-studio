import type { HeatModel, Mesh, MeshNode, Triangle } from './types'

export function pointOnSegment(point: MeshNode, a: MeshNode, b: MeshNode): boolean {
  const scale = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)
  if (Math.abs(cross) > scale * 1e-9) return false
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)
  const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  return dot >= -scale * 1e-9 && dot <= length2 + scale * 1e-9
}

export function geometryEdgesAt(vertices: MeshNode[], point: MeshNode): number[] {
  const edges: number[] = []
  for (let index = 0; index < vertices.length; index += 1) {
    if (pointOnSegment(point, vertices[index]!, vertices[(index + 1) % vertices.length]!)) edges.push(index)
  }
  return edges
}

export function geometryEdgeAt(vertices: MeshNode[], point: MeshNode): number | undefined {
  return geometryEdgesAt(vertices, point)[0]
}

export function boundaryOverrideKey(domainIndex: number, edge: number): string {
  return domainIndex === 0 ? String(edge) : `${domainIndex}:${edge}`
}

export function edgeOverride(model: HeatModel, physics: keyof HeatModel['edgeBoundaries'], point: MeshNode) {
  for (const [domainIndex, domain] of model.geometry.domains.entries()) {
    for (const edge of geometryEdgesAt(domain.vertices, point)) {
      const override = model.edgeBoundaries[physics][boundaryOverrideKey(domainIndex, edge)]
      if (override) return override
    }
  }
  return undefined
}

export function meshBoundaryEdges(mesh: Mesh): Array<[number, number]> {
  const edges = new Map<string, { nodes: [number, number]; count: number }>()
  const add = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const current = edges.get(key)
    if (current) current.count += 1
    else edges.set(key, { nodes: [a, b], count: 1 })
  }
  for (const triangle of mesh.triangles) {
    for (let edge = 0; edge < 3; edge += 1) add(triangle[edge]!, triangle[(edge + 1) % 3]!)
  }
  return [...edges.values()].filter((edge) => edge.count === 1).map((edge) => edge.nodes)
}

export function boundaryConditionOnEdge<T>(model: HeatModel, physics: keyof HeatModel['edgeBoundaries'], mesh: Mesh, a: number, b: number, named: (midpoint: MeshNode) => T): T {
  const midpoint = { x: (mesh.nodes[a]!.x + mesh.nodes[b]!.x) / 2, y: (mesh.nodes[a]!.y + mesh.nodes[b]!.y) / 2 }
  const override = edgeOverride(model, physics, midpoint)
  return (override ?? named(midpoint)) as T
}

export function boundarySide(vertices: MeshNode[], edge: number): 'left' | 'right' | 'top' | 'bottom' | undefined {
  const a = vertices[edge]!
  const b = vertices[(edge + 1) % vertices.length]!
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  if (dx <= Math.max(1, dy) * 1e-9) return (a.x + b.x) / 2 > 0 ? 'right' : 'left'
  if (dy <= Math.max(1, dx) * 1e-9) return (a.y + b.y) / 2 > 0 ? 'top' : 'bottom'
  return undefined
}

export function triangleCentroid(mesh: Mesh, triangle: Triangle): MeshNode {
  return {
    x: triangle.reduce((sum, node) => sum + mesh.nodes[node]!.x, 0) / 3,
    y: triangle.reduce((sum, node) => sum + mesh.nodes[node]!.y, 0) / 3,
  }
}
