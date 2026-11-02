import { describe, expect, it } from 'vitest'
import { rectangleGeometry } from './geometry'
import { createTetrahedralMesh } from './mesh3d'
import { solveScalar3D } from './scalar3d'
import { defaultModel } from './types'

describe('scalar tetrahedral FEM', () => {
  it('reproduces an affine Z field with front/back Dirichlet conditions', () => {
    const model = structuredClone(defaultModel)
    model.geometry = rectangleGeometry(1, 0.4, 0.3, '3d')
    model.mesh = { nx: 4, ny: 2, nz: 3, refinement: 0 }
    const mesh = createTetrahedralMesh(model)
    const result = solveScalar3D(model, {
      coefficient: 2, source: 0, tolerance: 1e-11, maxIterations: 1000, solver: 'direct', requirePrescribed: true,
      prescribedValue: (_x, _y, z) => Math.abs(Math.abs(z) - 0.15) < 1e-9 ? 4 + 40 * (z + 0.15) : undefined,
    }, mesh)
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => expect(result.values[index]).toBeCloseTo(4 + 40 * (node.z! + 0.15), 8))
    result.gradient.forEach((gradient) => {
      expect(gradient.x).toBeCloseTo(0, 8)
      expect(gradient.y).toBeCloseTo(0, 8)
      expect(gradient.z).toBeCloseTo(40, 8)
    })
  })

  it('assembles a consistent source and preserves a uniform reaction solution', () => {
    const model = structuredClone(defaultModel)
    model.geometry = rectangleGeometry(1, 0.4, 0.3, '3d')
    model.mesh = { nx: 2, ny: 2, nz: 2, refinement: 0 }
    const result = solveScalar3D(model, {
      coefficient: 1, source: 12, reactionCoefficient: 3, tolerance: 1e-11, maxIterations: 1000, solver: 'direct',
      prescribedValue: (x) => Math.abs(x) < 1e-9 || Math.abs(x - 1) < 1e-9 ? 4 : undefined,
    })
    result.mesh.nodes.forEach((_, index) => expect(result.values[index]).toBeCloseTo(4, 8))
  })
})
