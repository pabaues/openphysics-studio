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

function dot(a: number[], b: number[]): number {
  let result = 0
  for (let i = 0; i < a.length; i += 1) result += a[i]! * b[i]!
  return result
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
): IterativeSolution {
  const size = rhs.length
  if (size === 0) {
    return { values: [], converged: true, iterations: 0, relativeResidual: 0 }
  }

  const x = Array<number>(size).fill(0)
  const ax = multiply(rows, x)
  const r = rhs.map((value, i) => value - ax[i]!)
  const rhsNorm = Math.sqrt(dot(rhs, rhs))
  let residualNorm = Math.sqrt(dot(r, r))
  let relativeResidual = rhsNorm > 0 ? residualNorm / rhsNorm : residualNorm
  if (relativeResidual <= tolerance) {
    return { values: x, converged: true, iterations: 0, relativeResidual }
  }

  const z = r.map((value, i) => {
    const diagonal = rows[i]!.diagonal
    if (!(diagonal > 0)) throw new Error('The system is not positive definite.')
    return value / diagonal
  })
  const p = [...z]
  let rz = dot(r, z)
  let converged = false
  let iteration = 0

  for (; iteration < maxIterations; iteration += 1) {
    const ap = multiply(rows, p)
    const denominator = dot(p, ap)
    if (!(denominator > 0) || !Number.isFinite(denominator)) {
      throw new Error('The linear system lost positive definiteness.')
    }
    const alpha = rz / denominator
    for (let i = 0; i < size; i += 1) {
      x[i]! += alpha * p[i]!
      r[i]! -= alpha * ap[i]!
    }
    residualNorm = Math.sqrt(dot(r, r))
    relativeResidual = rhsNorm > 0 ? residualNorm / rhsNorm : residualNorm
    if (relativeResidual <= tolerance) {
      converged = true
      iteration += 1
      break
    }
    for (let i = 0; i < size; i += 1) {
      z[i] = r[i]! / rows[i]!.diagonal
    }
    const nextRz = dot(r, z)
    const beta = nextRz / rz
    for (let i = 0; i < size; i += 1) p[i] = z[i]! + beta * p[i]!
    rz = nextRz
  }

  return { values: x, converged, iterations: iteration, relativeResidual }
}
