import { multiDomainGeometry, polygonGeometry, rectangleGeometry } from './geometry'
import { defaultModel, type HeatModel, type Material } from './types'

export type ExamplePresetId = 'plate' | 'bar' | 'generation' | 'composite' | 'electric' | 'polygon' | 'tension' | 'pinPhotodetector' | 'pnModulator'

export const examplePresetGroups = [
  {
    label: 'General examples',
    options: [
      ['plate', 'Thermal plate study'],
      ['bar', 'Insulated conduction bar'],
      ['generation', 'Volumetric heating plate'],
      ['composite', 'Two-material composite plate'],
      ['electric', 'Parallel plate capacitor'],
      ['polygon', 'L-shaped electrostatic domain'],
      ['tension', 'Uniaxial tension patch'],
    ],
  },
  {
    label: 'Integrated photonics · reduced-order electrostatics',
    options: [
      ['pinPhotodetector', 'Si PIN photodetector'],
      ['pnModulator', 'High-density Si PN modulator'],
    ],
  },
] as const

function siliconMaterial(template: Material): Material {
  return {
    ...structuredClone(template),
    conductivity: 149,
    relativePermittivity: 11.7,
    density: 2329,
    heatCapacity: 700,
    youngsModulus: 170e9,
    poissonRatio: 0.28,
    thermalExpansion: 2.6e-6,
  }
}

function layeredPhotonicModel(kind: 'pinPhotodetector' | 'pnModulator'): HeatModel {
  const next = structuredClone(defaultModel)
  const pin = kind === 'pinPhotodetector'
  const widths = pin ? [250e-9, 1500e-9, 250e-9] : [500e-9, 400e-9, 500e-9]
  const prefix = pin ? 'pin' : 'mod'
  const coreName = pin ? 'Intrinsic Si absorption region' : 'PN junction · optical core'
  const names = ['p-Si contact', coreName, 'n-Si contact']
  const ids = [`domain-${prefix}-p`, `domain-${prefix}-core`, `domain-${prefix}-n`]
  let x = 0
  const domains = widths.map((width, index) => {
    const domain = {
      id: ids[index]!, name: names[index]!,
      vertices: [{ x, y: 0 }, { x: x + width, y: 0 }, { x: x + width, y: 220e-9 }, { x, y: 220e-9 }],
    }
    x += width
    return domain
  })

  next.name = pin ? 'Si PIN photodetector · reverse-bias cross-section' : 'Si PN modulator · depletion cross-section'
  next.activePhysics = 'electrostatics'
  next.geometry = multiDomainGeometry(domains)
  next.material = siliconMaterial(next.material)
  next.domainMaterials = Object.fromEntries(next.geometry.domains.slice(1).map((domain) => [domain.id, siliconMaterial(next.material)]))
  next.electrostatics = {
    chargeDensity: 0,
    leftVoltage: pin ? -2 : 0,
    rightVoltage: pin ? 0 : 2,
    top: { type: 'zeroCharge' },
    bottom: { type: 'zeroCharge' },
  }
  next.mesh = { nx: 32, ny: 12, refinement: 2 }
  next.convergence = { levels: 3 }
  next.adaptive = { levels: 3, markFraction: 0.3 }
  next.sweep = pin
    ? { parameter: 'electrostatics.leftVoltage', values: [-0.5, -1, -2, -4] }
    : { parameter: 'electrostatics.rightVoltage', values: [0, 1, 2, 4] }
  return next
}

export function createExampleModel(id: ExamplePresetId): HeatModel {
  if (id === 'pinPhotodetector' || id === 'pnModulator') return layeredPhotonicModel(id)
  const next = structuredClone(defaultModel)
  if (id === 'bar') {
    next.name = 'Insulated conduction bar'
    next.geometry = rectangleGeometry(0.2, 0.025)
    next.physics = { heatSource: 0, leftTemperature: 100, rightTemperature: 20, top: { type: 'insulated' }, bottom: { type: 'insulated' } }
  }
  if (id === 'generation') {
    next.name = 'Volumetric heating plate'
    next.geometry = rectangleGeometry(0.08, 0.08)
    next.material.conductivity = 15
    next.physics = { heatSource: 500000, leftTemperature: 20, rightTemperature: 20, top: { type: 'temperature', value: 20 }, bottom: { type: 'temperature', value: 20 } }
  }
  if (id === 'composite') {
    next.name = 'Two-material composite plate'
    next.geometry = multiDomainGeometry([
      { id: 'domain-1', name: 'High-conductivity domain', vertices: [{ x: 0, y: 0 }, { x: 0.05, y: 0 }, { x: 0.05, y: 0.05 }, { x: 0, y: 0.05 }] },
      { id: 'domain-2', name: 'Low-conductivity domain', vertices: [{ x: 0.05, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.05 }, { x: 0.05, y: 0.05 }] },
    ])
    next.material.conductivity = 45
    next.domainMaterials = { 'domain-2': { ...structuredClone(next.material), conductivity: 5, relativePermittivity: 4.2, youngsModulus: 70e9 } }
    next.physics = { heatSource: 0, leftTemperature: 20, rightTemperature: 80, top: { type: 'insulated' }, bottom: { type: 'insulated' } }
    next.mesh = { nx: 16, ny: 12, refinement: 2 }
  }
  if (id === 'electric') {
    next.name = 'Parallel plate capacitor'
    next.activePhysics = 'electrostatics'
    next.geometry = rectangleGeometry(0.05, 0.02)
    next.material.relativePermittivity = 4.2
    next.electrostatics = { chargeDensity: 0, leftVoltage: 0, rightVoltage: 12, top: { type: 'zeroCharge' }, bottom: { type: 'zeroCharge' } }
    next.mesh = { refinement: 1, nx: 24, ny: 12 }
  }
  if (id === 'polygon') {
    next.name = 'L-shaped electrostatic domain'
    next.activePhysics = 'electrostatics'
    next.geometry = polygonGeometry([{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.1, y: 0.2 }, { x: 0, y: 0.2 }])
    next.electrostatics = { chargeDensity: 0, leftVoltage: 0, rightVoltage: 12, top: { type: 'zeroCharge' }, bottom: { type: 'zeroCharge' } }
    next.mesh = { nx: 24, ny: 12, refinement: 2 }
    next.sweep = { parameter: 'material.relativePermittivity', values: [1, 2.2, 4.2] }
  }
  if (id === 'tension') {
    next.name = 'Uniaxial tension patch'
    next.activePhysics = 'elasticity'
    next.geometry = rectangleGeometry(0.2, 0.1)
    next.mesh = { refinement: 1, nx: 24, ny: 12 }
    next.material.youngsModulus = 70e9
    next.material.poissonRatio = 0.25
    next.elasticity.left = { type: 'roller' }
    next.elasticity.right = { type: 'normalDisplacement', value: 0.00002 }
    next.elasticity.bottom = { type: 'roller' }
    next.elasticity.top = { type: 'free' }
    next.sweep = { parameter: 'material.youngsModulus', values: [35e9, 70e9, 140e9] }
  }
  return next
}
