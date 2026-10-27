import { edgeOverride } from './boundary'
import { manufacturedSource } from './manufactured'
import { createModelMesh } from './mesh'
import { permittivityAt } from './properties'
import { near, solveScalar } from './scalar'
import { VACUUM_PERMITTIVITY, type ElectricSimulationResult, type HeatModel, type Mesh } from './types'

export function solveElectrostatics(model: HeatModel, existingMesh?: Mesh): ElectricSimulationResult {
  const { width, height } = model.geometry
  const permittivity = model.material.relativePermittivity * VACUUM_PERMITTIVITY
  const mesh = existingMesh ?? createModelMesh(model)
  const solution = solveScalar({
    width,
    height,
    nx: model.mesh.nx,
    ny: model.mesh.ny,
    coefficient: permittivity,
    coefficientAt: (x, y) => permittivityAt(model, x, y) * VACUUM_PERMITTIVITY,
    source: model.electrostatics.chargeDensity,
    sourceAt: (x, y) => manufacturedSource(model, x, y) ?? model.electrostatics.chargeDensity,
    tolerance: model.study.tolerance,
    maxIterations: model.study.maxIterations,
    solver: model.study.solver,
    preconditioner: model.study.preconditioner,
    ordering: model.study.ordering,
    prescribedValue: (x, y) => {
      if (model.study.manufacturedSolution === 'scalarSine') return near(x, 0, width) || near(x, width, width) || near(y, 0, height) || near(y, height, height) ? 0 : undefined
      const override = edgeOverride(model, 'electrostatics', { x, y })
      if (override) return override.type === 'potential' ? override.value : undefined
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
    solver: model.study.solver,
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
