import { solveCustom } from './custom'
import { solveElasticity } from './elasticity'
import { solveElectrostatics } from './electrostatics'
import { solveHeat } from './heat'
import { solveHeat3D } from './heat3d'
import type { AnySimulationResult, HeatModel } from './types'

export function solveActiveModel(model: HeatModel): AnySimulationResult {
  if (model.geometry.dimension === '3d') {
    if (model.activePhysics !== 'heat' || model.study.type !== 'stationary') throw new Error('The first 3D solver supports stationary Heat Transfer only.')
    return solveHeat3D(model)
  }
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
