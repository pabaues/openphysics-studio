import { createModelMesh } from './mesh'
import { near, scalarGradient, solveScalar, type ScalarProblem } from './scalar'
import type { HeatModel, SimulationResult, TransientFrame } from './types'

function heatProblem(model: HeatModel): ScalarProblem {
  const { width, height } = model.geometry
  return {
    width,
    height,
    nx: model.mesh.nx,
    ny: model.mesh.ny,
    coefficient: model.material.conductivity,
    source: model.physics.heatSource,
    tolerance: model.study.tolerance,
    maxIterations: model.study.maxIterations,
    solver: model.study.solver,
    prescribedValue: (x, y) => {
      if (near(x, 0, width)) return model.physics.leftTemperature
      if (near(x, width, width)) return model.physics.rightTemperature
      if (near(y, 0, height) && model.physics.bottom.type === 'temperature') return model.physics.bottom.value
      if (near(y, height, height) && model.physics.top.type === 'temperature') return model.physics.top.value
      return undefined
    },
  }
}

function thermalResult(model: HeatModel, solution: ReturnType<typeof solveScalar>): SimulationResult {
  return {
    physics: 'heat',
    solver: model.study.solver,
    mesh: solution.mesh,
    temperature: solution.values,
    flux: solution.gradient.map((gradient) => ({
      x: -model.material.conductivity * gradient.x,
      y: -model.material.conductivity * gradient.y,
      magnitude: model.material.conductivity * gradient.magnitude,
    })),
    converged: solution.converged,
    iterations: solution.iterations,
    relativeResidual: solution.relativeResidual,
    solveTimeMs: solution.solveTimeMs,
    minimum: solution.minimum,
    maximum: solution.maximum,
    average: solution.average,
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

function solveTransientHeat(model: HeatModel): SimulationResult {
  const mesh = createModelMesh(model)
  const settings = model.transient
  const dt = settings.duration / settings.timeSteps
  const reactionCoefficient = model.material.density * model.material.heatCapacity / dt
  let temperature = Array<number>(mesh.nodes.length).fill(settings.initialTemperature)
  const frames = [frame(0, temperature)]
  let final: SimulationResult | undefined
  let iterations = 0
  let converged = true
  let relativeResidual = 0
  let solveTimeMs = 0
  let outputIndex = 1
  for (let step = 1; step <= settings.timeSteps; step += 1) {
    final = thermalResult(model, solveScalar({
      ...heatProblem(model), reactionCoefficient, reactionSource: temperature, initialValues: temperature,
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
  if (!final) throw new Error('The transient study did not execute a time step.')
  return { ...final, converged, iterations, relativeResidual, solveTimeMs, transient: { frames, timeSteps: settings.timeSteps, conductivity: model.material.conductivity } }
}

export function solveHeat(model: HeatModel): SimulationResult {
  return model.study.type === 'transient' ? solveTransientHeat(model) : thermalResult(model, solveScalar(heatProblem(model), createModelMesh(model)))
}

/** Returns an independent frame without discarding the transient dataset. */
export function heatResultAtTime(result: SimulationResult, frameIndex: number): SimulationResult {
  if (!result.transient) return result
  const selected = result.transient.frames[Math.max(0, Math.min(frameIndex, result.transient.frames.length - 1))]!
  const conductivity = result.transient.conductivity
  return {
    ...result,
    temperature: [...selected.temperature],
    flux: scalarGradient(result.mesh, selected.temperature).map((gradient) => ({
      x: -conductivity * gradient.x,
      y: -conductivity * gradient.y,
      magnitude: conductivity * gradient.magnitude,
    })),
    minimum: selected.minimum,
    maximum: selected.maximum,
    average: selected.average,
  }
}
