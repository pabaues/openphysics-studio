import type { SparseRow } from './solver'

export interface Preconditioner { apply: (residual: number[]) => number[] }

export function jacobiPreconditioner(rows: SparseRow[]): Preconditioner {
  const inverse = rows.map((row) => {
    if (!(row.diagonal > 0) || !Number.isFinite(row.diagonal)) throw new Error('The system is not positive definite.')
    return 1 / row.diagonal
  })
  return { apply: (residual) => residual.map((value, index) => value * inverse[index]!) }
}

/** Incomplete Cholesky with zero fill (IC(0)) on the original lower-triangular pattern. */
export function ic0Preconditioner(rows: SparseRow[]): Preconditioner {
  const lower = rows.map((row, rowIndex) => {
    const entries = new Map<number, number>()
    row.indices.forEach((column, index) => { if (column <= rowIndex) entries.set(column, row.values[index]!) })
    entries.set(rowIndex, row.diagonal)
    return entries
  })
  for (let i = 0; i < lower.length; i += 1) {
    const row = lower[i]!
    const keys = [...row.keys()].filter((column) => column <= i).sort((a, b) => a - b)
    for (const j of keys) {
      let value = row.get(j)!
      const other = lower[j]!
      for (const [k, left] of row) {
        if (k >= j) continue
        const right = other.get(k)
        if (right !== undefined) value -= left * right
      }
      if (i === j) {
        if (!(value > 0) || !Number.isFinite(value)) throw new Error('IC(0) failed: the matrix is not positive definite or the zero-fill factorization is unstable.')
        row.set(i, Math.sqrt(value))
      } else {
        row.set(j, value / other.get(j)!)
      }
    }
  }
  return {
    apply: (residual) => {
      const forward = Array<number>(residual.length).fill(0)
      for (let i = 0; i < lower.length; i += 1) {
        let value = residual[i]!
        for (const [j, factor] of lower[i]!) if (j < i) value -= factor * forward[j]!
        forward[i] = value / lower[i]!.get(i)!
      }
      const result = [...forward]
      for (let i = lower.length - 1; i >= 0; i -= 1) {
        let value = forward[i]! / lower[i]!.get(i)!
        for (let j = i + 1; j < lower.length; j += 1) {
          const factor = lower[j]!.get(i)
          if (factor !== undefined) value -= factor * result[j]! / lower[i]!.get(i)!
        }
        result[i] = value
      }
      return result
    },
  }
}
