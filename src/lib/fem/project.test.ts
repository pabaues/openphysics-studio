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
    reordered.study = { tolerance: reordered.study.tolerance, maxIterations: reordered.study.maxIterations, type: reordered.study.type }
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
    expect(parsed.schemaVersion).toBe(4)
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
    expect(parsed.schemaVersion).toBe(4)
    expect(parsed.material.conductivity).toBe(123)
    expect(parsed.study).toEqual({ type: 'stationary', tolerance: 1e-6, maxIterations: 500 })
    expect(parsed.transient).toEqual(defaultModel.transient)
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
    expect(parsed.schemaVersion).toBe(4)
    expect(parsed.material.youngsModulus).toBe(defaultModel.material.youngsModulus)
    expect(parsed.elasticity).toEqual(defaultModel.elasticity)
  })
})
