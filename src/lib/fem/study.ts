import { solveCustom } from './custom'
import { solveElasticity } from './elasticity'
import { solveElectrostatics } from './electrostatics'
import { solveHeat } from './heat'
import type { AnySimulationResult, HeatModel } from './types'

export function solveActiveModel(model: HeatModel): AnySimulationResult {
  if (model.activePhysics === 'electrostatics') return solveElectrostatics(model)
  if (model.activePhysics === 'elasticity') return solveElasticity(model)
  if (model.activePhysics === 'custom') return solveCustom(model)
  return solveHeat(model)
}

export function resultValues(result: AnySimulationResult): number[] {
  if (result.physics === 'heat') return result.temperature
  if (result.physics === 'electrostatics') return result.potential
  if (result.physics === 'custom') return result.values
  return result.displacement.map((value) => value.magnitude)
}
