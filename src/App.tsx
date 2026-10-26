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
} from 'lucide-react'
import { ModelTree, type NodeId } from '@/components/ModelTree'
import { Inspector } from '@/components/Inspector'
import { SimulationCanvas, type ResultQuantity, type ViewMode } from '@/components/SimulationCanvas'
import { solveHeat } from '@/lib/fem/heat'
import { downloadText, toCsv, toVtk } from '@/lib/fem/exporters'
import { heatModelSchema, parseProjectJson } from '@/lib/fem/project'
import { defaultModel, type HeatModel, type SimulationResult } from '@/lib/fem/types'
import './App.css'

const initialModel = structuredClone(defaultModel)
const initialSignature = JSON.stringify(initialModel)

function App() {
  const [model, setModel] = useState<HeatModel>(initialModel)
  const [result, setResult] = useState<SimulationResult | null>(() => solveHeat(initialModel))
  const [resultSignature, setResultSignature] = useState(initialSignature)
  const [selected, setSelected] = useState<NodeId>('results')
  const [view, setView] = useState<ViewMode>('results')
  const [quantity, setQuantity] = useState<ResultQuantity>('temperature')
  const [showMesh, setShowMesh] = useState(false)
  const [computing, setComputing] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const stale = JSON.stringify(model) !== resultSignature

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3500)
  }

  const compute = (candidate = model) => {
    setComputing(true)
    window.setTimeout(() => {
      try {
        const validated = heatModelSchema.parse(candidate)
        const next = solveHeat(validated)
        setResult(next)
        setResultSignature(JSON.stringify(validated))
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

  const loadModel = (next: HeatModel) => {
    setModel(next)
    compute(next)
  }

  const exportFile = (format: 'csv' | 'vtk' | 'json') => {
    if (format === 'json') {
      downloadText(`${model.name.replaceAll(' ', '-').toLowerCase()}.opmodel.json`, JSON.stringify(model, null, 2), 'application/json')
      return
    }
    if (!result) return
    if (format === 'csv') downloadText('temperature-field.csv', toCsv(result), 'text/csv')
    if (format === 'vtk') downloadText('temperature-field.vtk', toVtk(result))
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        compute()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        exportFile('json')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const selectNode = (node: NodeId) => {
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
    loadModel(next)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><Waves size={23} /></div>
          <div><strong>OpenPhysics</strong><span>STUDIO</span></div>
        </div>
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
        <input className="document-name" value={model.name} onChange={(event) => setModel({ ...model, name: event.target.value })} aria-label="Model name" />
        <span className="saved-state"><Check size={12} />Local project</span>
        <div className="header-spacer" />
        <span className="community-badge">COMMUNITY PREVIEW</span>
        <button className="help-button" title="Open model documentation" onClick={() => notify('Stationary 2D heat conduction · P1 FEM · Open CSV/VTK export')}><CircleHelp size={17} /></button>
      </header>

      <div className="ribbon">
        <div className="ribbon-group preset-group">
          <Flame size={16} className="text-orange-500" />
          <select aria-label="Example model" onChange={(event) => choosePreset(event.target.value)} value="">
            <option value="" disabled>Example models</option>
            <option value="plate">Thermal plate study</option>
            <option value="bar">Insulated conduction bar</option>
            <option value="generation">Volumetric heating plate</option>
          </select>
          <ChevronDown size={12} />
        </div>
        <div className="ribbon-separator" />
        <button className="ribbon-button" onClick={() => selectNode('geometry')}><Box size={16} /><span>Geometry</span></button>
        <button className="ribbon-button" onClick={() => selectNode('physics')}><Activity size={16} /><span>Physics</span></button>
        <button className="ribbon-button" onClick={() => selectNode('mesh')}><Grid3X3 size={16} /><span>Mesh</span></button>
        <div className="header-spacer" />
        {stale && <span className="outdated-label">Model modified</span>}
        <button className="compute-button" disabled={computing} onClick={() => compute()}>
          {computing ? <LoaderCircle size={16} className="spin" /> : <Play size={15} fill="currentColor" />}
          {computing ? 'Computing…' : 'Compute'}
          <kbd>Ctrl ↵</kbd>
        </button>
      </div>

      <main className="workspace">
        <ModelTree selected={selected} onSelect={selectNode} hasResults={!!result && !stale} />
        <section className="center-panel">
          <div className="viewport-toolbar">
            <div className="view-tabs">
              {(['geometry', 'mesh', 'results'] as const).map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}
            </div>
            <div className="header-spacer" />
            {view === 'results' && <>
              <select className="quantity-select" value={quantity} onChange={(event) => setQuantity(event.target.value as ResultQuantity)} aria-label="Result quantity"><option value="temperature">Temperature (°C)</option><option value="flux">Heat flux (W/m²)</option></select>
              <label className="mesh-toggle"><input type="checkbox" checked={showMesh} onChange={(event) => setShowMesh(event.target.checked)} />Show mesh</label>
            </>}
            <button className="icon-button" title="Reset model" onClick={() => loadModel(structuredClone(defaultModel))}><RotateCcw size={14} /></button>
          </div>
          <SimulationCanvas model={model} result={result} view={view} quantity={quantity} showMesh={showMesh} stale={stale} />
          <div className="metrics-strip">
            <div className="metric"><span>MINIMUM</span><strong>{result ? result.minimum.toFixed(2) : '—'} <small>°C</small></strong></div>
            <div className="metric accent"><span>MAXIMUM</span><strong>{result ? result.maximum.toFixed(2) : '—'} <small>°C</small></strong></div>
            <div className="metric"><span>AVERAGE</span><strong>{result ? result.average.toFixed(2) : '—'} <small>°C</small></strong></div>
            <div className="metric"><span>MESH</span><strong>{result ? result.mesh.nodes.length.toLocaleString() : '—'} <small>nodes</small></strong></div>
            <div className="metric solver-metric"><span>LINEAR SOLVER</span><strong className={result?.converged ? 'converged' : 'not-converged'}>{result?.converged ? 'Converged' : 'Check'} </strong><small>{result ? `${result.iterations} iterations · ${result.relativeResidual.toExponential(1)} residual` : 'Not solved'}</small></div>
          </div>
        </section>
        <Inspector model={model} selected={selected} result={result} stale={stale} onChange={setModel} onExport={exportFile} />
      </main>

      <footer className="status-bar">
        <span className={`status-indicator ${result?.converged && !stale ? 'ok' : ''}`} />
        <span>{computing ? 'Assembling and solving…' : stale ? 'Results need updating' : result?.converged ? 'Study completed successfully' : 'Ready'}</span>
        <span className="status-divider">|</span><span>2D · Heat Transfer in Solids</span>
        <div className="header-spacer" />
        <Gauge size={12} /><span>{result ? `${result.solveTimeMs.toFixed(1)} ms` : '—'}</span>
        <span className="status-divider">|</span><span>Local session</span>
        <Download size={12} /><span>Open data</span>
      </footer>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.type === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}{toast.text}</div>}
    </div>
  )
}

export default App
