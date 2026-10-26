import { maximumElementSize } from './mesh'
import { resultValues, solveActiveModel } from './study'
import type { AnySimulationResult, ConvergenceEntry, ConvergenceReport, HeatModel } from './types'

function coarseSample(fine: AnySimulationResult, coarseNodeIndex: number, coarseNx: number): number {
  const refinement = (fine.mesh.kind === 'mapped' ? fine.mesh.nx : 0) / coarseNx
  const i = coarseNodeIndex % (coarseNx + 1)
  const j = Math.floor(coarseNodeIndex / (coarseNx + 1))
  const fineIndex = Math.round(j * refinement) * (fine.mesh.kind === 'mapped' ? fine.mesh.nx + 1 : 0) + Math.round(i * refinement)
  return resultValues(fine)[fineIndex]!
}

function compareGrids(coarse: AnySimulationResult, fine: AnySimulationResult) {
  const coarseValues = resultValues(coarse)
  const fineValues = resultValues(fine)
  let squaredDifference = 0
  let squaredReference = 0
  let maximumDifference = 0
  coarse.mesh.nodes.forEach((_, index) => {
    // Red refinement preserves coarse indices; mapped grids use their structured mapping.
    const fineValue = coarse.mesh.kind === 'unstructured' ? fineValues[index]! : coarseSample(fine, index, coarse.mesh.nx)
    const difference = fineValue - coarseValues[index]!
    squaredDifference += difference * difference
    squaredReference += fineValue * fineValue
    maximumDifference = Math.max(maximumDifference, Math.abs(difference))
  })
  const denominator = Math.sqrt(squaredReference / coarse.mesh.nodes.length)
  const absoluteL2 = Math.sqrt(squaredDifference / coarse.mesh.nodes.length)
  return { relativeL2: denominator > 0 ? absoluteL2 / denominator : absoluteL2, maximumDifference }
}

/** Successive-grid self-convergence for mapped and nested unstructured meshes. */
export function runConvergenceStudy(model: HeatModel): ConvergenceReport {
  const started = performance.now()
  const levels = model.convergence.levels
  if (model.geometry.shape === 'rectangle') {
    const refinement = 2 ** (levels - 1)
    if (model.mesh.nx * refinement > 128 || model.mesh.ny * refinement > 128) throw new Error('The finest convergence mesh exceeds 128 divisions per direction. Reduce the base mesh or levels.')
  } else {
    const estimatedTriangles = Math.max(1, model.geometry.vertices.length - 2) * 4 ** ((model.mesh.refinement ?? 1) + levels - 1)
    if (estimatedTriangles > 100000) throw new Error('The finest convergence mesh exceeds 100,000 triangles. Reduce the polygon refinement or levels.')
  }

  const entries: ConvergenceEntry[] = []
  let previous: AnySimulationResult | undefined
  let finest: AnySimulationResult | undefined
  let converged = true
  for (let level = 0; level < levels; level += 1) {
    const factor = 2 ** level
    const current = solveActiveModel({
      ...model,
      mesh: {
        nx: model.geometry.shape === 'rectangle' ? model.mesh.nx * factor : model.mesh.nx,
        ny: model.geometry.shape === 'rectangle' ? model.mesh.ny * factor : model.mesh.ny,
        refinement: (model.mesh.refinement ?? 1) + (model.geometry.shape === 'polygon' ? level : 0),
      },
    })
    if (current.mesh.triangles.length > 100000) throw new Error('A convergence mesh exceeds 100,000 triangles.')
    const entry: ConvergenceEntry = {
      level: level + 1,
      grid: current.mesh.kind === 'mapped' ? `${current.mesh.nx} × ${current.mesh.ny}` : `P1 · R${current.mesh.refinement}`,
      nx: current.mesh.kind === 'mapped' ? current.mesh.nx : 0,
      ny: current.mesh.kind === 'mapped' ? current.mesh.ny : 0,
      refinement: current.mesh.refinement,
      nodes: current.mesh.nodes.length,
      elementSize: maximumElementSize(current.mesh),
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
      const previousError = entries[entries.length - 1]?.relativeL2
      if (previousError !== undefined && previousError > solverFloor && comparison.relativeL2 > solverFloor) entry.observedOrder = Math.log2(previousError / comparison.relativeL2)
    }
    entries.push(entry)
    converged = converged && current.converged
    previous = current
    finest = current
    if (!current.converged) break
  }
  if (!finest) throw new Error('The convergence study did not produce a solution.')
  return { physics: model.activePhysics, entries, finest, converged, totalTimeMs: performance.now() - started }
}
