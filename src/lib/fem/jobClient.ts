import type { AdaptiveReport, ConvergenceReport } from './types'
import type { AnySimulationResult, HeatModel } from './types'
import type { SweepReport } from './sweep'

export type StudyJobAction = 'compute' | 'convergence' | 'adaptive' | 'sweep'

export interface StudyJobRequest {
  id: number
  action: StudyJobAction
  model: HeatModel
}

export type StudyJobResult = AnySimulationResult | ConvergenceReport | AdaptiveReport | SweepReport

export type StudyJobResponse =
  | { id: number; ok: true; result: StudyJobResult }
  | { id: number; ok: false; error: string }

export function createStudyJobClient() {
  const worker = new Worker(new URL('../../workers/study.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, { resolve: (result: StudyJobResult) => void; reject: (error: Error) => void }>()
  let nextId = 1

  const rejectPending = (message: string) => {
    pending.forEach(({ reject }) => reject(new Error(message)))
    pending.clear()
  }
  worker.addEventListener('message', (event: MessageEvent<StudyJobResponse>) => {
    const response = event.data
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    if (response.ok) request.resolve(response.result)
    else request.reject(new Error(response.error))
  })
  worker.addEventListener('error', () => rejectPending('The background study worker stopped unexpectedly. Reload the page and try again.'))

  const run = (action: StudyJobAction, model: HeatModel): Promise<StudyJobResult> => {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      const request: StudyJobRequest = { id, action, model: structuredClone(model) }
      worker.postMessage(request)
    })
  }

  return {
    compute: async (model: HeatModel) => await run('compute', model) as AnySimulationResult,
    convergence: async (model: HeatModel) => await run('convergence', model) as ConvergenceReport,
    adaptive: async (model: HeatModel) => await run('adaptive', model) as AdaptiveReport,
    sweep: async (model: HeatModel) => await run('sweep', model) as SweepReport,
    dispose: () => {
      worker.terminate()
      rejectPending('The background study was cancelled because the workbench closed.')
    },
  }
}
