import { useEffect, useRef, useState } from 'react'
import { Box, Grid3X3, Maximize2, Rotate3D } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { domainExtrusion } from '@/lib/fem/geometry'
import type { HeatModel } from '@/lib/fem/types'

interface Geometry3DCanvasProps {
  model: HeatModel
  selectedDomain: number
  onSelectDomain: (index: number) => void
}

const COLORS = ['#527ca5', '#c48a53', '#5d9c89', '#9a78a8', '#bc6e73', '#6c91a8']

export default function Geometry3DCanvas({ model, selectedDomain, onSelectDomain }: Geometry3DCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const solidsRef = useRef<THREE.Group | null>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const selectRef = useRef(onSelectDomain)
  const [error, setError] = useState('')
  const [wireframe, setWireframe] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => { selectRef.current = onSelectDomain }, [onSelectDomain])

  useEffect(() => {
    const container = host.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    let disposed = false
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      queueMicrotask(() => { if (!disposed) setError('WebGL is unavailable. Enable hardware acceleration or use the 2D Geometry view.') })
      return () => { disposed = true }
    }
    queueMicrotask(() => { if (!disposed) { setError(''); setReady(true) } })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D geometry. Drag to orbit, right-drag to pan, scroll to zoom, click a solid to select it.')
    renderer.domElement.setAttribute('role', 'img')
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f4f6f8')
    const camera = new THREE.PerspectiveCamera(40, 1, 1e-9, 10000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    controls.screenSpacePanning = true
    const solids = new THREE.Group()
    scene.add(solids)
    scene.add(new THREE.HemisphereLight('#ffffff', '#88929c', 2.1))
    const key = new THREE.DirectionalLight('#ffffff', 3)
    key.position.set(3, 5, 4)
    scene.add(key)
    const fill = new THREE.DirectionalLight('#dceaff', 1.1)
    fill.position.set(-3, 1, -4)
    scene.add(fill)
    sceneRef.current = scene
    cameraRef.current = camera
    controlsRef.current = controls
    solidsRef.current = solids

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down = { x: 0, y: 0 }
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    const pointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(meshesRef.current, false)[0]
      if (hit) selectRef.current(Number(hit.object.userData.domainIndex))
    }
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointerup', pointerUp)
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
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose()
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      solidsRef.current = null
      meshesRef.current = []
    }
  }, [])

  const setView = (kind: 'iso' | 'front' | 'top' | 'fit') => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const solids = solidsRef.current
    if (!camera || !controls || !solids) return
    const bounds = new THREE.Box3().setFromObject(solids)
    if (bounds.isEmpty()) return
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const radius = Math.max(size.length() / 2, 1e-9)
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
    const solids = solidsRef.current
    const scene = sceneRef.current
    if (!solids || !scene) return
    while (solids.children.length) {
      const child = solids.children[0]!
      solids.remove(child)
      child.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
    }
    const meshes: THREE.Mesh[] = []
    model.geometry.domains.forEach((domain, index) => {
      const shape = new THREE.Shape(domain.vertices.map((vertex) => new THREE.Vector2(vertex.x - model.geometry.width / 2, vertex.y - model.geometry.height / 2)))
      const { depth, z } = domainExtrusion(model.geometry, index)
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1, steps: 1 })
      geometry.translate(0, 0, z - depth / 2)
      const material = new THREE.MeshStandardMaterial({ color: COLORS[index % COLORS.length], roughness: 0.48, metalness: 0.06, transparent: true, opacity: 0.92 })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = domain.name
      mesh.userData.domainIndex = index
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: '#263b4b', transparent: true, opacity: 0.72 }))
      mesh.add(edges)
      solids.add(mesh)
      meshes.push(mesh)
    })
    meshesRef.current = meshes
    const bounds = new THREE.Box3().setFromObject(solids)
    const size = bounds.getSize(new THREE.Vector3())
    const scale = Math.max(size.x, size.y)
    const helper = new THREE.GridHelper(scale * 2, 12, '#aebbc5', '#dce2e7')
    helper.position.y = -model.geometry.height / 2 - scale * 0.04
    const axes = new THREE.AxesHelper(scale * 0.25)
    axes.position.copy(bounds.min)
    const helpers = new THREE.Group()
    helpers.name = 'reference'
    helpers.add(helper, axes)
    const oldHelpers = scene.getObjectByName('reference')
    if (oldHelpers) {
      scene.remove(oldHelpers)
      oldHelpers.traverse((object) => {
        if (object instanceof THREE.LineSegments || object instanceof THREE.Line) object.geometry.dispose()
        if (object instanceof THREE.LineSegments || object instanceof THREE.Line) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
    }
    scene.add(helpers)
    setView('iso')
  }, [model.geometry])

  useEffect(() => {
    meshesRef.current.forEach((mesh, index) => {
      const material = mesh.material as THREE.MeshStandardMaterial
      material.emissive.set(index === selectedDomain ? '#244e68' : '#000000')
      material.emissiveIntensity = index === selectedDomain ? 0.36 : 0
      material.opacity = index === selectedDomain ? 1 : 0.88
      material.wireframe = wireframe
    })
  }, [selectedDomain, wireframe, model.geometry])

  return <div className="geometry-3d" data-testid="geometry-3d">
    <div className="geometry-3d-toolbar">
      <span><Box size={15} />3D geometry</span>
      <button onClick={() => setView('fit')} title="Fit all solids"><Maximize2 size={14} />Fit</button>
      <button onClick={() => setView('iso')}><Rotate3D size={14} />Iso</button>
      <button onClick={() => setView('front')}>Front</button>
      <button onClick={() => setView('top')}>Top</button>
      <button className={wireframe ? 'active' : ''} onClick={() => setWireframe((value) => !value)}><Grid3X3 size={14} />Wireframe</button>
    </div>
    <div className="geometry-3d-host" ref={host} />
    {error && <div className="geometry-3d-error" role="alert">{error}</div>}
    {ready && !error && <div className="geometry-3d-caption"><strong>{model.geometry.domains[selectedDomain]?.name ?? 'No domain selected'}</strong><span>Drag to orbit · Right-drag to pan · Scroll to zoom</span><small>Prismatic 3D geometry · P1 tetrahedral heat, electrostatic and elastic FEM{model.activePhysics === 'heat' && model.study.type === 'transient' ? ' · Transient heat enabled' : ''}</small></div>}
  </div>
}
