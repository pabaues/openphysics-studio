import { solveElectrostatics } from './electrostatics'
import { solveHeat } from './heat'
import type { AnySimulationResult, HeatModel } from './types'

export function solveActiveModel(model: HeatModel): AnySimulationResult {
  return model.activePhysics === 'electrostatics' ? solveElectrostatics(model) : solveHeat(model)
}

export function resultValues(result: AnySimulationResult): number[] {
  return result.physics === 'heat' ? result.temperature : result.potential
}
