import {
  Activity,
  BarChart3,
  Box,
  ChevronDown,
  Download,
  FileText,
  Flame,
  Grid3X3,
  Layers3,
  LoaderCircle,
  Play,
  Settings2,
  TrendingUp,
  Upload,
  Zap,
} from 'lucide-react'
import type { NodeId } from './ModelTree'
import { examplePresetGroups, type ExamplePresetId } from '@/lib/fem/presets'
import type { ActivePhysics, HeatModel } from '@/lib/fem/types'

export type RibbonTab = 'home' | 'geometry' | 'materials' | 'physics' | 'mesh' | 'study' | 'results'

interface RibbonProps {
  model: HeatModel
  activeTab: RibbonTab
  busy: boolean
  computing: boolean
  converging: boolean
  stale: boolean
  hasResult: boolean
  onTabChange: (tab: RibbonTab) => void
  onSelect: (node: NodeId) => void
  onPhysicsChange: (physics: ActivePhysics) => void
  onPresetChange: (preset: ExamplePresetId) => void
  onImportGeometry: (file: File) => void
  onCompute: () => void
  onExport: (format: 'csv' | 'vtk' | 'html') => void
}

const tabs: { id: RibbonTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'materials', label: 'Materials' },
  { id: 'physics', label: 'Physics' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'study', label: 'Study' },
  { id: 'results', label: 'Results' },
]

export function Ribbon({ model, activeTab, busy, computing, converging, stale, hasResult, onTabChange, onSelect, onPhysicsChange, onPresetChange, onImportGeometry, onCompute, onExport }: RibbonProps) {
  const physics = model.activePhysics
  return <section className="workbench-ribbon" aria-label="Workflow commands">
    <div className="ribbon-tabs" role="tablist" aria-label="Workflow stage">
      {tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => onTabChange(tab.id)}>{tab.label}</button>)}
    </div>
    <div className="ribbon">
      <div className="ribbon-command-group">
        <span className="ribbon-group-caption">MODEL</span>
        <div className="ribbon-group-content">
          <div className="ribbon-group preset-group"><Flame size={17} className="text-orange-500" /><select aria-label="Example model" onChange={(event) => onPresetChange(event.target.value as ExamplePresetId)} value=""><option value="" disabled>Example models</option>{examplePresetGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>)}</select><ChevronDown size={12} /></div>
        </div>
      </div>
      <div className="ribbon-command-group">
        <span className="ribbon-group-caption">WORKSPACE</span>
        <div className="ribbon-group-content">
          <button className="ribbon-button" onClick={() => onSelect('geometry')}><Box size={17} /><span>Geometry</span></button>
          <div className="physics-picker">{physics === 'heat' ? <Flame size={16} /> : physics === 'electrostatics' ? <Zap size={16} /> : physics === 'custom' ? <Activity size={16} /> : <Box size={16} />}<select aria-label="Active physics" value={physics} onChange={(event) => onPhysicsChange(event.target.value as ActivePhysics)}><option value="heat">Heat Transfer</option><option value="electrostatics">Electrostatics</option><option value="elasticity">Linear Elasticity</option><option value="custom">Custom scalar PDE</option></select><Activity size={12} /></div>
          <button className="ribbon-button" onClick={() => onSelect('mesh')}><Grid3X3 size={17} /><span>Mesh</span></button>
        </div>
      </div>

      {activeTab === 'home' && <div className="ribbon-command-group contextual-group"><span className="ribbon-group-caption">MODEL BUILDER</span><div className="ribbon-group-content">
        <button className="ribbon-button" onClick={() => onSelect('study')}><Settings2 size={17} /><span>Study settings</span></button>
        <button className="ribbon-button" onClick={() => onSelect('results')}><BarChart3 size={17} /><span>Results</span></button>
      </div></div>}
      {activeTab === 'geometry' && <div className="ribbon-command-group contextual-group"><span className="ribbon-group-caption">GEOMETRY</span><div className="ribbon-group-content">
        <button className="ribbon-button" onClick={() => onSelect('geometry')}><Box size={17} /><span>Edit domains</span></button>
        <label className="ribbon-button ribbon-file"><Upload size={17} /><span>Import SVG / CSV</span><input aria-label="Ribbon geometry file" type="file" accept=".svg,.csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportGeometry(file); event.target.value = '' }} /></label>
      </div></div>}
      {activeTab === 'materials' && <div className="ribbon-command-group contextual-group"><span className="ribbon-group-caption">MATERIALS</span><div className="ribbon-group-content">
        <button className="ribbon-button" onClick={() => onSelect('material')}><Layers3 size={17} /><span>Edit domain materials</span></button>
      </div></div>}
      {activeTab === 'physics' && <div className="ribbon-command-group contextual-group"><span className="ribbon-group-caption">PHYSICS</span><div className="ribbon-group-content">
        <button className="ribbon-button" onClick={() => onSelect(physics === 'heat' ? 'physics' : physics === 'electrostatics' ? 'electrostatics' : physics === 'elasticity' ? 'elasticity' : 'custom')}><Zap size={17} /><span>Equations</span></button>
        <button className="ribbon-button" onClick={() => onSelect(physics === 'heat' ? 'left' : physics === 'electrostatics' ? 'electricLeft' : physics === 'elasticity' ? 'structuralLeft' : 'custom')}><Settings2 size={17} /><span>Boundaries</span></button>
      </div></div>}
      {activeTab === 'mesh' && <div className="ribbon-command-group contextual-group"><span className="ribbon-group-caption">MESH & REFINEMENT</span><div className="ribbon-group-content">
        <button className="ribbon-button" onClick={() => onSelect('mesh')}><Grid3X3 size={17} /><span>Mesh settings</span></button>
        <button className="ribbon-button" onClick={() => onSelect('convergence')}><TrendingUp size={17} /><span>Convergence</span></button>
        <button className="ribbon-button" onClick={() => onSelect('adaptive')}><Activity size={17} /><span>Adaptive mesh</span></button>
      </div></div>}
      {activeTab === 'study' && <div className="ribbon-command-group contextual-group"><span className="ribbon-group-caption">STUDY 1</span><div className="ribbon-group-content">
        <button className="ribbon-button" onClick={() => onSelect('study')}><Settings2 size={17} /><span>Solver</span></button>
        <button className="ribbon-button" onClick={() => onSelect('convergence')}><TrendingUp size={17} /><span>Convergence</span></button>
        <button className="ribbon-button" onClick={() => onSelect('sweep')}><BarChart3 size={17} /><span>Parametric sweep</span></button>
      </div></div>}
      {activeTab === 'results' && <div className="ribbon-command-group contextual-group"><span className="ribbon-group-caption">EXPORT</span><div className="ribbon-group-content">
        <button className="ribbon-button" disabled={!hasResult} onClick={() => onExport('csv')}><Download size={17} /><span>Field CSV</span></button>
        <button className="ribbon-button" disabled={!hasResult} onClick={() => onExport('vtk')}><Download size={17} /><span>Mesh VTK</span></button>
        <button className="ribbon-button" disabled={!hasResult} onClick={() => onExport('html')}><FileText size={17} /><span>Report</span></button>
      </div></div>}

      <div className="header-spacer" />
      <div className="ribbon-run-group">{stale && <span className="outdated-label">Model modified</span>}<button className="compute-button" disabled={busy} onClick={onCompute}>{busy ? <LoaderCircle size={17} className="spin" /> : <Play size={16} fill="currentColor" />}{converging ? 'Studying…' : computing ? 'Computing…' : 'Compute'}<kbd>Ctrl ↵</kbd></button></div>
    </div>
  </section>
}
