import { TrendingUp, X } from 'lucide-react'
import type { AdaptiveReport } from '@/lib/fem/types'

export function AdaptivePanel({ report, onClose }: { report: AdaptiveReport; onClose: () => void }) {
  return <section className="convergence-panel" aria-label="Adaptive mesh results">
    <div className="convergence-table-wrap">
      <div className="convergence-heading"><TrendingUp size={15} /><div><strong>Error-guided adaptation</strong><span>Gradient recovery · conforming longest-edge bisection</span></div><button onClick={onClose} title="Close adaptive results"><X size={14} /></button></div>
      <table className="convergence-table"><thead><tr><th>Level</th><th>Nodes</th><th>Triangles</th><th>Marked</th><th>Estimated error</th><th>Exact L2</th></tr></thead><tbody>
        {report.entries.map((entry) => <tr key={entry.level}><td>{entry.level}</td><td>{entry.nodes.toLocaleString()}</td><td>{entry.triangles.toLocaleString()}</td><td>{entry.markedTriangles.toLocaleString()}</td><td>{entry.estimatedError.toExponential(3)}</td><td>{entry.exactL2?.toExponential(3) ?? '—'}</td></tr>)}
      </tbody></table>
      <div className="convergence-note">The recovery indicator guides refinement; it is not a guaranteed error bound. Exact L2 appears only for a selected manufactured solution.</div>
    </div>
  </section>
}
