import { describe, expect, it } from 'vitest'
import { deriveValues } from './derived'
import { solveHeat } from './heat'
import { defaultModel } from './types'

describe('derived values', () => {
  it('integrates a uniform field exactly over the domain', () => {
    const model = structuredClone(defaultModel)
    model.geometry = { width: 2, height: 3 }
    model.mesh = { nx: 4, ny: 4 }
    model.physics = { heatSource: 0, leftTemperature: 42, rightTemperature: 42, top: { type: 'temperature', value: 42 }, bottom: { type: 'temperature', value: 42 } }
    const result = deriveValues(solveHeat(model))
    expect(result.area).toBeCloseTo(6, 12)
    expect(result.integral).toBeCloseTo(252, 10)
    expect(result.average).toBeCloseTo(42, 10)
    expect(result.centerProbe).toBeCloseTo(42, 10)
    expect(result.minimum.location).toBeDefined()
  })

  it('integrates a linear field exactly and evaluates its center', () => {
    const model = structuredClone(defaultModel)
    model.geometry = { width: 2, height: 1 }
    model.mesh = { nx: 8, ny: 4 }
    model.physics = { heatSource: 0, leftTemperature: 10, rightTemperature: 30, top: { type: 'insulated' }, bottom: { type: 'insulated' } }
    const result = deriveValues(solveHeat(model))
    expect(result.integral).toBeCloseTo(40, 8)
    expect(result.average).toBeCloseTo(20, 8)
    expect(result.centerProbe).toBeCloseTo(20, 8)
    expect(result.maximum.value).toBeCloseTo(30, 8)
    expect(result.maximum.location.x).toBeCloseTo(2, 8)
  })
})
