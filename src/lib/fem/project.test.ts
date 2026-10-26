import { describe, expect, it } from 'vitest'
import { parseProjectJson } from './project'
import { defaultModel } from './types'

describe('project persistence', () => {
  it('round-trips the current multiphysics schema', () => {
    const parsed = parseProjectJson(JSON.stringify(defaultModel))
    expect(parsed).toEqual(defaultModel)
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
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.activePhysics).toBe('heat')
    expect(parsed.material.relativePermittivity).toBe(1)
    expect(parsed.electrostatics).toEqual(defaultModel.electrostatics)
  })
})
