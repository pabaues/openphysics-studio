import { describe, expect, it } from 'vitest'
import { heatResultAtTime, solveHeat } from './heat'
import { defaultModel } from './types'

describe('transient heat FEM', () => {
  it('preserves a uniform initial and boundary temperature', () => {
    const model = structuredClone(defaultModel)
    model.mesh = { nx: 6, ny: 4 }
    model.study.type = 'transient'
    model.transient = { initialTemperature: 42, duration: 2, timeSteps: 10, outputSteps: 5 }
    model.physics = { heatSource: 0, leftTemperature: 42, rightTemperature: 42, top: { type: 'temperature', value: 42 }, bottom: { type: 'temperature', value: 42 } }
    const result = solveHeat(model)
    expect(result.transient?.frames).toHaveLength(6)
    expect(result.converged).toBe(true)
    for (const frame of result.transient!.frames) {
      expect(frame.minimum).toBeCloseTo(42, 8)
      expect(frame.maximum).toBeCloseTo(42, 8)
    }
  })

  it('stores the initial state and approaches the stationary solution', () => {
    const model = structuredClone(defaultModel)
    model.mesh = { nx: 8, ny: 4 }
    model.physics = { heatSource: 0, leftTemperature: 100, rightTemperature: 20, top: { type: 'insulated' }, bottom: { type: 'insulated' } }
    model.study.type = 'transient'
    model.transient = { initialTemperature: 20, duration: 100000, timeSteps: 100, outputSteps: 10 }
    const transient = solveHeat(model)
    const stationaryModel = structuredClone(model)
    stationaryModel.study.type = 'stationary'
    const stationary = solveHeat(stationaryModel)
    expect(transient.transient?.frames[0]?.temperature.every((value) => value === 20)).toBe(true)
    expect(transient.transient?.frames.at(-1)?.time).toBe(100000)
    transient.temperature.forEach((value, index) => expect(value).toBeCloseTo(stationary.temperature[index]!, 3))
    const initial = heatResultAtTime(transient, 0)
    expect(initial.temperature).toEqual(transient.transient?.frames[0]?.temperature)
    expect(initial.temperature).not.toBe(transient.transient?.frames[0]?.temperature)
  })
})
