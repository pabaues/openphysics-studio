import { describe, expect, it } from 'vitest'
import { modelSignature, parseProjectJson } from './project'
import { defaultModel } from './types'

describe('project persistence', () => {
  it('round-trips the current multiphysics schema', () => {
    const parsed = parseProjectJson(JSON.stringify(defaultModel))
    expect(parsed).toEqual(defaultModel)
  })

  it('uses signatures independent of schema key insertion order', () => {
    const reordered = structuredClone(defaultModel)
    reordered.study = { tolerance: reordered.study.tolerance, maxIterations: reordered.study.maxIterations, type: reordered.study.type, solver: reordered.study.solver }
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(defaultModel))
    expect(modelSignature(reordered)).toBe(modelSignature(defaultModel))
  })

  it('migrates thermal-only version 1 projects additively', () => {
    const legacy = {
      schemaVersion: 1,
      name: 'Legacy thermal model',
      geometry: defaultModel.geometry,
      material: { conductivity: 45 },
      physics: defaultModel.physics,
      mesh: defaultModel.mesh,
      study: defaultModel.study,
    }
    const parsed = parseProjectJson(JSON.stringify(legacy))
    expect(parsed.schemaVersion).toBe(6)
    expect(parsed.activePhysics).toBe('heat')
    expect(parsed.material.relativePermittivity).toBe(1)
    expect(parsed.material.density).toBe(defaultModel.material.density)
    expect(parsed.study.type).toBe('stationary')
    expect(parsed.electrostatics).toEqual(defaultModel.electrostatics)
  })

  it('migrates version 2 projects without replacing their settings', () => {
    const legacy = {
      ...structuredClone(defaultModel),
      schemaVersion: 2,
      material: { conductivity: 123, relativePermittivity: 4 },
      study: { tolerance: 1e-6, maxIterations: 500 },
      transient: undefined,
      sweep: undefined,
    }
    delete legacy.transient
    delete legacy.sweep
    const parsed = parseProjectJson(JSON.stringify(legacy))
    expect(parsed.schemaVersion).toBe(6)
    expect(parsed.material.conductivity).toBe(123)
    expect(parsed.study).toEqual({ type: 'stationary', tolerance: 1e-6, maxIterations: 500, solver: 'iterative' })
    expect(parsed.transient).toEqual(defaultModel.transient)
  })

  it('migrates version 5 projects without replacing geometry or study settings', () => {
    const legacy = structuredClone(defaultModel) as unknown as Record<string, unknown> & { schemaVersion: number; study: Record<string, unknown> }
    legacy.schemaVersion = 5
    delete legacy.study.solver
    legacy.name = 'Version 5 preserved model'
    legacy.mesh = { nx: 18, ny: 10, refinement: 2 }
    legacy.study = { type: 'stationary', tolerance: 1e-9, maxIterations: 800 }
    const parsed = parseProjectJson(JSON.stringify(legacy))
    expect(parsed.schemaVersion).toBe(6)
    expect(parsed.name).toBe('Version 5 preserved model')
    expect(parsed.geometry).toEqual(defaultModel.geometry)
    expect(parsed.mesh).toEqual({ nx: 18, ny: 10, refinement: 2 })
    expect(parsed.study).toEqual({ type: 'stationary', tolerance: 1e-9, maxIterations: 800, solver: 'iterative' })
  })

  it('migrates version 3 projects with structural defaults', () => {
    const legacy = {
      ...structuredClone(defaultModel),
      schemaVersion: 3,
      material: { conductivity: 45, relativePermittivity: 1, density: 7850, heatCapacity: 475 },
      elasticity: undefined,
    }
    delete legacy.elasticity
    const parsed = parseProjectJson(JSON.stringify(legacy))
    expect(parsed.schemaVersion).toBe(6)
    expect(parsed.material.youngsModulus).toBe(defaultModel.material.youngsModulus)
    expect(parsed.elasticity).toEqual(defaultModel.elasticity)
  })

  it('migrates version 4 rectangles to explicit vertices and mesh refinement', () => {
    const legacy = {
      ...structuredClone(defaultModel),
      schemaVersion: 4,
      geometry: { width: 0.2, height: 0.1 },
      mesh: { nx: 12, ny: 8 },
    }
    const parsed = parseProjectJson(JSON.stringify(legacy))
    expect(parsed.schemaVersion).toBe(6)
    expect(parsed.geometry.shape).toBe('rectangle')
    expect(parsed.geometry.vertices).toHaveLength(4)
    expect(parsed.geometry.vertices[2]).toEqual({ x: 0.2, y: 0.1 })
    expect(parsed.mesh).toEqual({ nx: 12, ny: 8, refinement: 1 })
  })

  it('rejects dimensions inconsistent with stored vertices', () => {
    const rectangle = structuredClone(defaultModel)
    rectangle.geometry.width = 0.2
    expect(() => parseProjectJson(JSON.stringify(rectangle))).toThrow(/Rectangle vertices/)
    const polygon = structuredClone(defaultModel)
    polygon.geometry = { shape: 'polygon', width: 0.2, height: 0.1, vertices: polygon.geometry.vertices }
    expect(() => parseProjectJson(JSON.stringify(polygon))).toThrow(/bounding box/)
  })
})
