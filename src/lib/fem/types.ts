export const VACUUM_PERMITTIVITY = 8.8541878128e-12

export type ActivePhysics = 'heat' | 'electrostatics' | 'elasticity' | 'custom'

export interface Material {
  conductivity: number
  relativePermittivity: number
  density: number
  heatCapacity: number
  youngsModulus: number
  poissonRatio: number
  thermalExpansion: number
  gradients: {
    conductivityX: number
    conductivityY: number
    permittivityX: number
    permittivityY: number
    youngsModulusX: number
    youngsModulusY: number
  }
}

export interface GeometryDomain {
  id: string
  name: string
  vertices: MeshNode[]
  /** Extrusion depth in metres; omitted domains inherit geometry.depth. */
  depth?: number
  /** Centre of the extrusion on the global Z axis, in metres. */
  z?: number
}

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
  | { type: 'traction'; x: number; y: number; z?: number }

export type CustomBoundaryCondition =
  | { type: 'dirichlet'; value: number }
  | { type: 'neumann'; value: number }

export type StudyType = 'stationary' | 'transient'
export type SolverKind = 'iterative' | 'direct'
export type PreconditionerKind = 'jacobi' | 'ic0'
export type SolverOrdering = 'natural' | 'rcm'

export type SweepParameter =
  | 'geometry.width'
  | 'geometry.height'
  | 'material.conductivity'
  | 'material.relativePermittivity'
  | 'material.youngsModulus'
  | 'physics.heatSource'
  | 'electrostatics.chargeDensity'
  | 'electrostatics.leftVoltage'
  | 'electrostatics.rightVoltage'

export interface HeatModel {
  schemaVersion: 11
  name: string
  activePhysics: ActivePhysics
  geometry: {
    shape: 'rectangle' | 'polygon'
    dimension: '2d' | '3d'
    width: number
    height: number
    depth: number
    vertices: MeshNode[]
    domains: GeometryDomain[]
  }
  /** Material of domain 0; additional domain materials are keyed by domain id. */
  material: Material
  domainMaterials: Record<string, Material>
  physics: {
    heatSource: number
    leftTemperature: number
    rightTemperature: number
    top: BoundaryCondition
    bottom: BoundaryCondition
    /** Front (+Z) and back (−Z) faces are used by the 3D heat solver. */
    front?: BoundaryCondition
    back?: BoundaryCondition
  }
  electrostatics: {
    chargeDensity: number
    leftVoltage: number
    rightVoltage: number
    top: ElectricBoundaryCondition
    bottom: ElectricBoundaryCondition
    front?: ElectricBoundaryCondition
    back?: ElectricBoundaryCondition
  }
  elasticity: {
    planeState: 'planeStress' | 'planeStrain'
    bodyForceX: number
    bodyForceY: number
    bodyForceZ?: number
    thermalCoupling: boolean
    referenceTemperature: number
    left: StructuralBoundaryCondition
    right: StructuralBoundaryCondition
    top: StructuralBoundaryCondition
    bottom: StructuralBoundaryCondition
    front?: StructuralBoundaryCondition
    back?: StructuralBoundaryCondition
  }
  custom: {
    diffusion: number
    reaction: number
    source: number
    left: CustomBoundaryCondition
    right: CustomBoundaryCondition
    top: CustomBoundaryCondition
    bottom: CustomBoundaryCondition
  }
  edgeBoundaries: {
    heat: Record<string, BoundaryCondition>
    electrostatics: Record<string, ElectricBoundaryCondition>
    elasticity: Record<string, StructuralBoundaryCondition>
    custom: Record<string, CustomBoundaryCondition>
  }
  mesh: {
    nx: number
    ny: number
    /** Z divisions for tetrahedral extrusion; ignored by 2D meshes. */
    nz?: number
    refinement?: number
  }
  study: {
    type: StudyType
    solver: SolverKind
    preconditioner: PreconditionerKind
    ordering: SolverOrdering
    manufacturedSolution: 'none' | 'scalarSine' | 'logarithmic'
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
  adaptive: {
    levels: number
    markFraction: number
  }
}

export interface MeshNode {
  x: number
  y: number
  /** Present only on three-dimensional mesh nodes. */
  z?: number
}

export type Triangle = [number, number, number]
export type Tetrahedron = [number, number, number, number]

export interface BaseMesh {
  kind: 'mapped' | 'unstructured' | 'tetrahedral'
  nodes: MeshNode[]
  /** Surface triangles for tetrahedral meshes; volume elements otherwise. */
  triangles: Triangle[]
  width: number
  height: number
  centroid: MeshNode
  refinement: number
  /** Geometry-domain index per surface/volume triangle. */
  triangleDomains?: number[]
}

export interface RectangularMesh extends BaseMesh {
  kind: 'mapped'
  nx: number
  ny: number
}

export interface UnstructuredMesh extends BaseMesh {
  kind: 'unstructured'
}

export interface TetrahedralMesh extends BaseMesh {
  kind: 'tetrahedral'
  tetrahedra: Tetrahedron[]
  tetrahedronDomains: number[]
  /** Volume-element index associated with each external surface triangle. */
  triangleElements: number[]
  nz: number
  depth: number
}

export type Mesh = RectangularMesh | UnstructuredMesh | TetrahedralMesh

export interface VectorValue {
  x: number
  y: number
  z?: number
  magnitude: number
}

export interface TensorValue {
  xx: number
  yy: number
  xy: number
  /** Additional normal/shear components present on 3D structural elements. */
  zz?: number
  yz?: number
  xz?: number
}

export type HeatFlux = VectorValue

export interface BaseSimulationResult {
  mesh: Mesh
  solver: SolverKind
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
    conductivities?: number[]
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
  planeState: 'planeStress' | 'planeStrain' | '3d'
  thermal?: {
    temperature: number[]
    referenceTemperature: number
    expansion: number
    expansions?: number[]
  }
}

export interface CustomSimulationResult extends BaseSimulationResult {
  physics: 'custom'
  values: number[]
  gradient: VectorValue[]
}

export type AnySimulationResult = SimulationResult | ElectricSimulationResult | StructuralSimulationResult | CustomSimulationResult

export interface ConvergenceEntry {
  level: number
  grid: string
  nx: number
  ny: number
  refinement: number
  nodes: number
  elementSize: number
  iterations: number
  solveTimeMs: number
  converged: boolean
  relativeL2?: number
  maximumDifference?: number
  nearSolverFloor?: boolean
  observedOrder?: number
  exactL2?: number
  exactMaximum?: number
}

export interface ConvergenceReport {
  physics: ActivePhysics
  entries: ConvergenceEntry[]
  finest: AnySimulationResult
  converged: boolean
  totalTimeMs: number
}

export interface AdaptiveEntry {
  level: number
  nodes: number
  triangles: number
  estimatedError: number
  markedTriangles: number
  exactL2?: number
  exactMaximum?: number
}

export interface AdaptiveReport {
  physics: ActivePhysics
  entries: AdaptiveEntry[]
  finest: AnySimulationResult
  totalTimeMs: number
}

export const defaultModel: HeatModel = {
  schemaVersion: 11,
  name: 'Thermal plate study',
  activePhysics: 'heat',
  geometry: {
    shape: 'rectangle', dimension: '2d', width: 0.1, height: 0.05, depth: 0.02,
    vertices: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.05 }, { x: 0, y: 0.05 }],
    domains: [{ id: 'domain-1', name: 'Domain 1', vertices: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.05 }, { x: 0, y: 0.05 }] }],
  },
  material: {
    conductivity: 45, relativePermittivity: 1, density: 7850, heatCapacity: 475,
    youngsModulus: 200e9, poissonRatio: 0.3, thermalExpansion: 12e-6,
    gradients: { conductivityX: 0, conductivityY: 0, permittivityX: 0, permittivityY: 0, youngsModulusX: 0, youngsModulusY: 0 },
  },
  domainMaterials: {},
  physics: {
    heatSource: 250000,
    leftTemperature: 20,
    rightTemperature: 80,
    top: { type: 'temperature', value: 20 },
    bottom: { type: 'temperature', value: 20 },
    front: { type: 'insulated' },
    back: { type: 'insulated' },
  },
  electrostatics: {
    chargeDensity: 0,
    leftVoltage: 0,
    rightVoltage: 5,
    top: { type: 'zeroCharge' },
    bottom: { type: 'zeroCharge' },
    front: { type: 'zeroCharge' },
    back: { type: 'zeroCharge' },
  },
  elasticity: {
    planeState: 'planeStress',
    bodyForceX: 0,
    bodyForceY: 0,
    bodyForceZ: 0,
    thermalCoupling: false,
    referenceTemperature: 20,
    left: { type: 'fixed' },
    right: { type: 'normalDisplacement', value: 0.00001 },
    top: { type: 'free' },
    bottom: { type: 'roller' },
    front: { type: 'free' },
    back: { type: 'roller' },
  },
  custom: {
    diffusion: 1,
    reaction: 0,
    source: 1,
    left: { type: 'dirichlet', value: 0 },
    right: { type: 'dirichlet', value: 0 },
    top: { type: 'neumann', value: 0 },
    bottom: { type: 'neumann', value: 0 },
  },
  edgeBoundaries: { heat: {}, electrostatics: {}, elasticity: {}, custom: {} },
  mesh: { nx: 28, ny: 16, nz: 2, refinement: 1 },
  study: { type: 'stationary', solver: 'iterative', preconditioner: 'jacobi', ordering: 'rcm', manufacturedSolution: 'none', tolerance: 1e-9, maxIterations: 2000 },
  transient: { initialTemperature: 20, duration: 10, timeSteps: 100, outputSteps: 20 },
  sweep: { parameter: 'material.conductivity', values: [15, 45, 100] },
  convergence: { levels: 3 },
  adaptive: { levels: 3, markFraction: 0.3 },
}
