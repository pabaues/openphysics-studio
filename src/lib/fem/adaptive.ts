import { solveCustom } from './custom'
import { solveElectrostatics } from './electrostatics'
import { solveHeat } from './heat'
import { manufacturedError, validateManufacturedModel } from './manufactured'
import { triangleGeometry } from './scalar'
import type { AdaptiveEntry, AdaptiveReport, AnySimulationResult, HeatModel, Mesh, Triangle, VectorValue } from './types'

function edgeKey(a: number, b: number) { return a < b ? `${a}:${b}` : `${b}:${a}` }

/** Gradient-recovery element indicator for a piecewise-linear scalar field. */
export function gradientRecoveryError(mesh: Mesh, gradient: VectorValue[]) {
  const recovered = mesh.nodes.map(() => ({ x: 0, y: 0, weight: 0 }))
  mesh.triangles.forEach((triangle, index) => {
    const area = triangleGeometry(mesh, triangle).area
    for (const node of triangle) {
      recovered[node]!.x += gradient[index]!.x * area
      recovered[node]!.y += gradient[index]!.y * area
      recovered[node]!.weight += area
    }
  })
  recovered.forEach((value) => { value.x /= value.weight; value.y /= value.weight })
  const indicators = mesh.triangles.map((triangle, index) => {
    const area = triangleGeometry(mesh, triangle).area
    const squared = triangle.reduce((sum, node) => {
      const dx = gradient[index]!.x - recovered[node]!.x
      const dy = gradient[index]!.y - recovered[node]!.y
      return sum + dx * dx + dy * dy
    }, 0) / 3
    return area * Math.sqrt(squared)
  })
  const total = Math.sqrt(indicators.reduce((sum, value) => sum + value * value, 0))
  return { indicators, total }
}

/**
 * Conforming longest-edge bisection. Coarse node indices are preserved. Elements
 * adjacent to a split edge are bisected too, so no hanging nodes remain.
 */
export function refineMarkedMesh(mesh: Mesh, marked: Set<number>): Mesh {
  if (marked.size === 0) return mesh
  const nodes = mesh.nodes.map((node) => ({ ...node }))
  let triangles = mesh.triangles.map((triangle) => [...triangle] as Triangle)
  const midpoints = new Map<string, number>()
  const midpoint = (a: number, b: number) => {
    const key = edgeKey(a, b)
    const existing = midpoints.get(key)
    if (existing !== undefined) return existing
    const index = nodes.length
    nodes.push({ x: (nodes[a]!.x + nodes[b]!.x) / 2, y: (nodes[a]!.y + nodes[b]!.y) / 2 })
    midpoints.set(key, index)
    return index
  }
  const requested = new Set(marked)
  for (let pass = 0; pass < 100; pass += 1) {
    let changed = false
    const next: Triangle[] = []
    for (let index = 0; index < triangles.length; index += 1) {
      const triangle = triangles[index]!
      const edges = [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]] as const
      const hanging = edges.filter(([a, b]) => midpoints.has(edgeKey(a, b)))
      const mustSplit = requested.has(index) || hanging.length > 0
      if (!mustSplit) { next.push(triangle); continue }
      const candidates = hanging.length > 0 ? hanging : edges
      const [a, b] = candidates.reduce((longest, edge) => {
        const length = (nodes[edge[0]]!.x - nodes[edge[1]]!.x) ** 2 + (nodes[edge[0]]!.y - nodes[edge[1]]!.y) ** 2
        const longestLength = (nodes[longest[0]]!.x - nodes[longest[1]]!.x) ** 2 + (nodes[longest[0]]!.y - nodes[longest[1]]!.y) ** 2
        return length > longestLength ? edge : longest
      })
      const opposite = triangle.find((node) => node !== a && node !== b)!
      const middle = midpoint(a, b)
      next.push([a, middle, opposite], [middle, b, opposite])
      changed = true
    }
    triangles = next
    requested.clear()
    if (!changed) break
    if (pass === 99) throw new Error('Adaptive conformity closure did not terminate.')
  }
  if (triangles.length > 100000) throw new Error('Adaptive refinement exceeded 100,000 triangles.')
  return { kind: 'unstructured', nodes, triangles, width: mesh.width, height: mesh.height, centroid: mesh.centroid, refinement: mesh.refinement + 1 }
}

function solveScalarOnMesh(model: HeatModel, mesh?: Mesh): AnySimulationResult {
  if (model.activePhysics === 'heat') return solveHeat(model, mesh)
  if (model.activePhysics === 'electrostatics') return solveElectrostatics(model, mesh)
  if (model.activePhysics === 'custom') return solveCustom(model, mesh)
  throw new Error('Gradient-recovery adaptation currently supports scalar physics; use uniform refinement for elasticity.')
}

export function runAdaptiveStudy(model: HeatModel): AdaptiveReport {
  const started = performance.now()
  validateManufacturedModel(model)
  if (model.study.type === 'transient') throw new Error('Adaptive studies currently require stationary physics.')
  const entries: AdaptiveEntry[] = []
  let result = solveScalarOnMesh(model)
  let mesh = result.mesh
  for (let level = 0; level < model.adaptive.levels; level += 1) {
    const gradient = result.physics === 'heat' || result.physics === 'electrostatics' || result.physics === 'custom'
      ? (result.physics === 'heat' ? result.flux.map((value) => ({ x: -value.x, y: -value.y, magnitude: value.magnitude })) : result.physics === 'electrostatics' ? result.electricField.map((value) => ({ x: -value.x, y: -value.y, magnitude: value.magnitude })) : result.gradient)
      : []
    const error = gradientRecoveryError(mesh, gradient)
    const count = level + 1 < model.adaptive.levels ? Math.max(1, Math.ceil(mesh.triangles.length * model.adaptive.markFraction)) : 0
    const marked = new Set(error.indicators.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value).slice(0, count).map((entry) => entry.index))
    entries.push({ level: level + 1, nodes: mesh.nodes.length, triangles: mesh.triangles.length, estimatedError: error.total, markedTriangles: count, ...manufacturedError(model, result) })
    if (!result.converged || level + 1 >= model.adaptive.levels) break
    mesh = refineMarkedMesh(mesh, marked)
    result = solveScalarOnMesh(model, mesh)
  }
  return { physics: model.activePhysics, entries, finest: result, totalTimeMs: performance.now() - started }
}
