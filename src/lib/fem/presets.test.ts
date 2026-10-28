import { describe, expect, it } from 'vitest'
import { runConvergenceStudy } from './convergence'
import { scaleGeometryToBoundingBox, scaleGeometryToDomainArea, signedPolygonArea } from './geometry'
import { createExampleModel, type ExamplePresetId } from './presets'
import { heatModelSchema } from './project'
import { solveElectrostatics } from './electrostatics'
import { runParametricSweep } from './sweep'

const photonicPresets: ExamplePresetId[] = ['pinPhotodetector', 'pnModulator']

describe('editable silicon photonics templates', () => {
  it.each(photonicPresets)('validates and solves the affine potential of %s', (id) => {
    const model = heatModelSchema.parse(createExampleModel(id))
    expect(model.geometry.domains).toHaveLength(3)
    expect(model.activePhysics).toBe('electrostatics')
    expect(model.geometry.width).toBeLessThan(1e-5)
    expect(model.geometry.height).toBe(220e-9)
    expect(model.domainMaterials[model.geometry.domains[1]!.id]?.relativePermittivity).toBe(11.7)

    model.study.solver = 'direct'
    const result = solveElectrostatics(model)
    const { leftVoltage, rightVoltage } = model.electrostatics
    const expectedField = -(rightVoltage - leftVoltage) / model.geometry.width
    expect(result.converged).toBe(true)
    expect(result.mesh.triangleDomains && new Set(result.mesh.triangleDomains).size).toBe(3)
    result.mesh.nodes.forEach((node, index) => {
      const expected = leftVoltage + (rightVoltage - leftVoltage) * node.x / model.geometry.width
      expect(result.potential[index]).toBeCloseTo(expected, 7)
    })
    result.electricField.forEach((field) => {
      expect(Math.abs(field.x - expectedField)).toBeLessThanOrEqual(Math.abs(expectedField) * 1e-7 + 1e-6)
      expect(Math.abs(field.y)).toBeLessThanOrEqual(Math.abs(expectedField) * 1e-7 + 1e-6)
    })
  })

  it.each(photonicPresets)('preserves domains, materials and interfaces while editing %s geometry', (id) => {
    const model = createExampleModel(id)
    const originalAreas = model.geometry.domains.map((domain) => signedPolygonArea(domain.vertices))
    const originalIds = model.geometry.domains.map((domain) => domain.id)
    const resized = scaleGeometryToBoundingBox(model.geometry, model.geometry.width * 2, model.geometry.height * 3)
    expect(resized.domains.map((domain) => domain.id)).toEqual(originalIds)
    resized.domains.forEach((domain, index) => {
      const ratio = signedPolygonArea(domain.vertices) / originalAreas[index]!
      expect(ratio).toBeCloseTo(6, 12)
    })
    for (let index = 0; index < resized.domains.length - 1; index += 1) {
      const rightEdge = resized.domains[index]!.vertices[1]!
      const nextLeftEdge = resized.domains[index + 1]!.vertices[0]!
      expect(rightEdge).toEqual(nextLeftEdge)
    }

    const targetArea = originalAreas[1]! * 9
    const areaScaled = scaleGeometryToDomainArea(model.geometry, 1, targetArea)
    expect(signedPolygonArea(areaScaled.domains[1]!.vertices) / targetArea).toBeCloseTo(1, 12)
    expect(areaScaled.width / model.geometry.width).toBeCloseTo(3, 12)
    expect(areaScaled.height / model.geometry.height).toBeCloseTo(3, 12)
    expect(heatModelSchema.parse({ ...model, geometry: areaScaled }).domainMaterials).toEqual(model.domainMaterials)
  })

  it.each(photonicPresets)('sweeps terminal bias without mutating %s', (id) => {
    const model = createExampleModel(id)
    model.mesh.refinement = 1
    model.study.solver = 'direct'
    model.sweep.values = model.sweep.values.slice(0, 2)
    const before = JSON.stringify(model)
    const report = runParametricSweep(model)
    expect(report.cases).toHaveLength(2)
    expect(report.cases.every((entry) => entry.result.converged)).toBe(true)
    expect(report.cases.every((entry) => entry.result.physics === 'electrostatics')).toBe(true)
    report.cases.forEach((entry, index) => {
      const result = entry.result
      if (result.physics !== 'electrostatics') throw new Error('Expected an electrostatic result.')
      const boundaryValues = id === 'pinPhotodetector' ? [entry.value, 0] : [0, entry.value]
      expect(result.minimum).toBeCloseTo(Math.min(...boundaryValues), 7)
      expect(result.maximum).toBeCloseTo(Math.max(...boundaryValues), 7)
      expect(entry.result.mesh.width).toBeCloseTo(model.geometry.width, 12)
      expect(index).toBeLessThan(2)
    })
    expect(JSON.stringify(model)).toBe(before)
  })

  it.each(photonicPresets)('runs nested mesh convergence for %s', (id) => {
    const model = createExampleModel(id)
    model.mesh.refinement = 0
    model.convergence.levels = 3
    model.study.solver = 'direct'
    const report = runConvergenceStudy(model)
    expect(report.converged).toBe(true)
    expect(report.entries).toHaveLength(3)
    expect(report.entries.map((entry) => entry.refinement)).toEqual([0, 1, 2])
    expect(report.entries[1]!.elementSize).toBeLessThan(report.entries[0]!.elementSize)
    expect(report.entries[2]!.elementSize).toBeLessThan(report.entries[1]!.elementSize)
    report.entries.slice(1).forEach((entry) => {
      // The affine solution is already in the P1 space, so only round-off remains.
      expect(entry.relativeL2).toBeLessThan(1e-6)
    })
  })
})
