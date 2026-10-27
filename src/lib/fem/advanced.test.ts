import { describe, expect, it } from 'vitest'
import { gradientRecoveryError, refineMarkedMesh, runAdaptiveStudy } from './adaptive'
import { meshBoundaryEdges } from './boundary'
import { runConvergenceStudy } from './convergence'
import { solveCustom } from './custom'
import { rectangleGeometry } from './geometry'
import { createRectangularMesh } from './mesh'
import { ic0Preconditioner } from './preconditioner'
import { solveLinearSystem, type SparseRow } from './solver'
import { defaultModel } from './types'
import { dotProduct, wasmDotAvailable } from './wasm'

function sineModel(nx = 6, ny = 4) {
  const model = structuredClone(defaultModel)
  model.activePhysics = 'custom'
  model.geometry = rectangleGeometry(1, 1)
  model.mesh = { nx, ny, refinement: 0 }
  model.custom.diffusion = 2
  model.custom.reaction = 0.5
  model.study.manufacturedSolution = 'scalarSine'
  return model
}

describe('adaptive and manufactured-solution studies', () => {
  it('refines marked elements into a conforming mesh and preserves coarse nodes', () => {
    const mesh = createRectangularMesh(1, 1, 4, 4)
    const refined = refineMarkedMesh(mesh, new Set([0, 3]))
    expect(refined.nodes.length).toBeGreaterThan(mesh.nodes.length)
    expect(refined.triangles.length).toBeGreaterThan(mesh.triangles.length)
    mesh.nodes.forEach((node, index) => expect(refined.nodes[index]).toEqual(node))
    const counts = new Map<string, number>()
    for (const triangle of refined.triangles) for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge]!
      const b = triangle[(edge + 1) % 3]!
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect([...counts.values()].every((count) => count === 1 || count === 2)).toBe(true)
    expect(meshBoundaryEdges(refined).length).toBe(16)
    expect(gradientRecoveryError(mesh, Array(mesh.triangles.length).fill({ x: 1, y: 0, magnitude: 1 })).total).toBe(0)
  })

  it('measures second-order nodal error against a custom scalar sine solution', () => {
    const report = runConvergenceStudy({ ...sineModel(), convergence: { levels: 3 } })
    const errors = report.entries.map((entry) => entry.exactL2!)
    expect(errors.every((error) => error > 0)).toBe(true)
    expect(errors[1]).toBeLessThan(errors[0]! * 0.35)
    expect(errors[2]).toBeLessThan(errors[1]! * 0.35)
  })

  it('runs local adaptation and reports both estimated and exact error', () => {
    const model = sineModel(8, 8)
    model.adaptive = { levels: 3, markFraction: 0.25 }
    const report = runAdaptiveStudy(model)
    expect(report.entries).toHaveLength(3)
    expect(report.entries[1]!.nodes).toBeGreaterThan(report.entries[0]!.nodes)
    expect(report.entries[2]!.exactL2!).toBeLessThan(report.entries[0]!.exactL2!)
    expect(report.finest.converged).toBe(true)
  })
})

describe('solver ordering, preconditioning and WASM kernel', () => {
  const rows: SparseRow[] = [
    { indices: [0, 1], values: [4, 1], diagonal: 4 },
    { indices: [0, 1, 2], values: [1, 4, 1], diagonal: 4 },
    { indices: [1, 2, 3], values: [1, 4, 1], diagonal: 4 },
    { indices: [2, 3], values: [1, 4], diagonal: 4 },
  ]
  const rhs = [1, 2, 3, 4]
  it('keeps solutions consistent across RCM, IC(0), Jacobi and direct variants', () => {
    const reference = solveLinearSystem(rows, rhs, 'direct', 1e-10, 100)
    const preconditioned = ic0Preconditioner(rows).apply(rhs)
    const reconstructed = rows.map((row) => row.indices.reduce((sum, column, index) => sum + row.values[index]! * preconditioned[column]!, 0))
    reconstructed.forEach((value, index) => expect(value).toBeCloseTo(rhs[index]!, 8))
    for (const options of [{ ordering: 'natural', preconditioner: 'jacobi' }, { ordering: 'rcm', preconditioner: 'jacobi' }, { ordering: 'rcm', preconditioner: 'ic0' }] as const) {
      const result = solveLinearSystem(rows, rhs, 'iterative', 1e-10, 100, undefined, options)
      expect(result.converged).toBe(true)
      result.values.forEach((value, index) => expect(value).toBeCloseTo(reference.values[index]!, 8))
    }
  })

  it('matches the JavaScript dot product and solves custom Neumann loads', () => {
    const a = Array.from({ length: 128 }, (_, index) => Math.sin(index))
    const b = Array.from({ length: 128 }, (_, index) => Math.cos(index * 0.5))
    const expected = a.reduce((sum, value, index) => sum + value * b[index]!, 0)
    expect(dotProduct(a, b)).toBeCloseTo(expected, 12)
    expect(wasmDotAvailable).toBe(true)
    const model = sineModel()
    model.study.manufacturedSolution = 'none'
    model.custom = { diffusion: 1, reaction: 1, source: 0, left: { type: 'dirichlet', value: 0 }, right: { type: 'neumann', value: 2 }, top: { type: 'neumann', value: 0 }, bottom: { type: 'neumann', value: 0 } }
    const result = solveCustom(model)
    expect(result.converged).toBe(true)
    expect(result.maximum).toBeGreaterThan(0)
  })
})
