import { createModelMesh } from './mesh'
import { near, solveScalar } from './scalar'
import { VACUUM_PERMITTIVITY, type ElectricSimulationResult, type HeatModel } from './types'

export function solveElectrostatics(model: HeatModel): ElectricSimulationResult {
  const { width, height } = model.geometry
  const permittivity = model.material.relativePermittivity * VACUUM_PERMITTIVITY
  const mesh = createModelMesh(model)
  const solution = solveScalar({
    width,
    height,
    nx: model.mesh.nx,
    ny: model.mesh.ny,
    coefficient: permittivity,
    source: model.electrostatics.chargeDensity,
    tolerance: model.study.tolerance,
    maxIterations: model.study.maxIterations,
    prescribedValue: (x, y) => {
      if (near(x, 0, width)) return model.electrostatics.leftVoltage
      if (near(x, width, width)) return model.electrostatics.rightVoltage
      if (near(y, 0, height) && model.electrostatics.bottom.type === 'potential') {
        return model.electrostatics.bottom.value
      }
      if (near(y, height, height) && model.electrostatics.top.type === 'potential') {
        return model.electrostatics.top.value
      }
      return undefined
    },
  }, mesh)

  return {
    physics: 'electrostatics',
    mesh: solution.mesh,
    potential: solution.values,
    electricField: solution.gradient.map((gradient) => ({
      x: -gradient.x,
      y: -gradient.y,
      magnitude: gradient.magnitude,
    })),
    converged: solution.converged,
    iterations: solution.iterations,
    relativeResidual: solution.relativeResidual,
    solveTimeMs: solution.solveTimeMs,
    minimum: solution.minimum,
    maximum: solution.maximum,
    average: solution.average,
  }
}
