import { describe, expect, it } from 'vitest'
import { runAdaptiveStudy } from './adaptive'
import { deriveValues } from './derived'
import { solveElasticity } from './elasticity'
import { solveElectrostatics } from './electrostatics'
import { toVtk } from './exporters'
import { multiDomainGeometry } from './geometry'
import { solveHeat } from './heat'
import { heatModelSchema } from './project'
import { defaultModel, type HeatModel } from './types'

function compositeModel(): HeatModel {
  const model = structuredClone(defaultModel)
  model.name = 'Two-domain analytical composite'
  model.geometry = multiDomainGeometry([
    { id: 'domain-1', name: 'Material A', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
    { id: 'domain-2', name: 'Material B', vertices: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }] },
  ])
  model.material.conductivity = 1
  model.material.relativePermittivity = 1
  model.domainMaterials = {
    'domain-2': { ...structuredClone(model.material), conductivity: 2, relativePermittivity: 2, youngsModulus: 2e6, thermalExpansion: 2e-5 },
  }
  model.material.youngsModulus = 1e6
  model.material.thermalExpansion = 1e-5
  model.material.poissonRatio = 0
  model.domainMaterials['domain-2']!.poissonRatio = 0
  model.mesh = { nx: 8, ny: 8, refinement: 2 }
  model.study.solver = 'direct'
  model.physics = { heatSource: 0, leftTemperature: 0, rightTemperature: 30, top: { type: 'insulated' }, bottom: { type: 'insulated' } }
  model.electrostatics = { chargeDensity: 0, leftVoltage: 0, rightVoltage: 30, top: { type: 'zeroCharge' }, bottom: { type: 'zeroCharge' } }
  return model
}

describe('multidomain geometry and materials', () => {
  it('reproduces series thermal and electric resistance with a continuous interface', () => {
    const model = compositeModel()
    const thermal = solveHeat(model)
    const electric = solveElectrostatics(model)
    expect(thermal.converged).toBe(true)
    expect(electric.converged).toBe(true)
    expect(thermal.mesh.triangleDomains?.filter((domain) => domain === 0)).toHaveLength(32)
    expect(thermal.mesh.triangleDomains?.filter((domain) => domain === 1)).toHaveLength(32)
    thermal.mesh.nodes.forEach((node, index) => {
      const expected = node.x <= 1 ? 20 * node.x : 10 + 10 * node.x
      expect(thermal.temperature[index]).toBeCloseTo(expected, 8)
      expect(electric.potential[index]).toBeCloseTo(expected, 6)
    })
    const interfaceNodes = thermal.mesh.nodes.map((node, index) => ({ node, index })).filter(({ node }) => Math.abs(node.x - 1) < 1e-10)
    expect(interfaceNodes).toHaveLength(5)
    expect(thermal.flux.every((flux) => Math.abs(flux.x + 20) < 1e-7 && Math.abs(flux.y) < 1e-7)).toBe(true)
    const vtk = toVtk(thermal)
    expect(vtk).toContain('SCALARS domain_id int 1')
    const derived = deriveValues(thermal)
    expect(derived.domains.map((domain) => domain.area)).toEqual([1, 1])
    expect(derived.domains[0]!.average).toBeCloseTo(10, 8)
    expect(derived.domains[1]!.average).toBeCloseTo(25, 8)
  })

  it('reproduces longitudinal free thermal expansion with domain-specific coefficients', () => {
    const model = compositeModel()
    model.activePhysics = 'elasticity'
    model.physics = { heatSource: 0, leftTemperature: 100, rightTemperature: 100, top: { type: 'temperature', value: 100 }, bottom: { type: 'temperature', value: 100 } }
    model.elasticity.thermalCoupling = true
    model.elasticity.referenceTemperature = 20
    model.elasticity.left = { type: 'roller' }
    model.elasticity.right = { type: 'free' }
    model.elasticity.top = { type: 'roller' }
    model.elasticity.bottom = { type: 'roller' }
    const result = solveElasticity(model)
    expect(result.converged).toBe(true)
    result.mesh.nodes.forEach((node, index) => {
      const expected = node.x <= 1 ? 8e-4 * node.x : 8e-4 + 16e-4 * (node.x - 1)
      expect(result.displacement[index]!.x).toBeCloseTo(expected, 9)
      expect(result.displacement[index]!.y).toBeCloseTo(0, 10)
    })
    result.stress.forEach((stress, elementIndex) => {
      const domain = result.mesh.triangleDomains?.[elementIndex] ?? 0
      const modulus = domain === 0 ? 1e6 : 2e6
      const expansion = domain === 0 ? 1e-5 : 2e-5
      expect(stress.xx).toBeCloseTo(0, 8)
      expect(stress.xy).toBeCloseTo(0, 8)
      expect(stress.yy).toBeCloseTo(-modulus * expansion * 80, 8)
    })
    expect(result.thermal?.expansions).toEqual([1e-5, 2e-5])
  })

  it('rejects overlap and nonconforming partial-edge contacts', () => {
    const a = { id: 'domain-1', name: 'A', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }
    expect(() => multiDomainGeometry([a, { id: 'domain-2', name: 'B', vertices: [{ x: 0.5, y: 0 }, { x: 1.5, y: 0 }, { x: 1.5, y: 1 }, { x: 0.5, y: 1 }] }])).toThrow(/complete matching edges|overlap/)
    expect(() => multiDomainGeometry([a, { id: 'domain-2', name: 'B', vertices: [{ x: 0.5, y: 1 }, { x: 1.5, y: 1 }, { x: 1.5, y: 2 }, { x: 0.5, y: 2 }] }])).toThrow(/partial-edge contacts/)
    const model = compositeModel()
    delete model.domainMaterials['domain-2']
    expect(() => heatModelSchema.parse(model)).toThrow(/Missing material/)
  })

  it('preserves domain tags and exact per-domain areas during local adaptation', () => {
    const model = compositeModel()
    model.adaptive = { levels: 2, markFraction: 0.25 }
    const report = runAdaptiveStudy(model)
    expect(report.entries).toHaveLength(2)
    expect(report.finest.mesh.triangleDomains).toHaveLength(report.finest.mesh.triangles.length)
    expect(new Set(report.finest.mesh.triangleDomains)).toEqual(new Set([0, 1]))
    const derived = deriveValues(report.finest)
    expect(derived.domains[0]!.area).toBeCloseTo(1, 10)
    expect(derived.domains[1]!.area).toBeCloseTo(1, 10)
  })

  it('round-trips domain assignments and materials through schema v8', () => {
    const model = compositeModel()
    const parsed = heatModelSchema.parse(JSON.parse(JSON.stringify(model)))
    expect(parsed).toEqual(model)
    expect(parsed.geometry.domains.map((domain) => domain.name)).toEqual(['Material A', 'Material B'])
    expect(parsed.domainMaterials['domain-2']!.conductivity).toBe(2)
  })
})
