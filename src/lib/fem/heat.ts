import { near, solveScalar } from './scalar'
import type { HeatModel, SimulationResult } from './types'

export function solveHeat(model: HeatModel): SimulationResult {
  const { width, height } = model.geometry
  const solution = solveScalar({
    width,
    height,
    nx: model.mesh.nx,
    ny: model.mesh.ny,
    coefficient: model.material.conductivity,
    source: model.physics.heatSource,
    tolerance: model.study.tolerance,
    maxIterations: model.study.maxIterations,
    prescribedValue: (x, y) => {
      if (near(x, 0, width)) return model.physics.leftTemperature
      if (near(x, width, width)) return model.physics.rightTemperature
      if (near(y, 0, height) && model.physics.bottom.type === 'temperature') {
        return model.physics.bottom.value
      }
      if (near(y, height, height) && model.physics.top.type === 'temperature') {
        return model.physics.top.value
      }
      return undefined
    },
  })

  return {
    physics: 'heat',
    mesh: solution.mesh,
    temperature: solution.values,
    flux: solution.gradient.map((gradient) => ({
      x: -model.material.conductivity * gradient.x,
      y: -model.material.conductivity * gradient.y,
      magnitude: model.material.conductivity * gradient.magnitude,
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
