import { createTetrahedralMesh, tetraGeometry } from './mesh3d'
import { solveLinearSystem, type SparseRow } from './solver'
import type { BaseSimulationResult, HeatModel, PreconditionerKind, SolverKind, SolverOrdering, TetrahedralMesh, VectorValue } from './types'

export interface ScalarProblem3D {
  coefficient: number
  source: number
  tolerance: number
  maxIterations: number
  solver: SolverKind
  preconditioner?: PreconditionerKind
  ordering?: SolverOrdering
  coefficientAt?: (x: number, y: number, z: number, domainIndex: number) => number
  sourceAt?: (x: number, y: number, z: number, domainIndex: number) => number
  reactionCoefficient?: number | ((domainIndex: number) => number)
  reactionSource?: number[]
  initialValues?: number[]
  requirePrescribed?: boolean
  prescribedValue: (x: number, y: number, z: number, domainIndex: number) => number | undefined
}

export interface ScalarSolution3D extends BaseSimulationResult {
  mesh: TetrahedralMesh
  values: number[]
  gradient: VectorValue[]
}

export interface ScalarAssembly3D {
  rows: SparseRow[]
  rhs: number[]
  prescribed: number[]
  freeToGlobal: number[]
  globalToFree: number[]
}

export function tetrahedronCentroid(mesh: TetrahedralMesh, tetrahedron: [number, number, number, number]) {
  return tetrahedron.reduce((point, index) => {
    const node = mesh.nodes[index]!
    return { x: point.x + node.x / 4, y: point.y + node.y / 4, z: point.z + node.z! / 4 }
  }, { x: 0, y: 0, z: 0 })
}

function nodeDomainAssignments(mesh: TetrahedralMesh): number[] {
  const domains = Array<number>(mesh.nodes.length).fill(-1)
  mesh.tetrahedra.forEach((tetrahedron, element) => tetrahedron.forEach((node) => {
    if (domains[node]! < 0) domains[node] = mesh.tetrahedronDomains[element]!
  }))
  if (domains.some((domain) => domain < 0)) throw new Error('A tetrahedral node is not connected to an element.')
  return domains
}

/** Assembles K + aM and F + aM·u with consistent P1 tetrahedral mass matrices. */
export function assembleScalar3D(problem: ScalarProblem3D, mesh: TetrahedralMesh): ScalarAssembly3D {
  const count = mesh.nodes.length
  if (problem.reactionSource && problem.reactionSource.length !== count) throw new Error('Reaction source size does not match the tetrahedral mesh.')
  if (problem.initialValues && problem.initialValues.length !== count) throw new Error('Initial values size does not match the tetrahedral mesh.')
  const prescribed = problem.initialValues ? [...problem.initialValues] : Array<number>(count).fill(0)
  const nodeDomains = nodeDomainAssignments(mesh)
  const freeToGlobal: number[] = []
  const globalToFree = Array<number>(count).fill(-1)
  mesh.nodes.forEach((node, index) => {
    const fixed = problem.prescribedValue(node.x, node.y, node.z!, nodeDomains[index]!)
    if (fixed === undefined) {
      globalToFree[index] = freeToGlobal.length
      freeToGlobal.push(index)
    } else prescribed[index] = fixed
  })
  if (problem.requirePrescribed && freeToGlobal.length === count) throw new Error('This stationary 3D study requires at least one Dirichlet boundary.')

  const rowMaps = freeToGlobal.map(() => new Map<number, number>())
  const rhs = Array<number>(freeToGlobal.length).fill(0)
  mesh.tetrahedra.forEach((tetrahedron, elementIndex) => {
    const domainIndex = mesh.tetrahedronDomains[elementIndex]!
    const { volume, gradients } = tetraGeometry(mesh.nodes, tetrahedron)
    const centroid = tetrahedronCentroid(mesh, tetrahedron)
    const reaction = typeof problem.reactionCoefficient === 'function' ? problem.reactionCoefficient(domainIndex) : problem.reactionCoefficient ?? 0
    const coefficient = problem.coefficientAt?.(centroid.x, centroid.y, centroid.z, domainIndex) ?? problem.coefficient
    const source = problem.sourceAt?.(centroid.x, centroid.y, centroid.z, domainIndex) ?? problem.source
    if (!(coefficient > 0)) throw new Error('The 3D diffusion coefficient must remain positive throughout the mesh.')
    for (let localI = 0; localI < 4; localI += 1) {
      const globalI = tetrahedron[localI]!
      const freeI = globalToFree[globalI]!
      if (freeI < 0) continue
      rhs[freeI]! += source * volume / 4
      for (let localJ = 0; localJ < 4; localJ += 1) {
        const globalJ = tetrahedron[localJ]!
        const a = gradients[localI]!
        const b = gradients[localJ]!
        const stiffness = coefficient * volume * (a.x * b.x + a.y * b.y + a.z * b.z)
        const mass = reaction * volume * (localI === localJ ? 1 / 10 : 1 / 20)
        const value = stiffness + mass
        const freeJ = globalToFree[globalJ]!
        if (freeJ >= 0) rowMaps[freeI]!.set(freeJ, (rowMaps[freeI]!.get(freeJ) ?? 0) + value)
        else rhs[freeI]! -= value * prescribed[globalJ]!
        if (problem.reactionSource) rhs[freeI]! += mass * problem.reactionSource[globalJ]!
      }
    }
  })
  const rows: SparseRow[] = rowMaps.map((entries, rowIndex) => {
    const indices = [...entries.keys()].sort((a, b) => a - b)
    return { indices, values: indices.map((index) => entries.get(index)!), diagonal: entries.get(rowIndex) ?? 0 }
  })
  return { rows, rhs, prescribed, freeToGlobal, globalToFree }
}

export function scalarGradient3D(mesh: TetrahedralMesh, values: number[]): VectorValue[] {
  if (values.length !== mesh.nodes.length) throw new Error('Field size does not match the tetrahedral mesh.')
  return mesh.tetrahedra.map((tetrahedron) => {
    const { gradients } = tetraGeometry(mesh.nodes, tetrahedron)
    const gradient = gradients.reduce((sum, item, localIndex) => ({
      x: sum.x + item.x * values[tetrahedron[localIndex]!]!,
      y: sum.y + item.y * values[tetrahedron[localIndex]!]!,
      z: sum.z + item.z * values[tetrahedron[localIndex]!]!,
    }), { x: 0, y: 0, z: 0 })
    return { ...gradient, magnitude: Math.hypot(gradient.x, gradient.y, gradient.z) }
  })
}

/** Solves −∇·(c∇u) + au = Q + f on a conforming P1 tetrahedral mesh. */
export function solveScalar3D(model: HeatModel, problem: ScalarProblem3D, existingMesh?: TetrahedralMesh): ScalarSolution3D {
  const started = performance.now()
  const mesh = existingMesh ?? createTetrahedralMesh(model)
  const assembly = assembleScalar3D(problem, mesh)
  const initial = problem.initialValues?.filter((_, index) => assembly.globalToFree[index]! >= 0)
  const solution = solveLinearSystem(assembly.rows, assembly.rhs, problem.solver, problem.tolerance, problem.maxIterations, initial, { preconditioner: problem.preconditioner, ordering: problem.ordering })
  const values = assembly.prescribed
  solution.values.forEach((value, freeIndex) => { values[assembly.freeToGlobal[freeIndex]!] = value })
  return {
    mesh,
    solver: problem.solver,
    values,
    gradient: scalarGradient3D(mesh, values),
    converged: solution.converged,
    iterations: solution.iterations,
    relativeResidual: solution.relativeResidual,
    solveTimeMs: performance.now() - started,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}
