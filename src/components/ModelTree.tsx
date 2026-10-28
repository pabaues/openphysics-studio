import { useState, type ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  Box,
  ChevronDown,
  ChevronRight,
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
import type { ActivePhysics, GeometryDomain } from '@/lib/fem/types'

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
  | 'custom'
  | 'mesh'
  | 'study'
  | 'convergence'
  | 'adaptive'
  | 'sweep'
  | 'results'

interface ModelTreeProps {
  selected: NodeId
  onSelect: (node: NodeId) => void
  hasResults: boolean
  activePhysics: ActivePhysics
  domains: GeometryDomain[]
  selectedDomain: number
  onSelectDomain: (index: number) => void
}

type GroupId = 'geometry' | 'heat' | 'electrostatics' | 'elasticity' | 'study'

function TreeGroup({ id, label, icon, selected, active, expanded, onToggle, onSelect, children }: {
  id: GroupId
  label: string
  icon: ReactNode
  selected: boolean
  active?: boolean
  expanded: boolean
  onToggle: (id: GroupId) => void
  onSelect: () => void
  children?: ReactNode
}) {
  return <div className="tree-group">
    <div className="tree-group-row">
      <button className="tree-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`} onClick={() => onToggle(id)}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
      <button className={`tree-item ${selected ? 'selected' : ''}`} onClick={onSelect}>{icon}<span>{label}</span>{active && <span className="physics-active" title="Active in study" />}</button>
    </div>
    {expanded && children && <div className="tree-children">{children}</div>}
  </div>
}

export function ModelTree({ selected, onSelect, hasResults, activePhysics, domains, selectedDomain, onSelectDomain }: ModelTreeProps) {
  const [expanded, setExpanded] = useState<Record<GroupId, boolean>>({ geometry: true, heat: true, electrostatics: true, elasticity: true, study: true })
  const toggle = (id: GroupId) => setExpanded((current) => ({ ...current, [id]: !current[id] }))
  return (
    <aside className="model-tree" aria-label="Model builder">
      <div className="panel-heading"><span>Model Builder</span><span className="tree-badge">2D</span></div>
      <div className="tree-root"><ChevronDown size={13} /><CircleDot size={14} className="text-blue-600" /><span>Model 1</span><span className="tree-root-meta">Local</span></div>
      <div className="tree-items">
        <TreeGroup id="geometry" label="Geometry 1" icon={<Box size={15} />} selected={selected === 'geometry'} expanded={expanded.geometry} onToggle={toggle} onSelect={() => onSelect('geometry')}>
          {domains.map((domain, index) => <button key={domain.id} className={`tree-item child domain-tree-item ${selected === 'geometry' && selectedDomain === index ? 'domain-selected' : ''}`} onClick={() => onSelectDomain(index)}><Box size={11} /><span>{domain.name}</span></button>)}
        </TreeGroup>
        <button aria-label="Materials" className={`tree-item tree-standalone ${selected === 'material' ? 'selected' : ''}`} onClick={() => onSelect('material')}><Layers3 size={15} /><span>Materials</span><span className="tree-count">{domains.length}</span></button>

        <TreeGroup id="heat" label="Heat Transfer" icon={<Flame size={15} />} selected={selected === 'physics'} active={activePhysics === 'heat'} expanded={expanded.heat} onToggle={toggle} onSelect={() => onSelect('physics')}>
          {(['left', 'right', 'top', 'bottom'] as const).map((boundary) => <button key={boundary} className={`tree-item child ${selected === boundary ? 'selected' : ''}`} onClick={() => onSelect(boundary)}>{boundary === 'top' || boundary === 'bottom' ? <Wind size={13} /> : <Thermometer size={13} />}<span>{boundary[0]!.toUpperCase() + boundary.slice(1)} boundary</span></button>)}
        </TreeGroup>

        <TreeGroup id="electrostatics" label="Electrostatics" icon={<Zap size={15} />} selected={selected === 'electrostatics'} active={activePhysics === 'electrostatics'} expanded={expanded.electrostatics} onToggle={toggle} onSelect={() => onSelect('electrostatics')}>
          {(['electricLeft', 'electricRight', 'electricTop', 'electricBottom'] as const).map((boundary) => <button key={boundary} className={`tree-item child ${selected === boundary ? 'selected' : ''}`} onClick={() => onSelect(boundary)}><Zap size={12} /><span>{boundary.replace('electric', '')} boundary</span></button>)}
        </TreeGroup>

        <TreeGroup id="elasticity" label="Linear Elasticity" icon={<Box size={15} />} selected={selected === 'elasticity'} active={activePhysics === 'elasticity'} expanded={expanded.elasticity} onToggle={toggle} onSelect={() => onSelect('elasticity')}>
          {(['structuralLeft', 'structuralRight', 'structuralTop', 'structuralBottom'] as const).map((boundary) => <button key={boundary} className={`tree-item child ${selected === boundary ? 'selected' : ''}`} onClick={() => onSelect(boundary)}><Box size={12} /><span>{boundary.replace('structural', '')} boundary</span></button>)}
        </TreeGroup>

        <button className={`tree-item tree-standalone ${selected === 'custom' ? 'selected' : ''}`} onClick={() => onSelect('custom')}><Activity size={15} /><span>Custom scalar PDE</span>{activePhysics === 'custom' && <span className="physics-active" title="Active in study" />}</button>
        <button className={`tree-item tree-standalone ${selected === 'mesh' ? 'selected' : ''}`} onClick={() => onSelect('mesh')}><Grid3X3 size={15} /><span>Mesh 1</span></button>
        <TreeGroup id="study" label="Study 1" icon={<Play size={15} />} selected={selected === 'study'} expanded={expanded.study} onToggle={toggle} onSelect={() => onSelect('study')}>
          <button className={`tree-item child ${selected === 'convergence' ? 'selected' : ''}`} onClick={() => onSelect('convergence')}><TrendingUp size={13} /><span>Mesh convergence</span></button>
          <button className={`tree-item child ${selected === 'adaptive' ? 'selected' : ''}`} onClick={() => onSelect('adaptive')}><Activity size={13} /><span>Adaptive mesh</span></button>
          <button className={`tree-item child ${selected === 'sweep' ? 'selected' : ''}`} onClick={() => onSelect('sweep')}><BarChart3 size={13} /><span>Parametric sweep</span></button>
        </TreeGroup>
        <button className={`tree-item tree-standalone results-node ${selected === 'results' ? 'selected' : ''}`} onClick={() => onSelect('results')}><BarChart3 size={15} /><span>Results</span><span className={`result-state ${hasResults ? 'ready' : ''}`} /></button>
      </div>
      <div className="tree-footer"><div className="legend-swatch" /><span>All settings are local</span></div>
    </aside>
  )
}
