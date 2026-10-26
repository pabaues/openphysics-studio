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
import { ModelTree, type NodeId } from '@/components/ModelTree'
import { Inspector } from '@/components/Inspector'
import { ConvergencePanel } from '@/components/ConvergencePanel'
import { DerivedValuesPanel } from '@/components/DerivedValuesPanel'
import { SweepPanel } from '@/components/SweepPanel'
import { SimulationCanvas, type ResultQuantity, type ViewMode } from '@/components/SimulationCanvas'
import { downloadText, toCsv, toDerivedCsv, toHtmlReport, toSweepCsv, toVtk } from '@/lib/fem/exporters'
import { heatModelSchema, modelSignature, parseProjectJson } from '@/lib/fem/project'
import { runConvergenceStudy } from '@/lib/fem/convergence'
import { heatResultAtTime } from '@/lib/fem/heat'
import { runParametricSweep, type SweepReport } from '@/lib/fem/sweep'
import { solveActiveModel } from '@/lib/fem/study'
import { defaultModel, type ActivePhysics, type AnySimulationResult, type ConvergenceReport, type HeatModel } from '@/lib/fem/types'
import './App.css'

const initialModel = structuredClone(defaultModel)
const initialSignature = modelSignature(initialModel)
const thermalNodes: NodeId[] = ['physics', 'left', 'right', 'top', 'bottom']
const electricNodes: NodeId[] = ['electrostatics', 'electricLeft', 'electricRight', 'electricTop', 'electricBottom']

function App() {
  const [model, setModel] = useState<HeatModel>(initialModel)
  const [result, setResult] = useState<AnySimulationResult | null>(() => solveActiveModel(initialModel))
  const [resultSignature, setResultSignature] = useState(initialSignature)
  const [convergenceReport, setConvergenceReport] = useState<ConvergenceReport | null>(null)
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
  const stale = modelSignature(model) !== resultSignature
  const busy = computing || converging

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3500)
  }
  const updateModel = (next: HeatModel) => {
    setModel(next)
    setConvergenceReport(null)
    setSweepReport(null)
    setFrameIndex(0)
  }
  const compute = (candidate = model) => {
    setComputing(true)
    window.setTimeout(() => {
      try {
        const validated = heatModelSchema.parse(candidate)
        const next = solveActiveModel(validated)
        setResult(next)
        setResultSignature(modelSignature(validated))
        setConvergenceReport(null)
        setSweepReport(null)
        setFrameIndex(next.physics === 'heat' && next.transient ? next.transient.frames.length - 1 : 0)
        setView('results')
        setSelected('results')
        notify(next.converged ? `Solution converged in ${next.iterations} iterations` : 'Solver stopped before reaching tolerance', next.converged ? 'success' : 'error')
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Unable to compute this model', 'error')
      } finally {
        setComputing(false)
      }
    }, 30)
  }
  const runConvergence = () => {
    setConverging(true)
    window.setTimeout(() => {
      try {
        const validated = heatModelSchema.parse(model)
        const report = runConvergenceStudy(validated)
        setConvergenceReport(report)
        setSweepReport(null)
        setResult(report.finest)
        setResultSignature(modelSignature(validated))
        setFrameIndex(report.finest.physics === 'heat' && report.finest.transient ? report.finest.transient.frames.length - 1 : 0)
        setView('results')
        setSelected('results')
        notify(report.converged ? `Convergence study completed: ${report.entries.length} grids` : 'A grid did not reach solver tolerance', report.converged ? 'success' : 'error')
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Unable to run convergence study', 'error')
      } finally {
        setConverging(false)
      }
    }, 40)
  }
  const runSweep = () => {
    setConverging(true)
    window.setTimeout(() => {
      try {
        const validated = heatModelSchema.parse(model)
        const report = runParametricSweep(validated)
        setSweepReport(report)
        setConvergenceReport(null)
        setSelectedCase(0)
        setResult(report.cases[0]!.result)
        setResultSignature(modelSignature(validated))
        setFrameIndex(0)
        setView('results')
        setSelected('sweep')
        notify(`Parametric sweep completed: ${report.cases.length} cases`)
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Unable to run parametric sweep', 'error')
      } finally {
        setConverging(false)
      }
    }, 40)
  }
  const loadModel = (next: HeatModel) => {
    setModel(next)
    compute(next)
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
    const stem = displayResult.physics === 'heat' ? 'temperature-field' : 'electric-potential'
    if (format === 'csv') downloadText(`${stem}.csv`, toCsv(displayResult), 'text/csv')
    if (format === 'vtk') downloadText(`${stem}.vtk`, toVtk(displayResult))
    if (format === 'derived') downloadText('derived-values.csv', toDerivedCsv(displayResult), 'text/csv')
    if (format === 'html') downloadText('simulation-report.html', toHtmlReport(model, displayResult), 'text/html')
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); compute() }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); exportFile('json') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const modelForPhysics = (physics: ActivePhysics): HeatModel => {
    const common = ['geometry.width', 'geometry.height']
    const applicable = physics === 'heat'
      ? [...common, 'material.conductivity', 'physics.heatSource']
      : [...common, 'material.relativePermittivity', 'electrostatics.chargeDensity']
    return {
      ...model,
      activePhysics: physics,
      study: { ...model.study, type: physics === 'electrostatics' ? 'stationary' : model.study.type },
      sweep: { ...model.sweep, parameter: applicable.includes(model.sweep.parameter) ? model.sweep.parameter : physics === 'heat' ? 'material.conductivity' : 'material.relativePermittivity' },
    }
  }
  const changePhysics = (physics: ActivePhysics) => {
    updateModel(modelForPhysics(physics))
    setQuantity(physics === 'heat' ? 'temperature' : 'potential')
    setSelected(physics === 'heat' ? 'physics' : 'electrostatics')
  }
  const selectNode = (node: NodeId) => {
    if (thermalNodes.includes(node) && model.activePhysics !== 'heat') updateModel(modelForPhysics('heat'))
    if (electricNodes.includes(node) && model.activePhysics !== 'electrostatics') updateModel(modelForPhysics('electrostatics'))
    if (thermalNodes.includes(node)) setQuantity('temperature')
    if (electricNodes.includes(node)) setQuantity('potential')
    setSelected(node)
    if (node === 'geometry') setView('geometry')
    if (node === 'mesh') setView('mesh')
    if (node === 'results') setView('results')
  }
  const choosePreset = (preset: string) => {
    const next = structuredClone(defaultModel)
    if (preset === 'bar') {
      next.name = 'Insulated conduction bar'
      next.geometry = { width: 0.2, height: 0.025 }
      next.physics = { heatSource: 0, leftTemperature: 100, rightTemperature: 20, top: { type: 'insulated' }, bottom: { type: 'insulated' } }
    }
    if (preset === 'generation') {
      next.name = 'Volumetric heating plate'
      next.geometry = { width: 0.08, height: 0.08 }
      next.material.conductivity = 15
      next.physics = { heatSource: 500000, leftTemperature: 20, rightTemperature: 20, top: { type: 'temperature', value: 20 }, bottom: { type: 'temperature', value: 20 } }
    }
    if (preset === 'electric') {
      next.name = 'Parallel plate capacitor'
      next.activePhysics = 'electrostatics'
      next.geometry = { width: 0.05, height: 0.02 }
      next.material.relativePermittivity = 4.2
      next.electrostatics = { chargeDensity: 0, leftVoltage: 0, rightVoltage: 12, top: { type: 'zeroCharge' }, bottom: { type: 'zeroCharge' } }
      next.mesh = { nx: 24, ny: 12 }
      setQuantity('potential')
    } else {
      setQuantity('temperature')
    }
    loadModel(next)
  }

  const resultUnit = result?.physics === 'electrostatics' ? 'V' : '°C'
  const physicsName = model.activePhysics === 'heat' ? 'Heat Transfer in Solids' : 'Electrostatics'

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
      <button className="help-button" title="About the numerical models" onClick={() => notify('P1 FEM · Heat conduction · Electrostatics · Automated mesh convergence')}><CircleHelp size={17} /></button>
    </header>

    <div className="ribbon">
      <div className="ribbon-group preset-group"><Flame size={16} className="text-orange-500" /><select aria-label="Example model" onChange={(event) => choosePreset(event.target.value)} value=""><option value="" disabled>Example models</option><option value="plate">Thermal plate study</option><option value="bar">Insulated conduction bar</option><option value="generation">Volumetric heating plate</option><option value="electric">Parallel plate capacitor</option></select><ChevronDown size={12} /></div>
      <div className="ribbon-separator" />
      <button className="ribbon-button" onClick={() => selectNode('geometry')}><Box size={16} /><span>Geometry</span></button>
      <div className="physics-picker">{model.activePhysics === 'heat' ? <Flame size={15} /> : <Zap size={15} />}<select aria-label="Active physics" value={model.activePhysics} onChange={(event) => changePhysics(event.target.value as ActivePhysics)}><option value="heat">Heat Transfer</option><option value="electrostatics">Electrostatics</option></select><Activity size={12} /></div>
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
              {result?.physics === 'electrostatics' ? <><option value="potential">Electric potential (V)</option><option value="electricField">Electric field (V/m)</option></> : <><option value="temperature">Temperature (°C)</option><option value="flux">Heat flux (W/m²)</option></>}
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
        {displayResult && view === 'results' && <DerivedValuesPanel result={displayResult} frameIndex={frameIndex} onFrameChange={setFrameIndex} />}
        <div className="metrics-strip">
          <div className="metric"><span>MINIMUM</span><strong>{displayResult ? displayResult.minimum.toFixed(3) : '—'} <small>{resultUnit}</small></strong></div>
          <div className="metric accent"><span>MAXIMUM</span><strong>{displayResult ? displayResult.maximum.toFixed(3) : '—'} <small>{resultUnit}</small></strong></div>
          <div className="metric"><span>NODAL AVERAGE</span><strong>{displayResult ? displayResult.average.toFixed(3) : '—'} <small>{resultUnit}</small></strong></div>
          <div className="metric"><span>MESH</span><strong>{displayResult ? displayResult.mesh.nodes.length.toLocaleString() : '—'} <small>nodes</small></strong></div>
          <div className="metric solver-metric"><span>LINEAR SOLVER</span><strong className={displayResult?.converged ? 'converged' : 'not-converged'}>{displayResult?.converged ? 'Converged' : 'Check'} </strong><small>{displayResult ? `${displayResult.iterations} iterations · ${displayResult.relativeResidual.toExponential(1)} residual` : 'Not solved'}</small></div>
        </div>
      </section>
      <Inspector model={model} selected={selected} result={displayResult} stale={stale} converging={converging} onChange={updateModel} onExport={exportFile} onRunConvergence={runConvergence} onRunSweep={runSweep} />
    </main>

    <footer className="status-bar"><span className={`status-indicator ${result?.converged && !stale ? 'ok' : ''}`} /><span>{converging ? 'Running successive mesh studies…' : computing ? 'Assembling and solving…' : stale ? 'Results need updating' : result?.converged ? 'Study completed successfully' : 'Ready'}</span><span className="status-divider">|</span><span>2D · {physicsName}</span><div className="header-spacer" /><Gauge size={12} /><span>{result ? `${result.solveTimeMs.toFixed(1)} ms` : '—'}</span><span className="status-divider">|</span><span>Local session</span><Download size={12} /><span>Open data</span></footer>
    {toast && <div className={`toast ${toast.type}`} role="status">{toast.type === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}{toast.text}</div>}
  </div>
}

export default App
