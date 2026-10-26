import { describe, expect, it } from 'vitest'
import { solveActiveModel, resultValues } from './study'
import { defaultModel, type HeatModel } from './types'

function smallModel(physics: HeatModel['activePhysics']): HeatModel {
  const model = structuredClone(defaultModel)
  model.activePhysics = physics
  model.mesh = { nx: 6, ny: 4, refinement: 1 }
  model.study.solver = 'iterative'
  return model
}

function expectMatchingSolutions(model: HeatModel) {
  const iterative = solveActiveModel(model)
  const direct = solveActiveModel({ ...model, study: { ...model.study, solver: 'direct' } })
  expect(iterative.converged).toBe(true)
  expect(direct.converged).toBe(true)
  expect(direct.solver).toBe('direct')
  expect(direct.iterations).toBe(1)
  expect(direct.relativeResidual).toBeLessThan(1e-9)
  const expected = resultValues(iterative)
  const actual = resultValues(direct)
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => {
    expect(Math.abs(value - expected[index]!)).toBeLessThanOrEqual(Math.max(1e-10, Math.abs(expected[index]!) * 1e-7))
  })
}

describe('direct solver FEM integration', () => {
  it.each(['heat', 'electrostatics', 'elasticity'] as const)('matches CG for %s', (physics) => {
    expectMatchingSolutions(smallModel(physics))
  })

  it('matches CG for a short implicit transient study', () => {
    const model = smallModel('heat')
    model.study.type = 'transient'
    model.transient = { initialTemperature: 20, duration: 1, timeSteps: 3, outputSteps: 3 }
    const iterative = solveActiveModel(model)
    const direct = solveActiveModel({ ...model, study: { ...model.study, solver: 'direct' } })
    expect(direct.physics).toBe('heat')
    expect(iterative.physics).toBe('heat')
    if (direct.physics !== 'heat' || iterative.physics !== 'heat') return
    expect(direct.converged).toBe(true)
    expect(direct.transient?.frames).toHaveLength(4)
    direct.temperature.forEach((value, index) => expect(value).toBeCloseTo(iterative.temperature[index]!, 7))
    direct.transient?.frames.forEach((frame, frameIndex) => {
      frame.temperature.forEach((value, index) => expect(value).toBeCloseTo(iterative.transient!.frames[frameIndex]!.temperature[index]!, 7))
    })
  })
})
