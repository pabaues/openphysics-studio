import { TrendingUp, X } from 'lucide-react'
import type { ConvergenceReport } from '@/lib/fem/types'

export function ConvergencePanel({ report, onClose }: { report: ConvergenceReport; onClose: () => void }) {
  const errors = report.entries.flatMap((entry) => entry.relativeL2 === undefined ? [] : [entry.relativeL2])
  const minError = Math.min(...errors)
  const maxError = Math.max(...errors)
  const chartEntries = report.entries.filter((entry) => entry.relativeL2 !== undefined)
  const points = chartEntries.map((entry, index) => {
    const x = 28 + (index / Math.max(1, chartEntries.length - 1)) * 150
    const logRange = Math.log10(maxError) - Math.log10(minError)
    const y = logRange > 0 ? 14 + ((Math.log10(maxError) - Math.log10(entry.relativeL2!)) / logRange) * 62 : 45
    return { x, y, entry }
  })

  return <section className="convergence-panel" aria-label="Mesh convergence results">
    <div className="convergence-table-wrap">
      <div className="convergence-heading"><TrendingUp size={15} /><div><strong>Mesh convergence</strong><span>Successive-grid normalized L2 difference</span></div><button onClick={onClose} title="Close convergence results"><X size={14} /></button></div>
      <table className="convergence-table"><thead><tr><th>Grid</th><th>h (m)</th><th>Nodes</th><th>L2 difference</th><th>Exact L2</th><th>Order</th></tr></thead><tbody>
        {report.entries.map((entry) => <tr key={entry.level}><td>{entry.grid}</td><td>{entry.elementSize.toExponential(2)}</td><td>{entry.nodes.toLocaleString()}</td><td>{entry.relativeL2 === undefined ? '—' : `${entry.relativeL2.toExponential(3)}${entry.nearSolverFloor ? ' †' : ''}`}</td><td>{entry.exactL2?.toExponential(3) ?? '—'}</td><td>{entry.observedOrder?.toFixed(2) ?? '—'}</td></tr>)}
      </tbody></table>
      <div className="convergence-note">Observed order requires 3 levels above the solver floor. † Round-off floor: order is not interpreted. Differences are not exact-solution errors.</div>
    </div>
    <div className="convergence-chart"><span>REFINEMENT TREND</span><svg viewBox="0 0 200 100" role="img" aria-label="Logarithmic mesh refinement trend">
      <line x1="26" y1="82" x2="184" y2="82" /><line x1="26" y1="10" x2="26" y2="82" />
      {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />}
      {points.map((point) => <circle key={point.entry.level} cx={point.x} cy={point.y} r="3"><title>L2 {point.entry.relativeL2!.toExponential(3)}</title></circle>)}
      <text x="105" y="96">grid level</text><text x="6" y="14">L2</text>
    </svg></div>
  </section>
}
