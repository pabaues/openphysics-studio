import { describe, expect, it } from 'vitest'
import { runConvergenceStudy } from './convergence'
import { parseGeometryFile, polygonGeometry, signedPolygonArea } from './geometry'
import { solveElectrostatics } from './electrostatics'
import { solveHeat } from './heat'
import { createPolygonMesh, maximumElementSize } from './mesh'
import { defaultModel } from './types'

const L_SHAPE = [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 },
  { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 },
]

function meshedLShape(refinement = 1) {
  const model = structuredClone(defaultModel)
  model.geometry = polygonGeometry(L_SHAPE)
  model.mesh.refinement = refinement
  model.physics = {
    heatSource: 0, leftTemperature: 20, rightTemperature: 80,
    top: { type: 'insulated' }, bottom: { type: 'insulated' },
  }
  model.electrostatics = {
    chargeDensity: 0, leftVoltage: 0, rightVoltage: 10,
    top: { type: 'zeroCharge' }, bottom: { type: 'zeroCharge' },
  }
  return model
}

describe('simple polygon geometry and unstructured meshes', () => {
  it('imports and normalizes CSV and linear SVG paths', () => {
    const csv = parseGeometryFile('domain.csv', 'x,y\n10,20\n12,20\n12,21\n11,21\n11,22\n10,22\n')
    const svg = parseGeometryFile('domain.svg', '<svg><path d="M 10 20 H 12 V 19 H 11 V 18 H 10 Z" /></svg>')
    expect(csv.vertices[0]).toEqual({ x: 0, y: 0 })
    expect(signedPolygonArea(csv.vertices)).toBeCloseTo(3, 12)
    expect(signedPolygonArea(svg.vertices)).toBeCloseTo(3, 12)
    expect(svg.width).toBeCloseTo(2)
    expect(svg.height).toBeCloseTo(2)
  })

  it('supports SVG polygon points and rejects unsupported or invalid boundaries', () => {
    const svg = parseGeometryFile('triangle.svg', '<svg><polygon points="0,0 2,0 0,1" /></svg>')
    expect(signedPolygonArea(svg.vertices)).toBeCloseTo(1)
    expect(() => parseGeometryFile('curve.svg', '<svg><path d="M0 0 C1 0 1 1 0 1 Z" /></svg>')).toThrow(/flatten curves/)
    expect(() => parseGeometryFile('subpaths.svg', '<svg><path d="M0 0 L1 0 L1 1 Z M2 2 L3 2 L3 3 Z" /></svg>')).toThrow(/Multiple SVG subpaths/)
    expect(() => polygonGeometry([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }])).toThrow(/intersect/)
  })

  it('uses one-to-four red refinement while preserving coarse node indices', () => {
    const coarse = createPolygonMesh(L_SHAPE, 0)
    const fine = createPolygonMesh(L_SHAPE, 1)
    expect(coarse.triangles).toHaveLength(4)
    expect(fine.triangles).toHaveLength(16)
    expect(fine.nodes.slice(0, coarse.nodes.length)).toEqual(coarse.nodes)
    expect(maximumElementSize(fine)).toBeCloseTo(maximumElementSize(coarse) / 2, 12)
    const area = fine.triangles.reduce((sum, [ia, ib, ic]) => {
      const a = fine.nodes[ia]!
      const b = fine.nodes[ib]!
      const c = fine.nodes[ic]!
      return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
    }, 0)
    expect(area).toBeCloseTo(3, 12)
  })

  it('reproduces affine thermal and electric fields exactly on an unstructured domain', () => {
    const model = meshedLShape()
    model.geometry = polygonGeometry([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])
    const thermal = solveHeat(model)
    const electric = solveElectrostatics(model)
    thermal.mesh.nodes.forEach((node, index) => expect(thermal.temperature[index]).toBeCloseTo(20 + 30 * node.x, 8))
    electric.mesh.nodes.forEach((node, index) => expect(electric.potential[index]).toBeCloseTo(5 * node.x, 8))
    expect(thermal.converged).toBe(true)
    expect(electric.converged).toBe(true)
  })

  it('runs nested polygon convergence without structured-grid assumptions', () => {
    const model = meshedLShape(0)
    model.physics.heatSource = 1000
    model.convergence.levels = 3
    const report = runConvergenceStudy(model)
    expect(report.entries.map((entry) => entry.grid)).toEqual(['P1 · R0', 'P1 · R1', 'P1 · R2'])
    expect(report.entries.map((entry) => entry.refinement)).toEqual([0, 1, 2])
    expect(report.entries[1]!.elementSize).toBeCloseTo(report.entries[0]!.elementSize / 2, 12)
    expect(report.entries[2]!.elementSize).toBeCloseTo(report.entries[1]!.elementSize / 2, 12)
    expect(report.finest.mesh.kind).toBe('unstructured')
    expect(report.converged).toBe(true)
  })
})
