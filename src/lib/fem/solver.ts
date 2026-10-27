import { reverseCuthillMcKee } from './ordering'
import { ic0Preconditioner, jacobiPreconditioner } from './preconditioner'
import { dotProduct } from './wasm'
import type { PreconditionerKind, SolverOrdering } from './types'

export interface SolverOptions {
  preconditioner?: PreconditionerKind
  ordering?: SolverOrdering
}

export interface SparseRow {
  indices: number[]
  values: number[]
  diagonal: number
}

export interface IterativeSolution {
  values: number[]
  converged: boolean
  iterations: number
  relativeResidual: number
}

function multiply(rows: SparseRow[], x: number[]): number[] {
  return rows.map((row) => {
    let value = 0
    for (let k = 0; k < row.indices.length; k += 1) {
      value += row.values[k]! * x[row.indices[k]!]!
    }
    return value
  })
}

/** Preconditioned conjugate gradients for a symmetric positive-definite system. */
export function solveConjugateGradient(
  rows: SparseRow[],
  rhs: number[],
  tolerance: number,
  maxIterations: number,
  initial?: number[],
  preconditionerKind: PreconditionerKind = 'jacobi',
): IterativeSolution {
  const size = rhs.length
  if (size === 0) return { values: [], converged: true, iterations: 0, relativeResidual: 0 }
  if (initial && initial.length !== size) throw new Error('Initial guess size does not match the linear system.')
  const preconditioner = preconditionerKind === 'ic0' ? ic0Preconditioner(rows) : jacobiPreconditioner(rows)
  const x = initial ? [...initial] : Array<number>(size).fill(0)
  const ax = multiply(rows, x)
  const r = rhs.map((value, i) => value - ax[i]!)
  const rhsNorm = Math.sqrt(dotProduct(rhs, rhs))
  let residualNorm = Math.sqrt(dotProduct(r, r))
  let relativeResidual = rhsNorm > 0 ? residualNorm / rhsNorm : residualNorm
  if (relativeResidual <= tolerance) return { values: x, converged: true, iterations: 0, relativeResidual }

  let z = preconditioner.apply(r)
  const p = [...z]
  let rz = dotProduct(r, z)
  let converged = false
  let iteration = 0
  for (; iteration < maxIterations; iteration += 1) {
    const ap = multiply(rows, p)
    const denominator = dotProduct(p, ap)
    if (!(denominator > 0) || !Number.isFinite(denominator)) throw new Error('The linear system lost positive definiteness.')
    const alpha = rz / denominator
    for (let i = 0; i < size; i += 1) {
      x[i]! += alpha * p[i]!
      r[i]! -= alpha * ap[i]!
    }
    residualNorm = Math.sqrt(dotProduct(r, r))
    relativeResidual = rhsNorm > 0 ? residualNorm / rhsNorm : residualNorm
    if (relativeResidual <= tolerance) { converged = true; iteration += 1; break }
    z = preconditioner.apply(r)
    const nextRz = dotProduct(r, z)
    const beta = nextRz / rz
    for (let i = 0; i < size; i += 1) p[i] = z[i]! + beta * p[i]!
    rz = nextRz
  }
  return { values: x, converged, iterations: iteration, relativeResidual }
}

/**
 * Sparse LDLᵀ factorization without pivoting for symmetric positive-definite systems.
 * Elimination-tree fill is stored in row/column maps; no dense N×N matrix is allocated.
 */
export function solveDirect(rows: SparseRow[], rhs: number[], tolerance: number): IterativeSolution {
  const size = rhs.length
  if (size === 0) return { values: [], converged: true, iterations: 0, relativeResidual: 0 }
  if (rows.length !== size) throw new Error('The sparse matrix size does not match the right-hand side.')

  const lower = rows.map((source, rowIndex) => {
    const entries = new Map<number, number>()
    source.indices.forEach((column, index) => {
      if (column <= rowIndex) entries.set(column, source.values[index]!)
    })
    entries.set(rowIndex, source.diagonal)
    return entries
  })
  const columns = Array.from({ length: size }, () => new Map<number, number>())
  const diagonal = Array<number>(size).fill(0)

  for (let i = 0; i < size; i += 1) {
    const row = lower[i]!
    const keys = [...row.keys()].filter((column) => column < i).sort((a, b) => a - b)
    const included = new Set(keys)
    for (let position = 0; position < keys.length; position += 1) {
      const k = keys[position]!
      const pivot = diagonal[k]!
      if (!(pivot > 0) || !Number.isFinite(pivot)) throw new Error('The system is not positive definite; LDLᵀ factorization failed.')
      const factor = row.get(k)! / pivot
      row.set(k, factor)
      if (factor !== 0) {
        for (const [j, columnFactor] of columns[k]!) {
          if (j <= k || j > i) continue
          row.set(j, (row.get(j) ?? 0) - factor * pivot * columnFactor)
          if (j < i && !included.has(j)) {
            let insertion = position + 1
            while (insertion < keys.length && keys[insertion]! < j) insertion += 1
            keys.splice(insertion, 0, j)
            included.add(j)
          }
        }
        row.set(i, (row.get(i) ?? 0) - factor * pivot * factor)
        columns[k]!.set(i, factor)
      }
    }
    const pivot = row.get(i) ?? 0
    if (!(pivot > 0) || !Number.isFinite(pivot)) throw new Error('The system is not positive definite; LDLᵀ factorization failed.')
    diagonal[i] = pivot
  }

  const forward = Array<number>(size).fill(0)
  for (let i = 0; i < size; i += 1) {
    let value = rhs[i]!
    for (const [j, factor] of lower[i]!) if (j < i) value -= factor * forward[j]!
    forward[i] = value
  }
  const scaled = forward.map((value, index) => value / diagonal[index]!)
  const values = [...scaled]
  for (let i = size - 1; i >= 0; i -= 1) {
    let value = scaled[i]!
    for (const [j, factor] of columns[i]!) value -= factor * values[j]!
    values[i] = value
  }

  const ax = multiply(rows, values)
  const residual = rhs.map((value, index) => value - ax[index]!)
  const rhsNorm = Math.sqrt(dotProduct(rhs, rhs))
  const residualNorm = Math.sqrt(dotProduct(residual, residual))
  const relativeResidual = rhsNorm > 0 ? residualNorm / rhsNorm : residualNorm
  return {
    values, converged: Number.isFinite(relativeResidual) && relativeResidual <= Math.max(1e-12, tolerance * 10),
    iterations: 1, relativeResidual,
  }
}

export function solveLinearSystem(
  rows: SparseRow[],
  rhs: number[],
  solver: 'direct' | 'iterative',
  tolerance: number,
  maxIterations: number,
  initial?: number[],
  options: SolverOptions = {},
): IterativeSolution {
  if (options.ordering === 'rcm' && rhs.length > 2) {
    const order = reverseCuthillMcKee(rows)
    const position = Array<number>(rows.length)
    order.forEach((oldIndex, newIndex) => { position[oldIndex] = newIndex })
    const reordered = order.map((oldIndex) => {
      const row = rows[oldIndex]!
      const entries = row.indices.map((column, index) => ({ column: position[column]!, value: row.values[index]! })).sort((a, b) => a.column - b.column)
      return { indices: entries.map((entry) => entry.column), values: entries.map((entry) => entry.value), diagonal: row.diagonal }
    })
    const reorderedInitial = initial ? order.map((oldIndex) => initial[oldIndex]!) : undefined
    const solution = solveLinearSystem(reordered, order.map((oldIndex) => rhs[oldIndex]!), solver, tolerance, maxIterations, reorderedInitial, { ...options, ordering: 'natural' })
    const values = Array<number>(rows.length)
    order.forEach((oldIndex, newIndex) => { values[oldIndex] = solution.values[newIndex]! })
    return { ...solution, values }
  }
  return solver === 'direct'
    ? solveDirect(rows, rhs, tolerance)
    : solveConjugateGradient(rows, rhs, tolerance, maxIterations, initial, options.preconditioner)
}
