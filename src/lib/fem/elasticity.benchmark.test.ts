import { describe, expect, it } from 'vitest'
import { runConvergenceStudy } from './convergence'
import { solveElasticity } from './elasticity'
import { rectangleGeometry } from './geometry'
import { defaultModel, type HeatModel } from './types'

function benchmarkModel(planeState: HeatModel['elasticity']['planeState']): HeatModel {
  const model = structuredClone(defaultModel)
  model.activePhysics = 'elasticity'
  model.geometry = rectangleGeometry(0.2, 0.1)
  model.mesh = { nx: 6, ny: 4 }
  model.material.youngsModulus = 70e9
  model.material.poissonRatio = 0.25
  model.elasticity.planeState = planeState
  model.elasticity.left = { type: 'roller' }
  model.elasticity.right = { type: 'normalDisplacement', value: 0.00002 }
  return model
}

describe('independent analytical elasticity benchmarks', () => {
  it('reproduces uniaxial tension under plane stress', () => {
    const model = benchmarkModel('planeStress')
    const strain = model.elasticity.right.type === 'normalDisplacement' ? model.elasticity.right.value / model.geometry.width : 0
    const result = solveElasticity(model)
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      expect(Math.abs(result.displacement[index]!.x - strain * node.x)).toBeLessThan(1e-11)
      expect(Math.abs(result.displacement[index]!.y + model.material.poissonRatio * strain * node.y)).toBeLessThan(1e-11)
    })
    const expectedStress = model.material.youngsModulus * strain
    for (const stress of result.stress) {
      expect(Math.abs(stress.xx - expectedStress) / expectedStress).toBeLessThan(1e-8)
      expect(Math.abs(stress.yy) / expectedStress).toBeLessThan(1e-8)
      expect(Math.abs(stress.xy) / expectedStress).toBeLessThan(1e-8)
    }
    expect(result.vonMises[0]!).toBeCloseTo(expectedStress, 1)
  })

  it('reproduces the analytical plane-strain uniaxial solution', () => {
    const model = benchmarkModel('planeStrain')
    const nu = model.material.poissonRatio
    const strain = model.elasticity.right.type === 'normalDisplacement' ? model.elasticity.right.value / model.geometry.width : 0
    const result = solveElasticity(model)
    const expectedStress = model.material.youngsModulus * strain / (1 - nu ** 2)
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      expect(Math.abs(result.displacement[index]!.x - strain * node.x)).toBeLessThan(1e-11)
      expect(Math.abs(result.displacement[index]!.y + nu / (1 - nu) * strain * node.y)).toBeLessThan(1e-11)
    })
    for (const stress of result.stress) {
      expect(Math.abs(stress.xx - expectedStress) / expectedStress).toBeLessThan(1e-8)
      expect(Math.abs(stress.yy) / expectedStress).toBeLessThan(1e-8)
    }
  })

  it('passes a rigid-body translation patch test with zero strain', () => {
    const model = benchmarkModel('planeStress')
    model.elasticity.left = { type: 'normalDisplacement', value: 0.003 }
    model.elasticity.right = { type: 'normalDisplacement', value: 0.003 }
    model.elasticity.bottom = { type: 'normalDisplacement', value: -0.002 }
    model.elasticity.top = { type: 'normalDisplacement', value: -0.002 }
    const result = solveElasticity(model)
    expect(result.converged).toBe(true)
    for (const displacement of result.displacement) {
      expect(displacement.x).toBeCloseTo(0.003, 10)
      expect(displacement.y).toBeCloseTo(-0.002, 10)
    }
    for (const strain of result.strain) {
      expect(Math.abs(strain.xx)).toBeLessThan(1e-12)
      expect(Math.abs(strain.yy)).toBeLessThan(1e-12)
      expect(Math.abs(strain.xy)).toBeLessThan(1e-12)
    }
    expect(Math.max(...result.vonMises)).toBeLessThan(1e-3)
  })

  it('runs successive-grid convergence on displacement magnitude', () => {
    const model = benchmarkModel('planeStress')
    model.mesh = { nx: 3, ny: 2 }
    model.convergence.levels = 3
    const report = runConvergenceStudy(model)
    expect(report.entries).toHaveLength(3)
    expect(report.converged).toBe(true)
    expect(report.finest.physics).toBe('elasticity')
    expect(report.entries[1]?.nearSolverFloor).toBe(true)
  })
})
