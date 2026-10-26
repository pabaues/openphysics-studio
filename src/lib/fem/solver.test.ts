import { describe, expect, it } from 'vitest'
import { solveConjugateGradient, solveDirect, solveLinearSystem, type SparseRow } from './solver'

function rows(matrix: number[][]): SparseRow[] {
  return matrix.map((row, rowIndex) => ({
    indices: row.flatMap((value, column) => value !== 0 ? [column] : []),
    values: row.filter((value) => value !== 0),
    diagonal: row[rowIndex]!,
  }))
}

describe('sparse direct LDLᵀ solver', () => {
  it('solves an SPD system and reports its actual residual', () => {
    const matrix = rows([[4, 1, 0], [1, 3, 1], [0, 1, 2]])
    const rhs = [6, 10, 8]
    const direct = solveDirect(matrix, rhs, 1e-12)
    expect(direct.values[0]).toBeCloseTo(1, 12)
    expect(direct.values[1]).toBeCloseTo(2, 12)
    expect(direct.values[2]).toBeCloseTo(3, 12)
    expect(direct.relativeResidual).toBeLessThan(1e-14)
    expect(direct.converged).toBe(true)
    expect(direct.iterations).toBe(1)
  })

  it('handles fill-in and agrees with conjugate gradients', () => {
    const matrix = rows([
      [4, 1, 0, 1],
      [1, 5, 1, 0],
      [0, 1, 6, 1],
      [1, 0, 1, 7],
    ])
    const rhs = [1, 2, 3, 4]
    const direct = solveDirect(matrix, rhs, 1e-12)
    const iterative = solveConjugateGradient(matrix, rhs, 1e-12, 100)
    direct.values.forEach((value, index) => expect(value).toBeCloseTo(iterative.values[index]!, 10))
    expect(direct.relativeResidual).toBeLessThan(1e-14)
  })

  it('dispatches the selected method and rejects non-SPD matrices', () => {
    const matrix = rows([[2, 1], [1, 2]])
    expect(solveLinearSystem(matrix, [3, 3], 'direct', 1e-12, 100).values).toEqual([1, 1])
    expect(solveLinearSystem(matrix, [3, 3], 'iterative', 1e-12, 100).values[0]).toBeCloseTo(1, 12)
    expect(() => solveDirect(rows([[1, 0], [0, -1]]), [1, 1], 1e-12)).toThrow(/positive definite/)
  })
})
