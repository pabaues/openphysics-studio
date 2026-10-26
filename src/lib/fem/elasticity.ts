import { createModelMesh } from './mesh'
import { near, triangleGeometry } from './scalar'
import { solveLinearSystem, type SparseRow } from './solver'
import type { HeatModel, Mesh, StructuralBoundaryCondition, StructuralSimulationResult, TensorValue } from './types'

type PlaneState = HeatModel['elasticity']['planeState']
type BoundarySide = 'left' | 'right' | 'top' | 'bottom'

export function constitutiveMatrix(youngsModulus: number, poissonRatio: number, planeState: PlaneState): number[][] {
  if (planeState === 'planeStress') {
    const factor = youngsModulus / (1 - poissonRatio ** 2)
    return [[factor, factor * poissonRatio, 0], [factor * poissonRatio, factor, 0], [0, 0, factor * (1 - poissonRatio) / 2]]
  }
  const factor = youngsModulus / ((1 + poissonRatio) * (1 - 2 * poissonRatio))
  return [
    [factor * (1 - poissonRatio), factor * poissonRatio, 0],
    [factor * poissonRatio, factor * (1 - poissonRatio), 0],
    [0, 0, factor * (1 - 2 * poissonRatio) / 2],
  ]
}

function prescribedDisplacement(condition: StructuralBoundaryCondition, side: BoundarySide, dof: number): number | undefined {
  if (condition.type === 'free') return undefined
  if (condition.type === 'fixed') return 0
  const normalDof = side === 'left' || side === 'right' ? 0 : 1
  if (dof !== normalDof) return undefined
  if (condition.type === 'roller') return 0
  return condition.value
}

function boundaryValue(model: HeatModel, x: number, y: number, dof: number): number | undefined {
  const { width, height } = model.geometry
  const boundaries: Array<[boolean, StructuralBoundaryCondition, BoundarySide]> = [
    [near(x, 0, width), model.elasticity.left, 'left'],
    [near(x, width, width), model.elasticity.right, 'right'],
    [near(y, 0, height), model.elasticity.bottom, 'bottom'],
    [near(y, height, height), model.elasticity.top, 'top'],
  ]
  for (const [selected, condition, side] of boundaries) {
    if (!selected) continue
    const prescribed = prescribedDisplacement(condition, side, dof)
    if (prescribed !== undefined) return prescribed
  }
  return undefined
}

function strainDisplacement(mesh: Mesh, triangle: [number, number, number]): number[][] {
  const { area, b, c } = triangleGeometry(mesh, triangle)
  const matrix = Array.from({ length: 3 }, () => Array<number>(6).fill(0))
  for (let local = 0; local < 3; local += 1) {
    const ux = local * 2
    const uy = ux + 1
    matrix[0]![ux] = b[local]! / (2 * area)
    matrix[1]![uy] = c[local]! / (2 * area)
    matrix[2]![ux] = c[local]! / (2 * area)
    matrix[2]![uy] = b[local]! / (2 * area)
  }
  return matrix
}

function multiply(left: number[][], right: number[][]): number[][] {
  return left.map((row) => right[0]!.map((_, column) => row.reduce((sum, value, index) => sum + value * right[index]![column]!, 0)))
}

function tensorProduct(matrix: number[][], vector: number[]): TensorValue {
  const values = matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index]!, 0))
  return { xx: values[0]!, yy: values[1]!, xy: values[2]! }
}

/** Isotropic small-strain 2D elasticity with two-component linear triangular elements. */
export function solveElasticity(model: HeatModel): StructuralSimulationResult {
  const started = performance.now()
  const mesh = createModelMesh(model)
  const dofCount = mesh.nodes.length * 2
  const values = Array<number>(dofCount).fill(0)
  const freeToGlobal: number[] = []
  const globalToFree = Array<number>(dofCount).fill(-1)
  mesh.nodes.forEach((node, nodeIndex) => {
    for (let dof = 0; dof < 2; dof += 1) {
      const global = nodeIndex * 2 + dof
      const fixed = boundaryValue(model, node.x, node.y, dof)
      if (fixed === undefined) {
        globalToFree[global] = freeToGlobal.length
        freeToGlobal.push(global)
      } else {
        values[global] = fixed
      }
    }
  })
  if (freeToGlobal.length === 0) throw new Error('All structural degrees of freedom are prescribed; no solve is required.')

  const D = constitutiveMatrix(model.material.youngsModulus, model.material.poissonRatio, model.elasticity.planeState)
  const rowMaps = freeToGlobal.map(() => new Map<number, number>())
  const rhs = Array<number>(freeToGlobal.length).fill(0)
  const elementMatrices: number[][][] = []
  for (const triangle of mesh.triangles) {
    const area = triangleGeometry(mesh, triangle).area
    const B = strainDisplacement(mesh, triangle)
    const DB = multiply(D, B)
    elementMatrices.push(B)
    for (let localI = 0; localI < 6; localI += 1) {
      const globalI = triangle[Math.floor(localI / 2)]! * 2 + localI % 2
      const freeI = globalToFree[globalI]!
      if (freeI < 0) continue
      rhs[freeI]! += (localI % 2 === 0 ? model.elasticity.bodyForceX : model.elasticity.bodyForceY) * area / 3
      for (let localJ = 0; localJ < 6; localJ += 1) {
        const globalJ = triangle[Math.floor(localJ / 2)]! * 2 + localJ % 2
        const stiffness = area * B.reduce((sum, row, index) => sum + row[localI]! * DB[index]![localJ]!, 0)
        const freeJ = globalToFree[globalJ]!
        if (freeJ >= 0) rowMaps[freeI]!.set(freeJ, (rowMaps[freeI]!.get(freeJ) ?? 0) + stiffness)
        else rhs[freeI]! -= stiffness * values[globalJ]!
      }
    }
  }
  const rows: SparseRow[] = rowMaps.map((entries, rowIndex) => {
    const indices = [...entries.keys()].sort((a, b) => a - b)
    return { indices, values: indices.map((index) => entries.get(index)!), diagonal: entries.get(rowIndex) ?? 0 }
  })
  const solution = solveLinearSystem(rows, rhs, model.study.solver, model.study.tolerance, model.study.maxIterations)
  solution.values.forEach((value, freeIndex) => { values[freeToGlobal[freeIndex]!] = value })

  const displacement = mesh.nodes.map((_, index) => {
    const x = values[index * 2]!
    const y = values[index * 2 + 1]!
    return { x, y, magnitude: Math.hypot(x, y) }
  })
  const strain: TensorValue[] = []
  const stress: TensorValue[] = []
  const stresses: number[] = []
  mesh.triangles.forEach((triangle, elementIndex) => {
    const elementDisplacement = triangle.flatMap((node) => [values[node * 2]!, values[node * 2 + 1]!])
    const elementStrain = tensorProduct(elementMatrices[elementIndex]!, elementDisplacement)
    const elementStress = tensorProduct(D, [elementStrain.xx, elementStrain.yy, elementStrain.xy])
    strain.push(elementStrain)
    stress.push(elementStress)
    const zz = model.elasticity.planeState === 'planeStrain' ? model.material.poissonRatio * (elementStress.xx + elementStress.yy) : 0
    stresses.push(Math.sqrt(0.5 * ((elementStress.xx - elementStress.yy) ** 2 + (elementStress.yy - zz) ** 2 + (zz - elementStress.xx) ** 2) + 3 * elementStress.xy ** 2))
  })
  const magnitudes = displacement.map((value) => value.magnitude)
  return {
    physics: 'elasticity', solver: model.study.solver, mesh, displacement, strain, stress, vonMises: stresses,
    planeState: model.elasticity.planeState,
    converged: solution.converged, iterations: solution.iterations, relativeResidual: solution.relativeResidual,
    solveTimeMs: performance.now() - started,
    minimum: Math.min(...magnitudes), maximum: Math.max(...magnitudes),
    average: magnitudes.reduce((sum, value) => sum + value, 0) / magnitudes.length,
  }
}
