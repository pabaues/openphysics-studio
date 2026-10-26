export const VACUUM_PERMITTIVITY = 8.8541878128e-12

export type ActivePhysics = 'heat' | 'electrostatics' | 'elasticity'

export type BoundaryCondition =
  | { type: 'temperature'; value: number }
  | { type: 'insulated' }

export type ElectricBoundaryCondition =
  | { type: 'potential'; value: number }
  | { type: 'zeroCharge' }

export type StructuralBoundaryCondition =
  | { type: 'free' }
  | { type: 'fixed' }
  | { type: 'roller' }
  | { type: 'normalDisplacement'; value: number }

export type StudyType = 'stationary' | 'transient'

export type SweepParameter =
  | 'geometry.width'
  | 'geometry.height'
  | 'material.conductivity'
  | 'material.relativePermittivity'
  | 'material.youngsModulus'
  | 'physics.heatSource'
  | 'electrostatics.chargeDensity'

export interface HeatModel {
  schemaVersion: 4
  name: string
  activePhysics: ActivePhysics
  geometry: {
    width: number
    height: number
  }
  material: {
    conductivity: number
    relativePermittivity: number
    density: number
    heatCapacity: number
    youngsModulus: number
    poissonRatio: number
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
  elasticity: {
    planeState: 'planeStress' | 'planeStrain'
    bodyForceX: number
    bodyForceY: number
    left: StructuralBoundaryCondition
    right: StructuralBoundaryCondition
    top: StructuralBoundaryCondition
    bottom: StructuralBoundaryCondition
  }
  mesh: {
    nx: number
    ny: number
  }
  study: {
    type: StudyType
    tolerance: number
    maxIterations: number
  }
  transient: {
    initialTemperature: number
    duration: number
    timeSteps: number
    outputSteps: number
  }
  sweep: {
    parameter: SweepParameter
    values: number[]
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

export interface TensorValue {
  xx: number
  yy: number
  xy: number
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

export interface TransientFrame {
  time: number
  temperature: number[]
  minimum: number
  maximum: number
  average: number
}

export interface SimulationResult extends BaseSimulationResult {
  physics: 'heat'
  temperature: number[]
  flux: HeatFlux[]
  transient?: {
    frames: TransientFrame[]
    timeSteps: number
    conductivity: number
  }
}

export interface ElectricSimulationResult extends BaseSimulationResult {
  physics: 'electrostatics'
  potential: number[]
  electricField: VectorValue[]
}

export interface StructuralSimulationResult extends BaseSimulationResult {
  physics: 'elasticity'
  displacement: VectorValue[]
  strain: TensorValue[]
  stress: TensorValue[]
  vonMises: number[]
  planeState: 'planeStress' | 'planeStrain'
}

export type AnySimulationResult = SimulationResult | ElectricSimulationResult | StructuralSimulationResult

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
  schemaVersion: 4,
  name: 'Thermal plate study',
  activePhysics: 'heat',
  geometry: { width: 0.1, height: 0.05 },
  material: {
    conductivity: 45, relativePermittivity: 1, density: 7850, heatCapacity: 475,
    youngsModulus: 200e9, poissonRatio: 0.3,
  },
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
  elasticity: {
    planeState: 'planeStress',
    bodyForceX: 0,
    bodyForceY: 0,
    left: { type: 'fixed' },
    right: { type: 'normalDisplacement', value: 0.00001 },
    top: { type: 'free' },
    bottom: { type: 'roller' },
  },
  mesh: { nx: 28, ny: 16 },
  study: { type: 'stationary', tolerance: 1e-9, maxIterations: 2000 },
  transient: { initialTemperature: 20, duration: 10, timeSteps: 100, outputSteps: 20 },
  sweep: { parameter: 'material.conductivity', values: [15, 45, 100] },
  convergence: { levels: 3 },
}
