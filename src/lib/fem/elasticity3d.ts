import { boundaryOverrideKey, boundarySide, edgeOverride, geometryEdgesAt } from './boundary'
import { domainExtrusion } from './geometry'
import { solveHeat3D } from './heat3d'
import { createTetrahedralMesh, tetraGeometry } from './mesh3d'
import { materialForDomain, youngsModulusAt } from './properties'
import { near } from './scalar'
import { tetrahedronCentroid } from './scalar3d'
import { solveLinearSystem, type SparseRow } from './solver'
import type { HeatModel, MeshNode, StructuralBoundaryCondition, StructuralSimulationResult, TensorValue, TetrahedralMesh } from './types'

type BoundarySide3D = 'left' | 'right' | 'top' | 'bottom' | 'front' | 'back'

export function constitutiveMatrix3D(youngsModulus: number, poissonRatio: number): number[][] {
  const lambda = youngsModulus * poissonRatio / ((1 + poissonRatio) * (1 - 2 * poissonRatio))
  const mu = youngsModulus / (2 * (1 + poissonRatio))
  return [
    [lambda + 2 * mu, lambda, lambda, 0, 0, 0],
    [lambda, lambda + 2 * mu, lambda, 0, 0, 0],
    [lambda, lambda, lambda + 2 * mu, 0, 0, 0],
    [0, 0, 0, mu, 0, 0],
    [0, 0, 0, 0, mu, 0],
    [0, 0, 0, 0, 0, mu],
  ]
}

function prescribedDisplacement(condition: StructuralBoundaryCondition, side: BoundarySide3D, dof: number): number | undefined {
  if (condition.type === 'free' || condition.type === 'traction') return undefined
  if (condition.type === 'fixed') return 0
  const normalDof = side === 'left' || side === 'right' ? 0 : side === 'top' || side === 'bottom' ? 1 : 2
  if (dof !== normalDof) return undefined
  return condition.type === 'roller' ? 0 : condition.value
}

function boundaryValue(model: HeatModel, node: MeshNode, dof: number, nodeDomain: number): number | undefined {
  for (const [domainIndex, domain] of model.geometry.domains.entries()) {
    for (const edge of geometryEdgesAt(domain.vertices, node)) {
      const override = model.edgeBoundaries.elasticity[boundaryOverrideKey(domainIndex, edge)]
      if (!override) continue
      const side = boundarySide(domain.vertices, edge)
      if ((override.type === 'roller' || override.type === 'normalDisplacement') && !side) throw new Error('Roller and normal-displacement edge selections require an axis-aligned edge.')
      return prescribedDisplacement(override, side ?? 'left', dof)
    }
  }
  const { width, height } = model.geometry
  const extrusion = domainExtrusion(model.geometry, nodeDomain)
  const boundaries: Array<[boolean, StructuralBoundaryCondition, BoundarySide3D]> = [
    [near(node.x, 0, width), model.elasticity.left, 'left'],
    [near(node.x, width, width), model.elasticity.right, 'right'],
    [near(node.y, 0, height), model.elasticity.bottom, 'bottom'],
    [near(node.y, height, height), model.elasticity.top, 'top'],
    [near(node.z ?? 0, extrusion.z - extrusion.depth / 2, extrusion.depth), model.elasticity.back ?? { type: 'free' }, 'back'],
    [near(node.z ?? 0, extrusion.z + extrusion.depth / 2, extrusion.depth), model.elasticity.front ?? { type: 'free' }, 'front'],
  ]
  for (const [selected, condition, side] of boundaries) {
    if (!selected) continue
    const prescribed = prescribedDisplacement(condition, side, dof)
    if (prescribed !== undefined) return prescribed
  }
  return undefined
}

function nodeDomainAssignments(mesh: TetrahedralMesh): number[] {
  const domains = Array<number>(mesh.nodes.length).fill(-1)
  mesh.tetrahedra.forEach((tetrahedron, element) => tetrahedron.forEach((node) => {
    if (domains[node]! < 0) domains[node] = mesh.tetrahedronDomains[element]!
  }))
  return domains
}

function surfaceCondition(model: HeatModel, mesh: TetrahedralMesh, faceIndex: number): StructuralBoundaryCondition {
  const triangle = mesh.triangles[faceIndex]!
  const domainIndex = mesh.tetrahedronDomains[mesh.triangleElements[faceIndex]!]!
  const centroid = triangle.reduce((point, node) => {
    const position = mesh.nodes[node]!
    return { x: point.x + position.x / 3, y: point.y + position.y / 3, z: point.z + position.z! / 3 }
  }, { x: 0, y: 0, z: 0 })
  const { depth, z } = domainExtrusion(model.geometry, domainIndex)
  if (near(centroid.z, z - depth / 2, depth)) return model.elasticity.back ?? { type: 'free' }
  if (near(centroid.z, z + depth / 2, depth)) return model.elasticity.front ?? { type: 'free' }
  const override = edgeOverride(model, 'elasticity', centroid) as StructuralBoundaryCondition | undefined
  if (override) return override
  const { width, height } = model.geometry
  if (near(centroid.x, 0, width)) return model.elasticity.left
  if (near(centroid.x, width, width)) return model.elasticity.right
  if (near(centroid.y, 0, height)) return model.elasticity.bottom
  if (near(centroid.y, height, height)) return model.elasticity.top
  return { type: 'free' }
}

function addSurfaceTractions(model: HeatModel, mesh: TetrahedralMesh, globalToFree: number[], rhs: number[]) {
  mesh.triangles.forEach((triangle, faceIndex) => {
    const condition = surfaceCondition(model, mesh, faceIndex)
    if (condition.type !== 'traction') return
    const [a, b, c] = triangle.map((node) => mesh.nodes[node]!)
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z! - a.z! }
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z! - a.z! }
    const cross = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x }
    const area = Math.hypot(cross.x, cross.y, cross.z) / 2
    const traction = [condition.x, condition.y, condition.z ?? 0]
    triangle.forEach((node) => {
      for (let dof = 0; dof < 3; dof += 1) {
        const free = globalToFree[node * 3 + dof]!
        if (free >= 0) rhs[free]! += area * traction[dof]! / 3
      }
    })
  })
}

/** B maps [ux,uy,uz] at four nodes to [exx,eyy,ezz,gamma_yz,gamma_xz,gamma_xy]. */
function strainDisplacement3D(mesh: TetrahedralMesh, tetrahedron: [number, number, number, number]): number[][] {
  const { gradients } = tetraGeometry(mesh.nodes, tetrahedron)
  const matrix = Array.from({ length: 6 }, () => Array<number>(12).fill(0))
  gradients.forEach((gradient, local) => {
    const ux = local * 3
    const uy = ux + 1
    const uz = ux + 2
    matrix[0]![ux] = gradient.x
    matrix[1]![uy] = gradient.y
    matrix[2]![uz] = gradient.z
    matrix[3]![uy] = gradient.z
    matrix[3]![uz] = gradient.y
    matrix[4]![ux] = gradient.z
    matrix[4]![uz] = gradient.x
    matrix[5]![ux] = gradient.y
    matrix[5]![uy] = gradient.x
  })
  return matrix
}

function multiply(left: number[][], right: number[][]): number[][] {
  return left.map((row) => right[0]!.map((_, column) => row.reduce((sum, value, index) => sum + value * right[index]![column]!, 0)))
}

function tensorProduct(matrix: number[][], vector: number[]): TensorValue {
  const values = matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index]!, 0))
  return { xx: values[0]!, yy: values[1]!, zz: values[2]!, yz: values[3]!, xz: values[4]!, xy: values[5]! }
}

/** Isotropic small-strain 3D elasticity with three-component P1 tetrahedral displacements. */
export function solveElasticity3D(model: HeatModel): StructuralSimulationResult {
  if (model.geometry.dimension !== '3d' || model.activePhysics !== 'elasticity' || model.study.type !== 'stationary') throw new Error('3D elasticity requires a stationary structural study and tetrahedral geometry.')
  const started = performance.now()
  const mesh = createTetrahedralMesh(model)
  const thermal = model.elasticity.thermalCoupling ? solveHeat3D({
    ...model, activePhysics: 'heat', study: { ...model.study, type: 'stationary' },
  }) : null
  if (thermal && !thermal.converged) throw new Error('The 3D thermal step did not converge; structural coupling was not attempted.')
  const dofCount = mesh.nodes.length * 3
  const values = Array<number>(dofCount).fill(0)
  const freeToGlobal: number[] = []
  const globalToFree = Array<number>(dofCount).fill(-1)
  const nodeDomains = nodeDomainAssignments(mesh)
  mesh.nodes.forEach((node, nodeIndex) => {
    for (let dof = 0; dof < 3; dof += 1) {
      const global = nodeIndex * 3 + dof
      const fixed = boundaryValue(model, node, dof, nodeDomains[nodeIndex]!)
      if (fixed === undefined) {
        globalToFree[global] = freeToGlobal.length
        freeToGlobal.push(global)
      } else values[global] = fixed
    }
  })
  if (freeToGlobal.length === 0) throw new Error('All 3D structural degrees of freedom are prescribed; no solve is required.')

  const thermalStrains: TensorValue[] = mesh.tetrahedra.map((tetrahedron, elementIndex) => {
    if (!thermal) return { xx: 0, yy: 0, zz: 0, yz: 0, xz: 0, xy: 0 }
    const temperature = tetrahedron.reduce((sum, node) => sum + thermal.temperature[node]!, 0) / 4
    const material = materialForDomain(model, mesh.tetrahedronDomains[elementIndex]!)
    const expansion = material.thermalExpansion * (temperature - model.elasticity.referenceTemperature)
    return { xx: expansion, yy: expansion, zz: expansion, yz: 0, xz: 0, xy: 0 }
  })
  const rowMaps = freeToGlobal.map(() => new Map<number, number>())
  const rhs = Array<number>(freeToGlobal.length).fill(0)
  const elementMatrices: number[][][] = []
  const elementConstitutive: number[][][] = []
  mesh.tetrahedra.forEach((tetrahedron, elementIndex) => {
    const { volume } = tetraGeometry(mesh.nodes, tetrahedron)
    const centroid = tetrahedronCentroid(mesh, tetrahedron)
    const domainIndex = mesh.tetrahedronDomains[elementIndex]!
    const material = materialForDomain(model, domainIndex)
    const D = constitutiveMatrix3D(youngsModulusAt(model, centroid.x, centroid.y, domainIndex), material.poissonRatio)
    const B = strainDisplacement3D(mesh, tetrahedron)
    const DB = multiply(D, B)
    const initial = thermalStrains[elementIndex]!
    const thermalLoad = multiply(D, [[initial.xx], [initial.yy], [initial.zz ?? 0], [0], [0], [0]]).flat()
    elementMatrices.push(B)
    elementConstitutive.push(D)
    for (let localI = 0; localI < 12; localI += 1) {
      const globalI = tetrahedron[Math.floor(localI / 3)]! * 3 + localI % 3
      const freeI = globalToFree[globalI]!
      if (freeI < 0) continue
      const bodyForce = localI % 3 === 0 ? model.elasticity.bodyForceX : localI % 3 === 1 ? model.elasticity.bodyForceY : model.elasticity.bodyForceZ ?? 0
      rhs[freeI]! += bodyForce * volume / 4
      rhs[freeI]! += volume * B.reduce((sum, row, index) => sum + row[localI]! * thermalLoad[index]!, 0)
      for (let localJ = 0; localJ < 12; localJ += 1) {
        const globalJ = tetrahedron[Math.floor(localJ / 3)]! * 3 + localJ % 3
        const stiffness = volume * B.reduce((sum, row, index) => sum + row[localI]! * DB[index]![localJ]!, 0)
        const freeJ = globalToFree[globalJ]!
        if (freeJ >= 0) rowMaps[freeI]!.set(freeJ, (rowMaps[freeI]!.get(freeJ) ?? 0) + stiffness)
        else rhs[freeI]! -= stiffness * values[globalJ]!
      }
    }
  })
  addSurfaceTractions(model, mesh, globalToFree, rhs)
  const rows: SparseRow[] = rowMaps.map((entries, rowIndex) => {
    const indices = [...entries.keys()].sort((a, b) => a - b)
    return { indices, values: indices.map((index) => entries.get(index)!), diagonal: entries.get(rowIndex) ?? 0 }
  })
  const solution = solveLinearSystem(rows, rhs, model.study.solver, model.study.tolerance, model.study.maxIterations, undefined, { preconditioner: model.study.preconditioner, ordering: model.study.ordering })
  solution.values.forEach((value, freeIndex) => { values[freeToGlobal[freeIndex]!] = value })

  const displacement = mesh.nodes.map((_, index) => {
    const x = values[index * 3]!
    const y = values[index * 3 + 1]!
    const z = values[index * 3 + 2]!
    return { x, y, z, magnitude: Math.hypot(x, y, z) }
  })
  const strain: TensorValue[] = []
  const stress: TensorValue[] = []
  const stresses: number[] = []
  mesh.tetrahedra.forEach((tetrahedron, elementIndex) => {
    const elementDisplacement = tetrahedron.flatMap((node) => [values[node * 3]!, values[node * 3 + 1]!, values[node * 3 + 2]!])
    const elementStrain = tensorProduct(elementMatrices[elementIndex]!, elementDisplacement)
    const initial = thermalStrains[elementIndex]!
    const elementStress = tensorProduct(elementConstitutive[elementIndex]!, [
      elementStrain.xx - initial.xx, elementStrain.yy - initial.yy, (elementStrain.zz ?? 0) - (initial.zz ?? 0),
      elementStrain.yz ?? 0, elementStrain.xz ?? 0, elementStrain.xy,
    ])
    strain.push(elementStrain)
    stress.push(elementStress)
    const zz = elementStress.zz ?? 0
    stresses.push(Math.sqrt(0.5 * ((elementStress.xx - elementStress.yy) ** 2 + (elementStress.yy - zz) ** 2 + (zz - elementStress.xx) ** 2)
      + 3 * (elementStress.xy ** 2 + (elementStress.yz ?? 0) ** 2 + (elementStress.xz ?? 0) ** 2)))
  })
  const magnitudes = displacement.map((value) => value.magnitude)
  return {
    physics: 'elasticity', solver: model.study.solver, mesh, displacement, strain, stress, vonMises: stresses,
    planeState: '3d',
    thermal: thermal ? { temperature: thermal.temperature, referenceTemperature: model.elasticity.referenceTemperature, expansion: model.material.thermalExpansion, expansions: model.geometry.domains.map((_, domainIndex) => materialForDomain(model, domainIndex).thermalExpansion) } : undefined,
    converged: solution.converged, iterations: solution.iterations, relativeResidual: solution.relativeResidual,
    solveTimeMs: performance.now() - started,
    minimum: Math.min(...magnitudes), maximum: Math.max(...magnitudes),
    average: magnitudes.reduce((sum, value) => sum + value, 0) / magnitudes.length,
  }
}
