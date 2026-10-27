import { describe, expect, it } from 'vitest'
import { pointOnSegment } from './boundary'
import { polygonGeometry, rectangleGeometry } from './geometry'
import { solveHeat } from './heat'
import { parseProjectJson } from './project'
import { defaultModel } from './types'

function logarithmicModel(nx: number, ny: number) {
  const model = structuredClone(defaultModel)
  model.geometry = rectangleGeometry(1, 0.2)
  model.mesh = { nx, ny, refinement: 1 }
  model.material.conductivity = 1
  model.material.gradients.conductivityX = 2
  model.physics = {
    heatSource: 0,
    leftTemperature: 0,
    rightTemperature: Math.log(3) / 2,
    top: { type: 'insulated' },
    bottom: { type: 'insulated' },
  }
  return model
}

describe('spatial coefficients and arbitrary boundary selections', () => {
  it('converges to a manufactured logarithmic solution with variable conductivity', () => {
    const errors = [[6, 4], [12, 8], [24, 16]].map(([nx, ny]) => {
      const result = solveHeat(logarithmicModel(nx!, ny!))
      expect(result.converged).toBe(true)
      return Math.max(...result.mesh.nodes.map((node, index) => Math.abs(result.temperature[index]! - Math.log(1 + 2 * node.x) / 2)))
    })
    expect(errors[1]!).toBeLessThan(errors[0]! * 0.35)
    expect(errors[2]!).toBeLessThan(errors[1]! * 0.35)
  })

  it('applies a Dirichlet override to an interior polygon boundary edge', () => {
    const model = structuredClone(defaultModel)
    model.geometry = polygonGeometry([{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.1, y: 0.2 }, { x: 0, y: 0.2 }])
    model.mesh = { nx: 12, ny: 8, refinement: 1 }
    model.edgeBoundaries.heat['4'] = { type: 'temperature', value: 77 }
    const result = solveHeat(model)
    const a = model.geometry.vertices[4]!
    const b = model.geometry.vertices[5]!
    const selected = result.mesh.nodes.map((node, index) => ({ node, index })).filter(({ node }) => pointOnSegment(node, a, b))
    expect(selected.length).toBeGreaterThan(2)
    for (const { index } of selected) expect(result.temperature[index]).toBeCloseTo(77, 8)
  })

  it('rejects spatial coefficients that become non-positive at a vertex', () => {
    const model = logarithmicModel(6, 4)
    model.material.gradients.conductivityX = -2
    expect(() => parseProjectJson(JSON.stringify(model))).toThrow(/conductivity must remain positive/)
  })
})
