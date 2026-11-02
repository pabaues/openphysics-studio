import { describe, expect, it } from 'vitest'
import { rectangleGeometry } from './geometry'
import { heatResultAtTime, solveHeat } from './heat'
import { solveHeat3D } from './heat3d'
import { heatModelSchema } from './project'
import { defaultModel, type HeatModel } from './types'

function block(timeSteps = 4): HeatModel {
  const model = structuredClone(defaultModel)
  model.geometry = rectangleGeometry(1, 0.4, 0.3, '3d')
  model.mesh = { nx: 4, ny: 2, nz: 2, refinement: 0 }
  model.physics = {
    heatSource: 0, leftTemperature: 20, rightTemperature: 100,
    top: { type: 'insulated' }, bottom: { type: 'insulated' },
    front: { type: 'insulated' }, back: { type: 'insulated' },
  }
  model.study = { ...model.study, type: 'transient', solver: 'iterative', tolerance: 1e-12, manufacturedSolution: 'none' }
  model.transient = { initialTemperature: 20, duration: 40000, timeSteps, outputSteps: Math.min(2, timeSteps) }
  return heatModelSchema.parse(model)
}

describe('3D transient heat with consistent tetrahedral mass', () => {
  it('converges to the equivalent 2D transient solution as Z is refined', () => {
    const model2D = block(1)
    model2D.geometry = rectangleGeometry(1, 0.4)
    const result2D = solveHeat(heatModelSchema.parse(model2D))
    const values2D = new Map(result2D.mesh.nodes.map((node, index) => [`${node.x}:${node.y}`, result2D.temperature[index]!]))
    const results = [1, 2, 4].map((nz) => {
      const model = block(1)
      model.mesh.nz = nz
      return solveHeat3D(model)
    })
    const errors = results.map((result) => {
      const mesh = result.mesh
      if (mesh.kind !== 'tetrahedral') throw new Error('Expected a tetrahedral mesh')
      return Math.max(...mesh.nodes.map((node, index) => {
        const layer = (node.z! + 0.15) / 0.3 * mesh.nz
        return Math.abs(layer - Math.round(layer)) < 1e-8 ? Math.abs(result.temperature[index]! - values2D.get(`${node.x}:${node.y}`)!) : 0
      }))
    })
    expect(errors[0]).toBeGreaterThan(1e-4)
    expect(errors[1]).toBeLessThan(errors[0]! * 0.8)
    expect(errors[2]).toBeLessThan(errors[1]! * 0.8)
    const result3D = results[1]!
    expect(result3D.transient?.frames.map((frame) => frame.time)).toEqual([0, 40000])
    const selected = heatResultAtTime(result3D, 1)
    expect(selected.temperature).toEqual(result3D.transient!.frames[1]!.temperature)
    if (selected.mesh.kind !== 'tetrahedral') throw new Error('Expected a tetrahedral mesh')
    expect(selected.flux).toHaveLength(selected.mesh.tetrahedra.length)
    expect(selected.flux.every((flux) => flux.z !== undefined)).toBe(true)
  })

  it('reduces temporal error when halving the implicit-Euler step', () => {
    const reference = solveHeat3D(block(16))
    const difference = (timeSteps: number) => {
      const result = solveHeat3D(block(timeSteps))
      return Math.max(...result.mesh.nodes.map((_, index) => Math.abs(result.temperature[index]! - reference.temperature[index]!)))
    }
    const coarse = difference(2)
    const fine = difference(4)
    const finer = difference(8)
    expect(coarse).toBeGreaterThan(1e-4)
    expect(fine).toBeLessThan(coarse * 0.65)
    expect(finer).toBeLessThan(fine * 0.65)
  })
})
