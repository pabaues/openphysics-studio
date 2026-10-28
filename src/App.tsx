import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FilePlus2,
  Flame,
  FolderOpen,
  Gauge,
  Grid3X3,
  LoaderCircle,
  Play,
  RotateCcw,
  Save,
  Waves,
  Zap,
} from 'lucide-react'
import { AdaptivePanel } from '@/components/AdaptivePanel'
import { ModelTree, type NodeId } from '@/components/ModelTree'
import { Inspector } from '@/components/Inspector'
import { ConvergencePanel } from '@/components/ConvergencePanel'
import { DerivedValuesPanel } from '@/components/DerivedValuesPanel'
import { SweepPanel } from '@/components/SweepPanel'
import { SimulationCanvas, type ResultQuantity, type ViewMode } from '@/components/SimulationCanvas'
import { downloadText, toCsv, toDerivedCsv, toHtmlReport, toSweepCsv, toVtk } from '@/lib/fem/exporters'
import { modelSignature, parseProjectJson } from '@/lib/fem/project'
import { parseGeometryFile } from '@/lib/fem/geometry'
import { heatResultAtTime } from '@/lib/fem/heat'
import { createStudyJobClient } from '@/lib/fem/jobClient'
import { createExampleModel, examplePresetGroups, type ExamplePresetId } from '@/lib/fem/presets'
import { type SweepReport } from '@/lib/fem/sweep'
import { solveActiveModel } from '@/lib/fem/study'
import { defaultModel, type ActivePhysics, type AdaptiveReport, type AnySimulationResult, type ConvergenceReport, type HeatModel } from '@/lib/fem/types'
import './App.css'

const initialModel = structuredClone(defaultModel)
const initialSignature = modelSignature(initialModel)
const thermalNodes: NodeId[] = ['physics', 'left', 'right', 'top', 'bottom']
const electricNodes: NodeId[] = ['electrostatics', 'electricLeft', 'electricRight', 'electricTop', 'electricBottom']
const structuralNodes: NodeId[] = ['elasticity', 'structuralLeft', 'structuralRight', 'structuralTop', 'structuralBottom']

function App() {
  const [model, setModel] = useState<HeatModel>(initialModel)
  const [result, setResult] = useState<AnySimulationResult | null>(() => solveActiveModel(initialModel))
  const [resultSignature, setResultSignature] = useState(initialSignature)
  const [convergenceReport, setConvergenceReport] = useState<ConvergenceReport | null>(null)
  const [adaptiveReport, setAdaptiveReport] = useState<AdaptiveReport | null>(null)
  const [sweepReport, setSweepReport] = useState<SweepReport | null>(null)
  const [selectedCase, setSelectedCase] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [selected, setSelected] = useState<NodeId>('results')
  const [view, setView] = useState<ViewMode>('results')
  const [quantity, setQuantity] = useState<ResultQuantity>('temperature')
  const [showMesh, setShowMesh] = useState(false)
  const [computing, setComputing] = useState(false)
  const [converging, setConverging] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const jobClient = useRef<ReturnType<typeof createStudyJobClient> | null>(null)
  const operation = useRef(0)
  const stale = modelSignature(model) !== resultSignature
  const busy = computing || converging

  const getJobClient = () => {
    jobClient.current ??= createStudyJobClient()
    return jobClient.current
  }
  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3500)
  }
  const updateModel = (next: HeatModel) => {
    operation.current += 1
    setComputing(false)
    setConverging(false)
    setModel(next)
    setConvergenceReport(null)
    setAdaptiveReport(null)
    setSweepReport(null)
    setFrameIndex(0)
  }
  const compute = async (candidate = model) => {
    const request = ++operation.current
    setComputing(true)
    try {
      const next = await getJobClient().compute(candidate)
      if (request !== operation.current) return
      setResult(next)
      setResultSignature(modelSignature(candidate))
      setConvergenceReport(null)
      setAdaptiveReport(null)
      setSweepReport(null)
      setFrameIndex(next.physics === 'heat' && next.transient ? next.transient.frames.length - 1 : 0)
      setView('results')
      setSelected('results')
      const detail = next.solver === 'direct' ? `Direct solution completed · ${next.relativeResidual.toExponential(1)} residual` : `Solution converged in ${next.iterations} iterations`
      notify(next.converged ? detail : 'Solver stopped before reaching tolerance', next.converged ? 'success' : 'error')
    } catch (error) {
      if (request === operation.current) notify(error instanceof Error ? error.message : 'Unable to compute this model', 'error')
    } finally {
      if (request === operation.current) setComputing(false)
    }
  }
  const runConvergence = async () => {
    const request = ++operation.current
    setConverging(true)
    try {
      const report = await getJobClient().convergence(model)
      if (request !== operation.current) return
      setConvergenceReport(report)
      setSweepReport(null)
      setResult(report.finest)
      setResultSignature(modelSignature(model))
      setFrameIndex(report.finest.physics === 'heat' && report.finest.transient ? report.finest.transient.frames.length - 1 : 0)
      setView('results')
      setSelected('results')
      notify(report.converged ? `Convergence study completed: ${report.entries.length} grids` : 'A grid did not reach solver tolerance', report.converged ? 'success' : 'error')
    } catch (error) {
      if (request === operation.current) notify(error instanceof Error ? error.message : 'Unable to run convergence study', 'error')
    } finally {
      if (request === operation.current) setConverging(false)
    }
  }
  const runAdaptive = async () => {
    const request = ++operation.current
    setConverging(true)
    try {
      const report = await getJobClient().adaptive(model)
      if (request !== operation.current) return
      setAdaptiveReport(report)
      setConvergenceReport(null)
      setSweepReport(null)
      setResult(report.finest)
      setResultSignature(modelSignature(model))
      setView('results')
      setSelected('adaptive')
      notify(`Adaptive study completed: ${report.entries.length} levels`)
    } catch (error) {
      if (request === operation.current) notify(error instanceof Error ? error.message : 'Unable to run adaptive study', 'error')
    } finally {
      if (request === operation.current) setConverging(false)
    }
  }
  const runSweep = async () => {
    const request = ++operation.current
    setConverging(true)
    try {
      const report = await getJobClient().sweep(model)
      if (request !== operation.current) return
      setSweepReport(report)
      setConvergenceReport(null)
      setAdaptiveReport(null)
      setSelectedCase(0)
      setResult(report.cases[0]!.result)
      setResultSignature(modelSignature(model))
      setFrameIndex(0)
      setView('results')
      setSelected('sweep')
      notify(`Parametric sweep completed: ${report.cases.length} cases`)
    } catch (error) {
      if (request === operation.current) notify(error instanceof Error ? error.message : 'Unable to run parametric sweep', 'error')
    } finally {
      if (request === operation.current) setConverging(false)
    }
  }
  const loadModel = (next: HeatModel) => {
    setModel(next)
    void compute(next)
  }
  const importGeometry = async (file: File) => {
    try {
      const geometry = parseGeometryFile(file.name, await file.text())
      updateModel({ ...model, geometry })
      setSelected('geometry')
      setView('geometry')
      notify(`Imported ${geometry.vertices.length}-vertex polygon from ${file.name}`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to import this geometry', 'error')
    }
  }
  const displayResult = result?.physics === 'heat' ? heatResultAtTime(result, frameIndex) : result
  const exportFile = (format: 'csv' | 'vtk' | 'json' | 'derived' | 'html' | 'sweep') => {
    if (format === 'json') {
      downloadText(`${model.name.replaceAll(' ', '-').toLowerCase()}.opmodel.json`, JSON.stringify(model, null, 2), 'application/json')
      return
    }
    if (format === 'sweep' && sweepReport) {
      downloadText('parametric-sweep.csv', toSweepCsv(sweepReport), 'text/csv')
      return
    }
    if (!displayResult) return
    const stem = displayResult.physics === 'heat' ? 'temperature-field' : displayResult.physics === 'electrostatics' ? 'electric-potential' : displayResult.physics === 'custom' ? 'custom-scalar-field' : 'structural-displacement'
    if (format === 'csv') downloadText(`${stem}.csv`, toCsv(displayResult), 'text/csv')
    if (format === 'vtk') downloadText(`${stem}.vtk`, toVtk(displayResult))
    if (format === 'derived') downloadText('derived-values.csv', toDerivedCsv(displayResult), 'text/csv')
    if (format === 'html') downloadText('simulation-report.html', toHtmlReport(model, displayResult), 'text/html')
  }

  useEffect(() => () => {
    operation.current += 1
    jobClient.current?.dispose()
    jobClient.current = null
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void compute() }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); exportFile('json') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const modelForPhysics = (physics: ActivePhysics): HeatModel => {
    const common = ['geometry.width', 'geometry.height']
    const applicable = physics === 'heat'
      ? [...common, 'material.conductivity', 'physics.heatSource']
      : physics === 'electrostatics' ? [...common, 'material.relativePermittivity', 'electrostatics.chargeDensity', 'electrostatics.leftVoltage', 'electrostatics.rightVoltage']
        : physics === 'elasticity' ? [...common, 'material.youngsModulus'] : common
    const fallback: HeatModel['sweep']['parameter'] = physics === 'heat' ? 'material.conductivity' : physics === 'electrostatics' ? 'material.relativePermittivity' : physics === 'elasticity' ? 'material.youngsModulus' : 'geometry.width'
    return {
      ...model,
      activePhysics: physics,
      study: { ...model.study, type: physics === 'heat' ? model.study.type : 'stationary' },
      sweep: { ...model.sweep, parameter: applicable.includes(model.sweep.parameter) ? model.sweep.parameter : fallback },
    }
  }
  const changePhysics = (physics: ActivePhysics) => {
    updateModel(modelForPhysics(physics))
    setQuantity(physics === 'heat' ? 'temperature' : physics === 'electrostatics' ? 'potential' : physics === 'custom' ? 'custom' : 'displacement')
    setSelected(physics === 'heat' ? 'physics' : physics === 'electrostatics' ? 'electrostatics' : physics === 'custom' ? 'custom' : 'elasticity')
  }
  const selectNode = (node: NodeId) => {
    if (thermalNodes.includes(node) && model.activePhysics !== 'heat') updateModel(modelForPhysics('heat'))
    if (electricNodes.includes(node) && model.activePhysics !== 'electrostatics') updateModel(modelForPhysics('electrostatics'))
    if (structuralNodes.includes(node) && model.activePhysics !== 'elasticity') updateModel(modelForPhysics('elasticity'))
    if (node === 'custom' && model.activePhysics !== 'custom') updateModel(modelForPhysics('custom'))
    if (thermalNodes.includes(node)) setQuantity('temperature')
    if (electricNodes.includes(node)) setQuantity('potential')
    if (structuralNodes.includes(node)) setQuantity('displacement')
    if (node === 'custom') setQuantity('custom')
    setSelected(node)
    if (node === 'geometry') setView('geometry')
    if (node === 'mesh') setView('mesh')
    if (node === 'results') setView('results')
  }
  const choosePreset = (preset: ExamplePresetId) => {
    const next = createExampleModel(preset)
    setQuantity(next.activePhysics === 'heat' ? 'temperature' : next.activePhysics === 'electrostatics' ? 'potential' : next.activePhysics === 'custom' ? 'custom' : 'displacement')
    loadModel(next)
  }

  const resultUnit = quantity === 'vonMises' ? 'Pa' : result?.physics === 'elasticity' ? 'm' : result?.physics === 'electrostatics' ? quantity === 'electricField' ? 'V/m' : 'V' : result?.physics === 'custom' ? quantity === 'customGradient' ? '|∇u|' : 'u' : quantity === 'flux' ? 'W/m²' : '°C'
  const physicsName = model.activePhysics === 'heat' ? 'Heat Transfer in Solids' : model.activePhysics === 'electrostatics' ? 'Electrostatics' : model.activePhysics === 'custom' ? 'Custom Scalar PDE' : 'Linear Elasticity'
  const quantityValues: number[] = !displayResult ? [] : displayResult.physics === 'elasticity'
    ? quantity === 'vonMises' ? displayResult.vonMises : displayResult.displacement.map((value) => value.magnitude)
    : displayResult.physics === 'electrostatics' ? quantity === 'electricField' ? displayResult.electricField.map((value) => value.magnitude) : displayResult.potential
      : displayResult.physics === 'custom' ? quantity === 'customGradient' ? displayResult.gradient.map((value) => value.magnitude) : displayResult.values
        : quantity === 'flux' ? displayResult.flux.map((value) => value.magnitude) : displayResult.temperature
  const metricMinimum = quantityValues.length ? Math.min(...quantityValues) : 0
  const metricMaximum = quantityValues.length ? Math.max(...quantityValues) : 0
  const metricAverage = quantityValues.length ? quantityValues.reduce((sum, value) => sum + value, 0) / quantityValues.length : 0

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><Waves size={23} /></div><div><strong>OpenPhysics</strong><span>STUDIO</span></div></div>
      <div className="header-divider" />
      <div className="document-actions">
        <button title="New model" onClick={() => loadModel(structuredClone(defaultModel))}><FilePlus2 size={15} /></button>
        <button title="Open model" onClick={() => fileInput.current?.click()}><FolderOpen size={15} /></button>
        <button title="Save model (Ctrl+S)" onClick={() => exportFile('json')}><Save size={15} /></button>
        <input ref={fileInput} type="file" accept=".json,.opmodel.json" hidden onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          try { loadModel(parseProjectJson(await file.text())) } catch (error) { notify(error instanceof Error ? error.message : 'Invalid model file', 'error') }
          event.target.value = ''
        }} />
      </div>
      <input className="document-name" value={model.name} onChange={(event) => updateModel({ ...model, name: event.target.value })} aria-label="Model name" />
      <span className="saved-state"><Check size={12} />Local project</span><div className="header-spacer" />
      <span className="community-badge">COMMUNITY PREVIEW</span>
      <button className="help-button" title="About the numerical models" onClick={() => notify('P1 FEM · Heat conduction · Electrostatics · Linear elasticity · Automated mesh convergence')}><CircleHelp size={17} /></button>
    </header>

    <div className="ribbon">
      <div className="ribbon-group preset-group"><Flame size={16} className="text-orange-500" /><select aria-label="Example model" onChange={(event) => choosePreset(event.target.value as ExamplePresetId)} value=""><option value="" disabled>Example models</option>{examplePresetGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>)}</select><ChevronDown size={12} /></div>
      <div className="ribbon-separator" />
      <button className="ribbon-button" onClick={() => selectNode('geometry')}><Box size={16} /><span>Geometry</span></button>
      <div className="physics-picker">{model.activePhysics === 'heat' ? <Flame size={15} /> : model.activePhysics === 'electrostatics' ? <Zap size={15} /> : model.activePhysics === 'custom' ? <Activity size={15} /> : <Box size={15} />}<select aria-label="Active physics" value={model.activePhysics} onChange={(event) => changePhysics(event.target.value as ActivePhysics)}><option value="heat">Heat Transfer</option><option value="electrostatics">Electrostatics</option><option value="elasticity">Linear Elasticity</option><option value="custom">Custom scalar PDE</option></select><Activity size={12} /></div>
      <button className="ribbon-button" onClick={() => selectNode('mesh')}><Grid3X3 size={16} /><span>Mesh</span></button>
      <div className="header-spacer" />{stale && <span className="outdated-label">Model modified</span>}
      <button className="compute-button" disabled={busy} onClick={() => compute()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Play size={15} fill="currentColor" />}{converging ? 'Studying…' : computing ? 'Computing…' : 'Compute'}<kbd>Ctrl ↵</kbd></button>
    </div>

    <main className="workspace">
      <ModelTree selected={selected} onSelect={selectNode} hasResults={!!result && !stale} activePhysics={model.activePhysics} />
      <section className="center-panel">
        <div className="viewport-toolbar">
          <div className="view-tabs"> {(['geometry', 'mesh', 'results'] as const).map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}</div>
          <div className="header-spacer" />
          {view === 'results' && <>
            <select className="quantity-select" value={quantity} onChange={(event) => setQuantity(event.target.value as ResultQuantity)} aria-label="Result quantity">
              {result?.physics === 'electrostatics' ? <><option value="potential">Electric potential (V)</option><option value="electricField">Electric field (V/m)</option></> : result?.physics === 'elasticity' ? <><option value="displacement">Displacement magnitude (m)</option><option value="vonMises">von Mises stress (Pa)</option></> : result?.physics === 'custom' ? <><option value="custom">Scalar field u</option><option value="customGradient">Gradient magnitude |∇u|</option></> : <><option value="temperature">Temperature (°C)</option><option value="flux">Heat flux (W/m²)</option></>}
            </select>
            <label className="mesh-toggle"><input type="checkbox" checked={showMesh} onChange={(event) => setShowMesh(event.target.checked)} />Show mesh</label>
          </>}
          <button className="icon-button" title="Reset model" onClick={() => loadModel(structuredClone(defaultModel))}><RotateCcw size={14} /></button>
        </div>
        <SimulationCanvas model={model} result={displayResult} view={view} quantity={quantity} showMesh={showMesh} stale={stale} />
        {sweepReport && view === 'results' && <SweepPanel report={sweepReport} selectedCase={selectedCase} onSelect={(index) => {
          const selectedResult = sweepReport.cases[index]!.result
          setSelectedCase(index)
          setResult(selectedResult)
          setFrameIndex(selectedResult.physics === 'heat' && selectedResult.transient ? selectedResult.transient.frames.length - 1 : 0)
        }} onClose={() => setSweepReport(null)} onExport={() => exportFile('sweep')} />}
        {convergenceReport && view === 'results' && <ConvergencePanel report={convergenceReport} onClose={() => setConvergenceReport(null)} />}
        {adaptiveReport && view === 'results' && <AdaptivePanel report={adaptiveReport} onClose={() => setAdaptiveReport(null)} />}
        {displayResult && view === 'results' && <DerivedValuesPanel result={displayResult} frameIndex={frameIndex} onFrameChange={setFrameIndex} />}
        <div className="metrics-strip">
          <div className="metric"><span>MINIMUM</span><strong>{displayResult ? metricMinimum.toExponential(3) : '—'} <small>{resultUnit}</small></strong></div>
          <div className="metric accent"><span>MAXIMUM</span><strong>{displayResult ? metricMaximum.toExponential(3) : '—'} <small>{resultUnit}</small></strong></div>
          <div className="metric"><span>FIELD AVERAGE</span><strong>{displayResult ? metricAverage.toExponential(3) : '—'} <small>{resultUnit}</small></strong></div>
          <div className="metric"><span>MESH</span><strong>{displayResult ? displayResult.mesh.nodes.length.toLocaleString() : '—'} <small>nodes</small></strong></div>
          <div className="metric solver-metric"><span>LINEAR SOLVER</span><strong className={displayResult?.converged ? 'converged' : 'not-converged'}>{displayResult ? displayResult.solver === 'direct' ? 'DIRECT LDLᵀ' : 'ITERATIVE CG' : '—'}</strong><small>{displayResult ? `${displayResult.converged ? 'Converged' : 'Check residual'} · ${displayResult.solver === 'iterative' ? `${displayResult.iterations} iterations · ` : ''}${displayResult.relativeResidual.toExponential(1)} residual` : 'Not solved'}</small></div>
        </div>
      </section>
      <Inspector model={model} selected={selected} result={displayResult} stale={stale} converging={converging} onChange={updateModel} onImportGeometry={importGeometry} onExport={exportFile} onRunConvergence={runConvergence} onRunAdaptive={runAdaptive} onRunSweep={runSweep} />
    </main>

    <footer className="status-bar"><span className={`status-indicator ${result?.converged && !stale ? 'ok' : ''}`} /><span>{converging ? 'Running successive mesh studies…' : computing ? 'Assembling and solving…' : stale ? 'Results need updating' : result?.converged ? 'Study completed successfully' : 'Ready'}</span><span className="status-divider">|</span><span>2D · {physicsName}</span><div className="header-spacer" /><Gauge size={12} /><span>{result ? `${result.solveTimeMs.toFixed(1)} ms` : '—'}</span><span className="status-divider">|</span><span>Local session</span><Download size={12} /><span>Open data</span></footer>
    {toast && <div className={`toast ${toast.type}`} role="status">{toast.type === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}{toast.text}</div>}
  </div>
}

export default App
