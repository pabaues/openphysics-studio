import { describe, expect, it } from 'vitest'
import { runConvergenceStudy } from './convergence'
import { defaultModel } from './types'

describe('automatic mesh convergence studies', () => {
  it('refines by two and reports decreasing successive-grid differences', () => {
    const model = structuredClone(defaultModel)
    model.mesh = { nx: 6, ny: 4 }
    model.convergence.levels = 3
    const originalMesh = { ...model.mesh }
    const report = runConvergenceStudy(model)
    expect(report.entries).toHaveLength(3)
    expect(report.entries.map((entry) => entry.nx)).toEqual([6, 12, 24])
    expect(report.entries[1]!.elementSize).toBeCloseTo(report.entries[0]!.elementSize / 2, 12)
    expect(report.entries[1]!.relativeL2!).toBeGreaterThan(0)
    expect(report.entries[2]!.relativeL2!).toBeLessThan(report.entries[1]!.relativeL2!)
    expect(report.entries[2]!.observedOrder!).toBeGreaterThan(0)
    expect(report.converged).toBe(true)
    expect(model.mesh).toEqual(originalMesh)
  })

  it('uses the active electrostatics interface', () => {
    const model = structuredClone(defaultModel)
    model.activePhysics = 'electrostatics'
    model.mesh = { nx: 4, ny: 4 }
    model.convergence.levels = 2
    const report = runConvergenceStudy(model)
    expect(report.physics).toBe('electrostatics')
    expect(report.finest.physics).toBe('electrostatics')
    expect(report.entries).toHaveLength(2)
  })

  it('does not interpret observed order at the solver round-off floor', () => {
    const model = structuredClone(defaultModel)
    model.activePhysics = 'electrostatics'
    model.mesh = { nx: 4, ny: 4 }
    model.convergence.levels = 3
    const report = runConvergenceStudy(model)
    expect(report.entries[2]!.nearSolverFloor).toBe(true)
    expect(report.entries[2]!.observedOrder).toBeUndefined()
  })

  it('bounds the finest mesh before starting expensive work', () => {
    const model = structuredClone(defaultModel)
    model.mesh = { nx: 64, ny: 64 }
    model.convergence.levels = 3
    expect(() => runConvergenceStudy(model)).toThrow(/finest convergence mesh/)
  })
})
