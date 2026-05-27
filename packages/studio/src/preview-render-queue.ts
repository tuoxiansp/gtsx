import {
  isRectNearViewport,
  studioPreviewPreloadMargin,
  studioPreviewRetainMargin,
  studioCanvasRectToViewportRect,
  type StudioCanvasPreviewVisibilityItem,
  type StudioViewportRect,
} from "./preview-lazy-loading"

export const defaultStudioPreviewRenderQueueMaxActive = 8
export const defaultStudioPreviewRenderQueueMaxLength = 18

export type StudioPreviewRenderQueueOptions = {
  maxActive?: number
  maxLength?: number
  preloadMargin?: number
  retainMargin?: number
}

export type StudioPreviewRenderQueueInput = StudioPreviewRenderQueueOptions & {
  canvas: { x: number; y: number; scale: number }
  completedSessionIds?: ReadonlySet<string>
  currentSessionIds?: ReadonlySet<string>
  items: readonly StudioCanvasPreviewVisibilityItem[]
  viewport: StudioViewportRect
}

type StudioPreviewRenderQueueCandidate = {
  cardIndex: number
  completed: boolean
  currentlyMounted: boolean
  distance: number
  intersectionArea: number
  needsRenderTask: boolean
  sessionId: string
  sessionIndex: number
}

export function queuedStudioPreviewSessionIds(input: StudioPreviewRenderQueueInput): Set<string> {
  const selected = new Set<string>()
  let activeTasks = 0
  let queuedTasks = 0
  const maxLength = positiveQueueLimit(input.maxLength, defaultStudioPreviewRenderQueueMaxLength)
  const maxActive = Math.min(positiveQueueLimit(input.maxActive, defaultStudioPreviewRenderQueueMaxActive), maxLength)

  for (const candidate of studioPreviewRenderQueueCandidates(input)) {
    if (selected.has(candidate.sessionId)) continue
    if (candidate.needsRenderTask) {
      if (queuedTasks >= maxLength) continue
      queuedTasks += 1
      if (activeTasks >= maxActive) continue
    }

    selected.add(candidate.sessionId)
    if (candidate.needsRenderTask) activeTasks += 1
  }

  return selected
}

export function studioPreviewRenderQueueOptionsFromParams(params: URLSearchParams): StudioPreviewRenderQueueOptions {
  return {
    maxActive: positiveIntegerParam(params, ["previewQueueActive", "queueActive"]),
    maxLength: positiveIntegerParam(params, ["previewQueueLength", "queueLength"]),
    preloadMargin: positiveIntegerParam(params, ["previewQueueBuffer", "queueBuffer", "previewBuffer"]),
    retainMargin: positiveIntegerParam(params, ["previewQueueRetain", "queueRetain", "previewRetain"]),
  }
}

function studioPreviewRenderQueueCandidates(input: StudioPreviewRenderQueueInput): StudioPreviewRenderQueueCandidate[] {
  const currentSessionIds = input.currentSessionIds ?? new Set<string>()
  const completedSessionIds = input.completedSessionIds ?? new Set<string>()
  const preloadMargin = positiveQueueLimit(input.preloadMargin, studioPreviewPreloadMargin)
  const retainMargin = Math.max(preloadMargin, positiveQueueLimit(input.retainMargin, studioPreviewRetainMargin))
  const visibleCards: StudioPreviewRenderQueueCandidate[][] = []
  const bufferedCards: StudioPreviewRenderQueueCandidate[][] = []

  input.items.forEach((item, cardIndex) => {
    const currentlyRendered = item.sessionIds.some((sessionId) => currentSessionIds.has(sessionId))
    const viewportRect = studioCanvasRectToViewportRect(input.canvas, item.rect)
    const margin = currentlyRendered ? retainMargin : preloadMargin
    if (!isRectNearViewport(viewportRect, input.viewport, margin)) return

    const distance = viewportRectDistance(viewportRect, input.viewport)
    const intersectionArea = viewportRectIntersectionArea(viewportRect, input.viewport)
    const cardCandidates = item.sessionIds.map((sessionId, sessionIndex) => {
      const currentlyMounted = currentSessionIds.has(sessionId)
      const completed = completedSessionIds.has(sessionId)
      return {
        cardIndex,
        completed,
        currentlyMounted,
        distance,
        intersectionArea,
        needsRenderTask: !currentlyMounted || !completed,
        sessionId,
        sessionIndex,
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
    ...roundRobinStudioPreviewRenderQueueCandidates(visibleCards),
    ...roundRobinStudioPreviewRenderQueueCandidates(bufferedCards),
  ]
}

function compareStudioPreviewRenderQueueCandidates(
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

function roundRobinStudioPreviewRenderQueueCandidates(
  cards: StudioPreviewRenderQueueCandidate[][],
): StudioPreviewRenderQueueCandidate[] {
  const sortedCards = cards.sort((left, right) =>
    compareStudioPreviewRenderQueueCandidates(left[0] as StudioPreviewRenderQueueCandidate, right[0] as StudioPreviewRenderQueueCandidate),
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

function viewportRectIntersectionArea(rect: StudioViewportRect, viewport: StudioViewportRect): number {
  const width = Math.max(0, Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left))
  const height = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top))
  return width * height
}

function positiveQueueLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
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
