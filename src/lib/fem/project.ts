import { z } from 'zod'
import { polygonGeometry, rectangleGeometry } from './geometry'
import { defaultModel, type HeatModel } from './types'

const thermalBoundarySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('temperature'), value: z.number().min(-273.15).max(10000) }),
  z.object({ type: z.literal('insulated') }),
])
const electricBoundarySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('potential'), value: z.number().min(-1e9).max(1e9) }),
  z.object({ type: z.literal('zeroCharge') }),
])
const structuralBoundarySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('free') }), z.object({ type: z.literal('fixed') }), z.object({ type: z.literal('roller') }),
  z.object({ type: z.literal('normalDisplacement'), value: z.number().min(-1000).max(1000) }),
  z.object({ type: z.literal('traction'), x: z.number().finite().min(-1e15).max(1e15), y: z.number().finite().min(-1e15).max(1e15) }),
])
const customBoundarySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dirichlet'), value: z.number().finite().min(-1e12).max(1e12) }),
  z.object({ type: z.literal('neumann'), value: z.number().finite().min(-1e12).max(1e12) }),
])
const geometrySchema = z.object({ width: z.number().positive().max(1000), height: z.number().positive().max(1000) })
const vertexSchema = z.object({ x: z.number().finite().min(0).max(1000), y: z.number().finite().min(0).max(1000) })
const geometryV5Schema = z.discriminatedUnion('shape', [
  geometrySchema.extend({ shape: z.literal('rectangle'), vertices: z.array(vertexSchema).length(4) }),
  geometrySchema.extend({ shape: z.literal('polygon'), vertices: z.array(vertexSchema).min(3).max(256) }),
])
const thermalPhysicsSchema = z.object({
  heatSource: z.number().min(-1e12).max(1e12),
  leftTemperature: z.number().min(-273.15).max(10000),
  rightTemperature: z.number().min(-273.15).max(10000),
  top: thermalBoundarySchema,
  bottom: thermalBoundarySchema,
})
const electrostaticsSchema = z.object({
  chargeDensity: z.number().min(-1e6).max(1e6),
  leftVoltage: z.number().min(-1e9).max(1e9),
  rightVoltage: z.number().min(-1e9).max(1e9),
  top: electricBoundarySchema,
  bottom: electricBoundarySchema,
})
const meshSchema = z.object({ nx: z.number().int().min(2).max(80), ny: z.number().int().min(2).max(80) })
const meshV5Schema = meshSchema.extend({ refinement: z.number().int().min(0).max(5) })
const linearSolverSchema = z.object({
  tolerance: z.number().min(1e-12).max(1e-3),
  maxIterations: z.number().int().min(10).max(20000),
})
const studySchema = linearSolverSchema.extend({ type: z.enum(['stationary', 'transient']) })
const transientSchema = z.object({
  initialTemperature: z.number().min(-273.15).max(10000), duration: z.number().positive().max(1e12),
  timeSteps: z.number().int().min(1).max(10000), outputSteps: z.number().int().min(1).max(100),
}).refine((value) => value.outputSteps <= value.timeSteps, { message: 'Output steps cannot exceed time steps.' })
const convergenceSchema = z.object({ levels: z.number().int().min(2).max(4) })

const legacyModelSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().trim().min(1).max(120), geometry: geometrySchema,
  material: z.object({ conductivity: z.number().positive().max(1e9) }),
  physics: thermalPhysicsSchema, mesh: meshSchema, study: linearSolverSchema,
})
const v2ModelSchema = z.object({
  schemaVersion: z.literal(2), name: z.string().trim().min(1).max(120), activePhysics: z.enum(['heat', 'electrostatics']),
  geometry: geometrySchema,
  material: z.object({ conductivity: z.number().positive().max(1e9), relativePermittivity: z.number().positive().max(1e9) }),
  physics: thermalPhysicsSchema, electrostatics: electrostaticsSchema, mesh: meshSchema, study: linearSolverSchema,
  convergence: convergenceSchema,
})
const v3ModelSchema = z.object({
  schemaVersion: z.literal(3), name: z.string().trim().min(1).max(120), activePhysics: z.enum(['heat', 'electrostatics']),
  geometry: geometrySchema,
  material: z.object({
    conductivity: z.number().positive().max(1e9), relativePermittivity: z.number().positive().max(1e9),
    density: z.number().positive().max(1e9), heatCapacity: z.number().positive().max(1e9),
  }),
  physics: thermalPhysicsSchema, electrostatics: electrostaticsSchema, mesh: meshSchema, study: studySchema,
  transient: transientSchema,
  sweep: z.object({
    parameter: z.enum(['geometry.width', 'geometry.height', 'material.conductivity', 'material.relativePermittivity', 'physics.heatSource', 'electrostatics.chargeDensity']),
    values: z.array(z.number().finite()).min(2).max(12),
  }),
  convergence: convergenceSchema,
})
type V3Model = z.infer<typeof v3ModelSchema>

const v4ModelObject = z.object({
  schemaVersion: z.literal(4),
  name: z.string().trim().min(1).max(120),
  activePhysics: z.enum(['heat', 'electrostatics', 'elasticity']),
  geometry: geometrySchema,
  material: z.object({
    conductivity: z.number().positive().max(1e9), relativePermittivity: z.number().positive().max(1e9),
    density: z.number().positive().max(1e9), heatCapacity: z.number().positive().max(1e9),
    youngsModulus: z.number().positive().max(1e15), poissonRatio: z.number().min(-0.99).max(0.499999),
  }),
  physics: thermalPhysicsSchema,
  electrostatics: electrostaticsSchema,
  elasticity: z.object({
    planeState: z.enum(['planeStress', 'planeStrain']),
    bodyForceX: z.number().min(-1e15).max(1e15), bodyForceY: z.number().min(-1e15).max(1e15),
    left: structuralBoundarySchema, right: structuralBoundarySchema,
    top: structuralBoundarySchema, bottom: structuralBoundarySchema,
  }),
  mesh: meshSchema,
  study: z.object({ type: z.enum(['stationary', 'transient']), tolerance: linearSolverSchema.shape.tolerance, maxIterations: linearSolverSchema.shape.maxIterations }),
  transient: transientSchema,
  sweep: z.object({
    parameter: z.enum(['geometry.width', 'geometry.height', 'material.conductivity', 'material.relativePermittivity', 'material.youngsModulus', 'physics.heatSource', 'electrostatics.chargeDensity']),
    values: z.array(z.number().finite()).min(2).max(12),
  }),
  convergence: convergenceSchema,
})
const v4ModelSchema = v4ModelObject.superRefine((model, context) => {
  if (model.study.type === 'transient' && model.activePhysics !== 'heat') context.addIssue({ code: 'custom', message: 'Transient studies currently require Heat Transfer.' })
})
type V4Model = z.infer<typeof v4ModelSchema>

const v5ModelObject = v4ModelObject.extend({
  schemaVersion: z.literal(5), geometry: geometryV5Schema, mesh: meshV5Schema,
})
type V5Model = z.infer<typeof v5ModelObject>

function validateGeometry(model: { geometry: V5Model['geometry'] }, context: z.RefinementCtx) {
  const tolerance = Math.max(model.geometry.width, model.geometry.height) * 1e-9
  if (model.geometry.shape === 'rectangle') {
    const expected = rectangleGeometry(model.geometry.width, model.geometry.height)
    if (model.geometry.vertices.some((vertex, index) => Math.abs(vertex.x - expected.vertices[index]!.x) > tolerance || Math.abs(vertex.y - expected.vertices[index]!.y) > tolerance)) {
      context.addIssue({ code: 'custom', message: 'Rectangle vertices must match its width and height.' })
    }
  } else {
    try {
      const normalized = polygonGeometry(model.geometry.vertices)
      if (Math.abs(normalized.width - model.geometry.width) > tolerance || Math.abs(normalized.height - model.geometry.height) > tolerance) {
        context.addIssue({ code: 'custom', message: 'Polygon width and height must match its bounding box.' })
      }
    } catch (error) {
      context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid polygon geometry.' })
    }
  }
}

const v5ModelSchema = v5ModelObject.superRefine((model, context) => {
  if (model.study.type === 'transient' && model.activePhysics !== 'heat') context.addIssue({ code: 'custom', message: 'Transient studies currently require Heat Transfer.' })
  validateGeometry(model, context)
})

const v6ModelSchema = v5ModelObject.extend({
  schemaVersion: z.literal(6), study: studySchema.extend({ solver: z.enum(['iterative', 'direct']) }),
}).superRefine((model, context) => {
  if (model.study.type === 'transient' && model.activePhysics !== 'heat') context.addIssue({ code: 'custom', message: 'Transient studies currently require Heat Transfer.' })
  validateGeometry(model, context)
})
type V6Model = z.infer<typeof v6ModelSchema>

const gradientSchema = z.object({
  conductivityX: z.number().finite(), conductivityY: z.number().finite(),
  permittivityX: z.number().finite(), permittivityY: z.number().finite(),
  youngsModulusX: z.number().finite(), youngsModulusY: z.number().finite(),
})
const v7ModelObject = v5ModelObject.extend({
  schemaVersion: z.literal(7),
  activePhysics: z.enum(['heat', 'electrostatics', 'elasticity', 'custom']),
  material: v5ModelObject.shape.material.extend({ thermalExpansion: z.number().finite().min(-0.01).max(0.01), gradients: gradientSchema }),
  elasticity: v5ModelObject.shape.elasticity.extend({ thermalCoupling: z.boolean(), referenceTemperature: z.number().min(-273.15).max(10000) }),
  custom: z.object({
    diffusion: z.number().positive().max(1e12), reaction: z.number().min(0).max(1e12), source: z.number().finite().min(-1e12).max(1e12),
    left: customBoundarySchema, right: customBoundarySchema, top: customBoundarySchema, bottom: customBoundarySchema,
  }),
  edgeBoundaries: z.object({
    heat: z.record(z.string(), thermalBoundarySchema), electrostatics: z.record(z.string(), electricBoundarySchema),
    elasticity: z.record(z.string(), structuralBoundarySchema), custom: z.record(z.string(), customBoundarySchema),
  }),
  study: studySchema.extend({ solver: z.enum(['iterative', 'direct']), preconditioner: z.enum(['jacobi', 'ic0']), ordering: z.enum(['natural', 'rcm']), manufacturedSolution: z.enum(['none', 'scalarSine', 'logarithmic']) }),
  adaptive: z.object({ levels: z.number().int().min(1).max(5), markFraction: z.number().min(0.05).max(1) }),
})

export const heatModelSchema = v7ModelObject.superRefine((model, context) => {
  if (model.study.type === 'transient' && model.activePhysics !== 'heat') context.addIssue({ code: 'custom', message: 'Transient studies currently require Heat Transfer.' })
  validateGeometry(model, context)
  for (const vertex of model.geometry.vertices) {
    if (model.material.conductivity + model.material.gradients.conductivityX * vertex.x + model.material.gradients.conductivityY * vertex.y <= 0) context.addIssue({ code: 'custom', message: 'Thermal conductivity must remain positive at every vertex.' })
    if (model.material.relativePermittivity + model.material.gradients.permittivityX * vertex.x + model.material.gradients.permittivityY * vertex.y <= 0) context.addIssue({ code: 'custom', message: 'Relative permittivity must remain positive at every vertex.' })
    if (model.material.youngsModulus + model.material.gradients.youngsModulusX * vertex.x + model.material.gradients.youngsModulusY * vertex.y <= 0) context.addIssue({ code: 'custom', message: 'Young’s modulus must remain positive at every vertex.' })
  }
  for (const boundaries of Object.values(model.edgeBoundaries)) {
    for (const key of Object.keys(boundaries)) {
      const edge = Number(key)
      if (!Number.isInteger(edge) || edge < 0 || edge >= model.geometry.vertices.length) context.addIssue({ code: 'custom', message: `Invalid boundary edge index: ${key}.` })
    }
  }
})

function migrateV2(model: z.infer<typeof v2ModelSchema>): V3Model {
  return {
    ...model, schemaVersion: 3,
    material: { ...model.material, density: defaultModel.material.density, heatCapacity: defaultModel.material.heatCapacity },
    study: { ...model.study, type: 'stationary' },
    transient: structuredClone(defaultModel.transient),
    sweep: { parameter: 'material.conductivity', values: [...defaultModel.sweep.values] },
  }
}

function migrateV3(model: V3Model): V4Model {
  return {
    ...model, schemaVersion: 4,
    material: { ...model.material, youngsModulus: defaultModel.material.youngsModulus, poissonRatio: defaultModel.material.poissonRatio },
    elasticity: structuredClone(defaultModel.elasticity),
  }
}

function migrateV4(model: V4Model): V5Model {
  return {
    ...model, schemaVersion: 5,
    geometry: rectangleGeometry(model.geometry.width, model.geometry.height),
    mesh: { ...model.mesh, refinement: 1 },
  }
}

function migrateV5(model: V5Model): V6Model {
  return { ...model, schemaVersion: 6, study: { ...model.study, solver: 'iterative' } }
}

function migrateV6(model: V6Model): HeatModel {
  return {
    ...model, schemaVersion: 7,
    material: { ...model.material, thermalExpansion: defaultModel.material.thermalExpansion, gradients: structuredClone(defaultModel.material.gradients) },
    elasticity: { ...model.elasticity, thermalCoupling: false, referenceTemperature: defaultModel.elasticity.referenceTemperature },
    custom: structuredClone(defaultModel.custom), edgeBoundaries: structuredClone(defaultModel.edgeBoundaries),
    study: { ...model.study, preconditioner: 'jacobi', ordering: 'rcm', manufacturedSolution: 'none' }, adaptive: structuredClone(defaultModel.adaptive),
  }
}

export function parseProjectJson(source: string): HeatModel {
  const json: unknown = JSON.parse(source)
  if (typeof json === 'object' && json !== null && 'schemaVersion' in json) {
    if (json.schemaVersion === 1) {
      const legacy = legacyModelSchema.parse(json)
      return migrateV6(migrateV5(migrateV4(migrateV3(migrateV2({
        ...legacy, schemaVersion: 2, activePhysics: 'heat',
        material: { ...legacy.material, relativePermittivity: 1 },
        electrostatics: structuredClone(defaultModel.electrostatics), convergence: { levels: 3 },
      })))))
    }
    if (json.schemaVersion === 2) return migrateV6(migrateV5(migrateV4(migrateV3(migrateV2(v2ModelSchema.parse(json))))))
    if (json.schemaVersion === 3) return migrateV6(migrateV5(migrateV4(migrateV3(v3ModelSchema.parse(json)))))
    if (json.schemaVersion === 4) return migrateV6(migrateV5(migrateV4(v4ModelSchema.parse(json))))
    if (json.schemaVersion === 5) return migrateV6(migrateV5(v5ModelSchema.parse(json)))
    if (json.schemaVersion === 6) return migrateV6(v6ModelSchema.parse(json))
  }
  return heatModelSchema.parse(json)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}

/** Stable across schema migrations and object-key insertion order. */
export function modelSignature(model: HeatModel): string {
  return JSON.stringify(canonical(model))
}
