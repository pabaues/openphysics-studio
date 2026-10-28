import { heatModelSchema, parseProjectJson } from './fem/project'
import { solveActiveModel } from './fem/study'
import type { AnySimulationResult, HeatModel } from './fem/types'

/** Validate and solve a model object or an .opmodel.json document. */
export function solveModel(input: HeatModel | string): AnySimulationResult {
  const model = typeof input === 'string' ? parseProjectJson(input) : heatModelSchema.parse(input)
  return solveActiveModel(model)
}

export { runAdaptiveStudy, gradientRecoveryError, refineMarkedMesh } from './fem/adaptive'
export { runConvergenceStudy } from './fem/convergence'
export { solveCustom } from './fem/custom'
export { deriveValues } from './fem/derived'
export { solveElasticity, constitutiveMatrix } from './fem/elasticity'
export { solveElectrostatics } from './fem/electrostatics'
export { toCsv, toDerivedCsv, toHtmlReport, toVtk } from './fem/exporters'
export { multiDomainGeometry, polygonGeometry, rectangleGeometry, scaleGeometryToBoundingBox, scaleGeometryToDomainArea, signedPolygonArea, parseGeometryFile, validateDomainLayout } from './fem/geometry'
export { solveHeat, heatResultAtTime } from './fem/heat'
export { createExampleModel, examplePresetGroups } from './fem/presets'
export type { ExamplePresetId } from './fem/presets'
export { createModelMesh, createMultidomainMesh, createPolygonMesh, createRectangularMesh, interpolateMesh, refineMesh } from './fem/mesh'
export { materialForDomain, conductivityAt, permittivityAt, youngsModulusAt } from './fem/properties'
export { heatModelSchema, modelSignature, parseProjectJson } from './fem/project'
export { runParametricSweep } from './fem/sweep'
export { solveActiveModel, resultValues } from './fem/study'
export { defaultModel, VACUUM_PERMITTIVITY } from './fem/types'
export type * from './fem/types'
