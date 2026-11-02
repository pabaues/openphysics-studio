import { describe, expect, it } from 'vitest'
import { multiDomainGeometry, rectangleGeometry } from './geometry'
import { solveHeat3D } from './heat3d'
import { createTetrahedralMesh, tetraGeometry } from './mesh3d'
import { heatModelSchema } from './project'
import { defaultModel, type HeatModel } from './types'

function block(): HeatModel {
  const model = structuredClone(defaultModel)
  model.geometry = rectangleGeometry(1, 0.4, 0.3, '3d')
  model.mesh = { nx: 6, ny: 3, nz: 3, refinement: 0 }
  model.physics = { ...model.physics, heatSource: 0, leftTemperature: 0, rightTemperature: 100, top: { type: 'insulated' }, bottom: { type: 'insulated' }, front: { type: 'insulated' }, back: { type: 'insulated' } }
  model.study = { ...model.study, solver: 'direct', tolerance: 1e-10, manufacturedSolution: 'none' }
  return heatModelSchema.parse(model)
}

describe('tetrahedral stationary heat FEM', () => {
  it('creates positive-volume conforming tetrahedra and external faces', () => {
    const model = block()
    const mesh = createTetrahedralMesh(model)
    expect(mesh.tetrahedra).toHaveLength(6 * 3 * 2 * 3 * 3)
    expect(mesh.nodes.every((node) => node.z !== undefined)).toBe(true)
    const volume = mesh.tetrahedra.reduce((sum, tetrahedron) => sum + tetraGeometry(mesh.nodes, tetrahedron).volume, 0)
    const geometry = tetraGeometry(mesh.nodes, mesh.tetrahedra[0]!)
    expect(geometry.gradients.reduce((sum, gradient) => sum + gradient.x, 0)).toBeCloseTo(0, 12)
    expect(geometry.gradients.reduce((sum, gradient) => sum + gradient.y, 0)).toBeCloseTo(0, 12)
    expect(geometry.gradients.reduce((sum, gradient) => sum + gradient.z, 0)).toBeCloseTo(0, 12)
    expect(volume).toBeCloseTo(0.12, 12)
    expect(mesh.triangles.length).toBeGreaterThan(0)
    expect(mesh.triangles.length).toBeLessThan(mesh.tetrahedra.length * 4)
  })

  it('reproduces the exact affine 3D temperature and heat flux', () => {
    const model = block()
    const result = solveHeat3D(model)
    expect(result.converged).toBe(true)
    expect(result.mesh.kind).toBe('tetrahedral')
    result.mesh.nodes.forEach((node, index) => expect(result.temperature[index]).toBeCloseTo(100 * node.x, 7))
    result.flux.forEach((flux) => {
      expect(flux.x).toBeCloseTo(-4500, 6)
      expect(flux.y).toBeCloseTo(0, 6)
      expect(flux.z).toBeCloseTo(0, 6)
    })
  })

  it('converges toward a one-dimensional parabolic manufactured profile', () => {
    const errors: number[] = []
    for (const divisions of [2, 4, 8]) {
      const model = block()
      model.mesh = { nx: divisions, ny: 2, nz: 2 }
      model.physics.leftTemperature = 0
      model.physics.rightTemperature = 0
      model.physics.heatSource = 1000
      const result = solveHeat3D(model)
      expect(result.mesh.kind).toBe('tetrahedral')
      if (result.mesh.kind !== 'tetrahedral') throw new Error('Expected tetrahedral mesh.')
      const error = Math.sqrt(result.mesh.tetrahedra.reduce((sum, tetrahedron) => {
        const x = tetrahedron.reduce((center, node) => center + result.mesh.nodes[node]!.x, 0) / 4
        const value = tetrahedron.reduce((center, node) => center + result.temperature[node]!, 0) / 4
        const exact = 1000 / (2 * model.material.conductivity) * x * (1 - x)
        return sum + (value - exact) ** 2
      }, 0) / result.mesh.tetrahedra.length)
      errors.push(error)
    }
    expect(errors[1]!).toBeLessThan(errors[0]! * 0.35)
    expect(errors[2]!).toBeLessThan(errors[1]! * 0.35)
  })

  it('couples matching multidomain prisms and rejects nonconforming Z interfaces', () => {
    const model = block()
    model.geometry = multiDomainGeometry([
      { id: 'domain-1', name: 'Left', depth: 0.3, vertices: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.4 }, { x: 0, y: 0.4 }] },
      { id: 'domain-2', name: 'Right', depth: 0.3, vertices: [{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.4 }, { x: 0.5, y: 0.4 }] },
    ], { dimension: '3d', depth: 0.3 })
    model.domainMaterials = { 'domain-2': structuredClone(model.material) }
    model.mesh = { nx: 4, ny: 2, nz: 2, refinement: 0 }
    const validated = heatModelSchema.parse(model)
    const result = solveHeat3D(validated)
    result.mesh.nodes.forEach((node, index) => expect(result.temperature[index]).toBeCloseTo(100 * node.x, 7))
    const invalid = structuredClone(validated)
    invalid.geometry.domains[1]!.z = 0.05
    expect(() => createTetrahedralMesh(invalid)).toThrow(/identical depth and center Z/)
  })
})
