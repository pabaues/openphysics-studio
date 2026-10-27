import { describe, expect, it } from 'vitest'
import { solveHeat } from './heat'
import { solveElasticity } from './elasticity'
import { toCsv, toDerivedCsv, toHtmlReport, toSweepCsv, toVtk } from './exporters'
import { runParametricSweep } from './sweep'
import { defaultModel } from './types'

const result = solveHeat({ ...structuredClone(defaultModel), mesh: { nx: 3, ny: 2 } })

describe('scientific exporters', () => {
  it('exports one nodal CSV row per mesh node', () => {
    const lines = toCsv(result).split('\n')
    expect(lines[0]).toBe('x_m,y_m,temperature_C')
    expect(lines).toHaveLength(result.mesh.nodes.length + 1)
  })

  it('exports a valid VTK triangle inventory', () => {
    const vtk = toVtk(result)
    expect(vtk).toContain('DATASET UNSTRUCTURED_GRID')
    expect(vtk).toContain(`POINTS ${result.mesh.nodes.length} double`)
    expect(vtk).toContain(`CELLS ${result.mesh.triangles.length}`)
    expect(vtk).toContain('SCALARS temperature_C double 1')
  })

  it('exports derived quantities with locations and units', () => {
    const csv = toDerivedCsv(result)
    expect(csv).toContain('area_weighted_average')
    expect(csv).toContain('center_probe')
    expect(csv).toContain('domain_1_area')
    expect(csv.split('\n')).toHaveLength(10)
  })

  it('exports every sweep case', () => {
    const model = structuredClone(defaultModel)
    model.mesh = { refinement: 1, nx: 3, ny: 2 }
    model.sweep = { parameter: 'material.conductivity', values: [15, 45] }
    const csv = toSweepCsv(runParametricSweep(model))
    expect(csv.split('\n')).toHaveLength(3)
    expect(csv).toContain('relative_residual')
  })

  it('exports structural displacement vectors and elementwise von Mises stress', () => {
    const model = structuredClone(defaultModel)
    model.activePhysics = 'elasticity'
    model.mesh = { refinement: 1, nx: 3, ny: 2 }
    model.elasticity.left = { type: 'roller' }
    const structural = solveElasticity(model)
    const csv = toCsv(structural)
    expect(csv.split('\n')[0]).toBe('x_m,y_m,ux_m,uy_m,displacement_m')
    expect(csv.split('\n')).toHaveLength(structural.mesh.nodes.length + 1)
    const vtk = toVtk(structural)
    expect(vtk).toContain('VECTORS displacement_m double')
    expect(vtk).toContain(`CELL_DATA ${structural.mesh.triangles.length}`)
    expect(vtk).toContain('SCALARS von_mises_stress_Pa double 1')
  })

  it('escapes model names in standalone HTML reports', () => {
    const report = toHtmlReport({ ...structuredClone(defaultModel), name: '<script>alert(1)</script>' }, result)
    expect(report).not.toContain('<script>alert(1)</script>')
    expect(report).toContain('&lt;script&gt;')
    expect(report).toContain('Area-weighted average')
  })
})
