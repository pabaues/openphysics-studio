import type { RectangularMesh } from './types'

export function createRectangularMesh(
  width: number,
  height: number,
  nx: number,
  ny: number,
): RectangularMesh {
  if (!(width > 0) || !(height > 0)) {
    throw new Error('Geometry dimensions must be positive.')
  }
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1) {
    throw new Error('Mesh divisions must be positive integers.')
  }

  const nodes = Array.from({ length: (nx + 1) * (ny + 1) }, (_, index) => ({
    x: ((index % (nx + 1)) / nx) * width,
    y: (Math.floor(index / (nx + 1)) / ny) * height,
  }))
  const triangles: RectangularMesh['triangles'] = []

  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const lowerLeft = j * (nx + 1) + i
      const lowerRight = lowerLeft + 1
      const upperLeft = lowerLeft + nx + 1
      const upperRight = upperLeft + 1
      triangles.push([lowerLeft, lowerRight, upperRight])
      triangles.push([lowerLeft, upperRight, upperLeft])
    }
  }

  return { nodes, triangles, nx, ny, width, height }
}
