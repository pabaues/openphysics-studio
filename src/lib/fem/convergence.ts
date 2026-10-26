import { resultValues, solveActiveModel } from './study'
import type { AnySimulationResult, ConvergenceEntry, ConvergenceReport, HeatModel } from './types'

function coarseSample(fine: AnySimulationResult, coarseNodeIndex: number, coarseNx: number): number {
  const refinement = fine.mesh.nx / coarseNx
  const i = coarseNodeIndex % (coarseNx + 1)
  const j = Math.floor(coarseNodeIndex / (coarseNx + 1))
  const fineIndex = Math.round(j * refinement) * (fine.mesh.nx + 1) + Math.round(i * refinement)
  return resultValues(fine)[fineIndex]!
}

function compareGrids(coarse: AnySimulationResult, fine: AnySimulationResult) {
  const coarseValues = resultValues(coarse)
  let squaredDifference = 0
  let squaredReference = 0
  let maximumDifference = 0
  coarse.mesh.nodes.forEach((_, index) => {
    const fineValue = coarseSample(fine, index, coarse.mesh.nx)
    const difference = fineValue - coarseValues[index]!
    squaredDifference += difference * difference
    squaredReference += fineValue * fineValue
    maximumDifference = Math.max(maximumDifference, Math.abs(difference))
  })
  const denominator = Math.sqrt(squaredReference / coarse.mesh.nodes.length)
  const absoluteL2 = Math.sqrt(squaredDifference / coarse.mesh.nodes.length)
  return {
    relativeL2: denominator > 0 ? absoluteL2 / denominator : absoluteL2,
    maximumDifference,
  }
}

/**
 * Successive-grid self-convergence. The reported L2 difference is not an error
 * against an exact solution; observed order uses three consecutive grid levels.
 */
export function runConvergenceStudy(model: HeatModel): ConvergenceReport {
  const started = performance.now()
  const levels = model.convergence.levels
  const refinement = 2 ** (levels - 1)
  if (model.mesh.nx * refinement > 128 || model.mesh.ny * refinement > 128) {
    throw new Error('The finest convergence mesh exceeds 128 divisions per direction. Reduce the base mesh or levels.')
  }

  const entries: ConvergenceEntry[] = []
  let previous: AnySimulationResult | undefined
  let finest: AnySimulationResult | undefined
  let converged = true

  for (let level = 0; level < levels; level += 1) {
    const factor = 2 ** level
    const current = solveActiveModel({
      ...model,
      mesh: { nx: model.mesh.nx * factor, ny: model.mesh.ny * factor },
    })
    const entry: ConvergenceEntry = {
      level: level + 1,
      nx: current.mesh.nx,
      ny: current.mesh.ny,
      nodes: current.mesh.nodes.length,
      elementSize: Math.max(current.mesh.width / current.mesh.nx, current.mesh.height / current.mesh.ny),
      iterations: current.iterations,
      solveTimeMs: current.solveTimeMs,
      converged: current.converged,
    }
    if (previous) {
      const comparison = compareGrids(previous, current)
      const solverFloor = model.study.tolerance * 10
      entry.relativeL2 = comparison.relativeL2
      entry.maximumDifference = comparison.maximumDifference
      entry.nearSolverFloor = comparison.relativeL2 <= solverFloor
      const previousEntry = entries[entries.length - 1]
      const previousError = previousEntry?.relativeL2
      if (previousError !== undefined && previousError > solverFloor && comparison.relativeL2 > solverFloor) {
        entry.observedOrder = Math.log2(previousError / comparison.relativeL2)
      }
    }
    entries.push(entry)
    converged = converged && current.converged
    previous = current
    finest = current
    if (!current.converged) break
  }

  if (!finest) throw new Error('The convergence study did not produce a solution.')
  return {
    physics: model.activePhysics,
    entries,
    finest,
    converged,
    totalTimeMs: performance.now() - started,
  }
}
