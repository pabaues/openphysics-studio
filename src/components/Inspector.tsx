import { Download, FileJson, FileText, FileUp, Info, LoaderCircle, Play, ShieldCheck, TrendingUp } from 'lucide-react'
import type { NodeId } from './ModelTree'
import { rectangleGeometry, signedPolygonArea } from '@/lib/fem/geometry'
import { sweepParameters } from '@/lib/fem/sweep'
import type { AnySimulationResult, BoundaryCondition, ElectricBoundaryCondition, HeatModel, StructuralBoundaryCondition, SweepParameter } from '@/lib/fem/types'

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

function StructuralBoundary({ condition, onChange }: { condition: StructuralBoundaryCondition; onChange: (condition: StructuralBoundaryCondition) => void }) {
  return <>
    <label className="field-label"><span>Boundary condition</span><select value={condition.type} onChange={(event) => {
      const type = event.target.value as StructuralBoundaryCondition['type']
      onChange(type === 'normalDisplacement' ? { type, value: 0 } : { type })
    }}><option value="free">Free / zero traction</option><option value="fixed">Fixed displacement</option><option value="roller">Roller / normal symmetry</option><option value="normalDisplacement">Prescribed normal displacement</option></select></label>
    {condition.type === 'normalDisplacement' && <NumberField label="Normal displacement" value={condition.value} unit="m" min={-1000} max={1000} step={0.00001} onChange={(value) => onChange({ type: 'normalDisplacement', value })} />}
    <div className="equation-box">u · n = uₙ <span>tangential displacement remains free for roller conditions</span></div>
  </>
}

export function Inspector({ model, selected, result, stale, converging, onChange, onImportGeometry, onExport, onRunConvergence, onRunSweep }: InspectorProps) {
  const updatePhysics = (patch: Partial<HeatModel['physics']>) => onChange({ ...model, activePhysics: 'heat', physics: { ...model.physics, ...patch } })
  const updateElectric = (patch: Partial<HeatModel['electrostatics']>) => onChange({ ...model, activePhysics: 'electrostatics', electrostatics: { ...model.electrostatics, ...patch } })
  const updateStructural = (patch: Partial<HeatModel['elasticity']>) => onChange({ ...model, activePhysics: 'elasticity', study: { ...model.study, type: 'stationary' }, elasticity: { ...model.elasticity, ...patch } })
  const electricBoundary = selected.replace('electric', '').toLowerCase() as 'left' | 'right' | 'top' | 'bottom'
  const structuralBoundary = selected.replace('structural', '').toLowerCase() as 'left' | 'right' | 'top' | 'bottom'
  const isElectricBoundary = selected.startsWith('electric')
  const isStructuralBoundary = selected.startsWith('structural')
  const isPolygon = model.geometry.shape === 'polygon'
  const resultName = result?.physics === 'electrostatics' ? 'potential' : result?.physics === 'elasticity' ? 'displacement' : 'temperature'
  const finestDivisions = Math.max(model.mesh.nx, model.mesh.ny) * 2 ** (model.convergence.levels - 1)
  const baseRefinement = model.mesh.refinement ?? 1
  const finestRefinement = baseRefinement + model.convergence.levels - 1
  const estimatedTriangles = (model.geometry.vertices.length - 2) * 4 ** finestRefinement
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
        {selected === 'geometry' && <Section eyebrow="Geometry sequence" title={isPolygon ? 'Simple polygon' : 'Parametric rectangle'} description={isPolygon ? 'An imported 2D boundary, normalized to Cartesian coordinates in metres.' : 'Dimensions propagate to the mesh and every subsequent study.'}>
          {!isPolygon && <>
            <NumberField label="Width" value={model.geometry.width} unit="m" min={0.001} max={1000} step={0.01} onChange={(width) => onChange({ ...model, geometry: rectangleGeometry(width, model.geometry.height) })} />
            <NumberField label="Height" value={model.geometry.height} unit="m" min={0.001} max={1000} step={0.01} onChange={(height) => onChange({ ...model, geometry: rectangleGeometry(model.geometry.width, height) })} />
          </>}
          {isPolygon && <>
            <div className="property-row"><span>Boundary vertices</span><strong>{model.geometry.vertices.length}</strong></div>
            <div className="property-row"><span>Bounding box</span><strong>{model.geometry.width.toPrecision(4)} × {model.geometry.height.toPrecision(4)} m</strong></div>
            <div className="property-row"><span>Domain area</span><strong>{signedPolygonArea(model.geometry.vertices).toPrecision(5)} m²</strong></div>
            <button className="export-button" onClick={() => onChange({ ...model, geometry: rectangleGeometry(model.geometry.width, model.geometry.height) })}>Use parametric rectangle</button>
          </>}
          {geometryImport}
          <div className="selection-card"><span className="selection-dot" />Domain 1 selected<strong>1 domain · {model.geometry.vertices.length} boundary segments</strong></div>
          {isPolygon && <div className="solver-note neutral"><Info size={16} /><span>CSV: x,y rows. SVG: one polygon, polyline or linear path (M/L/H/V/Z). SVG Y is inverted; curves, holes and multiple subpaths are not supported.</span></div>}
          {isPolygon && <div className="solver-note neutral"><Info size={16} /><span>Named conditions apply at the bounding-box extrema. Every other polygon edge keeps its natural boundary condition.</span></div>}
        </Section>}

        {selected === 'material' && <Section eyebrow="Materials" title="Isotropic solid" description="Constant properties shared by the available physics interfaces.">
          <NumberField label="Thermal conductivity" value={model.material.conductivity} unit="W/(m·K)" min={0.000001} step={1} onChange={(conductivity) => onChange({ ...model, material: { ...model.material, conductivity } })} />
          <NumberField label="Density" value={model.material.density} unit="kg/m³" min={0.000001} step={100} onChange={(density) => onChange({ ...model, material: { ...model.material, density } })} />
          <NumberField label="Heat capacity" value={model.material.heatCapacity} unit="J/(kg·K)" min={0.000001} step={25} onChange={(heatCapacity) => onChange({ ...model, material: { ...model.material, heatCapacity } })} />
          <NumberField label="Relative permittivity" value={model.material.relativePermittivity} unit="εᵣ" min={0.000001} step={0.5} onChange={(relativePermittivity) => onChange({ ...model, material: { ...model.material, relativePermittivity } })} />
          <NumberField label="Young’s modulus" value={model.material.youngsModulus} unit="Pa" min={0.000001} max={1e15} step={1e9} onChange={(youngsModulus) => onChange({ ...model, material: { ...model.material, youngsModulus } })} />
          <NumberField label="Poisson’s ratio" value={model.material.poissonRatio} unit="ν" min={-0.99} max={0.499999} step={0.01} onChange={(poissonRatio) => onChange({ ...model, material: { ...model.material, poissonRatio } })} />
          <div className="property-row"><span>Model</span><strong>Linear, isotropic</strong></div><div className="property-row"><span>Domain</span><strong>All domains</strong></div>
        </Section>}

        {selected === 'physics' && <Section eyebrow="Heat transfer in solids" title="Energy balance" description="Stationary or transient conduction with a uniform volumetric heat source.">
          <div className="equation-box primary">{model.study.type === 'transient' ? 'ρCₚ ∂T/∂t + ∇ · (−k∇T) = Q' : '∇ · (−k∇T) = Q'}</div>
          <NumberField label="Heat source Q" value={model.physics.heatSource} unit="W/m³" min={-1e12} max={1e12} step={10000} onChange={(heatSource) => updatePhysics({ heatSource })} />
          <div className="property-row"><span>Discretization</span><strong>Linear triangular FEM</strong></div>
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
          <div className="property-row"><span>Discretization</span><strong>P1 triangles · 2 DOF/node</strong></div>
          <div className="property-row"><span>Stress output</span><strong>Elementwise von Mises</strong></div>
        </Section>}

        {isStructuralBoundary && <Section eyebrow="Structural boundary" title={`${structuralBoundary[0]!.toUpperCase() + structuralBoundary.slice(1)} boundary`} description="Free, fixed, roller, or prescribed normal-displacement conditions.">
          <StructuralBoundary condition={model.elasticity[structuralBoundary]} onChange={(condition) => updateStructural({ [structuralBoundary]: condition })} />
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
          <label className="field-label"><span>Linear solver</span><select aria-label="Linear solver" value={model.study.solver} onChange={(event) => onChange({ ...model, study: { ...model.study, solver: event.target.value as HeatModel['study']['solver'] } })}><option value="iterative">Iterative CG · Jacobi</option><option value="direct">Direct LDLᵀ · sparse</option></select></label>
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
          <button className="study-button" disabled={converging} onClick={onRunSweep}><Play size={15} />Run parametric sweep</button>
          <div className="solver-note neutral"><ShieldCheck size={16} /><span>{isPolygon ? 'Bounding-box sweeps are unavailable for polygons; material and physics parameters remain available.' : 'Every case is schema-validated and solved independently. Select a result row to inspect its field.'}</span></div>
        </Section>}

        {selected === 'convergence' && <Section eyebrow="Study 1 · Automation" title="Mesh convergence" description="Halve the element size at every level and estimate self-convergence from successive solutions.">
          <label className="field-label"><span>Grid levels</span><select value={model.convergence.levels} onChange={(e) => onChange({ ...model, convergence: { levels: Number(e.target.value) } })}><option value={2}>2 levels</option><option value={3}>3 levels · observed order</option><option value={4}>4 levels</option></select></label>
          <div className="property-row"><span>Sequence</span><strong>{isPolygon ? Array.from({ length: model.convergence.levels }, (_, i) => `R${baseRefinement + i}`).join(' → ') : Array.from({ length: model.convergence.levels }, (_, i) => model.mesh.nx * 2 ** i).join(' → ')}</strong></div>
          <div className="property-row"><span>{isPolygon ? 'Finest mesh' : 'Finest divisions'}</span><strong>{isPolygon ? `${estimatedTriangles.toLocaleString()} triangles · R${finestRefinement}` : `${finestDivisions} max.`}</strong></div>
          {convergenceTooLarge && <div className="validation-note">{isPolygon ? 'Reduce polygon refinement or levels: the finest mesh is limited to R5 and 100,000 triangles.' : 'Reduce the base mesh or levels: the finest grid is limited to 128 divisions per direction.'}</div>}
          <button className="study-button" disabled={converging || convergenceTooLarge} onClick={onRunConvergence}>{converging ? <LoaderCircle size={15} className="spin" /> : <TrendingUp size={15} />}{converging ? 'Running study…' : 'Run convergence study'}</button>
          <div className="solver-note neutral"><ShieldCheck size={16} /><span>L2 differences compare successive grids; they are not exact-solution errors.</span></div>
        </Section>}

        {selected === 'results' && <Section eyebrow="Results" title="Export and provenance" description="Nodal values and mesh connectivity use open, documented formats.">
          <button className="export-button" disabled={!result} onClick={() => onExport('csv')}><Download size={15} /><span>Export {resultName}</span><b>CSV</b></button>
          <button className="export-button" disabled={!result} onClick={() => onExport('vtk')}><Download size={15} /><span>Export {result?.physics === 'elasticity' ? 'displacement + von Mises + mesh' : 'field + mesh'}</span><b>VTK</b></button>
          <button className="export-button" disabled={!result} onClick={() => onExport('derived')}><Download size={15} /><span>Export derived values</span><b>CSV</b></button>
          <button className="export-button" disabled={!result} onClick={() => onExport('html')}><FileText size={15} /><span>Export simulation report</span><b>HTML</b></button>
          <button className="export-button" onClick={() => onExport('json')}><FileJson size={15} /><span>Export model</span><b>JSON</b></button>
          {result && <div className="property-row"><span>Dataset</span><strong>{stale ? 'Out of date' : result?.physics === 'elasticity' ? 'Structural solution' : result?.physics === 'electrostatics' ? 'Electric solution' : 'Thermal solution'}</strong></div>}
        </Section>}
      </div>
      <div className="inspector-foot">Open model · Open data · Verifiable math</div>
    </aside>
  )
}
