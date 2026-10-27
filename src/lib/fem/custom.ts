import { boundaryConditionOnEdge, edgeOverride } from './boundary'
import { manufacturedSource } from './manufactured'
import { createModelMesh } from './mesh'
import { near, solveScalar } from './scalar'
import type { CustomBoundaryCondition, CustomSimulationResult, HeatModel, Mesh } from './types'

function namedBoundary(model: HeatModel, x: number, y: number): CustomBoundaryCondition {
  const { width, height } = model.geometry
  if (near(x, 0, width)) return model.custom.left
  if (near(x, width, width)) return model.custom.right
  if (near(y, 0, height)) return model.custom.bottom
  if (near(y, height, height)) return model.custom.top
  return { type: 'neumann', value: 0 }
}

export function solveCustom(model: HeatModel, existingMesh?: Mesh): CustomSimulationResult {
  const { width, height } = model.geometry
  const mesh = existingMesh ?? createModelMesh(model)
  const sine = model.study.manufacturedSolution === 'scalarSine'
  const solution = solveScalar({
    width, height, nx: model.mesh.nx, ny: model.mesh.ny,
    coefficient: model.custom.diffusion,
    source: model.custom.source,
    sourceAt: (x, y) => manufacturedSource(model, x, y) ?? model.custom.source,
    reactionCoefficient: model.custom.reaction,
    tolerance: model.study.tolerance,
    maxIterations: model.study.maxIterations,
    solver: model.study.solver,
    preconditioner: model.study.preconditioner,
    ordering: model.study.ordering,
    prescribedValue: (x, y) => {
      if (sine) return Math.abs(x) < 1e-12 || Math.abs(y) < 1e-12 || Math.abs(x - width) < 1e-12 || Math.abs(y - height) < 1e-12 ? 0 : undefined
      const override = edgeOverride(model, 'custom', { x, y })
      const condition = override ?? namedBoundary(model, x, y)
      const onBoundary = override !== undefined || near(x, 0, width) || near(x, width, width) || near(y, 0, height) || near(y, height, height)
      return onBoundary && condition.type === 'dirichlet' ? condition.value : undefined
    },
    boundaryFlux: sine ? undefined : (a, b, aIndex, bIndex) => {
      const condition = boundaryConditionOnEdge(model, 'custom', mesh, aIndex, bIndex, () => namedBoundary(model, (a.x + b.x) / 2, (a.y + b.y) / 2))
      return condition.type === 'neumann' ? condition.value : undefined
    },
  }, mesh)
  return {
    physics: 'custom', solver: model.study.solver, mesh: solution.mesh,
    values: solution.values, gradient: solution.gradient,
    converged: solution.converged, iterations: solution.iterations,
    relativeResidual: solution.relativeResidual, solveTimeMs: solution.solveTimeMs,
    minimum: solution.minimum, maximum: solution.maximum, average: solution.average,
  }
}
