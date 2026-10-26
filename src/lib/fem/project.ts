import { z } from 'zod'
import type { HeatModel } from './types'

const boundarySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('temperature'), value: z.number().min(-273.15).max(10000) }),
  z.object({ type: z.literal('insulated') }),
])

export const heatModelSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(120),
  geometry: z.object({
    width: z.number().positive().max(1000),
    height: z.number().positive().max(1000),
  }),
  material: z.object({ conductivity: z.number().positive().max(1e9) }),
  physics: z.object({
    heatSource: z.number().min(-1e12).max(1e12),
    leftTemperature: z.number().min(-273.15).max(10000),
    rightTemperature: z.number().min(-273.15).max(10000),
    top: boundarySchema,
    bottom: boundarySchema,
  }),
  mesh: z.object({
    nx: z.number().int().min(2).max(80),
    ny: z.number().int().min(2).max(80),
  }),
  study: z.object({
    tolerance: z.number().min(1e-12).max(1e-3),
    maxIterations: z.number().int().min(10).max(20000),
  }),
})

export function parseProjectJson(source: string): HeatModel {
  const json: unknown = JSON.parse(source)
  return heatModelSchema.parse(json)
}
