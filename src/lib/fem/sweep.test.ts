import { describe, expect, it } from 'vitest'
import { runParametricSweep } from './sweep'
import { defaultModel } from './types'

describe('parametric sweeps', () => {
  it('solves every value without mutating the base model', () => {
    const model = structuredClone(defaultModel)
    model.mesh = { nx: 6, ny: 4 }
    model.sweep = { parameter: 'geometry.width', values: [0.05, 0.1, 0.2] }
    const before = JSON.stringify(model)
    const report = runParametricSweep(model)
    expect(JSON.stringify(model)).toBe(before)
    expect(report.cases.map((entry) => entry.result.mesh.width)).toEqual([0.05, 0.1, 0.2])
    expect(report.cases).toHaveLength(3)
    expect(report.cases.every((entry) => entry.result.converged)).toBe(true)
  })

  it('applies source values and rejects irrelevant physics parameters', () => {
    const model = structuredClone(defaultModel)
    model.mesh = { nx: 4, ny: 4 }
    model.sweep = { parameter: 'physics.heatSource', values: [0, 1000] }
    const report = runParametricSweep(model)
    expect(report.cases[1]!.derived.integral).toBeGreaterThan(report.cases[0]!.derived.integral)
    model.activePhysics = 'electrostatics'
    expect(() => runParametricSweep(model)).toThrow(/does not affect/)
  })
})
