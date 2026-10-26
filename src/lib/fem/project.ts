import { z } from 'zod'
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
])
const geometrySchema = z.object({ width: z.number().positive().max(1000), height: z.number().positive().max(1000) })
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

export const heatModelSchema = z.object({
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
}).superRefine((model, context) => {
  if (model.study.type === 'transient' && model.activePhysics !== 'heat') {
    context.addIssue({ code: 'custom', message: 'Transient studies currently require Heat Transfer.' })
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

function migrateV3(model: V3Model): HeatModel {
  return {
    ...model, schemaVersion: 4,
    material: { ...model.material, youngsModulus: defaultModel.material.youngsModulus, poissonRatio: defaultModel.material.poissonRatio },
    elasticity: structuredClone(defaultModel.elasticity),
  }
}

export function parseProjectJson(source: string): HeatModel {
  const json: unknown = JSON.parse(source)
  if (typeof json === 'object' && json !== null && 'schemaVersion' in json) {
    if (json.schemaVersion === 1) {
      const legacy = legacyModelSchema.parse(json)
      return migrateV3(migrateV2({
        ...legacy, schemaVersion: 2, activePhysics: 'heat',
        material: { ...legacy.material, relativePermittivity: 1 },
        electrostatics: structuredClone(defaultModel.electrostatics), convergence: { levels: 3 },
      }))
    }
    if (json.schemaVersion === 2) return migrateV3(migrateV2(v2ModelSchema.parse(json)))
    if (json.schemaVersion === 3) return migrateV3(v3ModelSchema.parse(json))
  }
  return heatModelSchema.parse(json)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  }
  return value
}

/** Stable across schema migrations and object-key insertion order. */
export function modelSignature(model: HeatModel): string {
  return JSON.stringify(canonical(model))
}
