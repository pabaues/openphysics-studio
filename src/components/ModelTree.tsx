import {
  BarChart3,
  Box,
  ChevronDown,
  CircleDot,
  Flame,
  Grid3X3,
  Layers3,
  Play,
  Thermometer,
  TrendingUp,
  Wind,
  Zap,
} from 'lucide-react'
import type { ActivePhysics } from '@/lib/fem/types'

export type NodeId =
  | 'geometry'
  | 'material'
  | 'physics'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'electrostatics'
  | 'electricLeft'
  | 'electricRight'
  | 'electricTop'
  | 'electricBottom'
  | 'elasticity'
  | 'structuralLeft'
  | 'structuralRight'
  | 'structuralTop'
  | 'structuralBottom'
  | 'mesh'
  | 'study'
  | 'convergence'
  | 'sweep'
  | 'results'

interface ModelTreeProps {
  selected: NodeId
  onSelect: (node: NodeId) => void
  hasResults: boolean
  activePhysics: ActivePhysics
}

export function ModelTree({ selected, onSelect, hasResults, activePhysics }: ModelTreeProps) {
  return (
    <aside className="model-tree" aria-label="Model builder">
      <div className="panel-heading"><span>Model Builder</span><span className="tree-badge">2D</span></div>
      <div className="tree-root"><ChevronDown size={13} /><CircleDot size={14} className="text-blue-600" /><span>Model 1</span></div>
      <div className="tree-items">
        <button className={`tree-item ${selected === 'geometry' ? 'selected' : ''}`} onClick={() => onSelect('geometry')}><Box size={15} /><span>Geometry 1</span></button>
        <button className={`tree-item ${selected === 'material' ? 'selected' : ''}`} onClick={() => onSelect('material')}><Layers3 size={15} /><span>Materials</span></button>

        <button className={`tree-item ${selected === 'physics' ? 'selected' : ''}`} onClick={() => onSelect('physics')}>
          <Flame size={15} /><span>Heat Transfer</span>{activePhysics === 'heat' && <span className="physics-active" title="Active in study" />}
        </button>
        <div className="tree-children">
          {(['left', 'right', 'top', 'bottom'] as const).map((boundary) => (
            <button key={boundary} className={`tree-item child ${selected === boundary ? 'selected' : ''}`} onClick={() => onSelect(boundary)}>
              {boundary === 'top' || boundary === 'bottom' ? <Wind size={13} /> : <Thermometer size={13} />}
              <span>{boundary[0]!.toUpperCase() + boundary.slice(1)} boundary</span>
            </button>
          ))}
        </div>

        <button className={`tree-item ${selected === 'electrostatics' ? 'selected' : ''}`} onClick={() => onSelect('electrostatics')}>
          <Zap size={15} /><span>Electrostatics</span>{activePhysics === 'electrostatics' && <span className="physics-active" title="Active in study" />}
        </button>
        <div className="tree-children">
          {(['electricLeft', 'electricRight', 'electricTop', 'electricBottom'] as const).map((boundary) => (
            <button key={boundary} className={`tree-item child ${selected === boundary ? 'selected' : ''}`} onClick={() => onSelect(boundary)}>
              <Zap size={12} /><span>{boundary.replace('electric', '')} boundary</span>
            </button>
          ))}
        </div>

        <button className={`tree-item ${selected === 'elasticity' ? 'selected' : ''}`} onClick={() => onSelect('elasticity')}>
          <Box size={15} /><span>Linear Elasticity</span>{activePhysics === 'elasticity' && <span className="physics-active" title="Active in study" />}
        </button>
        <div className="tree-children">
          {(['structuralLeft', 'structuralRight', 'structuralTop', 'structuralBottom'] as const).map((boundary) => (
            <button key={boundary} className={`tree-item child ${selected === boundary ? 'selected' : ''}`} onClick={() => onSelect(boundary)}>
              <Box size={12} /><span>{boundary.replace('structural', '')} boundary</span>
            </button>
          ))}
        </div>

        <button className={`tree-item ${selected === 'mesh' ? 'selected' : ''}`} onClick={() => onSelect('mesh')}><Grid3X3 size={15} /><span>Mesh 1</span></button>
        <button className={`tree-item ${selected === 'study' ? 'selected' : ''}`} onClick={() => onSelect('study')}><Play size={15} /><span>Study 1</span></button>
        <div className="tree-children">
          <button className={`tree-item child ${selected === 'convergence' ? 'selected' : ''}`} onClick={() => onSelect('convergence')}><TrendingUp size={13} /><span>Mesh convergence</span></button>
          <button className={`tree-item child ${selected === 'sweep' ? 'selected' : ''}`} onClick={() => onSelect('sweep')}><BarChart3 size={13} /><span>Parametric sweep</span></button>
        </div>
        <button className={`tree-item results-node ${selected === 'results' ? 'selected' : ''}`} onClick={() => onSelect('results')}><BarChart3 size={15} /><span>Results</span><span className={`result-state ${hasResults ? 'ready' : ''}`} /></button>
      </div>
      <div className="tree-footer"><div className="legend-swatch" /><span>All settings are local</span></div>
    </aside>
  )
}
