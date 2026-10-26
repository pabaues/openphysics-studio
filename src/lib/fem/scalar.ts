import { createRectangularMesh } from './mesh'
import { solveConjugateGradient, type SparseRow } from './solver'
import type { BaseSimulationResult, RectangularMesh, Triangle, VectorValue } from './types'

export interface ScalarProblem {
  width: number
  height: number
  nx: number
  ny: number
  coefficient: number
  source: number
  tolerance: number
  maxIterations: number
  prescribedValue: (x: number, y: number) => number | undefined
}

export interface ScalarSolution extends BaseSimulationResult {
  values: number[]
  gradient: VectorValue[]
}

export function near(a: number, b: number, scale: number): boolean {
  return Math.abs(a - b) <= Math.max(1, scale) * 1e-10
}

export function triangleGeometry(mesh: RectangularMesh, triangle: Triangle) {
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

/** Solves ∇ · (−c∇u) = Q with Dirichlet elimination and natural zero flux. */
export function solveScalar(problem: ScalarProblem): ScalarSolution {
  const started = performance.now()
  const mesh = createRectangularMesh(problem.width, problem.height, problem.nx, problem.ny)
  const count = mesh.nodes.length
  const values = Array<number>(count).fill(0)
  const freeToGlobal: number[] = []
  const globalToFree = Array<number>(count).fill(-1)

  mesh.nodes.forEach((node, index) => {
    const prescribed = problem.prescribedValue(node.x, node.y)
    if (prescribed === undefined) {
      globalToFree[index] = freeToGlobal.length
      freeToGlobal.push(index)
    } else {
      values[index] = prescribed
    }
  })

  const rowMaps = freeToGlobal.map(() => new Map<number, number>())
  const rhs = Array<number>(freeToGlobal.length).fill(0)
  for (const triangle of mesh.triangles) {
    const { area, b, c } = triangleGeometry(mesh, triangle)
    for (let localI = 0; localI < 3; localI += 1) {
      const globalI = triangle[localI]!
      const freeI = globalToFree[globalI]!
      if (freeI < 0) continue
      rhs[freeI]! += (problem.source * area) / 3
      for (let localJ = 0; localJ < 3; localJ += 1) {
        const globalJ = triangle[localJ]!
        const value = (problem.coefficient / (4 * area)) *
          (b[localI]! * b[localJ]! + c[localI]! * c[localJ]!)
        const freeJ = globalToFree[globalJ]!
        if (freeJ >= 0) {
          rowMaps[freeI]!.set(freeJ, (rowMaps[freeI]!.get(freeJ) ?? 0) + value)
        } else {
          rhs[freeI]! -= value * values[globalJ]!
        }
      }
    }
  }

  const rows: SparseRow[] = rowMaps.map((entries, rowIndex) => {
    const indices = [...entries.keys()].sort((a, b) => a - b)
    return {
      indices,
      values: indices.map((index) => entries.get(index)!),
      diagonal: entries.get(rowIndex) ?? 0,
    }
  })
  const solution = solveConjugateGradient(rows, rhs, problem.tolerance, problem.maxIterations)
  solution.values.forEach((value, freeIndex) => {
    values[freeToGlobal[freeIndex]!] = value
  })

  const gradient = mesh.triangles.map((triangle) => {
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

  return {
    mesh,
    values,
    gradient,
    converged: solution.converged,
    iterations: solution.iterations,
    relativeResidual: solution.relativeResidual,
    solveTimeMs: performance.now() - started,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / count,
  }
}
