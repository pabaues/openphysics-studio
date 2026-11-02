import { describe, expect, it } from 'vitest'
import { electricDisplacement3D, solveElectrostatics3D } from './electrostatics3d'
import { multiDomainGeometry, rectangleGeometry } from './geometry'
import { heatModelSchema } from './project'
import { defaultModel, VACUUM_PERMITTIVITY, type HeatModel } from './types'

function block(): HeatModel {
  const model = structuredClone(defaultModel)
  model.activePhysics = 'electrostatics'
  model.geometry = rectangleGeometry(1, 0.4, 0.3, '3d')
  model.mesh = { nx: 6, ny: 3, nz: 3, refinement: 0 }
  model.electrostatics = {
    chargeDensity: 0, leftVoltage: 0, rightVoltage: 100,
    top: { type: 'zeroCharge' }, bottom: { type: 'zeroCharge' },
    front: { type: 'zeroCharge' }, back: { type: 'zeroCharge' },
  }
  model.study = { ...model.study, type: 'stationary', solver: 'direct', tolerance: 1e-10, manufacturedSolution: 'none' }
  return heatModelSchema.parse(model)
}

describe('tetrahedral 3D electrostatics', () => {
  it('reproduces an affine potential and XYZ electric field', () => {
    const result = solveElectrostatics3D(block())
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => expect(result.potential[index]).toBeCloseTo(100 * node.x, 7))
    result.electricField.forEach((field) => {
      expect(field.x).toBeCloseTo(-100, 6)
      expect(field.y).toBeCloseTo(0, 6)
      expect(field.z).toBeCloseTo(0, 6)
    })
  })

  it('applies potential conditions on front and back faces', () => {
    const model = block()
    model.electrostatics.leftVoltage = 0
    model.electrostatics.rightVoltage = 0
    model.electrostatics.back = { type: 'potential', value: 0 }
    model.electrostatics.front = { type: 'potential', value: 12 }
    const result = solveElectrostatics3D(model)
    expect(result.converged).toBe(true)
    let backNodes = 0
    let frontNodes = 0
    result.mesh.nodes.forEach((node, index) => {
      if (node.x <= 1e-8 || node.x >= 1 - 1e-8 || node.y <= 1e-8 || node.y >= 0.4 - 1e-8) return
      if (Math.abs(node.z! + 0.15) < 1e-9) {
        expect(result.potential[index]).toBeCloseTo(0, 8)
        backNodes += 1
      }
      if (Math.abs(node.z! - 0.15) < 1e-9) {
        expect(result.potential[index]).toBeCloseTo(12, 8)
        frontNodes += 1
      }
    })
    expect(backNodes).toBeGreaterThan(0)
    expect(frontNodes).toBeGreaterThan(0)
    expect(result.electricField.some((field) => field.z! < -1)).toBe(true)
  })

  it('converges for a parabolic charge profile and computes consistent displacement', () => {
    const results = [3, 6, 12].map((nx) => {
      const model = block()
      model.mesh.nx = nx
      model.electrostatics.rightVoltage = 0
      model.electrostatics.chargeDensity = 2 * VACUUM_PERMITTIVITY
      return solveElectrostatics3D(model)
    })
    const errors = results.map((result) => Math.sqrt(result.mesh.nodes.reduce((sum, node, index) => {
      const difference = result.potential[index]! - node.x * (1 - node.x)
      return sum + difference * difference
    }, 0) / result.mesh.nodes.length))
    expect(errors[1]).toBeLessThan(errors[0]! * 0.6)
    expect(errors[2]).toBeLessThan(errors[1]! * 0.6)
    const result = results[1]!
    const displacement = electricDisplacement3D(block(), result)
    displacement.forEach((value, index) => {
      expect(value.x).toBeCloseTo(VACUUM_PERMITTIVITY * result.electricField[index]!.x, 18)
      expect(value.y).toBeCloseTo(VACUUM_PERMITTIVITY * result.electricField[index]!.y, 18)
      expect(value.z).toBeCloseTo(VACUUM_PERMITTIVITY * result.electricField[index]!.z!, 18)
    })
  })

  it('couples multidomain permittivity with continuous potential and displacement', () => {
    const model = block()
    model.geometry = multiDomainGeometry([
      { id: 'domain-1', name: 'Left dielectric', depth: 0.3, vertices: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.4 }, { x: 0, y: 0.4 }] },
      { id: 'domain-2', name: 'Right dielectric', depth: 0.3, vertices: [{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.4 }, { x: 0.5, y: 0.4 }] },
    ], { dimension: '3d', depth: 0.3 })
    model.domainMaterials = { 'domain-2': { ...structuredClone(model.material), relativePermittivity: 2 } }
    model.electrostatics.rightVoltage = 30
    model.mesh = { nx: 4, ny: 2, nz: 2, refinement: 0 }
    const result = solveElectrostatics3D(heatModelSchema.parse(model))
    result.mesh.nodes.forEach((node, index) => expect(result.potential[index]).toBeCloseTo(node.x <= 0.5 ? 40 * node.x : 10 + 20 * node.x, 7))
    electricDisplacement3D(model, result).forEach((value) => expect(value.x).toBeCloseTo(-40 * VACUUM_PERMITTIVITY, 18))
  })
})
