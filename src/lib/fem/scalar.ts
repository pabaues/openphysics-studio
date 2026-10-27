import { meshBoundaryEdges, triangleCentroid } from './boundary'
import { createRectangularMesh } from './mesh'
import { solveLinearSystem, type SparseRow } from './solver'
import type { BaseSimulationResult, Mesh, MeshNode, PreconditionerKind, SolverKind, SolverOrdering, Triangle, VectorValue } from './types'

export interface ScalarProblem {
  width: number
  height: number
  nx: number
  ny: number
  coefficient: number
  source: number
  tolerance: number
  maxIterations: number
  solver: SolverKind
  preconditioner?: PreconditionerKind
  ordering?: SolverOrdering
  coefficientAt?: (x: number, y: number) => number
  sourceAt?: (x: number, y: number) => number
  boundaryFlux?: (a: MeshNode, b: MeshNode, aIndex: number, bIndex: number) => number | undefined
  reactionCoefficient?: number
  reactionSource?: number[]
  initialValues?: number[]
  prescribedValue: (x: number, y: number) => number | undefined
}

export interface ScalarSolution extends BaseSimulationResult {
  values: number[]
  gradient: VectorValue[]
}

export interface ScalarAssembly {
  rows: SparseRow[]
  rhs: number[]
  prescribed: number[]
  freeToGlobal: number[]
  globalToFree: number[]
}

export function near(a: number, b: number, scale: number): boolean {
  return Math.abs(a - b) <= Math.max(1, scale) * 1e-10
}

export function triangleGeometry(mesh: Mesh, triangle: Triangle) {
  const [ia, ib, ic] = triangle
  const a = mesh.nodes[ia]!
  const b = mesh.nodes[ib]!
  const c = mesh.nodes[ic]!
  const twiceArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  if (!(twiceArea > 0)) throw new Error('Invalid triangle orientation.')
  return {
    area: twiceArea / 2,
    b: [b.y - c.y, c.y - a.y, a.y - b.y],
    c: [c.x - b.x, a.x - c.x, b.x - a.x],
  }
}

/** Assembles K + aM and F + aM·u with consistent P1 element mass matrices. */
export function assembleScalar(problem: ScalarProblem, mesh: Mesh): ScalarAssembly {
  const count = mesh.nodes.length
  if (problem.reactionSource && problem.reactionSource.length !== count) throw new Error('Reaction source size does not match the mesh.')
  const prescribed = problem.initialValues ? [...problem.initialValues] : Array<number>(count).fill(0)
  const freeToGlobal: number[] = []
  const globalToFree = Array<number>(count).fill(-1)
  mesh.nodes.forEach((node, index) => {
    const fixed = problem.prescribedValue(node.x, node.y)
    if (fixed === undefined) {
      globalToFree[index] = freeToGlobal.length
      freeToGlobal.push(index)
    } else {
      prescribed[index] = fixed
    }
  })
  const rowMaps = freeToGlobal.map(() => new Map<number, number>())
  const rhs = Array<number>(freeToGlobal.length).fill(0)
  const reaction = problem.reactionCoefficient ?? 0
  for (const triangle of mesh.triangles) {
    const { area, b, c } = triangleGeometry(mesh, triangle)
    const centroid = triangleCentroid(mesh, triangle)
    const coefficient = problem.coefficientAt?.(centroid.x, centroid.y) ?? problem.coefficient
    const source = problem.sourceAt?.(centroid.x, centroid.y) ?? problem.source
    if (!(coefficient > 0)) throw new Error('The diffusion coefficient must remain positive throughout the mesh.')
    for (let localI = 0; localI < 3; localI += 1) {
      const globalI = triangle[localI]!
      const freeI = globalToFree[globalI]!
      if (freeI < 0) continue
      rhs[freeI]! += (source * area) / 3
      for (let localJ = 0; localJ < 3; localJ += 1) {
        const globalJ = triangle[localJ]!
        const stiffness = (coefficient / (4 * area)) *
          (b[localI]! * b[localJ]! + c[localI]! * c[localJ]!)
        const mass = reaction * area * (localI === localJ ? 1 / 6 : 1 / 12)
        const value = stiffness + mass
        const freeJ = globalToFree[globalJ]!
        if (freeJ >= 0) {
          rowMaps[freeI]!.set(freeJ, (rowMaps[freeI]!.get(freeJ) ?? 0) + value)
        } else {
          rhs[freeI]! -= value * prescribed[globalJ]!
        }
        if (problem.reactionSource) rhs[freeI]! += mass * problem.reactionSource[globalJ]!
      }
    }
  }
  if (problem.boundaryFlux) {
    for (const [a, b] of meshBoundaryEdges(mesh)) {
      const flux = problem.boundaryFlux(mesh.nodes[a]!, mesh.nodes[b]!, a, b)
      if (flux === undefined) continue
      const factor = Math.hypot(mesh.nodes[b]!.x - mesh.nodes[a]!.x, mesh.nodes[b]!.y - mesh.nodes[a]!.y) * flux / 2
      for (const node of [a, b]) {
        const free = globalToFree[node]!
        if (free >= 0) rhs[free]! += factor
      }
    }
  }
  const rows: SparseRow[] = rowMaps.map((entries, rowIndex) => {
    const indices = [...entries.keys()].sort((a, b) => a - b)
    return { indices, values: indices.map((index) => entries.get(index)!), diagonal: entries.get(rowIndex) ?? 0 }
  })
  return { rows, rhs, prescribed, freeToGlobal, globalToFree }
}

export function scalarGradient(mesh: Mesh, values: number[]): VectorValue[] {
  return mesh.triangles.map((triangle) => {
    const { area, b, c } = triangleGeometry(mesh, triangle)
    let x = 0
    let y = 0
    triangle.forEach((nodeIndex, localIndex) => {
      x += values[nodeIndex]! * b[localIndex]!
      y += values[nodeIndex]! * c[localIndex]!
    })
    x /= 2 * area
    y /= 2 * area
    return { x, y, magnitude: Math.hypot(x, y) }
  })
}

/** Solves ∇ · (−c∇u) + au = Q + f with Dirichlet elimination. */
export function solveScalar(problem: ScalarProblem, existingMesh?: Mesh): ScalarSolution {
  const started = performance.now()
  const mesh = existingMesh ?? createRectangularMesh(problem.width, problem.height, problem.nx, problem.ny)
  const assembly = assembleScalar(problem, mesh)
  const initial = problem.initialValues?.filter((_, index) => assembly.globalToFree[index]! >= 0)
  const solution = solveLinearSystem(assembly.rows, assembly.rhs, problem.solver, problem.tolerance, problem.maxIterations, initial, { preconditioner: problem.preconditioner, ordering: problem.ordering })
  const values = assembly.prescribed
  solution.values.forEach((value, freeIndex) => { values[assembly.freeToGlobal[freeIndex]!] = value })
  return {
    mesh,
    solver: problem.solver,
    values,
    gradient: scalarGradient(mesh, values),
    converged: solution.converged,
    iterations: solution.iterations,
    relativeResidual: solution.relativeResidual,
    solveTimeMs: performance.now() - started,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}
