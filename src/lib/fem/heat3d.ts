import { edgeOverride } from './boundary'
import { domainExtrusion } from './geometry'
import { createTetrahedralMesh, tetraGeometry } from './mesh3d'
import { conductivityAt } from './properties'
import { near } from './scalar'
import { solveLinearSystem, type SparseRow } from './solver'
import type { HeatModel, SimulationResult, TetrahedralMesh } from './types'

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

function nodeDomainAssignments(mesh: TetrahedralMesh): number[] {
  const domains = Array<number>(mesh.nodes.length).fill(-1)
  mesh.tetrahedra.forEach((tetrahedron, element) => tetrahedron.forEach((node) => {
    if (domains[node]! < 0) domains[node] = mesh.tetrahedronDomains[element]!
  }))
  if (domains.some((domain) => domain < 0)) throw new Error('A tetrahedral node is not connected to an element.')
  return domains
}

/** Stationary 3D heat conduction with linear tetrahedra and Dirichlet elimination. */
export function solveHeat3D(model: HeatModel, existingMesh?: TetrahedralMesh): SimulationResult {
  if (model.geometry.dimension !== '3d' || model.activePhysics !== 'heat' || model.study.type !== 'stationary') throw new Error('The first 3D solver supports stationary Heat Transfer only.')
  const started = performance.now()
  const mesh = existingMesh ?? createTetrahedralMesh(model)
  const prescribed = new Map<number, number>()
  const nodeDomains = nodeDomainAssignments(mesh)
  mesh.nodes.forEach((node, index) => {
    const value = prescribedTemperature(model, node.x, node.y, node.z!, nodeDomains[index]!)
    if (value !== undefined) prescribed.set(index, value)
  })
  if (prescribed.size === 0) throw new Error('A stationary 3D heat study requires at least one fixed-temperature boundary.')
  const free = mesh.nodes.map((_, index) => index).filter((index) => !prescribed.has(index))
  const systemIndex = new Map(free.map((node, index) => [node, index]))
  const assembly = free.map(() => new Map<number, number>())
  const rhs = Array<number>(free.length).fill(0)
  const flux: Array<{ x: number; y: number; z: number; magnitude: number }> = []

  mesh.tetrahedra.forEach((tetrahedron, elementIndex) => {
    const domain = mesh.tetrahedronDomains[elementIndex]!
    const { volume, gradients } = tetraGeometry(mesh.nodes, tetrahedron)
    const centroid = tetrahedron.reduce((point, index) => {
      const node = mesh.nodes[index]!
      return { x: point.x + node.x / 4, y: point.y + node.y / 4, z: point.z + node.z! / 4 }
    }, { x: 0, y: 0, z: 0 })
    const conductivity = conductivityAt(model, centroid.x, centroid.y, domain)
    const source = model.physics.heatSource * volume / 4
    tetrahedron.forEach((globalRow, localRow) => {
      const row = systemIndex.get(globalRow)
      if (row !== undefined) rhs[row]! += source
      tetrahedron.forEach((globalColumn, localColumn) => {
        const gradient = gradients[localRow]!
        const other = gradients[localColumn]!
        const value = conductivity * volume * (gradient.x * other.x + gradient.y * other.y + gradient.z * other.z)
        const fixed = prescribed.get(globalColumn)
        if (row === undefined) return
        if (fixed !== undefined) rhs[row]! -= value * fixed
        else {
          const column = systemIndex.get(globalColumn)!
          assembly[row]!.set(column, (assembly[row]!.get(column) ?? 0) + value)
        }
      })
    })
  })

  const rows: SparseRow[] = assembly.map((entries, index) => {
    const sorted = [...entries.entries()].filter(([, value]) => value !== 0).sort(([a], [b]) => a - b)
    return { indices: sorted.map(([column]) => column), values: sorted.map(([, value]) => value), diagonal: entries.get(index) ?? 0 }
  })
  const solution = solveLinearSystem(rows, rhs, model.study.solver, model.study.tolerance, model.study.maxIterations, undefined, { preconditioner: model.study.preconditioner, ordering: model.study.ordering })
  const temperature = Array<number>(mesh.nodes.length).fill(0)
  prescribed.forEach((value, index) => { temperature[index] = value })
  free.forEach((node, index) => { temperature[node] = solution.values[index]! })

  mesh.tetrahedra.forEach((tetrahedron, elementIndex) => {
    const { gradients } = tetraGeometry(mesh.nodes, tetrahedron)
    const gradient = gradients.reduce((sum, item, localIndex) => ({ x: sum.x + item.x * temperature[tetrahedron[localIndex]!]!, y: sum.y + item.y * temperature[tetrahedron[localIndex]!]!, z: sum.z + item.z * temperature[tetrahedron[localIndex]!]! }), { x: 0, y: 0, z: 0 })
    const centroid = tetrahedron.reduce((point, index) => ({ x: point.x + mesh.nodes[index]!.x / 4, y: point.y + mesh.nodes[index]!.y / 4 }), { x: 0, y: 0 })
    const conductivity = conductivityAt(model, centroid.x, centroid.y, mesh.tetrahedronDomains[elementIndex]!)
    flux.push({ x: -conductivity * gradient.x, y: -conductivity * gradient.y, z: -conductivity * gradient.z, magnitude: conductivity * Math.hypot(gradient.x, gradient.y, gradient.z) })
  })
  return {
    physics: 'heat', mesh, temperature, flux, solver: model.study.solver,
    converged: solution.converged, iterations: solution.iterations, relativeResidual: solution.relativeResidual,
    solveTimeMs: performance.now() - started, minimum: Math.min(...temperature), maximum: Math.max(...temperature),
    average: temperature.reduce((sum, value) => sum + value, 0) / temperature.length,
  }
}
