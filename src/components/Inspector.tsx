import { useState } from 'react'
import { Download, FileJson, FileText, FileUp, Info, LoaderCircle, Play, ShieldCheck, TrendingUp } from 'lucide-react'
import type { NodeId } from './ModelTree'
import { multiDomainGeometry, rectangleGeometry, signedPolygonArea } from '@/lib/fem/geometry'
import { boundaryOverrideKey } from '@/lib/fem/boundary'
import { materialForDomain } from '@/lib/fem/properties'
import { near } from '@/lib/fem/scalar'
import { sweepParameters } from '@/lib/fem/sweep'
import type { AnySimulationResult, BoundaryCondition, CustomBoundaryCondition, ElectricBoundaryCondition, HeatModel, Material, StructuralBoundaryCondition, SweepParameter } from '@/lib/fem/types'

interface InspectorProps {
  model: HeatModel
  selected: NodeId
  result: AnySimulationResult | null
  stale: boolean
  converging: boolean
  onChange: (model: HeatModel) => void
  onImportGeometry: (file: File) => void
  onExport: (format: 'csv' | 'vtk' | 'json' | 'derived' | 'html' | 'sweep') => void
  onRunConvergence: () => void
  onRunAdaptive: () => void
  onRunSweep: () => void
}

function NumberField({ label, value, unit, min, max, step = 1, onChange }: {
  label: string
  value: number
  unit?: string
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return <label className="field-label"><span>{label}</span><span className="number-field"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber) }} />{unit && <span>{unit}</span>}</span></label>
}

function Section({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <><div className="inspector-title"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><div className="inspector-section">{children}</div></>
}

function ThermalBoundary({ condition, onChange }: { condition: BoundaryCondition; onChange: (condition: BoundaryCondition) => void }) {
  return <>
    <label className="field-label"><span>Boundary condition</span><select value={condition.type} onChange={(event) => onChange(event.target.value === 'insulated' ? { type: 'insulated' } : { type: 'temperature', value: 20 })}><option value="temperature">Temperature</option><option value="insulated">Thermal insulation</option></select></label>
    {condition.type === 'temperature' && <NumberField label="Temperature" value={condition.value} unit="°C" min={-273.15} max={10000} onChange={(value) => onChange({ type: 'temperature', value })} />}
    <div className="equation-box">−k∇T · n = 0 <span>when insulated</span></div>
  </>
}

function ElectricBoundary({ condition, onChange }: { condition: ElectricBoundaryCondition; onChange: (condition: ElectricBoundaryCondition) => void }) {
  return <>
    <label className="field-label"><span>Boundary condition</span><select value={condition.type} onChange={(event) => onChange(event.target.value === 'zeroCharge' ? { type: 'zeroCharge' } : { type: 'potential', value: 0 })}><option value="potential">Electric potential</option><option value="zeroCharge">Zero charge / symmetry</option></select></label>
    {condition.type === 'potential' && <NumberField label="Potential" value={condition.value} unit="V" min={-1e9} max={1e9} onChange={(value) => onChange({ type: 'potential', value })} />}
    <div className="equation-box">−ε∇V · n = 0 <span>natural zero-charge condition</span></div>
  </>
}

function CustomBoundary({ condition, onChange }: { condition: CustomBoundaryCondition; onChange: (condition: CustomBoundaryCondition) => void }) {
  return <>
    <label className="field-label"><span>Boundary condition</span><select value={condition.type} onChange={(event) => onChange({ type: event.target.value as CustomBoundaryCondition['type'], value: condition.value })}><option value="dirichlet">Dirichlet · u = g</option><option value="neumann">Neumann · flux = g</option></select></label>
    <NumberField label="Boundary value g" value={condition.value} step={0.1} onChange={(value) => onChange({ ...condition, value })} />
  </>
}

function StructuralBoundary({ condition, onChange }: { condition: StructuralBoundaryCondition; onChange: (condition: StructuralBoundaryCondition) => void }) {
  return <>
    <label className="field-label"><span>Boundary condition</span><select value={condition.type} onChange={(event) => {
      const type = event.target.value as StructuralBoundaryCondition['type']
      onChange(type === 'normalDisplacement' ? { type, value: 0 } : type === 'traction' ? { type, x: 0, y: 0 } : { type })
    }}><option value="free">Free / zero traction</option><option value="fixed">Fixed displacement</option><option value="roller">Roller / normal symmetry</option><option value="normalDisplacement">Prescribed normal displacement</option><option value="traction">Boundary traction</option></select></label>
    {condition.type === 'normalDisplacement' && <NumberField label="Normal displacement" value={condition.value} unit="m" min={-1000} max={1000} step={0.00001} onChange={(value) => onChange({ type: 'normalDisplacement', value })} />}
    {condition.type === 'traction' && <><NumberField label="Traction X" value={condition.x} unit="N/m²" min={-1e15} max={1e15} step={1000} onChange={(x) => onChange({ type: 'traction', x, y: condition.y })} /><NumberField label="Traction Y" value={condition.y} unit="N/m²" min={-1e15} max={1e15} step={1000} onChange={(y) => onChange({ type: 'traction', x: condition.x, y })} /></>}
    <div className="equation-box">u · n = uₙ <span>traction uses consistent P1 edge loads; rollers release tangential displacement</span></div>
  </>
}

function EdgeBoundaryEditor({ model, physics, onChange }: { model: HeatModel; physics: keyof HeatModel['edgeBoundaries']; onChange: (model: HeatModel) => void }) {
  const [selection, setSelection] = useState('0:0')
  const [requestedDomain, requestedEdge] = selection.split(':').map(Number)
  const domainIndex = model.geometry.domains[requestedDomain] ? requestedDomain : 0
  const domain = model.geometry.domains[domainIndex]!
  const vertices = domain.vertices
  const edge = (requestedEdge ?? 0) % vertices.length
  const key = boundaryOverrideKey(domainIndex, edge)
  const a = vertices[edge]!
  const b = vertices[(edge + 1) % vertices.length]!
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const { width, height } = model.geometry
  const heatDefault: BoundaryCondition = near(midpoint.x, 0, width) ? { type: 'temperature', value: model.physics.leftTemperature }
    : near(midpoint.x, width, width) ? { type: 'temperature', value: model.physics.rightTemperature }
      : near(midpoint.y, 0, height) ? model.physics.bottom : near(midpoint.y, height, height) ? model.physics.top : { type: 'insulated' }
  const electricDefault: ElectricBoundaryCondition = near(midpoint.x, 0, width) ? { type: 'potential', value: model.electrostatics.leftVoltage }
    : near(midpoint.x, width, width) ? { type: 'potential', value: model.electrostatics.rightVoltage }
      : near(midpoint.y, 0, height) ? model.electrostatics.bottom : near(midpoint.y, height, height) ? model.electrostatics.top : { type: 'zeroCharge' }
  const structuralDefault: StructuralBoundaryCondition = near(midpoint.x, 0, width) ? model.elasticity.left
    : near(midpoint.x, width, width) ? model.elasticity.right : near(midpoint.y, 0, height) ? model.elasticity.bottom
      : near(midpoint.y, height, height) ? model.elasticity.top : { type: 'free' }
  const customDefault: CustomBoundaryCondition = near(midpoint.x, 0, width) ? model.custom.left
    : near(midpoint.x, width, width) ? model.custom.right : near(midpoint.y, 0, height) ? model.custom.bottom
      : near(midpoint.y, height, height) ? model.custom.top : { type: 'neumann', value: 0 }
  const update = (condition: BoundaryCondition | ElectricBoundaryCondition | StructuralBoundaryCondition | CustomBoundaryCondition) => {
    const edgeBoundaries = structuredClone(model.edgeBoundaries)
    if (physics === 'heat') edgeBoundaries.heat[key] = condition as BoundaryCondition
    if (physics === 'electrostatics') edgeBoundaries.electrostatics[key] = condition as ElectricBoundaryCondition
    if (physics === 'elasticity') edgeBoundaries.elasticity[key] = condition as StructuralBoundaryCondition
    if (physics === 'custom') edgeBoundaries.custom[key] = condition as CustomBoundaryCondition
    onChange({ ...model, edgeBoundaries })
  }
  const reset = () => {
    const edgeBoundaries = structuredClone(model.edgeBoundaries)
    delete edgeBoundaries[physics][key]
    onChange({ ...model, edgeBoundaries })
  }
  return <div className="inspector-section">
    <div className="property-row"><span>Arbitrary boundary selection</span><strong>{Object.keys(model.edgeBoundaries[physics]).length} overrides</strong></div>
    <label className="field-label"><span>Domain / boundary edge</span><select aria-label={`${physics} boundary edge`} value={`${domainIndex}:${edge}`} onChange={(event) => setSelection(event.target.value)}>{model.geometry.domains.flatMap((item, itemIndex) => item.vertices.map((vertex, index) => <option key={`${itemIndex}:${index}`} value={`${itemIndex}:${index}`}>{item.name} · Edge {index} · ({vertex.x.toPrecision(3)}, {vertex.y.toPrecision(3)})</option>))}</select></label>
    {physics === 'heat' && <ThermalBoundary condition={model.edgeBoundaries.heat[key] ?? heatDefault} onChange={update} />}
    {physics === 'electrostatics' && <ElectricBoundary condition={model.edgeBoundaries.electrostatics[key] ?? electricDefault} onChange={update} />}
    {physics === 'elasticity' && <StructuralBoundary condition={model.edgeBoundaries.elasticity[key] ?? structuralDefault} onChange={update} />}
    {physics === 'custom' && <CustomBoundary condition={model.edgeBoundaries.custom[key] ?? customDefault} onChange={update} />}
    <button className="export-button" onClick={reset}>Use named boundary default</button>
  </div>
}

export function Inspector({ model, selected, result, stale, converging, onChange, onImportGeometry, onExport, onRunConvergence, onRunAdaptive, onRunSweep }: InspectorProps) {
  const [selectedDomain, setSelectedDomain] = useState(0)
  const domainIndex = model.geometry.domains[selectedDomain] ? selectedDomain : 0
  const activeDomain = model.geometry.domains[domainIndex]!
  const activeMaterial = materialForDomain(model, domainIndex)
  const updateMaterial = (patch: Partial<Material>) => {
    if (domainIndex === 0) onChange({ ...model, material: { ...model.material, ...patch } })
    else onChange({ ...model, domainMaterials: { ...model.domainMaterials, [activeDomain.id]: { ...activeMaterial, ...patch } } })
  }
  const addDomain = () => {
    const gap = model.geometry.width * 0.1
    const width = model.geometry.width * 0.5
    const x = model.geometry.width + gap
    let sequence = model.geometry.domains.length + 1
    while (model.geometry.domains.some((domain) => domain.id === `domain-${sequence}`)) sequence += 1
    const id = `domain-${sequence}`
    const domain = { id, name: `Domain ${sequence}`, vertices: [{ x, y: 0 }, { x: x + width, y: 0 }, { x: x + width, y: model.geometry.height }, { x, y: model.geometry.height }] }
    onChange({ ...model, geometry: multiDomainGeometry([...model.geometry.domains, domain]), domainMaterials: { ...model.domainMaterials, [id]: structuredClone(activeMaterial) } })
    setSelectedDomain(model.geometry.domains.length)
  }
  const removeDomain = () => {
    if (model.geometry.domains.length === 1) return
    const retained = model.geometry.domains.filter((_, index) => index !== domainIndex)
    const domainMaterials = structuredClone(model.domainMaterials)
    delete domainMaterials[activeDomain.id]
    const material = domainIndex === 0 ? materialForDomain(model, 1) : model.material
    if (domainIndex === 0) delete domainMaterials[retained[0]!.id]
    onChange({ ...model, material, geometry: multiDomainGeometry(retained), domainMaterials })
    setSelectedDomain(0)
  }
  const updatePhysics = (patch: Partial<HeatModel['physics']>) => onChange({ ...model, activePhysics: 'heat', physics: { ...model.physics, ...patch } })
  const updateElectric = (patch: Partial<HeatModel['electrostatics']>) => onChange({ ...model, activePhysics: 'electrostatics', electrostatics: { ...model.electrostatics, ...patch } })
  const updateStructural = (patch: Partial<HeatModel['elasticity']>) => onChange({ ...model, activePhysics: 'elasticity', study: { ...model.study, type: 'stationary' }, elasticity: { ...model.elasticity, ...patch } })
  const updateCustom = (patch: Partial<HeatModel['custom']>) => onChange({ ...model, activePhysics: 'custom', study: { ...model.study, type: 'stationary' }, custom: { ...model.custom, ...patch } })
  const electricBoundary = selected.replace('electric', '').toLowerCase() as 'left' | 'right' | 'top' | 'bottom'
  const structuralBoundary = selected.replace('structural', '').toLowerCase() as 'left' | 'right' | 'top' | 'bottom'
  const isElectricBoundary = selected.startsWith('electric')
  const isStructuralBoundary = selected.startsWith('structural')
  const isPolygon = model.geometry.shape === 'polygon'
  const resultName = result?.physics === 'electrostatics' ? 'potential' : result?.physics === 'elasticity' ? 'displacement' : result?.physics === 'custom' ? 'scalar field' : 'temperature'
  const finestDivisions = Math.max(model.mesh.nx, model.mesh.ny) * 2 ** (model.convergence.levels - 1)
  const baseRefinement = model.mesh.refinement ?? 1
  const finestRefinement = baseRefinement + model.convergence.levels - 1
  const estimatedTriangles = model.geometry.domains.reduce((sum, domain) => sum + domain.vertices.length - 2, 0) * 4 ** finestRefinement
  const convergenceTooLarge = isPolygon ? finestRefinement > 5 || estimatedTriangles > 100000 : finestDivisions > 128
  const geometryImport = <label className="study-button geometry-import"><FileUp size={15} />Import SVG or CSV<input aria-label="Geometry file" type="file" accept=".svg,.csv" hidden onChange={(event) => {
    const file = event.target.files?.[0]
    if (file) onImportGeometry(file)
    event.target.value = ''
  }} /></label>

  return (
    <aside className="inspector" aria-label="Settings">
      <div className="panel-heading"><span>Settings</span><Info size={14} /></div>
      <div className="inspector-scroll">
        {selected === 'geometry' && <Section eyebrow="Geometry sequence" title={model.geometry.domains.length > 1 ? `${model.geometry.domains.length} geometry domains` : isPolygon ? 'Simple polygon' : 'Parametric rectangle'} description="Independent polygon domains share nodes only across complete matching edges.">
          <label className="field-label"><span>Active domain</span><select aria-label="Active domain" value={domainIndex} onChange={(event) => setSelectedDomain(Number(event.target.value))}>{model.geometry.domains.map((domain, index) => <option key={domain.id} value={index}>{domain.name}</option>)}</select></label>
          {!isPolygon && model.geometry.domains.length === 1 && <>
            <NumberField label="Width" value={model.geometry.width} unit="m" min={0.001} max={1000} step={0.01} onChange={(width) => onChange({ ...model, geometry: rectangleGeometry(width, model.geometry.height) })} />
            <NumberField label="Height" value={model.geometry.height} unit="m" min={0.001} max={1000} step={0.01} onChange={(height) => onChange({ ...model, geometry: rectangleGeometry(model.geometry.width, height) })} />
          </>}
          {isPolygon && <>
            <div className="property-row"><span>Domain vertices</span><strong>{activeDomain.vertices.length}</strong></div>
            <div className="property-row"><span>Global bounding box</span><strong>{model.geometry.width.toPrecision(4)} × {model.geometry.height.toPrecision(4)} m</strong></div>
            <div className="property-row"><span>Active domain area</span><strong>{signedPolygonArea(activeDomain.vertices).toPrecision(5)} m²</strong></div>
            {model.geometry.domains.length === 1 && <button className="export-button" onClick={() => onChange({ ...model, geometry: rectangleGeometry(model.geometry.width, model.geometry.height) })}>Use parametric rectangle</button>}
          </>}
          <button className="study-button" disabled={model.geometry.domains.length >= 16} onClick={addDomain}>Add disconnected rectangle domain</button>
          <button className="export-button" disabled={model.geometry.domains.length === 1} onClick={removeDomain}>Remove active domain</button>
          {geometryImport}
          <div className="selection-card"><span className="selection-dot" />{activeDomain.name} selected<strong>{model.geometry.domains.length} {model.geometry.domains.length === 1 ? 'domain' : 'domains'} · {activeDomain.vertices.length} active boundary segments</strong></div>
          {isPolygon && <div className="solver-note neutral"><Info size={16} /><span>CSV/SVG import replaces the geometry with one polygon. To build connected domains, use the composite preset or construct matching polygons through the API.</span></div>}
          <div className="solver-note neutral"><Info size={16} /><span>Overlaps and partial-edge contacts are rejected. Internal matching edges become continuous material interfaces; named conditions apply only at global extrema.</span></div>
        </Section>}

        {selected === 'material' && <Section eyebrow="Materials" title={`${activeDomain.name} · isotropic solid`} description="Domain-specific properties with optional linear spatial gradients, c(x,y) = c₀ + gx x + gy y.">
          <label className="field-label"><span>Material domain</span><select aria-label="Material domain" value={domainIndex} onChange={(event) => setSelectedDomain(Number(event.target.value))}>{model.geometry.domains.map((domain, index) => <option key={domain.id} value={index}>{domain.name}</option>)}</select></label>
          <NumberField label="Thermal conductivity" value={activeMaterial.conductivity} unit="W/(m·K)" min={0.000001} step={1} onChange={(conductivity) => updateMaterial({ conductivity })} />
          <NumberField label="Conductivity gradient X" value={activeMaterial.gradients.conductivityX} unit="W/(m²·K)" step={1} onChange={(conductivityX) => updateMaterial({ gradients: { ...activeMaterial.gradients, conductivityX } })} />
          <NumberField label="Conductivity gradient Y" value={activeMaterial.gradients.conductivityY} unit="W/(m²·K)" step={1} onChange={(conductivityY) => updateMaterial({ gradients: { ...activeMaterial.gradients, conductivityY } })} />
          <NumberField label="Density" value={activeMaterial.density} unit="kg/m³" min={0.000001} step={100} onChange={(density) => updateMaterial({ density })} />
          <NumberField label="Heat capacity" value={activeMaterial.heatCapacity} unit="J/(kg·K)" min={0.000001} step={25} onChange={(heatCapacity) => updateMaterial({ heatCapacity })} />
          <NumberField label="Relative permittivity" value={activeMaterial.relativePermittivity} unit="εᵣ" min={0.000001} step={0.5} onChange={(relativePermittivity) => updateMaterial({ relativePermittivity })} />
          <NumberField label="Permittivity gradient X" value={activeMaterial.gradients.permittivityX} unit="1/m" step={0.1} onChange={(permittivityX) => updateMaterial({ gradients: { ...activeMaterial.gradients, permittivityX } })} />
          <NumberField label="Permittivity gradient Y" value={activeMaterial.gradients.permittivityY} unit="1/m" step={0.1} onChange={(permittivityY) => updateMaterial({ gradients: { ...activeMaterial.gradients, permittivityY } })} />
          <NumberField label="Young’s modulus" value={activeMaterial.youngsModulus} unit="Pa" min={0.000001} max={1e15} step={1e9} onChange={(youngsModulus) => updateMaterial({ youngsModulus })} />
          <NumberField label="Young modulus gradient X" value={activeMaterial.gradients.youngsModulusX} unit="Pa/m" step={1e9} onChange={(youngsModulusX) => updateMaterial({ gradients: { ...activeMaterial.gradients, youngsModulusX } })} />
          <NumberField label="Young modulus gradient Y" value={activeMaterial.gradients.youngsModulusY} unit="Pa/m" step={1e9} onChange={(youngsModulusY) => updateMaterial({ gradients: { ...activeMaterial.gradients, youngsModulusY } })} />
          <NumberField label="Poisson’s ratio" value={activeMaterial.poissonRatio} unit="ν" min={-0.99} max={0.499999} step={0.01} onChange={(poissonRatio) => updateMaterial({ poissonRatio })} />
          <NumberField label="Thermal expansion" value={activeMaterial.thermalExpansion} unit="1/K" min={-0.01} max={0.01} step={0.000001} onChange={(thermalExpansion) => updateMaterial({ thermalExpansion })} />
          <div className="property-row"><span>Model</span><strong>Linear, isotropic</strong></div><div className="property-row"><span>Assignment</span><strong>{activeDomain.name}</strong></div>
        </Section>}

        {selected === 'physics' && <Section eyebrow="Heat transfer in solids" title="Energy balance" description="Stationary or transient conduction with a uniform volumetric heat source.">
          <div className="equation-box primary">{model.study.type === 'transient' ? 'ρCₚ ∂T/∂t + ∇ · (−k∇T) = Q' : '∇ · (−k∇T) = Q'}</div>
          <NumberField label="Heat source Q" value={model.physics.heatSource} unit="W/m³" min={-1e12} max={1e12} step={10000} onChange={(heatSource) => updatePhysics({ heatSource })} />
          <div className="property-row"><span>Discretization</span><strong>Linear triangular FEM</strong></div>
          <EdgeBoundaryEditor model={model} physics="heat" onChange={onChange} />
        </Section>}

        {(selected === 'left' || selected === 'right') && <Section eyebrow="Thermal boundary" title={`${selected === 'left' ? 'Left' : 'Right'} boundary`} description="Prescribed temperature applied through Dirichlet elimination.">
          <NumberField label="Temperature" value={selected === 'left' ? model.physics.leftTemperature : model.physics.rightTemperature} unit="°C" min={-273.15} max={10000} onChange={(value) => updatePhysics(selected === 'left' ? { leftTemperature: value } : { rightTemperature: value })} />
          <div className="equation-box">T = T₀ <span>on ∂Ω</span></div>
        </Section>}
        {(selected === 'top' || selected === 'bottom') && <Section eyebrow="Thermal boundary" title={`${selected === 'top' ? 'Top' : 'Bottom'} boundary`} description="Choose a fixed temperature or zero normal heat flux."><ThermalBoundary condition={model.physics[selected]} onChange={(condition) => updatePhysics({ [selected]: condition })} /></Section>}

        {selected === 'electrostatics' && <Section eyebrow="Electrostatics" title="Gauss’s law" description="Stationary electric potential with uniform space-charge density.">
          <div className="equation-box primary">∇ · (−ε∇V) = ρ</div>
          <NumberField label="Space charge ρ" value={model.electrostatics.chargeDensity} unit="C/m³" min={-1e6} max={1e6} step={1e-9} onChange={(chargeDensity) => updateElectric({ chargeDensity })} />
          <div className="property-row"><span>Permittivity</span><strong>ε = εᵣε₀</strong></div><div className="property-row"><span>Derived quantity</span><strong>E = −∇V</strong></div>
          <EdgeBoundaryEditor model={model} physics="electrostatics" onChange={onChange} />
        </Section>}

        {isElectricBoundary && <Section eyebrow="Electric boundary" title={`${electricBoundary[0]!.toUpperCase() + electricBoundary.slice(1)} boundary`} description="Prescribe potential or impose zero normal electric displacement.">
          {(electricBoundary === 'left' || electricBoundary === 'right')
            ? <><NumberField label="Electric potential" value={electricBoundary === 'left' ? model.electrostatics.leftVoltage : model.electrostatics.rightVoltage} unit="V" min={-1e9} max={1e9} onChange={(value) => updateElectric(electricBoundary === 'left' ? { leftVoltage: value } : { rightVoltage: value })} /><div className="equation-box">V = V₀ <span>on ∂Ω</span></div></>
            : <ElectricBoundary condition={model.electrostatics[electricBoundary]} onChange={(condition) => updateElectric({ [electricBoundary]: condition })} />}
        </Section>}

        {selected === 'elasticity' && <Section eyebrow="Solid mechanics" title="Linear elasticity" description="Small-strain isotropic elasticity with two displacement components per node.">
          <div className="equation-box primary">∇ · σ + b = 0, &nbsp; σ = D : ε</div>
          <label className="field-label"><span>2D formulation</span><select aria-label="Plane formulation" value={model.elasticity.planeState} onChange={(event) => updateStructural({ planeState: event.target.value as HeatModel['elasticity']['planeState'] })}><option value="planeStress">Plane stress</option><option value="planeStrain">Plane strain</option></select></label>
          <NumberField label="Body force X" value={model.elasticity.bodyForceX} unit="N/m³" min={-1e15} max={1e15} step={1000} onChange={(bodyForceX) => updateStructural({ bodyForceX })} />
          <NumberField label="Body force Y" value={model.elasticity.bodyForceY} unit="N/m³" min={-1e15} max={1e15} step={1000} onChange={(bodyForceY) => updateStructural({ bodyForceY })} />
          <label className="mesh-toggle"><input type="checkbox" checked={model.elasticity.thermalCoupling} onChange={(event) => updateStructural({ thermalCoupling: event.target.checked })} />One-way thermal expansion</label>
          {model.elasticity.thermalCoupling && <NumberField label="Reference temperature" value={model.elasticity.referenceTemperature} unit="°C" min={-273.15} max={10000} onChange={(referenceTemperature) => updateStructural({ referenceTemperature })} />}
          <div className="property-row"><span>Discretization</span><strong>P1 triangles · 2 DOF/node</strong></div>
          <div className="property-row"><span>Stress output</span><strong>Elementwise von Mises</strong></div>
          <EdgeBoundaryEditor model={model} physics="elasticity" onChange={onChange} />
        </Section>}

        {isStructuralBoundary && <Section eyebrow="Structural boundary" title={`${structuralBoundary[0]!.toUpperCase() + structuralBoundary.slice(1)} boundary`} description="Free, fixed, roller, or prescribed normal-displacement conditions.">
          <StructuralBoundary condition={model.elasticity[structuralBoundary]} onChange={(condition) => updateStructural({ [structuralBoundary]: condition })} />
        </Section>}

        {selected === 'custom' && <Section eyebrow="User-defined physics" title="Scalar convection-free PDE" description="Constant-coefficient diffusion–reaction equation with Dirichlet and Neumann boundaries.">
          <div className="equation-box primary">−∇ · (c∇u) + au = f</div>
          <NumberField label="Diffusion c" value={model.custom.diffusion} min={0.000001} max={1e12} step={0.1} onChange={(diffusion) => updateCustom({ diffusion })} />
          <NumberField label="Reaction a" value={model.custom.reaction} min={0} max={1e12} step={0.1} onChange={(reaction) => updateCustom({ reaction })} />
          <NumberField label="Source f" value={model.custom.source} min={-1e12} max={1e12} step={0.1} onChange={(source) => updateCustom({ source })} />
          <div className="property-row"><span>Discretization</span><strong>P1 triangles · consistent mass</strong></div>
          <EdgeBoundaryEditor model={model} physics="custom" onChange={onChange} />
        </Section>}

        {selected === 'mesh' && <Section eyebrow="Mesh sequence" title={isPolygon ? 'Unstructured triangles' : 'Mapped triangles'} description={isPolygon ? 'Earcut triangulation followed by nested one-to-four red refinement.' : 'A structured grid split into first-order triangular finite elements.'}>
          {!isPolygon && <>
            <label className="field-label"><span>Horizontal divisions <b>{model.mesh.nx}</b></span><input type="range" min="4" max="64" step="2" value={model.mesh.nx} onChange={(e) => onChange({ ...model, mesh: { ...model.mesh, nx: Number(e.target.value) } })} /></label>
            <label className="field-label"><span>Vertical divisions <b>{model.mesh.ny}</b></span><input type="range" min="4" max="64" step="2" value={model.mesh.ny} onChange={(e) => onChange({ ...model, mesh: { ...model.mesh, ny: Number(e.target.value) } })} /></label>
            <div className="mesh-summary"><strong>{((model.mesh.nx + 1) * (model.mesh.ny + 1)).toLocaleString()}</strong><span>nodes</span><strong>{(2 * model.mesh.nx * model.mesh.ny).toLocaleString()}</strong><span>triangles</span></div>
          </>}
          {isPolygon && <>
            <label className="field-label"><span>Refinement level <b>R{baseRefinement}</b></span><input aria-label="Polygon refinement" type="range" min="0" max="4" step="1" value={baseRefinement} onChange={(event) => onChange({ ...model, mesh: { ...model.mesh, refinement: Number(event.target.value) } })} /></label>
            <div className="mesh-summary"><strong>{model.geometry.vertices.length}</strong><span>boundary vertices</span><strong>{((model.geometry.vertices.length - 2) * 4 ** baseRefinement).toLocaleString()}</strong><span>triangles</span></div>
            <div className="property-row"><span>Element size</span><strong>h ÷ 2 per level</strong></div>
            <div className="solver-note neutral"><ShieldCheck size={16} /><span>Red refinement preserves coarse node indices, enabling direct nested-grid convergence comparisons.</span></div>
          </>}
        </Section>}

        {selected === 'study' && <Section eyebrow="Study 1" title={model.study.type === 'transient' ? 'Transient solver' : 'Stationary solver'} description={model.study.solver === 'direct' ? 'Sparse LDLᵀ factorization for symmetric positive-definite systems, with the true residual reported.' : 'Sparse systems solved with Jacobi-preconditioned conjugate gradients and reported residuals.'}>
          <label className="field-label"><span>Study type</span><select aria-label="Study type" value={model.study.type} onChange={(event) => {
            const type = event.target.value as HeatModel['study']['type']
            onChange({ ...model, activePhysics: type === 'transient' ? 'heat' : model.activePhysics, study: { ...model.study, type } })
          }}><option value="stationary">Stationary</option><option value="transient">Transient heat · implicit Euler</option></select></label>
          <label className="field-label"><span>Linear solver</span><select aria-label="Linear solver" value={model.study.solver} onChange={(event) => onChange({ ...model, study: { ...model.study, solver: event.target.value as HeatModel['study']['solver'] } })}><option value="iterative">Iterative conjugate gradients</option><option value="direct">Direct LDLᵀ · sparse</option></select></label>
          {model.study.solver === 'iterative' && <label className="field-label"><span>Preconditioner</span><select aria-label="Preconditioner" value={model.study.preconditioner} onChange={(event) => onChange({ ...model, study: { ...model.study, preconditioner: event.target.value as HeatModel['study']['preconditioner'] } })}><option value="jacobi">Jacobi</option><option value="ic0">Incomplete Cholesky · IC(0)</option></select></label>}
          <label className="field-label"><span>Matrix ordering</span><select aria-label="Matrix ordering" value={model.study.ordering} onChange={(event) => onChange({ ...model, study: { ...model.study, ordering: event.target.value as HeatModel['study']['ordering'] } })}><option value="rcm">Reverse Cuthill–McKee</option><option value="natural">Natural</option></select></label>
          {model.study.type === 'transient' && <>
            <NumberField label="Initial temperature" value={model.transient.initialTemperature} unit="°C" min={-273.15} max={10000} onChange={(initialTemperature) => onChange({ ...model, transient: { ...model.transient, initialTemperature } })} />
            <NumberField label="Duration" value={model.transient.duration} unit="s" min={0.000001} step={1} onChange={(duration) => onChange({ ...model, transient: { ...model.transient, duration } })} />
            <NumberField label="Time steps" value={model.transient.timeSteps} min={1} max={10000} step={10} onChange={(timeSteps) => onChange({ ...model, transient: { ...model.transient, timeSteps: Math.round(timeSteps) } })} />
            <NumberField label="Output intervals" value={model.transient.outputSteps} min={1} max={100} step={1} onChange={(outputSteps) => onChange({ ...model, transient: { ...model.transient, outputSteps: Math.round(outputSteps) } })} />
            <div className="solver-note neutral"><ShieldCheck size={16} /><span>First-order implicit Euler with consistent P1 mass matrices. Electrostatics remains stationary.</span></div>
          </>}
          <label className="field-label"><span>Relative tolerance</span><select value={model.study.tolerance} onChange={(e) => onChange({ ...model, study: { ...model.study, tolerance: Number(e.target.value) } })}><option value={1e-6}>10⁻⁶</option><option value={1e-9}>10⁻⁹</option><option value={1e-12}>10⁻¹²</option></select></label>
          <NumberField label="Maximum iterations" value={model.study.maxIterations} min={10} max={20000} step={100} onChange={(maxIterations) => onChange({ ...model, study: { ...model.study, maxIterations } })} />
          <div className="solver-note"><ShieldCheck size={16} /><span>Residual-based convergence is always reported.</span></div>
        </Section>}

        {selected === 'sweep' && <Section eyebrow="Study 1 · Automation" title="Parametric sweep" description="Solve independent model copies for 2–12 values and compare derived quantities.">
          <label className="field-label"><span>Parameter</span><select aria-label="Sweep parameter" value={model.sweep.parameter} onChange={(event) => onChange({ ...model, sweep: { ...model.sweep, parameter: event.target.value as SweepParameter } })}>{Object.entries(sweepParameters).filter(([parameter, metadata]) => (!isPolygon || !parameter.startsWith('geometry.')) && (metadata.physics === 'both' || metadata.physics === model.activePhysics)).map(([parameter, metadata]) => <option key={parameter} value={parameter}>{metadata.label}</option>)}</select></label>
          <label className="field-label"><span>Values · comma separated</span><input key={`${model.sweep.parameter}-${model.sweep.values.join(',')}`} aria-label="Sweep values" className="text-field" defaultValue={model.sweep.values.join(', ')} onBlur={(event) => {
            const values = event.target.value.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value))
            onChange({ ...model, sweep: { ...model.sweep, values } })
          }} /></label>
          <div className="property-row"><span>Selected parameter</span><strong>{sweepParameters[model.sweep.parameter].unit || 'dimensionless'}</strong></div>
          <button className="study-button" disabled={converging || (isPolygon && model.activePhysics === 'custom')} onClick={onRunSweep}><Play size={15} />Run parametric sweep</button>
          <div className="solver-note neutral"><ShieldCheck size={16} /><span>{isPolygon && model.activePhysics === 'custom' ? 'Custom scalar physics currently exposes only geometry parameters for sweeps, so polygon sweeps are unavailable.' : isPolygon ? 'Bounding-box sweeps are unavailable for polygons; material and physics parameters remain available.' : 'Every case is schema-validated and solved independently. Select a result row to inspect its field.'}</span></div>
        </Section>}

        {selected === 'convergence' && <Section eyebrow="Study 1 · Automation" title="Mesh convergence" description="Halve the element size at every level and estimate self-convergence from successive solutions.">
          <label className="field-label"><span>Grid levels</span><select value={model.convergence.levels} onChange={(e) => onChange({ ...model, convergence: { levels: Number(e.target.value) } })}><option value={2}>2 levels</option><option value={3}>3 levels · observed order</option><option value={4}>4 levels</option></select></label>
          <label className="field-label"><span>Verification reference</span><select aria-label="Manufactured solution" value={model.study.manufacturedSolution} onChange={(event) => onChange({ ...model, study: { ...model.study, manufacturedSolution: event.target.value as HeatModel['study']['manufacturedSolution'] } })}><option value="none">Successive grids only</option><option value="scalarSine">Scalar sine · exact error</option><option value="logarithmic">Logarithmic heat · exact error</option></select></label>
          <div className="property-row"><span>Sequence</span><strong>{isPolygon ? Array.from({ length: model.convergence.levels }, (_, i) => `R${baseRefinement + i}`).join(' → ') : Array.from({ length: model.convergence.levels }, (_, i) => model.mesh.nx * 2 ** i).join(' → ')}</strong></div>
          <div className="property-row"><span>{isPolygon ? 'Finest mesh' : 'Finest divisions'}</span><strong>{isPolygon ? `${estimatedTriangles.toLocaleString()} triangles · R${finestRefinement}` : `${finestDivisions} max.`}</strong></div>
          {convergenceTooLarge && <div className="validation-note">{isPolygon ? 'Reduce polygon refinement or levels: the finest mesh is limited to R5 and 100,000 triangles.' : 'Reduce the base mesh or levels: the finest grid is limited to 128 divisions per direction.'}</div>}
          <button className="study-button" disabled={converging || convergenceTooLarge} onClick={onRunConvergence}>{converging ? <LoaderCircle size={15} className="spin" /> : <TrendingUp size={15} />}{converging ? 'Running study…' : 'Run convergence study'}</button>
          <div className="solver-note neutral"><ShieldCheck size={16} /><span>L2 differences compare successive grids; they are not exact-solution errors.</span></div>
        </Section>}

        {selected === 'adaptive' && <Section eyebrow="Study 1 · Automation" title="Error-guided adaptation" description="Recover nodal gradients, mark the largest element indicators and bisect while preserving a conforming mesh.">
          <label className="field-label"><span>Adaptive levels</span><select value={model.adaptive.levels} onChange={(event) => onChange({ ...model, adaptive: { ...model.adaptive, levels: Number(event.target.value) } })}>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
          <label className="field-label"><span>Marked fraction <b>{Math.round(model.adaptive.markFraction * 100)}%</b></span><input aria-label="Adaptive marked fraction" type="range" min="0.05" max="1" step="0.05" value={model.adaptive.markFraction} onChange={(event) => onChange({ ...model, adaptive: { ...model.adaptive, markFraction: Number(event.target.value) } })} /></label>
          <button className="study-button" disabled={converging || model.activePhysics === 'elasticity' || model.study.type === 'transient'} onClick={onRunAdaptive}>{converging ? <LoaderCircle size={15} className="spin" /> : <TrendingUp size={15} />}Run adaptive study</button>
          <div className="solver-note neutral"><ShieldCheck size={16} /><span>Available for stationary scalar physics. The indicator is not a guaranteed error bound; select a manufactured reference in Mesh convergence to also report exact errors.</span></div>
        </Section>}

        {selected === 'results' && <Section eyebrow="Results" title="Export and provenance" description="Nodal values and mesh connectivity use open, documented formats.">
          <button className="export-button" disabled={!result} onClick={() => onExport('csv')}><Download size={15} /><span>Export {resultName}</span><b>CSV</b></button>
          <button className="export-button" disabled={!result} onClick={() => onExport('vtk')}><Download size={15} /><span>Export {result?.physics === 'elasticity' ? 'displacement + von Mises + mesh' : 'field + mesh'}</span><b>VTK</b></button>
          <button className="export-button" disabled={!result} onClick={() => onExport('derived')}><Download size={15} /><span>Export derived values</span><b>CSV</b></button>
          <button className="export-button" disabled={!result} onClick={() => onExport('html')}><FileText size={15} /><span>Export simulation report</span><b>HTML</b></button>
          <button className="export-button" onClick={() => onExport('json')}><FileJson size={15} /><span>Export model</span><b>JSON</b></button>
          {result && <div className="property-row"><span>Dataset</span><strong>{stale ? 'Out of date' : result?.physics === 'elasticity' ? 'Structural solution' : result?.physics === 'electrostatics' ? 'Electric solution' : result?.physics === 'custom' ? 'Custom scalar solution' : 'Thermal solution'}</strong></div>}
        </Section>}
      </div>
      <div className="inspector-foot">Open model · Open data · Verifiable math</div>
    </aside>
  )
}
