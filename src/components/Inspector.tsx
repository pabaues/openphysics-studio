import { Download, FileJson, Info, LoaderCircle, ShieldCheck, TrendingUp } from 'lucide-react'
import type { NodeId } from './ModelTree'
import type { AnySimulationResult, BoundaryCondition, ElectricBoundaryCondition, HeatModel } from '@/lib/fem/types'

interface InspectorProps {
  model: HeatModel
  selected: NodeId
  result: AnySimulationResult | null
  stale: boolean
  converging: boolean
  onChange: (model: HeatModel) => void
  onExport: (format: 'csv' | 'vtk' | 'json') => void
  onRunConvergence: () => void
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

export function Inspector({ model, selected, result, stale, converging, onChange, onExport, onRunConvergence }: InspectorProps) {
  const updatePhysics = (patch: Partial<HeatModel['physics']>) => onChange({ ...model, activePhysics: 'heat', physics: { ...model.physics, ...patch } })
  const updateElectric = (patch: Partial<HeatModel['electrostatics']>) => onChange({ ...model, activePhysics: 'electrostatics', electrostatics: { ...model.electrostatics, ...patch } })
  const electricBoundary = selected.replace('electric', '').toLowerCase() as 'left' | 'right' | 'top' | 'bottom'
  const isElectricBoundary = selected.startsWith('electric')
  const resultIsElectric = result?.physics === 'electrostatics'
  const finestDivisions = Math.max(model.mesh.nx, model.mesh.ny) * 2 ** (model.convergence.levels - 1)

  return (
    <aside className="inspector" aria-label="Settings">
      <div className="panel-heading"><span>Settings</span><Info size={14} /></div>
      <div className="inspector-scroll">
        {selected === 'geometry' && <Section eyebrow="Geometry sequence" title="Parametric rectangle" description="Dimensions propagate to the mesh and every subsequent study.">
          <NumberField label="Width" value={model.geometry.width} unit="m" min={0.001} max={1000} step={0.01} onChange={(width) => onChange({ ...model, geometry: { ...model.geometry, width } })} />
          <NumberField label="Height" value={model.geometry.height} unit="m" min={0.001} max={1000} step={0.01} onChange={(height) => onChange({ ...model, geometry: { ...model.geometry, height } })} />
          <div className="selection-card"><span className="selection-dot" />Domain 1 selected<strong>1 domain · 4 boundaries</strong></div>
        </Section>}

        {selected === 'material' && <Section eyebrow="Materials" title="Isotropic solid" description="Constant properties shared by the available physics interfaces.">
          <NumberField label="Thermal conductivity" value={model.material.conductivity} unit="W/(m·K)" min={0.000001} step={1} onChange={(conductivity) => onChange({ ...model, material: { ...model.material, conductivity } })} />
          <NumberField label="Relative permittivity" value={model.material.relativePermittivity} unit="εᵣ" min={0.000001} step={0.5} onChange={(relativePermittivity) => onChange({ ...model, material: { ...model.material, relativePermittivity } })} />
          <div className="property-row"><span>Model</span><strong>Linear, isotropic</strong></div><div className="property-row"><span>Domain</span><strong>All domains</strong></div>
        </Section>}

        {selected === 'physics' && <Section eyebrow="Heat transfer in solids" title="Energy balance" description="Stationary conduction with a uniform volumetric heat source.">
          <div className="equation-box primary">∇ · (−k∇T) = Q</div>
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

        {selected === 'mesh' && <Section eyebrow="Mesh sequence" title="Mapped triangles" description="A structured grid split into first-order triangular finite elements.">
          <label className="field-label"><span>Horizontal divisions <b>{model.mesh.nx}</b></span><input type="range" min="4" max="64" step="2" value={model.mesh.nx} onChange={(e) => onChange({ ...model, mesh: { ...model.mesh, nx: Number(e.target.value) } })} /></label>
          <label className="field-label"><span>Vertical divisions <b>{model.mesh.ny}</b></span><input type="range" min="4" max="64" step="2" value={model.mesh.ny} onChange={(e) => onChange({ ...model, mesh: { ...model.mesh, ny: Number(e.target.value) } })} /></label>
          <div className="mesh-summary"><strong>{((model.mesh.nx + 1) * (model.mesh.ny + 1)).toLocaleString()}</strong><span>nodes</span><strong>{(2 * model.mesh.nx * model.mesh.ny).toLocaleString()}</strong><span>triangles</span></div>
        </Section>}

        {selected === 'study' && <Section eyebrow="Study 1" title="Stationary solver" description="Sparse symmetric system solved with Jacobi-preconditioned conjugate gradients.">
          <label className="field-label"><span>Relative tolerance</span><select value={model.study.tolerance} onChange={(e) => onChange({ ...model, study: { ...model.study, tolerance: Number(e.target.value) } })}><option value={1e-6}>10⁻⁶</option><option value={1e-9}>10⁻⁹</option><option value={1e-12}>10⁻¹²</option></select></label>
          <NumberField label="Maximum iterations" value={model.study.maxIterations} min={10} max={20000} step={100} onChange={(maxIterations) => onChange({ ...model, study: { ...model.study, maxIterations } })} />
          <div className="solver-note"><ShieldCheck size={16} /><span>Residual-based convergence is always reported.</span></div>
        </Section>}

        {selected === 'convergence' && <Section eyebrow="Study 1 · Automation" title="Mesh convergence" description="Solve successively refined ×2 grids and estimate self-convergence from their differences.">
          <label className="field-label"><span>Grid levels</span><select value={model.convergence.levels} onChange={(e) => onChange({ ...model, convergence: { levels: Number(e.target.value) } })}><option value={2}>2 levels</option><option value={3}>3 levels · observed order</option><option value={4}>4 levels</option></select></label>
          <div className="property-row"><span>Sequence</span><strong>{Array.from({ length: model.convergence.levels }, (_, i) => model.mesh.nx * 2 ** i).join(' → ')}</strong></div>
          <div className="property-row"><span>Finest divisions</span><strong>{finestDivisions} max.</strong></div>
          {finestDivisions > 128 && <div className="validation-note">Reduce the base mesh or levels: the finest grid is limited to 128 divisions per direction.</div>}
          <button className="study-button" disabled={converging || finestDivisions > 128} onClick={onRunConvergence}>{converging ? <LoaderCircle size={15} className="spin" /> : <TrendingUp size={15} />}{converging ? 'Running study…' : 'Run convergence study'}</button>
          <div className="solver-note neutral"><ShieldCheck size={16} /><span>L2 differences compare successive grids; they are not exact-solution errors.</span></div>
        </Section>}

        {selected === 'results' && <Section eyebrow="Results" title="Export and provenance" description="Nodal values and mesh connectivity use open, documented formats.">
          <button className="export-button" disabled={!result} onClick={() => onExport('csv')}><Download size={15} /><span>Export {resultIsElectric ? 'potential' : 'temperature'}</span><b>CSV</b></button>
          <button className="export-button" disabled={!result} onClick={() => onExport('vtk')}><Download size={15} /><span>Export field + mesh</span><b>VTK</b></button>
          <button className="export-button" onClick={() => onExport('json')}><FileJson size={15} /><span>Export model</span><b>JSON</b></button>
          {result && <div className="property-row"><span>Dataset</span><strong>{stale ? 'Out of date' : resultIsElectric ? 'Electric solution' : 'Thermal solution'}</strong></div>}
        </Section>}
      </div>
      <div className="inspector-foot">Open model · Open data · Verifiable math</div>
    </aside>
  )
}
