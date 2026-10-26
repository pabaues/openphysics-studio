import { deriveValues, type DerivedValues } from './derived'
import { heatModelSchema } from './project'
import { solveActiveModel } from './study'
import type { AnySimulationResult, HeatModel, SweepParameter } from './types'

export interface SweepCase {
  value: number
  result: AnySimulationResult
  derived: DerivedValues
}

export interface SweepReport {
  parameter: SweepParameter
  parameterLabel: string
  unit: string
  cases: SweepCase[]
  totalTimeMs: number
}

export const sweepParameters: Record<SweepParameter, { label: string; unit: string; physics: 'heat' | 'electrostatics' | 'elasticity' | 'both' }> = {
  'geometry.width': { label: 'Width', unit: 'm', physics: 'both' },
  'geometry.height': { label: 'Height', unit: 'm', physics: 'both' },
  'material.conductivity': { label: 'Thermal conductivity', unit: 'W/(m·K)', physics: 'heat' },
  'material.relativePermittivity': { label: 'Relative permittivity', unit: '', physics: 'electrostatics' },
  'material.youngsModulus': { label: 'Young’s modulus', unit: 'Pa', physics: 'elasticity' },
  'physics.heatSource': { label: 'Heat source', unit: 'W/m³', physics: 'heat' },
  'electrostatics.chargeDensity': { label: 'Space charge', unit: 'C/m³', physics: 'electrostatics' },
}

function withParameter(model: HeatModel, parameter: SweepParameter, value: number): HeatModel {
  const next = structuredClone(model)
  if (parameter === 'geometry.width') next.geometry.width = value
  if (parameter === 'geometry.height') next.geometry.height = value
  if (parameter === 'material.conductivity') next.material.conductivity = value
  if (parameter === 'material.relativePermittivity') next.material.relativePermittivity = value
  if (parameter === 'material.youngsModulus') next.material.youngsModulus = value
  if (parameter === 'physics.heatSource') next.physics.heatSource = value
  if (parameter === 'electrostatics.chargeDensity') next.electrostatics.chargeDensity = value
  return heatModelSchema.parse(next)
}

export function runParametricSweep(model: HeatModel): SweepReport {
  const started = performance.now()
  const { parameter, values } = model.sweep
  const metadata = sweepParameters[parameter]
  if (metadata.physics !== 'both' && metadata.physics !== model.activePhysics) {
    throw new Error(`${metadata.label} does not affect the active ${model.activePhysics} interface.`)
  }
  if (values.length < 2 || values.length > 12) throw new Error('A sweep requires between 2 and 12 values.')
  if (new Set(values).size !== values.length) throw new Error('Sweep values must be unique.')
  const cases = values.map((value) => {
    const result = solveActiveModel(withParameter(model, parameter, value))
    return { value, result, derived: deriveValues(result) }
  })
  return { parameter, parameterLabel: metadata.label, unit: metadata.unit, cases, totalTimeMs: performance.now() - started }
}
