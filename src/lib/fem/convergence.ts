import { manufacturedError, validateManufacturedModel } from './manufactured'
import { maximumElementSize } from './mesh'
import { maximumTetrahedronSize } from './mesh3d'
import { resultValues, solveActiveModel } from './study'
import type { AnySimulationResult, ConvergenceEntry, ConvergenceReport, HeatModel, MeshNode } from './types'

function coordinateKey(node: MeshNode): string {
  return [node.x, node.y, node.z ?? 0].map((value) => value.toPrecision(14)).join(':')
}

function compareGrids(coarse: AnySimulationResult, fine: AnySimulationResult) {
  const coarseValues = resultValues(coarse)
  const fineValues = resultValues(fine)
  // Domain assembly changes global indices; nested coordinates are the stable grid identity.
  const fineAtCoordinates = new Map(fine.mesh.nodes.map((node, index) => [coordinateKey(node), fineValues[index]!]))
  let squaredDifference = 0
  let squaredReference = 0
  let maximumDifference = 0
  let samples = 0
  coarse.mesh.nodes.forEach((node, index) => {
    const fineValue = fineAtCoordinates.get(coordinateKey(node))
    // Centre-based tetrahedral refinement adds non-nested prism centres; compare all shared nodes.
    if (fineValue === undefined) return
    const difference = fineValue - coarseValues[index]!
    squaredDifference += difference * difference
    squaredReference += fineValue * fineValue
    maximumDifference = Math.max(maximumDifference, Math.abs(difference))
    samples += 1
  })
  if (samples === 0) throw new Error('The refined mesh does not share any coarse-grid coordinates.')
  const denominator = Math.sqrt(squaredReference / samples)
  const absoluteL2 = Math.sqrt(squaredDifference / samples)
  return { relativeL2: denominator > 0 ? absoluteL2 / denominator : absoluteL2, maximumDifference }
}

function validateFinestSize(model: HeatModel) {
  const levels = model.convergence.levels
  const factor = 2 ** (levels - 1)
  if (model.geometry.dimension === '3d') {
    const nz = (model.mesh.nz ?? 2) * factor
    const triangles = model.geometry.shape === 'rectangle' && model.geometry.domains.length === 1
      ? model.mesh.nx * factor * model.mesh.ny * factor * 2
      : Math.max(1, model.geometry.vertices.length - 2) * 4 ** ((model.mesh.refinement ?? 1) + levels - 1)
    if (triangles * nz * 8 > 100000 || nz > 32) throw new Error('The finest 3D convergence mesh exceeds 100,000 tetrahedra or 32 Z divisions. Reduce the base mesh or levels.')
  } else if (model.geometry.shape === 'rectangle') {
    if (model.mesh.nx * factor > 128 || model.mesh.ny * factor > 128) throw new Error('The finest convergence mesh exceeds 128 divisions per direction. Reduce the base mesh or levels.')
  } else {
    const estimatedTriangles = Math.max(1, model.geometry.vertices.length - 2) * 4 ** ((model.mesh.refinement ?? 1) + levels - 1)
    if (estimatedTriangles > 100000) throw new Error('The finest convergence mesh exceeds 100,000 triangles. Reduce the polygon refinement or levels.')
  }
}

/** Successive-grid self-convergence for nested triangular and tetrahedral meshes. */
export function runConvergenceStudy(model: HeatModel): ConvergenceReport {
  const started = performance.now()
  validateManufacturedModel(model)
  validateFinestSize(model)
  const levels = model.convergence.levels
  const entries: ConvergenceEntry[] = []
  let previous: AnySimulationResult | undefined
  let finest: AnySimulationResult | undefined
  let converged = true
  for (let level = 0; level < levels; level += 1) {
    const factor = 2 ** level
    const mesh = {
      nx: model.geometry.shape === 'rectangle' ? model.mesh.nx * factor : model.mesh.nx,
      ny: model.geometry.shape === 'rectangle' ? model.mesh.ny * factor : model.mesh.ny,
      nz: model.geometry.dimension === '3d' ? (model.mesh.nz ?? 2) * factor : model.mesh.nz,
      refinement: (model.mesh.refinement ?? 1) + (model.geometry.shape === 'polygon' ? level : 0),
    }
    const current = solveActiveModel({ ...model, mesh })
    const elements = current.mesh.kind === 'tetrahedral' ? current.mesh.tetrahedra.length : current.mesh.triangles.length
    if (elements > 100000) throw new Error('A convergence mesh exceeds 100,000 elements.')
    const grid = current.mesh.kind === 'tetrahedral'
      ? model.geometry.shape === 'rectangle' && model.geometry.domains.length === 1
        ? `P1 tetrahedra · ${mesh.nx} × ${mesh.ny} × ${mesh.nz}`
        : `P1 tetrahedra · R${current.mesh.refinement} · Z${current.mesh.nz}`
      : current.mesh.kind === 'mapped' ? `${current.mesh.nx} × ${current.mesh.ny}` : `P1 · R${current.mesh.refinement}`
    const entry: ConvergenceEntry = {
      level: level + 1,
      grid,
      nx: current.mesh.kind === 'mapped' ? current.mesh.nx : 0,
      ny: current.mesh.kind === 'mapped' ? current.mesh.ny : 0,
      refinement: current.mesh.refinement,
      nodes: current.mesh.nodes.length,
      elementSize: current.mesh.kind === 'tetrahedral' ? maximumTetrahedronSize(current.mesh) : maximumElementSize(current.mesh),
      iterations: current.iterations,
      solveTimeMs: current.solveTimeMs,
      converged: current.converged,
      ...manufacturedError(model, current),
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
