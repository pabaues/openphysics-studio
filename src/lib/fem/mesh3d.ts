import { domainExtrusion } from './geometry'
import { createPolygonMesh, createRectangularMesh } from './mesh'
import type { HeatModel, MeshNode, TetrahedralMesh, Tetrahedron, Triangle } from './types'

export interface TetraGeometry {
  volume: number
  gradients: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }]
}

export function tetraGeometry(nodes: MeshNode[], tetrahedron: Tetrahedron): TetraGeometry {
  const [a, b, c, d] = tetrahedron.map((index) => nodes[index]!)
  if (a.z === undefined || b.z === undefined || c.z === undefined || d.z === undefined) throw new Error('Tetrahedral nodes require Z coordinates.')
  const determinant = (b.x - a.x) * ((c.y - a.y) * (d.z - a.z) - (c.z - a.z) * (d.y - a.y))
    - (b.y - a.y) * ((c.x - a.x) * (d.z - a.z) - (c.z - a.z) * (d.x - a.x))
    + (b.z - a.z) * ((c.x - a.x) * (d.y - a.y) - (c.y - a.y) * (d.x - a.x))
  const volume = determinant / 6
  if (!(volume > 0) || !Number.isFinite(volume)) throw new Error('Tetrahedra must have finite positive volume.')
  const cross = (p: MeshNode, q: MeshNode, r: MeshNode) => ({
    x: (q.y! - p.y!) * (r.z! - p.z!) - (q.z! - p.z!) * (r.y! - p.y!),
    y: (q.z! - p.z!) * (r.x! - p.x!) - (q.x! - p.x!) * (r.z! - p.z!),
    z: (q.x! - p.x!) * (r.y! - p.y!) - (q.y! - p.y!) * (r.x! - p.x!),
  })
  const gradients = [cross(b, c, d), cross(c, a, d), cross(a, b, d), cross(b, a, c)].map((gradient) => ({
    x: -gradient.x / determinant,
    y: -gradient.y / determinant,
    z: -gradient.z / determinant,
  })) as TetraGeometry['gradients']
  return { volume, gradients }
}

function orientedTetrahedron(nodes: MeshNode[], tetrahedron: Tetrahedron): Tetrahedron {
  const [a, b, c, d] = tetrahedron.map((index) => nodes[index]!)
  const determinant = (b.x - a.x) * ((c.y - a.y) * (d.z! - a.z!) - (c.z! - a.z!) * (d.y - a.y))
    - (b.y - a.y) * ((c.x - a.x) * (d.z! - a.z!) - (c.z! - a.z!) * (d.x - a.x))
    + (b.z! - a.z!) * ((c.x - a.x) * (d.y - a.y) - (c.y - a.y) * (d.x - a.x))
  const oriented = determinant > 0 ? tetrahedron : [tetrahedron[0], tetrahedron[1], tetrahedron[3], tetrahedron[2]] as Tetrahedron
  tetraGeometry(nodes, oriented)
  return oriented
}

/**
 * Splits a prism through its centre into eight tetrahedra. Vertical-face diagonals
 * depend only on their four global nodes, so adjacent domains remain conforming.
 */
function prismTetrahedra(nodes: MeshNode[], lower: Triangle, upper: Triangle, centre: number): Tetrahedron[] {
  const result: Tetrahedron[] = [
    orientedTetrahedron(nodes, [lower[0], lower[1], lower[2], centre]),
    orientedTetrahedron(nodes, [upper[0], upper[2], upper[1], centre]),
  ]
  const diagonalOrder = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)]
  for (let edge = 0; edge < 3; edge += 1) {
    const next = (edge + 1) % 3
    const a = lower[edge]!
    const b = lower[next]!
    const A = upper[edge]!
    const B = upper[next]!
    const first = diagonalOrder(a, B)
    const second = diagonalOrder(b, A)
    const useAB = first[0]! < second[0]! || (first[0] === second[0] && first[1]! <= second[1]!)
    const faces: Triangle[] = useAB ? [[a, b, B], [a, B, A]] : [[a, b, A], [b, B, A]]
    faces.forEach((face) => result.push(orientedTetrahedron(nodes, [...face, centre])))
  }
  return result
}

function assertConformingExtrusions(model: HeatModel) {
  const tolerance = Math.max(model.geometry.width, model.geometry.height) * 1e-9
  for (let left = 0; left < model.geometry.domains.length; left += 1) {
    const aDomain = model.geometry.domains[left]!
    for (let right = left + 1; right < model.geometry.domains.length; right += 1) {
      const bDomain = model.geometry.domains[right]!
      const sharedEdge = aDomain.vertices.some((a, index) => {
        const b = aDomain.vertices[(index + 1) % aDomain.vertices.length]!
        return bDomain.vertices.some((c, other) => {
          const d = bDomain.vertices[(other + 1) % bDomain.vertices.length]!
          return (Math.hypot(a.x - c.x, a.y - c.y) <= tolerance && Math.hypot(b.x - d.x, b.y - d.y) <= tolerance)
            || (Math.hypot(a.x - d.x, a.y - d.y) <= tolerance && Math.hypot(b.x - c.x, b.y - c.y) <= tolerance)
        })
      })
      if (sharedEdge) {
        const a = domainExtrusion(model.geometry, left)
        const b = domainExtrusion(model.geometry, right)
        if (Math.abs(a.depth - b.depth) > tolerance || Math.abs(a.z - b.z) > tolerance) throw new Error(`3D domains ${left + 1} and ${right + 1} share a face and must have identical depth and center Z for a conforming tetrahedral mesh.`)
      }
    }
  }
}

export function createTetrahedralMesh(model: HeatModel, extraRefinement = 0): TetrahedralMesh {
  if (model.geometry.dimension !== '3d') throw new Error('A tetrahedral mesh requires 3D geometry.')
  assertConformingExtrusions(model)
  const nz = (model.mesh.nz ?? 2) * 2 ** extraRefinement
  if (!Number.isInteger(nz) || nz < 1 || nz > 32) throw new Error('Tetrahedral Z divisions must be between 1 and 32 after refinement.')
  const nodes: MeshNode[] = []
  const tetrahedra: Tetrahedron[] = []
  const tetrahedronDomains: number[] = []
  const shared = new Map<string, number>()
  const tolerance = Math.max(model.geometry.width, model.geometry.height, model.geometry.depth) * 1e-9
  const key = (node: MeshNode) => `${Math.round(node.x / tolerance)}:${Math.round(node.y / tolerance)}:${Math.round(node.z! / tolerance)}`

  model.geometry.domains.forEach((domain, domainIndex) => {
    const local = domainIndex === 0 && model.geometry.shape === 'rectangle' && model.geometry.domains.length === 1
      ? createRectangularMesh(model.geometry.width, model.geometry.height, model.mesh.nx * 2 ** extraRefinement, model.mesh.ny * 2 ** extraRefinement)
      : createPolygonMesh(domain.vertices, (model.mesh.refinement ?? 1) + extraRefinement)
    const { depth, z } = domainExtrusion(model.geometry, domainIndex)
    const layers = Array.from({ length: nz + 1 }, () => Array<number>(local.nodes.length))
    for (let layer = 0; layer <= nz; layer += 1) {
      local.nodes.forEach((node, localIndex) => {
        const point = { x: node.x, y: node.y, z: z - depth / 2 + depth * layer / nz }
        const nodeKey = key(point)
        const existing = shared.get(nodeKey)
        if (existing !== undefined) { layers[layer]![localIndex] = existing; return }
        const index = nodes.length
        nodes.push(point)
        shared.set(nodeKey, index)
        layers[layer]![localIndex] = index
      })
    }
    for (let layer = 0; layer < nz; layer += 1) {
      local.triangles.forEach((triangle) => {
        const lower = triangle.map((node) => layers[layer]![node]!) as Triangle
        const upper = triangle.map((node) => layers[layer + 1]![node]!) as Triangle
        const prismNodes = [...lower, ...upper]
        const centre = nodes.length
        nodes.push(prismNodes.reduce((point, node) => ({
          x: point.x + nodes[node]!.x / 6,
          y: point.y + nodes[node]!.y / 6,
          z: point.z! + nodes[node]!.z! / 6,
        }), { x: 0, y: 0, z: 0 }))
        prismTetrahedra(nodes, lower, upper, centre).forEach((tetrahedron) => {
          tetrahedra.push(tetrahedron)
          tetrahedronDomains.push(domainIndex)
        })
      })
    }
  })
  if (tetrahedra.length > 100000) throw new Error('The 3D mesh exceeds 100,000 tetrahedra. Reduce refinement or Z divisions.')

  const faces = new Map<string, { triangle: Triangle; count: number; element: number }>()
  tetrahedra.forEach(([a, b, c, d], element) => {
    ;[[a, b, c], [a, d, b], [a, c, d], [b, d, c]].forEach((face) => {
      const triangle = face as Triangle
      const faceKey = [...triangle].sort((x, y) => x - y).join(':')
      const existing = faces.get(faceKey)
      if (existing) existing.count += 1
      else faces.set(faceKey, { triangle, count: 1, element })
    })
  })
  const externalFaces = [...faces.values()].filter((face) => face.count === 1)
  const triangles = externalFaces.map((face) => face.triangle)
  const triangleElements = externalFaces.map((face) => face.element)
  return {
    kind: 'tetrahedral', nodes, triangles, tetrahedra, tetrahedronDomains, triangleElements, nz,
    width: model.geometry.width, height: model.geometry.height, depth: model.geometry.depth,
    centroid: { x: model.geometry.width / 2, y: model.geometry.height / 2, z: domainExtrusion(model.geometry, 0).z },
    refinement: (model.mesh.refinement ?? 1) + extraRefinement,
  }
}

export function maximumTetrahedronSize(mesh: TetrahedralMesh): number {
  let maximum = 0
  for (const tetrahedron of mesh.tetrahedra) {
    for (let a = 0; a < 4; a += 1) for (let b = a + 1; b < 4; b += 1) {
      const p = mesh.nodes[tetrahedron[a]!]!
      const q = mesh.nodes[tetrahedron[b]!]!
      maximum = Math.max(maximum, Math.hypot(p.x - q.x, p.y - q.y, p.z! - q.z!))
    }
  }
  return maximum
}
