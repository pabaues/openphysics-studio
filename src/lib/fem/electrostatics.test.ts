import { describe, expect, it } from 'vitest'
import { solveElectrostatics } from './electrostatics'
import { defaultModel, VACUUM_PERMITTIVITY } from './types'

function electricModel() {
  const model = structuredClone(defaultModel)
  model.activePhysics = 'electrostatics'
  model.mesh = { nx: 12, ny: 8 }
  model.electrostatics = {
    chargeDensity: 0,
    leftVoltage: 0,
    rightVoltage: 12,
    top: { type: 'zeroCharge' },
    bottom: { type: 'zeroCharge' },
  }
  return model
}

describe('stationary electrostatics FEM', () => {
  it('reproduces the analytical parallel-plate potential and electric field', () => {
    const model = electricModel()
    const result = solveElectrostatics(model)
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      expect(result.potential[index]).toBeCloseTo((12 * node.x) / model.geometry.width, 8)
    })
    for (const field of result.electricField) {
      expect(field.x).toBeCloseTo(-12 / model.geometry.width, 6)
      expect(field.y).toBeCloseTo(0, 6)
    }
  })

  it('reproduces the analytical charged-one-dimensional solution', () => {
    const model = electricModel()
    model.electrostatics.rightVoltage = 0
    model.electrostatics.chargeDensity = 2 * VACUUM_PERMITTIVITY
    const result = solveElectrostatics(model)
    result.mesh.nodes.forEach((node, index) => {
      const exact = node.x * (model.geometry.width - node.x)
      expect(result.potential[index]).toBeCloseTo(exact, 8)
    })
  })

  it('preserves a uniform potential', () => {
    const model = electricModel()
    model.electrostatics = {
      chargeDensity: 0,
      leftVoltage: 7,
      rightVoltage: 7,
      top: { type: 'potential', value: 7 },
      bottom: { type: 'potential', value: 7 },
    }
    const result = solveElectrostatics(model)
    expect(result.minimum).toBeCloseTo(7, 6)
    expect(result.maximum).toBeCloseTo(7, 6)
  })
})
