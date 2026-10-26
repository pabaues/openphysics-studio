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
const geometrySchema = z.object({
  width: z.number().positive().max(1000),
  height: z.number().positive().max(1000),
})
const thermalPhysicsSchema = z.object({
  heatSource: z.number().min(-1e12).max(1e12),
  leftTemperature: z.number().min(-273.15).max(10000),
  rightTemperature: z.number().min(-273.15).max(10000),
  top: thermalBoundarySchema,
  bottom: thermalBoundarySchema,
})
const meshSchema = z.object({
  nx: z.number().int().min(2).max(80),
  ny: z.number().int().min(2).max(80),
})
const studySchema = z.object({
  tolerance: z.number().min(1e-12).max(1e-3),
  maxIterations: z.number().int().min(10).max(20000),
})

const legacyModelSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(120),
  geometry: geometrySchema,
  material: z.object({ conductivity: z.number().positive().max(1e9) }),
  physics: thermalPhysicsSchema,
  mesh: meshSchema,
  study: studySchema,
})

export const heatModelSchema = z.object({
  schemaVersion: z.literal(2),
  name: z.string().trim().min(1).max(120),
  activePhysics: z.enum(['heat', 'electrostatics']),
  geometry: geometrySchema,
  material: z.object({
    conductivity: z.number().positive().max(1e9),
    relativePermittivity: z.number().positive().max(1e9),
  }),
  physics: thermalPhysicsSchema,
  electrostatics: z.object({
    chargeDensity: z.number().min(-1e6).max(1e6),
    leftVoltage: z.number().min(-1e9).max(1e9),
    rightVoltage: z.number().min(-1e9).max(1e9),
    top: electricBoundarySchema,
    bottom: electricBoundarySchema,
  }),
  mesh: meshSchema,
  study: studySchema,
  convergence: z.object({ levels: z.number().int().min(2).max(4) }),
})

export function parseProjectJson(source: string): HeatModel {
  const json: unknown = JSON.parse(source)
  if (typeof json === 'object' && json !== null && 'schemaVersion' in json && json.schemaVersion === 1) {
    const legacy = legacyModelSchema.parse(json)
    return {
      ...legacy,
      schemaVersion: 2,
      activePhysics: 'heat',
      material: { ...legacy.material, relativePermittivity: 1 },
      electrostatics: structuredClone(defaultModel.electrostatics),
      convergence: { levels: 3 },
    }
  }
  return heatModelSchema.parse(json)
}
