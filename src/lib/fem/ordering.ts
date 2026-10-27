import type { SparseRow } from './solver'

/** Reverse Cuthill–McKee ordering of the symmetric sparse adjacency graph. */
export function reverseCuthillMcKee(rows: SparseRow[]): number[] {
  const size = rows.length
  const neighbors = rows.map((row, index) => [...new Set(row.indices.filter((column) => column !== index))])
  const degree = neighbors.map((entries) => entries.length)
  const visited = Array<boolean>(size).fill(false)
  const order: number[] = []
  while (order.length < size) {
    let start = -1
    for (let index = 0; index < size; index += 1) {
      if (!visited[index] && (start < 0 || degree[index]! < degree[start]!)) start = index
    }
    const queue = [start]
    visited[start] = true
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]!
      order.push(current)
      const adjacent = neighbors[current]!.filter((node) => !visited[node]).sort((a, b) => degree[a]! - degree[b]! || a - b)
      for (const node of adjacent) { visited[node] = true; queue.push(node) }
    }
  }
  return order.reverse()
}
