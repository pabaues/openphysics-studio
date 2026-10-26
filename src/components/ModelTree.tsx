import {
  Box,
  ChevronDown,
  CircleDot,
  Flame,
  Grid3X3,
  Layers3,
  Play,
  BarChart3,
  Thermometer,
  Wind,
} from 'lucide-react'

export type NodeId =
  | 'geometry'
  | 'material'
  | 'physics'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'mesh'
  | 'study'
  | 'results'

interface ModelTreeProps {
  selected: NodeId
  onSelect: (node: NodeId) => void
  hasResults: boolean
}

const baseItems: Array<{ id: NodeId; label: string; icon: typeof Box; detail?: string }> = [
  { id: 'geometry', label: 'Geometry 1', icon: Box, detail: 'Rectangle' },
  { id: 'material', label: 'Materials', icon: Layers3, detail: 'Custom solid' },
  { id: 'physics', label: 'Heat Transfer', icon: Flame, detail: 'Stationary' },
  { id: 'mesh', label: 'Mesh 1', icon: Grid3X3, detail: 'Mapped triangles' },
  { id: 'study', label: 'Study 1', icon: Play, detail: 'Stationary' },
]

export function ModelTree({ selected, onSelect, hasResults }: ModelTreeProps) {
  return (
    <aside className="model-tree" aria-label="Model builder">
      <div className="panel-heading">
        <span>Model Builder</span>
        <span className="tree-badge">2D</span>
      </div>
      <div className="tree-root">
        <ChevronDown size={13} />
        <CircleDot size={14} className="text-blue-600" />
        <span>Model 1</span>
      </div>
      <div className="tree-items">
        {baseItems.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.id}>
              <button
                className={`tree-item ${selected === item.id ? 'selected' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                {item.id === 'study' && <span className="study-dot" />}
              </button>
              {item.id === 'physics' && (
                <div className="tree-children">
                  {(['left', 'right', 'top', 'bottom'] as const).map((boundary) => (
                    <button
                      key={boundary}
                      className={`tree-item child ${selected === boundary ? 'selected' : ''}`}
                      onClick={() => onSelect(boundary)}
                    >
                      {boundary === 'top' || boundary === 'bottom' ? (
                        <Wind size={13} />
                      ) : (
                        <Thermometer size={13} />
                      )}
                      <span>{boundary[0]!.toUpperCase() + boundary.slice(1)} boundary</span>
                    </button>
                  ))}
                </div>
              )}
              {selected === item.id && item.detail && (
                <div className="tree-detail">{item.detail}</div>
              )}
            </div>
          )
        })}
        <button
          className={`tree-item results-node ${selected === 'results' ? 'selected' : ''}`}
          onClick={() => onSelect('results')}
        >
          <BarChart3 size={15} />
          <span>Results</span>
          <span className={`result-state ${hasResults ? 'ready' : ''}`} />
        </button>
      </div>
      <div className="tree-footer">
        <div className="legend-swatch" />
        <span>All settings are local</span>
      </div>
    </aside>
  )
}
