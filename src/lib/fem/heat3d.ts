import { edgeOverride } from './boundary'
import { domainExtrusion } from './geometry'
import { conductivityAt, materialForDomain } from './properties'
import { near } from './scalar'
import { solveScalar3D, tetrahedronCentroid, type ScalarProblem3D, type ScalarSolution3D } from './scalar3d'
import { createTetrahedralMesh } from './mesh3d'
import type { HeatModel, SimulationResult, TetrahedralMesh, TransientFrame } from './types'

function prescribedTemperature(model: HeatModel, x: number, y: number, z: number, domainIndex: number): number | undefined {
  const { width, height } = model.geometry
  const override = edgeOverride(model, 'heat', { x, y })
  if (override) return override.type === 'temperature' ? override.value : undefined
  if (near(x, 0, width)) return model.physics.leftTemperature
  if (near(x, width, width)) return model.physics.rightTemperature
  if (near(y, 0, height) && model.physics.bottom.type === 'temperature') return model.physics.bottom.value
  if (near(y, height, height) && model.physics.top.type === 'temperature') return model.physics.top.value
  const { depth, z: centerZ } = domainExtrusion(model.geometry, domainIndex)
  const back = model.physics.back ?? { type: 'insulated' }
  const front = model.physics.front ?? { type: 'insulated' }
  if (near(z, centerZ - depth / 2, depth) && back.type === 'temperature') return back.value
  if (near(z, centerZ + depth / 2, depth) && front.type === 'temperature') return front.value
  return undefined
}

function heatProblem3D(model: HeatModel): ScalarProblem3D {
  return {
    coefficient: model.material.conductivity,
    coefficientAt: (x, y, _z, domainIndex) => conductivityAt(model, x, y, domainIndex),
    source: model.physics.heatSource,
    tolerance: model.study.tolerance,
    maxIterations: model.study.maxIterations,
    solver: model.study.solver,
    preconditioner: model.study.preconditioner,
    ordering: model.study.ordering,
    requirePrescribed: model.study.type === 'stationary',
    prescribedValue: (x, y, z, domainIndex) => prescribedTemperature(model, x, y, z, domainIndex),
  }
}

function thermalResult3D(model: HeatModel, solution: ScalarSolution3D): SimulationResult {
  const flux = solution.gradient.map((gradient, elementIndex) => {
    const centroid = tetrahedronCentroid(solution.mesh, solution.mesh.tetrahedra[elementIndex]!)
    const conductivity = conductivityAt(model, centroid.x, centroid.y, solution.mesh.tetrahedronDomains[elementIndex]!)
    return { x: -conductivity * gradient.x, y: -conductivity * gradient.y, z: -conductivity * (gradient.z ?? 0), magnitude: conductivity * gradient.magnitude }
  })
  return {
    physics: 'heat', mesh: solution.mesh, temperature: solution.values, flux, solver: model.study.solver,
    converged: solution.converged, iterations: solution.iterations, relativeResidual: solution.relativeResidual,
    solveTimeMs: solution.solveTimeMs, minimum: solution.minimum, maximum: solution.maximum, average: solution.average,
  }
}

function frame(time: number, temperature: number[]): TransientFrame {
  return {
    time,
    temperature: [...temperature],
    minimum: Math.min(...temperature),
    maximum: Math.max(...temperature),
    average: temperature.reduce((sum, value) => sum + value, 0) / temperature.length,
  }
}

function solveTransientHeat3D(model: HeatModel, mesh: TetrahedralMesh): SimulationResult {
  const settings = model.transient
  const dt = settings.duration / settings.timeSteps
  const reactionCoefficient = (domainIndex: number) => {
    const material = materialForDomain(model, domainIndex)
    return material.density * material.heatCapacity / dt
  }
  let temperature = Array<number>(mesh.nodes.length).fill(settings.initialTemperature)
  const frames = [frame(0, temperature)]
  let final: SimulationResult | undefined
  let iterations = 0
  let converged = true
  let relativeResidual = 0
  let solveTimeMs = 0
  let outputIndex = 1
  for (let step = 1; step <= settings.timeSteps; step += 1) {
    final = thermalResult3D(model, solveScalar3D(model, {
      ...heatProblem3D(model), reactionCoefficient, reactionSource: temperature, initialValues: temperature,
    }, mesh))
    temperature = final.temperature
    iterations += final.iterations
    solveTimeMs += final.solveTimeMs
    relativeResidual = Math.max(relativeResidual, final.relativeResidual)
    converged = converged && final.converged
    if (step === Math.round(outputIndex * settings.timeSteps / settings.outputSteps)) {
      frames.push(frame(step * dt, temperature))
      outputIndex += 1
    }
  }
  if (!final) throw new Error('The transient 3D study did not execute a time step.')
  const conductivities = mesh.tetrahedra.map((tetrahedron, elementIndex) => {
    const centroid = tetrahedronCentroid(mesh, tetrahedron)
    return conductivityAt(model, centroid.x, centroid.y, mesh.tetrahedronDomains[elementIndex]!)
  })
  return { ...final, converged, iterations, relativeResidual, solveTimeMs, transient: { frames, timeSteps: settings.timeSteps, conductivity: model.material.conductivity, conductivities } }
}

/** Stationary/transient 3D heat conduction with linear tetrahedra and consistent mass. */
export function solveHeat3D(model: HeatModel, existingMesh?: TetrahedralMesh): SimulationResult {
  if (model.geometry.dimension !== '3d' || model.activePhysics !== 'heat') throw new Error('3D heat conduction requires Heat Transfer and tetrahedral geometry.')
  const mesh = existingMesh ?? createTetrahedralMesh(model)
  if (model.study.type === 'transient') return solveTransientHeat3D(model, mesh)
  return thermalResult3D(model, solveScalar3D(model, heatProblem3D(model), mesh))
}
