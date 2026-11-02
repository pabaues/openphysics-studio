import { describe, expect, it } from 'vitest'
import { runAdaptiveStudy } from './adaptive'
import { runConvergenceStudy } from './convergence'
import { deriveValues } from './derived'
import { toCsv, toDerivedCsv, toHtmlReport, toVtk } from './exporters'
import { rectangleGeometry } from './geometry'
import { solveActiveModel } from './study'
import { runParametricSweep } from './sweep'
import { defaultModel, type HeatModel } from './types'

function thermalBlock(): HeatModel {
  const model = structuredClone(defaultModel)
  model.geometry = rectangleGeometry(2, 1, 0.5, '3d')
  model.mesh = { nx: 4, ny: 2, nz: 2, refinement: 0 }
  model.physics = {
    heatSource: 0, leftTemperature: 42, rightTemperature: 42,
    top: { type: 'temperature', value: 42 }, bottom: { type: 'temperature', value: 42 },
    front: { type: 'temperature', value: 42 }, back: { type: 'temperature', value: 42 },
  }
  model.study = { ...model.study, solver: 'direct', manufacturedSolution: 'none' }
  return model
}

describe('3D heat workflow', () => {
  it('integrates the P1 field over the true volume', () => {
    const result = solveActiveModel(thermalBlock())
    expect(result.mesh.kind).toBe('tetrahedral')
    const derived = deriveValues(result)
    expect(derived.area).toBeCloseTo(1, 12)
    expect(derived.integral).toBeCloseTo(42, 10)
    expect(derived.average).toBeCloseTo(42, 10)
    expect(derived.centerProbe).toBeCloseTo(42, 10)
    expect(derived.maximum.location.z).toBeDefined()
  })

  it('exports volumetric CSV, derived quantities, VTK tetrahedra and HTML', () => {
    const model = thermalBlock()
    const result = solveActiveModel(model)
    expect(toCsv(result).split('\n')[0]).toBe('x_m,y_m,z_m,temperature_C')
    expect(toDerivedCsv(result)).toContain('volume_weighted_average')
    const vtk = toVtk(result)
    expect(result.mesh.kind).toBe('tetrahedral')
    if (result.mesh.kind !== 'tetrahedral') throw new Error('Expected tetrahedra.')
    expect(vtk).toContain(`CELLS ${result.mesh.tetrahedra.length} ${result.mesh.tetrahedra.length * 5}`)
    expect(vtk).toContain(`CELL_TYPES ${result.mesh.tetrahedra.length}\n10`)
    const report = toHtmlReport(model, result)
    expect(report).toContain('P1 tetrahedra')
    expect(report).toContain('Domain volume')
    expect(report).toContain('Volume-weighted average')
  })

  it('refines X, Y and Z during a nested 3D convergence study', () => {
    const model = thermalBlock()
    model.convergence.levels = 3
    const report = runConvergenceStudy(model)
    expect(report.converged).toBe(true)
    expect(report.entries.map((entry) => entry.grid)).toEqual([
      'P1 tetrahedra · 4 × 2 × 2', 'P1 tetrahedra · 8 × 4 × 4', 'P1 tetrahedra · 16 × 8 × 8',
    ])
    expect(report.entries[1]!.elementSize).toBeLessThan(report.entries[0]!.elementSize)
    expect(report.entries[2]!.elementSize).toBeLessThan(report.entries[1]!.elementSize)
    expect(report.finest.mesh.kind).toBe('tetrahedral')
  })

  it('supports parametric sweeps and rejects unsupported local 3D adaptation', () => {
    const model = thermalBlock()
    model.sweep = { parameter: 'material.conductivity', values: [20, 45] }
    expect(runParametricSweep(model).cases).toHaveLength(2)
    expect(() => runAdaptiveStudy(model)).toThrow(/2D only/)
  })
})
