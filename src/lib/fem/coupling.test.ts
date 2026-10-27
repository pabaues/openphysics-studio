import { describe, expect, it } from 'vitest'
import { solveElasticity } from './elasticity'
import { rectangleGeometry } from './geometry'
import { defaultModel } from './types'

function structuralModel() {
  const model = structuredClone(defaultModel)
  model.activePhysics = 'elasticity'
  model.geometry = rectangleGeometry(0.2, 0.1)
  model.mesh = { nx: 8, ny: 4, refinement: 1 }
  model.material.youngsModulus = 70e9
  model.material.poissonRatio = 0.25
  model.elasticity.left = { type: 'roller' }
  model.elasticity.right = { type: 'free' }
  model.elasticity.bottom = { type: 'roller' }
  model.elasticity.top = { type: 'free' }
  return model
}

describe('boundary tractions and one-way thermal–structural coupling', () => {
  it('reproduces uniaxial stress from a consistent boundary traction load', () => {
    const model = structuralModel()
    model.elasticity.right = { type: 'traction', x: 1e6, y: 0 }
    const result = solveElasticity(model)
    const strain = 1e6 / model.material.youngsModulus
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      expect(Math.abs(result.displacement[index]!.x - strain * node.x)).toBeLessThan(1e-11)
      expect(Math.abs(result.displacement[index]!.y + model.material.poissonRatio * strain * node.y)).toBeLessThan(1e-11)
    })
    for (const stress of result.stress) {
      expect(stress.xx).toBeCloseTo(1e6, 1)
      expect(Math.abs(stress.yy)).toBeLessThan(1e-3)
      expect(Math.abs(stress.xy)).toBeLessThan(1e-3)
    }
  })

  it('reproduces stress-free uniform thermal expansion', () => {
    const model = structuralModel()
    model.elasticity.thermalCoupling = true
    model.study.solver = 'direct'
    model.elasticity.referenceTemperature = 20
    model.material.thermalExpansion = 12e-6
    model.physics = {
      heatSource: 0, leftTemperature: 100, rightTemperature: 100,
      top: { type: 'temperature', value: 100 }, bottom: { type: 'temperature', value: 100 },
    }
    const result = solveElasticity(model)
    const strain = model.material.thermalExpansion * 80
    expect(result.thermal?.temperature.every((value) => Math.abs(value - 100) < 1e-8)).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      expect(Math.abs(result.displacement[index]!.x - strain * node.x)).toBeLessThan(1e-10)
      expect(Math.abs(result.displacement[index]!.y - strain * node.y)).toBeLessThan(1e-10)
    })
    expect(Math.max(...result.vonMises)).toBeLessThan(1e-2)
  })
})
