import {
  type StudioCanvasTransform,
  type StudioColumnLayout,
  type StudioColumnLayoutMeasurement,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "./client"
import {
  studioCanvasRectToViewportRect,
  type StudioCanvasPreviewVisibilityItem,
  type StudioViewportRect,
} from "./preview-lazy-loading"
import {
  defaultStudioPreviewRenderQueueActiveRenderTimeoutMilliseconds,
  queuedStudioPreviewSessionIds,
  type StudioCanvasMovement,
  type StudioPreviewRenderQueueRunOptions,
  visibleQueuedStudioPreviewSessionIds,
} from "./preview-render-queue"
import type { StudioPreviewGeometryCacheStore } from "./preview-geometry-cache-store"
import { studioPreviewVisibilityItems } from "./studio-canvas-geometry"

export type StudioPreviewRenderPlanInput = {
  activeRenderTimeoutMilliseconds?: number
  canvas: StudioCanvasTransform
  canvasMovement?: StudioCanvasMovement
  canvasViewportPreset: StudioViewportPreset
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  columnMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement>
  completedSessionIds: ReadonlySet<string>
  currentSessionIds: ReadonlySet<string>
  mountedAtBySessionId: ReadonlyMap<string, number>
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  frameStates?: Record<string, StudioPreviewFrameState>
  queueOptions?: StudioPreviewRenderQueueRunOptions
  viewport: StudioViewportRect
  workspace: StudioWorkspaceState
}

export type StudioPreviewRenderPlan = {
  activeSessionIds: ReadonlySet<string>
  allVisibleSessionIds: ReadonlySet<string>
  completedSessionIds: ReadonlySet<string>
  hasIncompleteVisibleRenderTasks: boolean
  nextSessionIds: ReadonlySet<string>
  viewport: StudioViewportRect
  visibleSessionIds: ReadonlySet<string>
  visibilityItems: readonly StudioCanvasPreviewVisibilityItem[]
  visibleRects: { canvasRect: StudioViewportRect; sessionId: string; viewportRect: StudioViewportRect }[]
}

export function createStudioPreviewRenderPlan(input: StudioPreviewRenderPlanInput): StudioPreviewRenderPlan {
  const visibilityItems = studioPreviewVisibilityItems(
    input.workspace,
    input.canvasViewportPreset,
    input.columnLayoutByIndex,
    input.columnMeasurementsByIndex,
    {
      frameStates: input.frameStates,
      previewCache: input.previewCache,
      previewGeometryStore: input.previewGeometryStore,
    },
  )
  const activeSessionIds = activeStudioPreviewRenderPlanSessionIds(
    input.currentSessionIds,
    input.completedSessionIds,
    input.mountedAtBySessionId,
    input.activeRenderTimeoutMilliseconds ?? defaultStudioPreviewRenderQueueActiveRenderTimeoutMilliseconds,
  )
  const queueInput = {
    activeSessionIds,
    canvas: input.canvas,
    canvasMovement: input.canvasMovement,
    completedSessionIds: input.completedSessionIds,
    currentSessionIds: input.currentSessionIds,
    items: visibilityItems,
    viewport: input.viewport,
    ...input.queueOptions,
  }
  const nextSessionIds = queuedStudioPreviewSessionIds(queueInput)
  const visibleSessionIds = visibleQueuedStudioPreviewSessionIds(queueInput, nextSessionIds)
  const allVisibleSessionIds = allVisibleStudioPreviewRenderPlanSessionIds(visibilityItems, input.canvas, input.viewport)

  return {
    activeSessionIds,
    allVisibleSessionIds,
    completedSessionIds: input.completedSessionIds,
    hasIncompleteVisibleRenderTasks: studioPreviewRenderPlanHasIncompleteVisibleRenderTasks(
      allVisibleSessionIds,
      input.completedSessionIds,
    ),
    nextSessionIds,
    viewport: input.viewport,
    visibleSessionIds,
    visibilityItems,
    visibleRects: studioPreviewRenderPlanVisibleRects(visibilityItems, visibleSessionIds, input.canvas),
  }
}

export function allVisibleStudioPreviewRenderPlanSessionIds(
  visibilityItems: readonly StudioCanvasPreviewVisibilityItem[],
  canvas: StudioCanvasTransform,
  viewport: StudioViewportRect,
): Set<string> {
  const visibleSessionIds = new Set<string>()

  for (const item of visibilityItems) {
    const viewportRect = studioCanvasRectToViewportRect(canvas, item.rect)
    if (viewportRectIntersectionArea(viewportRect, viewport) <= 0) continue
    for (const sessionId of item.sessionIds) visibleSessionIds.add(sessionId)
  }

  return visibleSessionIds
}

export function studioPreviewRenderPlanHasIncompleteVisibleRenderTasks(
  visibleSessionIds: ReadonlySet<string>,
  completedSessionIds: ReadonlySet<string>,
): boolean {
  if (visibleSessionIds.size === 0) return false

  for (const sessionId of visibleSessionIds) {
    if (!completedSessionIds.has(sessionId)) return true
  }

  return false
}

function activeStudioPreviewRenderPlanSessionIds(
  currentSessionIds: ReadonlySet<string>,
  completedSessionIds: ReadonlySet<string>,
  mountedAt: ReadonlyMap<string, number>,
  timeoutMs: number | undefined,
): Set<string> {
  const sessionIds = new Set<string>()
  const now = studioPreviewRenderPlanPerformanceNow()

  for (const sessionId of currentSessionIds) {
    if (completedSessionIds.has(sessionId)) continue
    const startedAt = mountedAt.get(sessionId) ?? now
    if (timeoutMs === undefined || now - startedAt < timeoutMs) sessionIds.add(sessionId)
  }

  return sessionIds
}

function studioPreviewRenderPlanVisibleRects(
  items: readonly StudioCanvasPreviewVisibilityItem[],
  visibleSessionIds: ReadonlySet<string>,
  canvas: StudioCanvasTransform,
): { canvasRect: StudioViewportRect; sessionId: string; viewportRect: StudioViewportRect }[] {
  const rects: { canvasRect: StudioViewportRect; sessionId: string; viewportRect: StudioViewportRect }[] = []

  for (const item of items) {
    for (const sessionId of item.sessionIds) {
      if (!visibleSessionIds.has(sessionId)) continue
      rects.push({
        canvasRect: item.rect,
        sessionId,
        viewportRect: studioCanvasRectToViewportRect(canvas, item.rect),
      })
    }
  }

  return rects
}

function viewportRectIntersectionArea(rect: StudioViewportRect, viewport: StudioViewportRect): number {
  const width = Math.max(0, Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left))
  const height = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top))
  return width * height
}

function studioPreviewRenderPlanPerformanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}
