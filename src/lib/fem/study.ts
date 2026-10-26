import { solveElasticity } from './elasticity'
import { solveElectrostatics } from './electrostatics'
import { solveHeat } from './heat'
import type { AnySimulationResult, HeatModel } from './types'

export function solveActiveModel(model: HeatModel): AnySimulationResult {
  if (model.activePhysics === 'electrostatics') return solveElectrostatics(model)
  if (model.activePhysics === 'elasticity') return solveElasticity(model)
  return solveHeat(model)
}

export function resultValues(result: AnySimulationResult): number[] {
  if (result.physics === 'heat') return result.temperature
  if (result.physics === 'electrostatics') return result.potential
  return result.displacement.map((value) => value.magnitude)
}
