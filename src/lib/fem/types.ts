export const VACUUM_PERMITTIVITY = 8.8541878128e-12

export type ActivePhysics = 'heat' | 'electrostatics'

export type BoundaryCondition =
  | { type: 'temperature'; value: number }
  | { type: 'insulated' }

export type ElectricBoundaryCondition =
  | { type: 'potential'; value: number }
  | { type: 'zeroCharge' }

export interface HeatModel {
  schemaVersion: 2
  name: string
  activePhysics: ActivePhysics
  geometry: {
    width: number
    height: number
  }
  material: {
    conductivity: number
    relativePermittivity: number
  }
  physics: {
    heatSource: number
    leftTemperature: number
    rightTemperature: number
    top: BoundaryCondition
    bottom: BoundaryCondition
  }
  electrostatics: {
    chargeDensity: number
    leftVoltage: number
    rightVoltage: number
    top: ElectricBoundaryCondition
    bottom: ElectricBoundaryCondition
  }
  mesh: {
    nx: number
    ny: number
  }
  study: {
    tolerance: number
    maxIterations: number
  }
  convergence: {
    levels: number
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

export interface VectorValue {
  x: number
  y: number
  magnitude: number
}

export type HeatFlux = VectorValue

export interface BaseSimulationResult {
  mesh: RectangularMesh
  converged: boolean
  iterations: number
  relativeResidual: number
  solveTimeMs: number
  minimum: number
  maximum: number
  average: number
}

export interface SimulationResult extends BaseSimulationResult {
  physics: 'heat'
  temperature: number[]
  flux: HeatFlux[]
}

export interface ElectricSimulationResult extends BaseSimulationResult {
  physics: 'electrostatics'
  potential: number[]
  electricField: VectorValue[]
}

export type AnySimulationResult = SimulationResult | ElectricSimulationResult

export interface ConvergenceEntry {
  level: number
  nx: number
  ny: number
  nodes: number
  elementSize: number
  iterations: number
  solveTimeMs: number
  converged: boolean
  relativeL2?: number
  maximumDifference?: number
  nearSolverFloor?: boolean
  observedOrder?: number
}

export interface ConvergenceReport {
  physics: ActivePhysics
  entries: ConvergenceEntry[]
  finest: AnySimulationResult
  converged: boolean
  totalTimeMs: number
}

export const defaultModel: HeatModel = {
  schemaVersion: 2,
  name: 'Thermal plate study',
  activePhysics: 'heat',
  geometry: { width: 0.1, height: 0.05 },
  material: { conductivity: 45, relativePermittivity: 1 },
  physics: {
    heatSource: 250000,
    leftTemperature: 20,
    rightTemperature: 80,
    top: { type: 'temperature', value: 20 },
    bottom: { type: 'temperature', value: 20 },
  },
  electrostatics: {
    chargeDensity: 0,
    leftVoltage: 0,
    rightVoltage: 5,
    top: { type: 'zeroCharge' },
    bottom: { type: 'zeroCharge' },
  },
  mesh: { nx: 28, ny: 16 },
  study: { tolerance: 1e-9, maxIterations: 2000 },
  convergence: { levels: 3 },
}
