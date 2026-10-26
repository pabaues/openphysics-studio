import { describe, expect, it } from 'vitest'
import { solveHeat } from './heat'
import { createRectangularMesh } from './mesh'
import { defaultModel } from './types'
import type { HeatModel } from './types'

function model(overrides: Partial<HeatModel> = {}): HeatModel {
  return {
    ...structuredClone(defaultModel),
    mesh: { nx: 12, ny: 8 },
    physics: {
      ...structuredClone(defaultModel.physics),
      top: { type: 'insulated' },
      bottom: { type: 'insulated' },
      heatSource: 0,
      leftTemperature: 10,
      rightTemperature: 90,
    },
    ...overrides,
  }
}

describe('rectangular mesh', () => {
  it('creates nodes and consistently oriented triangles', () => {
    const mesh = createRectangularMesh(2, 1, 4, 2)
    expect(mesh.nodes).toHaveLength(15)
    expect(mesh.triangles).toHaveLength(16)
    for (const [a, b, c] of mesh.triangles) {
      const p = mesh.nodes[a]!
      const q = mesh.nodes[b]!
      const r = mesh.nodes[c]!
      const area2 = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
      expect(area2).toBeGreaterThan(0)
    }
  })
})

describe('stationary heat FEM', () => {
  it('reproduces the analytical linear conduction solution', () => {
    const current = model()
    const result = solveHeat(current)
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      const exact = 10 + (80 * node.x) / current.geometry.width
      expect(result.temperature[index]).toBeCloseTo(exact, 8)
    })
  })

  it('reproduces the analytical solution with uniform heat generation', () => {
    const current = model()
    current.physics.leftTemperature = 0
    current.physics.rightTemperature = 0
    current.physics.heatSource = 100000
    const result = solveHeat(current)
    const k = current.material.conductivity
    const length = current.geometry.width
    result.mesh.nodes.forEach((node, index) => {
      const exact = (current.physics.heatSource / (2 * k)) * node.x * (length - node.x)
      expect(result.temperature[index]).toBeCloseTo(exact, 7)
    })
  })

  it('preserves a uniform temperature field', () => {
    const current = model()
    current.physics = {
      heatSource: 0,
      leftTemperature: 42,
      rightTemperature: 42,
      top: { type: 'temperature', value: 42 },
      bottom: { type: 'temperature', value: 42 },
    }
    const result = solveHeat(current)
    expect(result.minimum).toBeCloseTo(42, 6)
    expect(result.maximum).toBeCloseTo(42, 6)
    expect(result.relativeResidual).toBeLessThanOrEqual(current.study.tolerance)
  })

  it('reports non-convergence instead of hiding it', () => {
    const current = model()
    current.study.maxIterations = 10
    current.mesh = { nx: 50, ny: 40 }
    const result = solveHeat(current)
    expect(result.converged).toBe(false)
    expect(result.iterations).toBeLessThanOrEqual(10)
    expect(Number.isFinite(result.relativeResidual)).toBe(true)
  })
})
