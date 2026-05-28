export type StudioPreviewRenderQueueDebugObservationInput = {
  newSessionIds?: readonly string[]
  newVisibleSessionIds?: readonly string[]
  nextSessionIds?: readonly string[]
  renderBudget: "canvas-movement" | "normal"
  renderScope: "buffer" | "visible"
  visibleSessionIds?: readonly string[]
}

export type StudioPreviewTimingObservationInput = {
  sessionId: string
  type: "gtsx:error" | "gtsx:ready"
}

export type StudioPreviewRenderObservationSnapshot = {
  fullRender?: StudioPreviewFullRenderObservationSnapshot
  sequence: number
  scrollResponse?: StudioPreviewScrollResponseObservationSnapshot
}

export type StudioPreviewScrollResponseObservationSnapshot = {
  completedVisibleSessionCount: number
  firstVisibleCompletionMilliseconds?: number
  latestVisibleCompletionMilliseconds?: number
  pendingVisibleSessionCount: number
  startedAtMilliseconds: number
  visibleSessionCount: number
}

export type StudioPreviewFullRenderObservationSnapshot = {
  completedSessionCount: number
  firstCompletionMilliseconds?: number
  latestCompletionMilliseconds?: number
  pendingSessionCount: number
  renderCompletionsPerSecond?: number
  sessionCount: number
  startedAtMilliseconds: number
}

type MutableObservationRun = {
  completedSessionIds: Set<string>
  firstCompletionMilliseconds?: number
  latestCompletionMilliseconds?: number
  sessionIds: Set<string>
  startedAtMilliseconds: number
}

export type StudioPreviewRenderObservation = {
  observePreviewTiming: (input: StudioPreviewTimingObservationInput) => StudioPreviewRenderObservationSnapshot
  observeQueueRun: (input: StudioPreviewRenderQueueDebugObservationInput) => StudioPreviewRenderObservationSnapshot
  snapshot: () => StudioPreviewRenderObservationSnapshot
}

export function createStudioPreviewRenderObservation(input: {
  now: () => number
}): StudioPreviewRenderObservation {
  let fullRenderRun: MutableObservationRun | undefined
  let scrollResponseRun: MutableObservationRun | undefined
  let sequence = 0

  const nextSnapshot = (): StudioPreviewRenderObservationSnapshot => ({
    fullRender: fullRenderRun ? studioPreviewFullRenderObservationSnapshot(fullRenderRun) : undefined,
    scrollResponse: scrollResponseRun ? studioPreviewScrollResponseObservationSnapshot(scrollResponseRun) : undefined,
    sequence,
  })

  return {
    observePreviewTiming(timing) {
      const now = input.now()
      let changed = false
      if (scrollResponseRun && scrollResponseRun.sessionIds.has(timing.sessionId)) {
        changed = observeStudioPreviewRenderCompletion(scrollResponseRun, timing.sessionId, now) || changed
      }
      if (fullRenderRun && fullRenderRun.sessionIds.has(timing.sessionId)) {
        changed = observeStudioPreviewRenderCompletion(fullRenderRun, timing.sessionId, now) || changed
      }
      if (changed) sequence += 1
      return nextSnapshot()
    },
    observeQueueRun(queueRun) {
      const now = input.now()
      if (queueRun.renderBudget === "canvas-movement") {
        const visibleSessionIds =
          queueRun.newVisibleSessionIds !== undefined ? queueRun.newVisibleSessionIds : queueRun.visibleSessionIds ?? []
        if (visibleSessionIds.length > 0 || (queueRun.newVisibleSessionIds === undefined && !scrollResponseRun)) {
          scrollResponseRun = createMutableObservationRun(visibleSessionIds, now)
        }
      }

      if (queueRun.renderBudget === "normal" && queueRun.renderScope === "buffer") {
        const fullRenderSessionIds =
          queueRun.newSessionIds !== undefined ? queueRun.newSessionIds : queueRun.nextSessionIds ?? []
        if (fullRenderSessionIds.length > 0 || (queueRun.newSessionIds === undefined && !fullRenderRun)) {
          fullRenderRun = createMutableObservationRun(fullRenderSessionIds, now)
        }
      }

      sequence += 1
      return nextSnapshot()
    },
    snapshot: nextSnapshot,
  }
}

function createMutableObservationRun(sessionIds: readonly string[], startedAtMilliseconds: number): MutableObservationRun {
  return {
    completedSessionIds: new Set(),
    sessionIds: new Set(sessionIds),
    startedAtMilliseconds,
  }
}

function observeStudioPreviewRenderCompletion(
  run: MutableObservationRun,
  sessionId: string,
  now: number,
): boolean {
  if (run.completedSessionIds.has(sessionId)) return false

  run.completedSessionIds.add(sessionId)
  const elapsedMilliseconds = Math.max(0, now - run.startedAtMilliseconds)
  run.firstCompletionMilliseconds ??= elapsedMilliseconds
  run.latestCompletionMilliseconds = elapsedMilliseconds
  return true
}

function studioPreviewScrollResponseObservationSnapshot(
  run: MutableObservationRun,
): StudioPreviewScrollResponseObservationSnapshot {
  return {
    completedVisibleSessionCount: run.completedSessionIds.size,
    firstVisibleCompletionMilliseconds: roundObservationMilliseconds(run.firstCompletionMilliseconds),
    latestVisibleCompletionMilliseconds: roundObservationMilliseconds(run.latestCompletionMilliseconds),
    pendingVisibleSessionCount: Math.max(0, run.sessionIds.size - run.completedSessionIds.size),
    startedAtMilliseconds: roundObservationMilliseconds(run.startedAtMilliseconds) ?? 0,
    visibleSessionCount: run.sessionIds.size,
  }
}

function studioPreviewFullRenderObservationSnapshot(run: MutableObservationRun): StudioPreviewFullRenderObservationSnapshot {
  const latestCompletionMilliseconds = roundObservationMilliseconds(run.latestCompletionMilliseconds)
  return {
    completedSessionCount: run.completedSessionIds.size,
    firstCompletionMilliseconds: roundObservationMilliseconds(run.firstCompletionMilliseconds),
    latestCompletionMilliseconds,
    pendingSessionCount: Math.max(0, run.sessionIds.size - run.completedSessionIds.size),
    renderCompletionsPerSecond:
      latestCompletionMilliseconds && latestCompletionMilliseconds > 0
        ? roundObservationRate(run.completedSessionIds.size / (latestCompletionMilliseconds / 1000))
        : undefined,
    sessionCount: run.sessionIds.size,
    startedAtMilliseconds: roundObservationMilliseconds(run.startedAtMilliseconds) ?? 0,
  }
}

function roundObservationMilliseconds(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : undefined
}

function roundObservationRate(value: number): number {
  return Math.round(value * 10) / 10
}
