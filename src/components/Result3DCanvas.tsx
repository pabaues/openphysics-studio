import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Grid3X3, Maximize2, Rotate3D, Thermometer, Zap } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createTetrahedralMesh } from '@/lib/fem/mesh3d'
import type { AnySimulationResult, HeatModel, TetrahedralMesh } from '@/lib/fem/types'
import type { ResultQuantity, ViewMode } from './SimulationCanvas'

interface Result3DCanvasProps {
  model: HeatModel
  result: AnySimulationResult | null
  view: ViewMode
  quantity: ResultQuantity
  showMesh: boolean
}

const PALETTE = ['#253494', '#225ea8', '#1d91c0', '#41b6c4', '#a1dab4', '#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026']
const colorAt = (value: number, minimum: number, maximum: number, target: THREE.Color) => {
  const range = maximum - minimum
  const position = range <= Math.max(1, Math.abs(minimum), Math.abs(maximum)) * 1e-9 ? 0.5 : THREE.MathUtils.clamp((value - minimum) / range, 0, 1)
  const scaled = position * (PALETTE.length - 1)
  const lower = Math.floor(scaled)
  const upper = Math.min(PALETTE.length - 1, lower + 1)
  return target.set(PALETTE[lower]!).lerp(new THREE.Color(PALETTE[upper]!), scaled - lower)
}

export default function Result3DCanvas({ model, result, view, quantity, showMesh }: Result3DCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const contentRef = useRef<THREE.Group | null>(null)
  const [wireframe, setWireframe] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const generated = useMemo(() => {
    if (view !== 'mesh') return { mesh: undefined, error: '' }
    try { return { mesh: createTetrahedralMesh(model), error: '' } }
    catch (cause) { return { mesh: undefined, error: cause instanceof Error ? cause.message : 'Unable to create the tetrahedral mesh.' } }
  }, [model, view])
  const resultMesh = result?.mesh.kind === 'tetrahedral' ? result.mesh : undefined
  const mesh: TetrahedralMesh | undefined = view === 'mesh' ? generated.mesh : resultMesh
  const field = useMemo(() => {
    if (!result) return { values: [] as number[], elementValues: false, label: 'Result', unit: '' }
    if (result.physics === 'heat') return quantity === 'flux'
      ? { values: result.flux.map((value) => value.magnitude), elementValues: true, label: 'Heat flux magnitude', unit: 'W/m²' }
      : { values: result.temperature, elementValues: false, label: 'Temperature', unit: '°C' }
    if (result.physics === 'electrostatics') return quantity === 'electricField'
      ? { values: result.electricField.map((value) => value.magnitude), elementValues: true, label: 'Electric field magnitude', unit: 'V/m' }
      : { values: result.potential, elementValues: false, label: 'Electric potential', unit: 'V' }
    if (result.physics === 'elasticity') return quantity === 'vonMises'
      ? { values: result.vonMises, elementValues: true, label: 'von Mises stress', unit: 'Pa' }
      : { values: result.displacement.map((value) => value.magnitude), elementValues: false, label: 'Displacement magnitude', unit: 'm' }
    return { values: result.values, elementValues: false, label: 'Custom scalar field', unit: 'u' }
  }, [result, quantity])
  const { values, elementValues } = field
  const minimum = values.length ? Math.min(...values) : 0
  const maximum = values.length ? Math.max(...values) : 1

  useEffect(() => {
    const container = host.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    let disposed = false
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }) }
    catch {
      queueMicrotask(() => { if (!disposed) setError('WebGL is unavailable. Enable hardware acceleration to inspect the 3D mesh and results.') })
      return () => { disposed = true }
    }
    queueMicrotask(() => { if (!disposed) { setError(''); setReady(true) } })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-label', 'Interactive tetrahedral 3D visualization. Drag to orbit, right-drag to pan, and scroll to zoom.')
    renderer.domElement.setAttribute('role', 'img')
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f4f6f8')
    const camera = new THREE.PerspectiveCamera(40, 1, 1e-9, 10000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = true
    const content = new THREE.Group()
    scene.add(content)
    scene.add(new THREE.HemisphereLight('#ffffff', '#748391', 2.2))
    const light = new THREE.DirectionalLight('#ffffff', 2.8)
    light.position.set(3, 5, 4)
    scene.add(light)
    sceneRef.current = scene
    cameraRef.current = camera
    controlsRef.current = controls
    contentRef.current = content
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    })
    resize.observe(container)
    let frame = 0
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera) }
    animate()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      contentRef.current = null
    }
  }, [])

  const setView = (kind: 'iso' | 'front' | 'top' | 'fit') => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const content = contentRef.current
    if (!camera || !controls || !content) return
    const bounds = new THREE.Box3().setFromObject(content)
    if (bounds.isEmpty()) return
    const center = bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1e-9)
    const direction = kind === 'front' ? new THREE.Vector3(0, 0, 1)
      : kind === 'top' ? new THREE.Vector3(0, 1, 0.0001)
        : kind === 'fit' ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(1.3, 1, 1.5).normalize()
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25
    camera.position.copy(center).addScaledVector(direction, distance)
    camera.near = Math.max(distance / 1000, 1e-10)
    camera.far = distance * 1000
    camera.up.set(0, 1, 0)
    camera.updateProjectionMatrix()
    controls.target.copy(center)
    controls.update()
  }

  useEffect(() => {
    const content = contentRef.current
    const scene = sceneRef.current
    if (!content || !scene) return
    while (content.children.length) {
      const child = content.children[0]!
      content.remove(child)
      child.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
    }
    if (!mesh) return
    const positions = new Float32Array(mesh.triangles.length * 9)
    const colors = new Float32Array(mesh.triangles.length * 9)
    const color = new THREE.Color()
    mesh.triangles.forEach((triangle, faceIndex) => {
      triangle.forEach((nodeIndex, corner) => {
        const node = mesh.nodes[nodeIndex]!
        const offset = faceIndex * 9 + corner * 3
        positions[offset] = node.x
        positions[offset + 1] = node.y
        positions[offset + 2] = node.z ?? 0
        const value = elementValues ? values[mesh.triangleElements[faceIndex]!] ?? 0 : values[nodeIndex] ?? 0
        colorAt(value, minimum, maximum, color)
        colors[offset] = color.r
        colors[offset + 1] = color.g
        colors[offset + 2] = color.b
      })
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox!
    const center = bounds.getCenter(new THREE.Vector3())
    geometry.translate(-center.x, -center.y, -center.z)
    const material = new THREE.MeshStandardMaterial({ vertexColors: view === 'results', color: view === 'results' ? '#ffffff' : '#77a7c7', roughness: 0.55, metalness: 0.03, side: THREE.DoubleSide, wireframe: wireframe || showMesh })
    content.add(new THREE.Mesh(geometry, material))
    const size = bounds.getSize(new THREE.Vector3())
    const scale = Math.max(size.x, size.y, size.z)
    const oldHelpers = scene.getObjectByName('result-reference')
    if (oldHelpers) {
      scene.remove(oldHelpers)
      oldHelpers.traverse((object) => {
        if (object instanceof THREE.LineSegments || object instanceof THREE.Line) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((item) => item.dispose())
        }
      })
    }
    const helpers = new THREE.Group()
    helpers.name = 'result-reference'
    const grid = new THREE.GridHelper(scale * 2, 12, '#aebbc5', '#dce2e7')
    grid.position.y = -size.y / 2 - scale * 0.04
    const axes = new THREE.AxesHelper(scale * 0.25)
    axes.position.copy(bounds.min).sub(center)
    helpers.add(grid, axes)
    scene.add(helpers)
    setView('iso')
  }, [mesh, view, values, minimum, maximum, elementValues, showMesh, wireframe])

  return <div className="geometry-3d" data-testid="tetrahedral-3d">
    <div className="geometry-3d-toolbar">
      <span>{view === 'results' ? result?.physics === 'electrostatics' ? <Zap size={15} /> : result?.physics === 'elasticity' ? <Box size={15} /> : <Thermometer size={15} /> : <Box size={15} />}{view === 'results' ? '3D FEM results' : 'Tetrahedral mesh'}</span>
      <button onClick={() => setView('fit')} title="Fit 3D view"><Maximize2 size={14} />Fit</button>
      <button onClick={() => setView('iso')}><Rotate3D size={14} />Iso</button>
      <button onClick={() => setView('front')}>Front</button>
      <button onClick={() => setView('top')}>Top</button>
      <button className={wireframe ? 'active' : ''} onClick={() => setWireframe((value) => !value)}><Grid3X3 size={14} />Wireframe</button>
    </div>
    <div className="geometry-3d-host" ref={host} />
    {(error || generated.error) && <div className="geometry-3d-error" role="alert">{error || generated.error}</div>}
    {ready && !error && !generated.error && mesh && <div className="geometry-3d-caption"><strong>{view === 'results' ? `${field.label} · ${minimum.toExponential(3)} … ${maximum.toExponential(3)} ${field.unit}` : 'Linear tetrahedral elements'}</strong><span>{mesh.nodes.length.toLocaleString()} nodes · {mesh.tetrahedra.length.toLocaleString()} tetrahedra · {mesh.nz} Z divisions</span><small>{view === 'results' ? `External surface colors · ${elementValues ? 'constant element values' : 'P1 nodal interpolation'} inside each tetrahedron` : 'Prismatic tetrahedralization · drag to inspect'}</small></div>}
    {view === 'results' && !resultMesh && <div className="geometry-3d-error" role="status">Compute this 3D model to display its tetrahedral solution.</div>}
  </div>
}
