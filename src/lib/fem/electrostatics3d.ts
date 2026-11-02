import { edgeOverride } from './boundary'
import { domainExtrusion } from './geometry'
import { permittivityAt } from './properties'
import { near } from './scalar'
import { solveScalar3D, tetrahedronCentroid } from './scalar3d'
import { VACUUM_PERMITTIVITY, type ElectricSimulationResult, type HeatModel, type TetrahedralMesh } from './types'

function prescribedPotential(model: HeatModel, x: number, y: number, z: number, domainIndex: number): number | undefined {
  const { width, height } = model.geometry
  const override = edgeOverride(model, 'electrostatics', { x, y })
  if (override) return override.type === 'potential' ? override.value : undefined
  if (near(x, 0, width)) return model.electrostatics.leftVoltage
  if (near(x, width, width)) return model.electrostatics.rightVoltage
  if (near(y, 0, height) && model.electrostatics.bottom.type === 'potential') return model.electrostatics.bottom.value
  if (near(y, height, height) && model.electrostatics.top.type === 'potential') return model.electrostatics.top.value
  const { depth, z: centerZ } = domainExtrusion(model.geometry, domainIndex)
  const back = model.electrostatics.back ?? { type: 'zeroCharge' }
  const front = model.electrostatics.front ?? { type: 'zeroCharge' }
  if (near(z, centerZ - depth / 2, depth) && back.type === 'potential') return back.value
  if (near(z, centerZ + depth / 2, depth) && front.type === 'potential') return front.value
  return undefined
}

/** Stationary 3D electrostatics with linear tetrahedra and Dirichlet elimination. */
export function solveElectrostatics3D(model: HeatModel, existingMesh?: TetrahedralMesh): ElectricSimulationResult {
  if (model.geometry.dimension !== '3d' || model.activePhysics !== 'electrostatics' || model.study.type !== 'stationary') throw new Error('3D electrostatics requires a stationary study and tetrahedral geometry.')
  const solution = solveScalar3D(model, {
    coefficient: model.material.relativePermittivity * VACUUM_PERMITTIVITY,
    coefficientAt: (x, y, _z, domainIndex) => permittivityAt(model, x, y, domainIndex) * VACUUM_PERMITTIVITY,
    source: model.electrostatics.chargeDensity,
    tolerance: model.study.tolerance,
    maxIterations: model.study.maxIterations,
    solver: model.study.solver,
    preconditioner: model.study.preconditioner,
    ordering: model.study.ordering,
    requirePrescribed: true,
    prescribedValue: (x, y, z, domainIndex) => prescribedPotential(model, x, y, z, domainIndex),
  }, existingMesh)
  return {
    physics: 'electrostatics',
    solver: model.study.solver,
    mesh: solution.mesh,
    potential: solution.values,
    electricField: solution.gradient.map((gradient) => ({ x: -gradient.x, y: -gradient.y, z: -(gradient.z ?? 0), magnitude: gradient.magnitude })),
    converged: solution.converged,
    iterations: solution.iterations,
    relativeResidual: solution.relativeResidual,
    solveTimeMs: solution.solveTimeMs,
    minimum: solution.minimum,
    maximum: solution.maximum,
    average: solution.average,
  }
}

/** Electric displacement D = −ε∇V for each tetrahedron, in C/m². */
export function electricDisplacement3D(model: HeatModel, result: ElectricSimulationResult) {
  if (result.mesh.kind !== 'tetrahedral') throw new Error('Electric displacement 3D requires a tetrahedral result.')
  const mesh = result.mesh
  return result.electricField.map((field, elementIndex) => {
    const centroid = tetrahedronCentroid(mesh, mesh.tetrahedra[elementIndex]!)
    const permittivity = permittivityAt(model, centroid.x, centroid.y, mesh.tetrahedronDomains[elementIndex]!) * VACUUM_PERMITTIVITY
    return { x: permittivity * field.x, y: permittivity * field.y, z: permittivity * (field.z ?? 0), magnitude: permittivity * field.magnitude }
  })
}
