import { conductivityAt, permittivityAt } from './properties'
import { resultValues } from './study'
import { VACUUM_PERMITTIVITY, type AnySimulationResult, type HeatModel } from './types'

export function manufacturedValue(model: HeatModel, x: number, y: number): number {
  const { width, height } = model.geometry
  if (model.study.manufacturedSolution === 'scalarSine') {
    return Math.sin(Math.PI * x / width) * Math.sin(Math.PI * y / height)
  }
  if (model.study.manufacturedSolution === 'logarithmic') {
    const gradient = model.material.gradients.conductivityX
    const base = model.material.conductivity
    const denominator = Math.log1p(gradient * width / base)
    return model.physics.leftTemperature + (model.physics.rightTemperature - model.physics.leftTemperature) * Math.log1p(gradient * x / base) / denominator
  }
  throw new Error('No manufactured solution is selected.')
}

export function manufacturedSource(model: HeatModel, x: number, y: number): number | undefined {
  if (model.study.manufacturedSolution !== 'scalarSine') return undefined
  const value = manufacturedValue(model, x, y)
  const waveNumber2 = (Math.PI / model.geometry.width) ** 2 + (Math.PI / model.geometry.height) ** 2
  if (model.activePhysics === 'heat') return model.material.conductivity * waveNumber2 * value
  if (model.activePhysics === 'electrostatics') return permittivityAt(model, x, y) * VACUUM_PERMITTIVITY * waveNumber2 * value
  return model.custom.diffusion * waveNumber2 * value + model.custom.reaction * value
}

export function manufacturedError(model: HeatModel, result: AnySimulationResult) {
  if (model.study.manufacturedSolution === 'none') return undefined
  if (result.physics === 'elasticity') throw new Error('Manufactured scalar solutions are available for heat, electrostatics and custom scalar physics.')
  const values = resultValues(result)
  let squared = 0
  let maximum = 0
  result.mesh.nodes.forEach((node, index) => {
    const error = values[index]! - manufacturedValue(model, node.x, node.y)
    squared += error * error
    maximum = Math.max(maximum, Math.abs(error))
  })
  return { exactL2: Math.sqrt(squared / values.length), exactMaximum: maximum }
}

export function validateManufacturedModel(model: HeatModel): void {
  if (model.study.manufacturedSolution === 'none') return
  if (model.activePhysics === 'elasticity' || model.study.type === 'transient') throw new Error('Manufactured convergence currently supports stationary scalar physics.')
  if (model.study.manufacturedSolution === 'scalarSine') {
    if (model.geometry.shape !== 'rectangle') throw new Error('The scalar sine benchmark requires a rectangular domain with zero Dirichlet conditions on all four sides.')
    const gradients = model.material.gradients
    if (model.activePhysics === 'heat' && (gradients.conductivityX !== 0 || gradients.conductivityY !== 0)) throw new Error('The scalar sine heat benchmark requires constant conductivity.')
    if (model.activePhysics === 'electrostatics' && (gradients.permittivityX !== 0 || gradients.permittivityY !== 0)) throw new Error('The scalar sine electrostatic benchmark requires constant permittivity.')
  }
  if (model.study.manufacturedSolution === 'logarithmic') {
    if (model.activePhysics !== 'heat' || model.material.gradients.conductivityY !== 0 || model.physics.heatSource !== 0 || model.physics.top.type !== 'insulated' || model.physics.bottom.type !== 'insulated') {
      throw new Error('The logarithmic benchmark requires stationary heat, zero source and Y conductivity gradient, and insulated top/bottom boundaries.')
    }
    if (conductivityAt(model, model.geometry.width, 0) <= 0) throw new Error('The logarithmic benchmark requires positive conductivity.')
  }
}
