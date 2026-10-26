import { describe, expect, it } from 'vitest'
import { solveHeat } from './heat'
import { toCsv, toVtk } from './exporters'
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
})
