export type BoundaryCondition =
  | { type: 'temperature'; value: number }
  | { type: 'insulated' }

export interface HeatModel {
  schemaVersion: 1
  name: string
  geometry: {
    width: number
    height: number
  }
  material: {
    conductivity: number
  }
  physics: {
    heatSource: number
    leftTemperature: number
    rightTemperature: number
    top: BoundaryCondition
    bottom: BoundaryCondition
  }
  mesh: {
    nx: number
    ny: number
  }
  study: {
    tolerance: number
    maxIterations: number
  }
}

export interface MeshNode {
  x: number
  y: number
}

export type Triangle = [number, number, number]

export interface RectangularMesh {
  nodes: MeshNode[]
  triangles: Triangle[]
  nx: number
  ny: number
  width: number
  height: number
}

export interface HeatFlux {
  x: number
  y: number
  magnitude: number
}

export interface SimulationResult {
  mesh: RectangularMesh
  temperature: number[]
  flux: HeatFlux[]
  converged: boolean
  iterations: number
  relativeResidual: number
  solveTimeMs: number
  minimum: number
  maximum: number
  average: number
}

export const defaultModel: HeatModel = {
  schemaVersion: 1,
  name: 'Thermal plate study',
  geometry: { width: 0.1, height: 0.05 },
  material: { conductivity: 45 },
  physics: {
    heatSource: 250000,
    leftTemperature: 20,
    rightTemperature: 80,
    top: { type: 'temperature', value: 20 },
    bottom: { type: 'temperature', value: 20 },
  },
  mesh: { nx: 28, ny: 16 },
  study: { tolerance: 1e-9, maxIterations: 2000 },
}
