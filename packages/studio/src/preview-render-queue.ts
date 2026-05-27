import {
  shouldRenderStudioPreview,
  studioCanvasRectToViewportRect,
  type StudioCanvasPreviewVisibilityItem,
  type StudioViewportRect,
} from "./preview-lazy-loading"

export const defaultStudioPreviewRenderQueueMaxActive = 8
export const defaultStudioPreviewRenderQueueMaxLength = 18

export type StudioPreviewRenderQueueOptions = {
  maxActive?: number
  maxLength?: number
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
  const maxActive = positiveQueueLimit(input.maxActive, defaultStudioPreviewRenderQueueMaxActive)
  const maxLength = Math.max(maxActive, positiveQueueLimit(input.maxLength, defaultStudioPreviewRenderQueueMaxLength))

  for (const candidate of studioPreviewRenderQueueCandidates(input)) {
    if (selected.size >= maxLength) break
    if (candidate.needsRenderTask && activeTasks >= maxActive) continue

    selected.add(candidate.sessionId)
    if (candidate.needsRenderTask) activeTasks += 1
  }

  return selected
}

export function studioPreviewRenderQueueOptionsFromParams(params: URLSearchParams): StudioPreviewRenderQueueOptions {
  return {
    maxActive: positiveIntegerParam(params, ["previewQueueActive", "queueActive"]),
    maxLength: positiveIntegerParam(params, ["previewQueueLength", "queueLength"]),
  }
}

function studioPreviewRenderQueueCandidates(input: StudioPreviewRenderQueueInput): StudioPreviewRenderQueueCandidate[] {
  const currentSessionIds = input.currentSessionIds ?? new Set<string>()
  const completedSessionIds = input.completedSessionIds ?? new Set<string>()
  const candidates: StudioPreviewRenderQueueCandidate[] = []

  input.items.forEach((item, cardIndex) => {
    const currentlyRendered = item.sessionIds.some((sessionId) => currentSessionIds.has(sessionId))
    const viewportRect = studioCanvasRectToViewportRect(input.canvas, item.rect)
    if (!shouldRenderStudioPreview(currentlyRendered, viewportRect, input.viewport)) return

    const distance = viewportRectDistance(viewportRect, input.viewport)
    const intersectionArea = viewportRectIntersectionArea(viewportRect, input.viewport)
    item.sessionIds.forEach((sessionId, sessionIndex) => {
      const currentlyMounted = currentSessionIds.has(sessionId)
      candidates.push({
        cardIndex,
        currentlyMounted,
        distance,
        intersectionArea,
        needsRenderTask: !currentlyMounted || !completedSessionIds.has(sessionId),
        sessionId,
        sessionIndex,
      })
    })
  })

  return candidates.sort(compareStudioPreviewRenderQueueCandidates)
}

function compareStudioPreviewRenderQueueCandidates(
  left: StudioPreviewRenderQueueCandidate,
  right: StudioPreviewRenderQueueCandidate,
): number {
  return (
    left.distance - right.distance ||
    right.intersectionArea - left.intersectionArea ||
    Number(right.currentlyMounted) - Number(left.currentlyMounted) ||
    left.cardIndex - right.cardIndex ||
    left.sessionIndex - right.sessionIndex
  )
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
