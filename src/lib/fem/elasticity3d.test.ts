import { describe, expect, it } from 'vitest'
import { solveElasticity3D } from './elasticity3d'
import { multiDomainGeometry, rectangleGeometry } from './geometry'
import { heatModelSchema } from './project'
import { defaultModel, type HeatModel } from './types'

function block(): HeatModel {
  const model = structuredClone(defaultModel)
  model.activePhysics = 'elasticity'
  model.geometry = rectangleGeometry(1, 0.4, 0.3, '3d')
  model.mesh = { nx: 4, ny: 2, nz: 2, refinement: 0 }
  model.elasticity = {
    ...model.elasticity,
    bodyForceX: 0, bodyForceY: 0, bodyForceZ: 0,
    left: { type: 'roller' }, right: { type: 'traction', x: 1e6, y: 0, z: 0 },
    top: { type: 'free' }, bottom: { type: 'roller' },
    front: { type: 'free' }, back: { type: 'roller' },
  }
  model.study = { ...model.study, type: 'stationary', solver: 'direct', tolerance: 1e-11, manufacturedSolution: 'none' }
  return heatModelSchema.parse(model)
}

describe('tetrahedral 3D linear elasticity', () => {
  it('reproduces uniaxial traction, lateral contraction and von Mises stress', () => {
    const model = block()
    const result = solveElasticity3D(model)
    const E = model.material.youngsModulus
    const nu = model.material.poissonRatio
    expect(result.converged).toBe(true)
    expect(result.planeState).toBe('3d')
    result.mesh.nodes.forEach((node, index) => {
      const displacement = result.displacement[index]!
      expect(displacement.x).toBeCloseTo(1e6 / E * node.x, 10)
      expect(displacement.y).toBeCloseTo(-nu * 1e6 / E * node.y, 10)
      expect(displacement.z).toBeCloseTo(-nu * 1e6 / E * (node.z! + 0.15), 10)
    })
    result.vonMises.forEach((stress) => expect(stress).toBeCloseTo(1e6, 2))
    result.stress.forEach((stress) => {
      expect(stress.xx).toBeCloseTo(1e6, 2)
      expect(stress.yy).toBeCloseTo(0, 2)
      expect(stress.zz).toBeCloseTo(0, 2)
    })
  })

  it('applies consistent traction on the front face and a back roller', () => {
    const model = block()
    model.elasticity.left = { type: 'roller' }
    model.elasticity.right = { type: 'free' }
    model.elasticity.back = { type: 'roller' }
    model.elasticity.front = { type: 'traction', x: 0, y: 0, z: 2e6 }
    const result = solveElasticity3D(model)
    const E = model.material.youngsModulus
    const nu = model.material.poissonRatio
    result.mesh.nodes.forEach((node, index) => {
      const displacement = result.displacement[index]!
      expect(displacement.x).toBeCloseTo(-nu * 2e6 / E * node.x, 10)
      expect(displacement.y).toBeCloseTo(-nu * 2e6 / E * node.y, 10)
      expect(displacement.z).toBeCloseTo(2e6 / E * (node.z! + 0.15), 10)
    })
    result.vonMises.forEach((stress) => expect(stress).toBeCloseTo(2e6, 2))
  })

  it('reproduces free 3D thermal expansion without residual stress', () => {
    const model = block()
    model.elasticity.right = { type: 'free' }
    model.elasticity.thermalCoupling = true
    model.elasticity.referenceTemperature = 20
    model.physics = {
      heatSource: 0, leftTemperature: 100, rightTemperature: 100,
      top: { type: 'temperature', value: 100 }, bottom: { type: 'temperature', value: 100 },
      front: { type: 'temperature', value: 100 }, back: { type: 'temperature', value: 100 },
    }
    const result = solveElasticity3D(model)
    const expansion = model.material.thermalExpansion * 80
    result.mesh.nodes.forEach((node, index) => {
      const displacement = result.displacement[index]!
      expect(displacement.x).toBeCloseTo(expansion * node.x, 10)
      expect(displacement.y).toBeCloseTo(expansion * node.y, 10)
      expect(displacement.z).toBeCloseTo(expansion * (node.z! + 0.15), 10)
    })
    result.vonMises.forEach((stress) => expect(Math.abs(stress)).toBeLessThan(1e-3))
  })

  it('assembles piecewise axial strain for two materials in series', () => {
    const model = block()
    model.geometry = multiDomainGeometry([
      { id: 'domain-1', name: 'Left solid', depth: 0.3, vertices: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.4 }, { x: 0, y: 0.4 }] },
      { id: 'domain-2', name: 'Right solid', depth: 0.3, vertices: [{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.4 }, { x: 0.5, y: 0.4 }] },
    ], { dimension: '3d', depth: 0.3 })
    model.material.poissonRatio = 0
    model.domainMaterials = { 'domain-2': { ...structuredClone(model.material), youngsModulus: 400e9 } }
    model.mesh = { nx: 4, ny: 2, nz: 2, refinement: 0 }
    model.study.solver = 'iterative'
    model.study.tolerance = 1e-12
    const result = solveElasticity3D(heatModelSchema.parse(model))
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      const expected = node.x <= 0.5 ? 5e-6 * node.x : 2.5e-6 + 2.5e-6 * (node.x - 0.5)
      const displacement = result.displacement[index]!
      expect(displacement.x).toBeCloseTo(expected, 10)
      expect(displacement.y).toBeCloseTo(-model.material.poissonRatio * 1e6 / model.material.youngsModulus * node.y, 10)
      expect(displacement.z).toBeCloseTo(-model.material.poissonRatio * 1e6 / model.material.youngsModulus * (node.z! + 0.15), 10)
    })
    result.stress.forEach((stress) => expect(stress.xx).toBeCloseTo(1e6, 2))
    result.strain.forEach((strain, elementIndex) => {
      if (result.mesh.kind !== 'tetrahedral') throw new Error('Expected tetrahedra.')
      const domain = result.mesh.tetrahedronDomains[elementIndex]!
      expect(strain.xx).toBeCloseTo(domain === 0 ? 5e-6 : 2.5e-6, 11)
    })
  })
})
