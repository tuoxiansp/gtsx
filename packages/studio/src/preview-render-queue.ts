import {
  isRectNearViewport,
  studioPreviewRenderBufferMargin,
  studioCanvasRectToViewportRect,
  type StudioCanvasPreviewVisibilityItem,
  type StudioViewportRect,
} from "./preview-lazy-loading"

export const defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasks = 24
export const defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement = 4
export const defaultStudioPreviewRenderQueueMinimumVisibleRenderTasksDuringCanvasMovement = 4
export const defaultStudioPreviewRenderQueueMaximumRenderTaskCount = 8192
export const defaultStudioPreviewRenderQueueMaximumMountedPreviewSessions = 32
export const defaultStudioPreviewRenderQueueActiveRenderTimeoutMilliseconds = 5000
export const defaultStudioPreviewRenderQueueRenderThrottleMilliseconds = 100
export const defaultStudioPreviewRenderQueueRenderDebounceMilliseconds = 120
export const defaultStudioPreviewRenderQueueBufferRenderDelayMilliseconds = 1000

export type StudioPreviewRenderQueueOptions = {
  /** How long an unfinished mounted preview is treated as an in-flight render. */
  activeRenderTimeoutMilliseconds?: number
  bufferRenderDelayMilliseconds?: number
  /** The maximum number of active or newly dispatched iframe render tasks in one queue pass. */
  maximumConcurrentRenderTasks?: number
  /** The maximum number of active or newly dispatched iframe render tasks while the canvas is actively moving. */
  maximumConcurrentRenderTasksDuringCanvasMovement?: number
  /** Safety cap for queued render candidates; keep this large under normal use. */
  maximumRenderTaskCount?: number
  /** The maximum number of mounted preview sessions retained by the canvas. */
  maximumMountedPreviewSessions?: number
  /** The visible viewport's render-response floor while the canvas is actively moving. */
  minimumVisibleRenderTasksDuringCanvasMovement?: number
  /** The offscreen area where previews may be mounted and rendered. */
  renderBufferMargin?: number
  renderDebounceMilliseconds?: number
  renderThrottleMilliseconds?: number
}

export type StudioPreviewRenderQueueRunOptions = StudioPreviewRenderQueueOptions & {
  includeBufferedRenderTasks?: boolean
  minimumVisibleRenderTasks?: number
}

export type StudioCanvasMovement = {
  x: number
  y: number
}

export type StudioPreviewRenderQueueInput = StudioPreviewRenderQueueRunOptions & {
  activeSessionIds?: ReadonlySet<string>
  canvas: { x: number; y: number; scale: number }
  canvasMovement?: StudioCanvasMovement
  completedSessionIds?: ReadonlySet<string>
  currentSessionIds?: ReadonlySet<string>
  items: readonly StudioCanvasPreviewVisibilityItem[]
  viewport: StudioViewportRect
}

type StudioPreviewRenderQueueCandidate = {
  active: boolean
  cardIndex: number
  completed: boolean
  currentlyMounted: boolean
  directionOffset: number
  directionRank: number
  distance: number
  intersectionArea: number
  visible: boolean
  needsRenderTask: boolean
  sessionId: string
  sessionIndex: number
}

export function queuedStudioPreviewSessionIds(input: StudioPreviewRenderQueueInput): Set<string> {
  const selected = new Set<string>()
  let concurrentRenderTasks = 0
  let renderTaskCandidateCount = 0
  let visibleRenderTasks = 0
  const maximumRenderTaskCount = positiveQueueLimit(input.maximumRenderTaskCount, defaultStudioPreviewRenderQueueMaximumRenderTaskCount)
  const maximumConcurrentRenderTasks = Math.min(positiveQueueLimit(input.maximumConcurrentRenderTasks, defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasks), maximumRenderTaskCount)
  const maximumMountedPreviewSessions = positiveQueueLimit(
    input.maximumMountedPreviewSessions,
    defaultStudioPreviewRenderQueueMaximumMountedPreviewSessions,
  )
  const minimumVisibleRenderTasks = Math.min(
    nonNegativeQueueLimit(input.minimumVisibleRenderTasks, 0),
    maximumConcurrentRenderTasks,
  )

  for (const candidate of studioPreviewRenderQueueCandidates(input)) {
    if (selected.has(candidate.sessionId)) continue

    if (candidate.currentlyMounted && !candidate.active) {
      if (selected.size >= maximumMountedPreviewSessions) continue
      selected.add(candidate.sessionId)
      continue
    }

    if (candidate.needsRenderTask) {
      renderTaskCandidateCount += 1
      if (renderTaskCandidateCount > maximumRenderTaskCount) continue
    }

    if (studioPreviewRenderTaskConsumesBudget(candidate)) {
      if (
        !canQueueStudioPreviewRenderTask(candidate, {
          concurrentRenderTasks,
          maximumConcurrentRenderTasks,
          minimumVisibleRenderTasks,
          visibleRenderTasks,
        })
      ) {
        continue
      }
      concurrentRenderTasks += 1
      if (candidate.visible) visibleRenderTasks += 1
    }

    if (!candidate.visible && selected.size >= maximumMountedPreviewSessions) continue
    selected.add(candidate.sessionId)
  }

  return selected
}

function studioPreviewRenderTaskConsumesBudget(candidate: StudioPreviewRenderQueueCandidate): boolean {
  return candidate.active || candidate.needsRenderTask
}

function canQueueStudioPreviewRenderTask(
  candidate: StudioPreviewRenderQueueCandidate,
  budget: {
    concurrentRenderTasks: number
    maximumConcurrentRenderTasks: number
    minimumVisibleRenderTasks: number
    visibleRenderTasks: number
  },
): boolean {
  if (!studioPreviewRenderTaskConsumesBudget(candidate)) return true
  if (candidate.visible && candidate.active) return true
  if (candidate.visible && budget.visibleRenderTasks < budget.minimumVisibleRenderTasks) return true
  return budget.concurrentRenderTasks < budget.maximumConcurrentRenderTasks
}

export function visibleQueuedStudioPreviewSessionIds(
  input: StudioPreviewRenderQueueInput,
  queuedSessionIds: ReadonlySet<string> = queuedStudioPreviewSessionIds(input),
): Set<string> {
  const visibleSessionIds = new Set<string>()

  for (const candidate of studioPreviewRenderQueueCandidates(input)) {
    if (candidate.visible && queuedSessionIds.has(candidate.sessionId)) visibleSessionIds.add(candidate.sessionId)
  }

  return visibleSessionIds
}

export function studioPreviewRenderQueueOptionsFromParams(params: URLSearchParams): StudioPreviewRenderQueueOptions {
  return {
    activeRenderTimeoutMilliseconds: positiveIntegerParam(params, [
      "previewQueueActiveRenderTimeoutMilliseconds",
      "previewQueueActiveRenderTimeout",
      "queueActiveRenderTimeout",
      "previewQueueActiveTimeout",
      "queueActiveTimeout",
    ]),
    bufferRenderDelayMilliseconds: nonNegativeIntegerParam(params, [
      "previewQueueBufferRenderDelayMilliseconds",
      "previewQueueBufferRenderDelay",
      "queueBufferRenderDelay",
      "previewQueueBufferDelay",
      "previewRenderBufferDelay",
      "previewBufferDelay",
      "queueBufferDelay",
      "bufferDelay",
    ]),
    renderDebounceMilliseconds: nonNegativeIntegerParam(params, [
      "previewQueueRenderDebounceMilliseconds",
      "previewQueueRenderDebounce",
      "queueRenderDebounce",
      "previewQueueDebounce",
      "previewRenderDebounce",
      "previewDebounce",
      "queueDebounce",
      "debounce",
    ]),
    maximumConcurrentRenderTasks: positiveIntegerParam(params, [
      "previewQueueMaximumConcurrentRenderTasks",
      "queueMaximumConcurrentRenderTasks",
      "maximumConcurrentRenderTasks",
      "previewQueueActive",
      "queueActive",
    ]),
    maximumConcurrentRenderTasksDuringCanvasMovement: positiveIntegerParam(params, [
      "previewQueueMaximumConcurrentRenderTasksDuringCanvasMovement",
      "queueMaximumConcurrentRenderTasksDuringCanvasMovement",
      "maximumConcurrentRenderTasksDuringCanvasMovement",
    ]),
    minimumVisibleRenderTasksDuringCanvasMovement: nonNegativeIntegerParam(params, [
      "previewQueueMinimumVisibleRenderTasksDuringCanvasMovement",
      "queueMinimumVisibleRenderTasksDuringCanvasMovement",
      "minimumVisibleRenderTasksDuringCanvasMovement",
      "previewQueueVisibleRenderFloor",
      "queueVisibleRenderFloor",
    ]),
    renderBufferMargin: nonNegativeIntegerParam(params, [
      "previewQueueRenderBufferMargin",
      "queueRenderBufferMargin",
      "previewRenderBufferMargin",
      "previewQueueBuffer",
      "queueBuffer",
      "previewBuffer",
    ]),
    maximumRenderTaskCount: positiveIntegerParam(params, [
      "previewQueueMaximumRenderTaskCount",
      "queueMaximumRenderTaskCount",
      "maximumRenderTaskCount",
      "previewQueueSafety",
      "queueSafety",
      "previewQueueLength",
      "queueLength",
    ]),
    maximumMountedPreviewSessions: positiveIntegerParam(params, [
      "previewQueueMaximumMountedPreviewSessions",
      "queueMaximumMountedPreviewSessions",
      "maximumMountedPreviewSessions",
      "previewQueueMounted",
      "queueMounted",
    ]),
    renderThrottleMilliseconds: nonNegativeIntegerParam(params, [
      "previewQueueRenderThrottleMilliseconds",
      "previewQueueRenderThrottle",
      "queueRenderThrottle",
      "previewQueueThrottle",
      "previewRenderThrottle",
      "previewThrottle",
      "queueThrottle",
      "throttle",
    ]),
  }
}

function studioPreviewRenderQueueCandidates(input: StudioPreviewRenderQueueInput): StudioPreviewRenderQueueCandidate[] {
  const currentSessionIds = input.currentSessionIds ?? new Set<string>()
  const completedSessionIds = input.completedSessionIds ?? new Set<string>()
  const activeSessionIds = input.activeSessionIds ?? new Set<string>()
  const renderBufferMargin = nonNegativeQueueLimit(input.renderBufferMargin, studioPreviewRenderBufferMargin)
  const includeBufferedRenderTasks = input.includeBufferedRenderTasks !== false
  const renderDirection = canvasMovementToRenderDirection(input.canvasMovement)
  const visibleCards: StudioPreviewRenderQueueCandidate[][] = []
  const bufferedCards: StudioPreviewRenderQueueCandidate[][] = []

  input.items.forEach((item, cardIndex) => {
    const currentlyRendered = item.sessionIds.some((sessionId) => currentSessionIds.has(sessionId))
    const viewportRect = studioCanvasRectToViewportRect(input.canvas, item.rect)
    const margin = currentlyRendered || includeBufferedRenderTasks ? renderBufferMargin : 0
    if (!isRectNearViewport(viewportRect, input.viewport, margin)) return

    const intersectionArea = viewportRectIntersectionArea(viewportRect, input.viewport)
    const distance =
      intersectionArea > 0
        ? viewportRectCenterDistance(viewportRect, input.viewport)
        : viewportRectDistance(viewportRect, input.viewport)
    const cardCandidates = item.sessionIds.map((sessionId, sessionIndex) => {
      const currentlyMounted = currentSessionIds.has(sessionId)
      const completed = completedSessionIds.has(sessionId)
      return {
        active: activeSessionIds.has(sessionId),
        cardIndex,
        completed,
        currentlyMounted,
        ...bufferedDirectionSortValues(viewportRect, input.viewport, renderDirection),
        distance,
        intersectionArea,
        needsRenderTask: !currentlyMounted,
        sessionId,
        sessionIndex,
        visible: intersectionArea > 0,
      }
    })
    if (cardCandidates.length === 0) return

    if (intersectionArea > 0) {
      visibleCards.push(cardCandidates)
    } else {
      bufferedCards.push(cardCandidates)
    }
  })

  return [
    ...roundRobinStudioPreviewRenderQueueCandidates(visibleCards, compareVisibleStudioPreviewRenderQueueCandidates),
    ...roundRobinStudioPreviewRenderQueueCandidates(bufferedCards, compareBufferedStudioPreviewRenderQueueCandidates),
  ]
}

function compareVisibleStudioPreviewRenderQueueCandidates(
  left: StudioPreviewRenderQueueCandidate,
  right: StudioPreviewRenderQueueCandidate,
): number {
  return (
    left.distance - right.distance ||
    right.intersectionArea - left.intersectionArea ||
    Number(right.currentlyMounted) - Number(left.currentlyMounted) ||
    Number(right.completed) - Number(left.completed) ||
    left.cardIndex - right.cardIndex ||
    left.sessionIndex - right.sessionIndex
  )
}

function compareBufferedStudioPreviewRenderQueueCandidates(
  left: StudioPreviewRenderQueueCandidate,
  right: StudioPreviewRenderQueueCandidate,
): number {
  return (
    left.directionRank - right.directionRank ||
    left.distance - right.distance ||
    left.directionOffset - right.directionOffset ||
    Number(right.currentlyMounted) - Number(left.currentlyMounted) ||
    Number(right.completed) - Number(left.completed) ||
    left.cardIndex - right.cardIndex ||
    left.sessionIndex - right.sessionIndex
  )
}

function roundRobinStudioPreviewRenderQueueCandidates(
  cards: StudioPreviewRenderQueueCandidate[][],
  compare: (left: StudioPreviewRenderQueueCandidate, right: StudioPreviewRenderQueueCandidate) => number,
): StudioPreviewRenderQueueCandidate[] {
  const sortedCards = cards.sort((left, right) =>
    compare(left[0] as StudioPreviewRenderQueueCandidate, right[0] as StudioPreviewRenderQueueCandidate),
  )
  const candidates: StudioPreviewRenderQueueCandidate[] = []
  const maxSessionCount = Math.max(0, ...sortedCards.map((card) => card.length))

  for (let sessionIndex = 0; sessionIndex < maxSessionCount; sessionIndex += 1) {
    for (const card of sortedCards) {
      const candidate = card[sessionIndex]
      if (candidate) candidates.push(candidate)
    }
  }

  return candidates
}

function viewportRectDistance(rect: StudioViewportRect, viewport: StudioViewportRect): number {
  const dx = rect.right < viewport.left ? viewport.left - rect.right : rect.left > viewport.right ? rect.left - viewport.right : 0
  const dy = rect.bottom < viewport.top ? viewport.top - rect.bottom : rect.top > viewport.bottom ? rect.top - viewport.bottom : 0
  return Math.hypot(dx, dy)
}

function canvasMovementToRenderDirection(movement: StudioCanvasMovement | undefined): StudioCanvasMovement | undefined {
  if (!movement) return undefined
  const length = Math.hypot(movement.x, movement.y)
  if (length < 0.001) return undefined
  return { x: -movement.x / length, y: -movement.y / length }
}

function bufferedDirectionSortValues(
  rect: StudioViewportRect,
  viewport: StudioViewportRect,
  renderDirection: StudioCanvasMovement | undefined,
): { directionOffset: number; directionRank: number } {
  if (!renderDirection) return { directionOffset: 0, directionRank: 0 }

  const vector = viewportRectCenterVector(rect, viewport)
  const projection = vector.x * renderDirection.x + vector.y * renderDirection.y
  const directionOffset = Math.abs(vector.x * renderDirection.y - vector.y * renderDirection.x)
  return { directionOffset, directionRank: projection > 0 ? 0 : 1 }
}

function viewportRectCenterVector(rect: StudioViewportRect, viewport: StudioViewportRect): StudioCanvasMovement {
  const rectCenterX = (rect.left + rect.right) / 2
  const rectCenterY = (rect.top + rect.bottom) / 2
  const viewportCenterX = (viewport.left + viewport.right) / 2
  const viewportCenterY = (viewport.top + viewport.bottom) / 2
  return { x: rectCenterX - viewportCenterX, y: rectCenterY - viewportCenterY }
}

function viewportRectCenterDistance(rect: StudioViewportRect, viewport: StudioViewportRect): number {
  const vector = viewportRectCenterVector(rect, viewport)
  return Math.hypot(vector.x, vector.y)
}

function viewportRectIntersectionArea(rect: StudioViewportRect, viewport: StudioViewportRect): number {
  const width = Math.max(0, Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left))
  const height = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top))
  return width * height
}

function positiveQueueLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function nonNegativeQueueLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function positiveIntegerParam(params: URLSearchParams, names: readonly string[]): number | undefined {
  for (const name of names) {
    const value = params.get(name)
    if (!value) continue
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }

  return undefined
}

function nonNegativeIntegerParam(params: URLSearchParams, names: readonly string[]): number | undefined {
  for (const name of names) {
    const value = params.get(name)
    if (!value) continue
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed)
  }

  return undefined
}
