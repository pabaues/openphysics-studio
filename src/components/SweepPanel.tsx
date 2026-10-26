import { X } from 'lucide-react'
import type { SweepReport } from '@/lib/fem/sweep'

export function SweepPanel({ report, selectedCase, onSelect, onClose, onExport }: {
  report: SweepReport
  selectedCase: number
  onSelect: (index: number) => void
  onClose: () => void
  onExport: () => void
}) {
  const values = report.cases.map((entry) => entry.derived.average)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => `${20 + index * 220 / Math.max(1, values.length - 1)},${95 - (value - min) * 70 / range}`).join(' ')
  return <section className="sweep-panel" aria-label="Parametric sweep results">
    <div className="sweep-table-wrap">
      <div className="convergence-heading"><div><strong>{report.parameterLabel} sweep</strong><span>{report.cases.length} solved cases · select a row to inspect</span></div><button className="sweep-export" onClick={onExport}>Export CSV</button><button title="Close sweep" onClick={onClose}><X size={14} /></button></div>
      <table className="convergence-table sweep-table"><thead><tr><th>Case</th><th>{report.parameterLabel} {report.unit && `(${report.unit})`}</th><th>Average</th><th>Minimum</th><th>Maximum</th><th>Iterations</th></tr></thead><tbody>
        {report.cases.map((entry, index) => <tr key={entry.value} className={selectedCase === index ? 'active' : ''} onClick={() => onSelect(index)}><td>{index + 1}</td><td>{entry.value}</td><td>{entry.derived.average.toPrecision(5)}</td><td>{entry.result.minimum.toPrecision(5)}</td><td>{entry.result.maximum.toPrecision(5)}</td><td>{entry.result.iterations}</td></tr>)}
      </tbody></table>
    </div>
    <div className="convergence-chart"><span>AREA-WEIGHTED AVERAGE</span><svg viewBox="0 0 260 110" role="img" aria-label="Sweep average chart"><line x1="20" y1="95" x2="240" y2="95" /><polyline points={points} />{values.map((value, index) => <circle key={index} cx={20 + index * 220 / Math.max(1, values.length - 1)} cy={95 - (value - min) * 70 / range} r="3" />)}<text x="20" y="106">{report.cases[0]?.value}</text><text x="240" y="106">{report.cases.at(-1)?.value}</text></svg></div>
  </section>
}
