import type { HeatModel, Material, Mesh } from './types'

export function materialForDomain(model: HeatModel, domainIndex: number): Material {
  if (domainIndex === 0) return model.material
  const domain = model.geometry.domains[domainIndex]
  const material = domain ? model.domainMaterials[domain.id] : undefined
  if (!material) throw new Error(`Missing material for geometry domain ${domainIndex + 1}.`)
  return material
}

export function triangleDomain(mesh: Mesh, elementIndex: number): number {
  return mesh.triangleDomains?.[elementIndex] ?? 0
}

export function conductivityAt(model: HeatModel, x: number, y: number, domainIndex = 0): number {
  const material = materialForDomain(model, domainIndex)
  return material.conductivity + material.gradients.conductivityX * x + material.gradients.conductivityY * y
}

export function permittivityAt(model: HeatModel, x: number, y: number, domainIndex = 0): number {
  const material = materialForDomain(model, domainIndex)
  return material.relativePermittivity + material.gradients.permittivityX * x + material.gradients.permittivityY * y
}

export function youngsModulusAt(model: HeatModel, x: number, y: number, domainIndex = 0): number {
  const material = materialForDomain(model, domainIndex)
  return material.youngsModulus + material.gradients.youngsModulusX * x + material.gradients.youngsModulusY * y
}
