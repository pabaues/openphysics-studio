import { createRectangularMesh } from './mesh'
import { solveConjugateGradient, type SparseRow } from './solver'
import type { HeatModel, RectangularMesh, SimulationResult } from './types'

function near(a: number, b: number, scale: number): boolean {
  return Math.abs(a - b) <= Math.max(1, scale) * 1e-10
}

function prescribedTemperature(model: HeatModel, x: number, y: number): number | undefined {
  const { width, height } = model.geometry
  if (near(x, 0, width)) return model.physics.leftTemperature
  if (near(x, width, width)) return model.physics.rightTemperature
  if (near(y, 0, height) && model.physics.bottom.type === 'temperature') {
    return model.physics.bottom.value
  }
  if (near(y, height, height) && model.physics.top.type === 'temperature') {
    return model.physics.top.value
  }
  return undefined
}

function triangleGeometry(mesh: RectangularMesh, triangle: [number, number, number]) {
  const [ia, ib, ic] = triangle
  const a = mesh.nodes[ia]!
  const b = mesh.nodes[ib]!
  const c = mesh.nodes[ic]!
  const twiceArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  if (!(twiceArea > 0)) throw new Error('Invalid triangle orientation.')
  return {
    area: twiceArea / 2,
    b: [b.y - c.y, c.y - a.y, a.y - b.y],
    c: [c.x - b.x, a.x - c.x, b.x - a.x],
  }
}

export function solveHeat(model: HeatModel): SimulationResult {
  const started = performance.now()
  const mesh = createRectangularMesh(
    model.geometry.width,
    model.geometry.height,
    model.mesh.nx,
    model.mesh.ny,
  )
  const count = mesh.nodes.length
  const temperature = Array<number>(count).fill(0)
  const freeToGlobal: number[] = []
  const globalToFree = Array<number>(count).fill(-1)

  mesh.nodes.forEach((node, index) => {
    const prescribed = prescribedTemperature(model, node.x, node.y)
    if (prescribed === undefined) {
      globalToFree[index] = freeToGlobal.length
      freeToGlobal.push(index)
    } else {
      temperature[index] = prescribed
    }
  })

  const rowMaps = freeToGlobal.map(() => new Map<number, number>())
  const rhs = Array<number>(freeToGlobal.length).fill(0)
  const conductivity = model.material.conductivity
  const source = model.physics.heatSource

  for (const triangle of mesh.triangles) {
    const { area, b, c } = triangleGeometry(mesh, triangle)
    for (let localI = 0; localI < 3; localI += 1) {
      const globalI = triangle[localI]!
      const freeI = globalToFree[globalI]!
      if (freeI < 0) continue
      rhs[freeI]! += (source * area) / 3
      for (let localJ = 0; localJ < 3; localJ += 1) {
        const globalJ = triangle[localJ]!
        const value = (conductivity / (4 * area)) *
          (b[localI]! * b[localJ]! + c[localI]! * c[localJ]!)
        const freeJ = globalToFree[globalJ]!
        if (freeJ >= 0) {
          rowMaps[freeI]!.set(freeJ, (rowMaps[freeI]!.get(freeJ) ?? 0) + value)
        } else {
          rhs[freeI]! -= value * temperature[globalJ]!
        }
      }
    }
  }

  const rows: SparseRow[] = rowMaps.map((entries, rowIndex) => {
    const indices = [...entries.keys()].sort((a, b) => a - b)
    return {
      indices,
      values: indices.map((index) => entries.get(index)!),
      diagonal: entries.get(rowIndex) ?? 0,
    }
  })

  const solution = solveConjugateGradient(
    rows,
    rhs,
    model.study.tolerance,
    model.study.maxIterations,
  )
  solution.values.forEach((value, freeIndex) => {
    temperature[freeToGlobal[freeIndex]!] = value
  })

  const flux = mesh.triangles.map((triangle) => {
    const { area, b, c } = triangleGeometry(mesh, triangle)
    let dTx = 0
    let dTy = 0
    triangle.forEach((nodeIndex, localIndex) => {
      dTx += temperature[nodeIndex]! * b[localIndex]!
      dTy += temperature[nodeIndex]! * c[localIndex]!
    })
    dTx /= 2 * area
    dTy /= 2 * area
    const x = -conductivity * dTx
    const y = -conductivity * dTy
    return { x, y, magnitude: Math.hypot(x, y) }
  })

  const minimum = Math.min(...temperature)
  const maximum = Math.max(...temperature)
  const average = temperature.reduce((sum, value) => sum + value, 0) / count
  return {
    mesh,
    temperature,
    flux,
    converged: solution.converged,
    iterations: solution.iterations,
    relativeResidual: solution.relativeResidual,
    solveTimeMs: performance.now() - started,
    minimum,
    maximum,
    average,
  }
}
