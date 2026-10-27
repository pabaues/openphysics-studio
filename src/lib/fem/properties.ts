import type { HeatModel } from './types'

export function conductivityAt(model: HeatModel, x: number, y: number): number {
  return model.material.conductivity + model.material.gradients.conductivityX * x + model.material.gradients.conductivityY * y
}

export function permittivityAt(model: HeatModel, x: number, y: number): number {
  return model.material.relativePermittivity + model.material.gradients.permittivityX * x + model.material.gradients.permittivityY * y
}

export function youngsModulusAt(model: HeatModel, x: number, y: number): number {
  return model.material.youngsModulus + model.material.gradients.youngsModulusX * x + model.material.gradients.youngsModulusY * y
}
