/// <reference lib="webworker" />

import { runAdaptiveStudy } from '@/lib/fem/adaptive'
import { runConvergenceStudy } from '@/lib/fem/convergence'
import type { StudyJobRequest, StudyJobResponse } from '@/lib/fem/jobClient'
import { heatModelSchema } from '@/lib/fem/project'
import { runParametricSweep } from '@/lib/fem/sweep'
import { solveActiveModel } from '@/lib/fem/study'

const scope = self as DedicatedWorkerGlobalScope

scope.addEventListener('message', (event: MessageEvent<StudyJobRequest>) => {
  const { id, action, model } = event.data
  try {
    const validated = heatModelSchema.parse(model)
    const result = action === 'compute'
      ? solveActiveModel(validated)
      : action === 'convergence'
        ? runConvergenceStudy(validated)
        : action === 'adaptive'
          ? runAdaptiveStudy(validated)
          : runParametricSweep(validated)
    const response: StudyJobResponse = { id, ok: true, result }
    scope.postMessage(response)
  } catch (error) {
    const response: StudyJobResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to complete the background study.',
    }
    scope.postMessage(response)
  }
})
