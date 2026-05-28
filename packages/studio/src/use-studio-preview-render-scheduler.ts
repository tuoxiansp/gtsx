"use client"

import React from "react"
import { flushSync } from "react-dom"

import {
  type StudioCanvasTransform,
  type StudioColumnLayout,
  type StudioColumnLayoutMeasurement,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "./client"
import type { StudioPreviewGeometryCacheStore } from "./preview-geometry-cache-store"
import type { StudioViewportRect } from "./preview-lazy-loading"
import {
  defaultStudioPreviewRenderQueueActiveRenderTimeoutMilliseconds,
  defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasks,
  type StudioCanvasMovement,
  type StudioPreviewRenderQueueOptions,
  type StudioPreviewRenderQueueRunOptions,
} from "./preview-render-queue"
import type { StudioPreviewRenderSessionStore } from "./preview-render-session-store"
import { createStudioPreviewRenderRequestClock } from "./studio-preview-render-request-clock"
import {
  createStudioPreviewRenderCompletionSource,
  type StudioPreviewRenderCompletionSource,
} from "./studio-preview-render-completion-source"
import { createStudioPreviewRenderPlan, type StudioPreviewRenderPlan } from "./studio-preview-render-plan"
import {
  normalBufferedPreviewRenderRequestPolicy,
  studioPreviewRenderQueueOptionsForRequestPolicy,
  type StudioPreviewRenderRequestPolicy,
  type StudioPreviewRenderSchedulerRunOptions,
} from "./studio-preview-render-request-policy"

type MutableRef<T> = {
  current: T
}

export type StudioPreviewRenderScheduler = {
  flushPreviewRender: (nextCanvas?: StudioCanvasTransform, options?: StudioPreviewRenderSchedulerRunOptions) => void
  requestCanvasPreviewRender: (nextCanvas?: StudioCanvasTransform) => void
  requestPreviewRender: (nextCanvas?: StudioCanvasTransform) => void
}

export function useStudioPreviewRenderScheduler(input: {
  canvasRef: MutableRef<StudioCanvasTransform>
  canvasViewportElement: HTMLDivElement | null
  canvasViewportPresetRef: MutableRef<StudioViewportPreset>
  columnLayoutByIndexRef: MutableRef<Record<number, StudioColumnLayout>>
  columnMeasurementsByIndexRef: MutableRef<Record<number, StudioColumnLayoutMeasurement>>
  frameStatesRef: MutableRef<Record<string, StudioPreviewFrameState> | undefined>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  previewRenderQueueRef: MutableRef<StudioPreviewRenderQueueOptions | undefined>
  previewRenderSessionStore: StudioPreviewRenderSessionStore
  workspaceRef: MutableRef<StudioWorkspaceState>
}): StudioPreviewRenderScheduler {
  const lastCanvasRenderMovement = React.useRef<StudioCanvasMovement | undefined>(undefined)
  const lastCanvasUsedForRenderMovement = React.useRef(input.canvasRef.current)
  const mountedAtBySessionId = React.useRef(new Map<string, number>())
  const sessionIdsRef = React.useRef(input.previewRenderSessionStore.getSessionIds())

  const runQueue = React.useCallback(
    (
      nextCanvas: StudioCanvasTransform = input.canvasRef.current,
      requestPolicy: StudioPreviewRenderRequestPolicy = normalBufferedPreviewRenderRequestPolicy,
    ) => {
      if (!input.canvasViewportElement) return false

      const queueOptions = studioPreviewRenderQueueOptionsForRequestPolicy(input.previewRenderQueueRef.current, requestPolicy)
      const completionSource = createStudioPreviewRenderCompletionSource({
        frameStates: input.frameStatesRef.current,
        previewGeometryStore: input.previewGeometryStore,
      })
      const canvasMovement = studioCanvasMovement(lastCanvasUsedForRenderMovement.current, nextCanvas)
      if (isMeaningfulStudioCanvasMovement(canvasMovement)) lastCanvasRenderMovement.current = canvasMovement
      lastCanvasUsedForRenderMovement.current = nextCanvas
      const plan = createStudioPreviewRenderPlanForScheduler({
        activeRenderTimeoutMilliseconds:
          queueOptions?.activeRenderTimeoutMilliseconds ??
          defaultStudioPreviewRenderQueueActiveRenderTimeoutMilliseconds,
        canvas: nextCanvas,
        canvasMovement: lastCanvasRenderMovement.current,
        canvasViewportElement: input.canvasViewportElement,
        canvasViewportPreset: input.canvasViewportPresetRef.current,
        columnLayoutByIndex: input.columnLayoutByIndexRef.current,
        columnMeasurementsByIndex: input.columnMeasurementsByIndexRef.current,
        completionSource,
        frameStates: input.frameStatesRef.current,
        mountedAtBySessionId: mountedAtBySessionId.current,
        previewGeometryStore: input.previewGeometryStore,
        queueOptions,
        sessionIds: sessionIdsRef.current,
        workspace: input.workspaceRef.current,
      })
      if (!plan) return false
      const previousSessionIds = sessionIdsRef.current
      const newSessionIds = studioPreviewRenderSessionIdsNotIn(plan.nextSessionIds, previousSessionIds)
      const newVisibleSessionIds = studioPreviewRenderSessionIdsNotIn(plan.visibleSessionIds, previousSessionIds)
      dispatchStudioPreviewQueueDebug({
        canvas: nextCanvas,
        canvasMovement: lastCanvasRenderMovement.current,
        completedCount: plan.completedSessionIds.size,
        currentCount: sessionIdsRef.current.size,
        includeBuffer: requestPolicy.renderScope === "buffer",
        itemCount: plan.visibilityItems.length,
        maximumConcurrentRenderTasks:
          queueOptions?.maximumConcurrentRenderTasks ?? defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasks,
        minimumVisibleRenderTasks: queueOptions?.minimumVisibleRenderTasks ?? 0,
        nextCount: plan.nextSessionIds.size,
        nextSessionIds: [...plan.nextSessionIds],
        newSessionIds,
        newVisibleSessionIds,
        renderExpansionCenterViewportPoint: studioPreviewRenderExpansionCenterViewportPoint(plan.viewport),
        renderBudget: requestPolicy.renderBudget,
        renderScope: requestPolicy.renderScope,
        showRenderExpansionCenterPulse: shouldShowStudioPreviewRenderExpansionCenterPulse(requestPolicy),
        visibleRects: plan.visibleRects,
        visibleCount: plan.visibleSessionIds.size,
        visibleSessionIds: [...plan.visibleSessionIds],
        viewportHeight: plan.viewport.bottom,
        viewportWidth: plan.viewport.right,
        useCanvasMovementRenderTaskLimit: requestPolicy.renderBudget === "canvas-movement",
      })

      syncRenderPreviewSessionMountedAt(mountedAtBySessionId.current, previousSessionIds, plan.nextSessionIds)
      sessionIdsRef.current = plan.nextSessionIds
      return commitStudioPreviewRenderSessions(input.previewRenderSessionStore, plan.nextSessionIds, plan.visibleSessionIds, {
        urgent: requestPolicy.renderBudget === "canvas-movement",
      })
    },
    [
      input.canvasRef,
      input.canvasViewportElement,
      input.canvasViewportPresetRef,
      input.columnLayoutByIndexRef,
      input.columnMeasurementsByIndexRef,
      input.frameStatesRef,
      input.previewGeometryStore,
      input.previewRenderQueueRef,
      input.previewRenderSessionStore,
      input.workspaceRef,
    ],
  )

  const runQueueNow = React.useCallback(
    (
      nextCanvas: StudioCanvasTransform = input.canvasRef.current,
      requestPolicy: StudioPreviewRenderRequestPolicy = normalBufferedPreviewRenderRequestPolicy,
    ) => {
      return runQueue(nextCanvas, requestPolicy)
    },
    [input.canvasRef, runQueue],
  )

  const renderRequestClock = React.useMemo(
    () =>
      createStudioPreviewRenderRequestClock({
        getCanvas: () => input.canvasRef.current,
        getRenderQueueOptions: () => input.previewRenderQueueRef.current,
        runRenderRequest: runQueueNow,
      }),
    [input.canvasRef, input.previewRenderQueueRef, runQueueNow],
  )

  const requestPreviewRender = React.useCallback(
    (nextCanvas: StudioCanvasTransform = input.canvasRef.current) => {
      renderRequestClock.requestBufferedRender(nextCanvas)
    },
    [input.canvasRef, renderRequestClock],
  )

  const flushPreviewRender = React.useCallback(
    (nextCanvas: StudioCanvasTransform = input.canvasRef.current, options: StudioPreviewRenderSchedulerRunOptions = {}) => {
      renderRequestClock.flushRenderRequest(nextCanvas, options)
    },
    [input.canvasRef, renderRequestClock],
  )

  const requestCanvasPreviewRender = React.useCallback(
    (nextCanvas: StudioCanvasTransform = input.canvasRef.current) => {
      renderRequestClock.requestCanvasMovementRender(nextCanvas)
    },
    [input.canvasRef, renderRequestClock],
  )

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const handlePreviewCompletion = () => {
      renderRequestClock.requestRenderAfterPreviewCompletion()
    }

    window.addEventListener("gtsx:preview-timing", handlePreviewCompletion)
    return () => window.removeEventListener("gtsx:preview-timing", handlePreviewCompletion)
  }, [renderRequestClock])

  React.useEffect(() => {
    return () => renderRequestClock.dispose()
  }, [renderRequestClock])

  return {
    flushPreviewRender,
    requestCanvasPreviewRender,
    requestPreviewRender,
  }
}

function createStudioPreviewRenderPlanForScheduler(input: {
  activeRenderTimeoutMilliseconds?: number
  canvas: StudioCanvasTransform
  canvasMovement?: StudioCanvasMovement
  canvasViewportElement: HTMLDivElement | null
  canvasViewportPreset: StudioViewportPreset
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  columnMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement>
  completionSource: StudioPreviewRenderCompletionSource
  frameStates?: Record<string, StudioPreviewFrameState>
  mountedAtBySessionId: ReadonlyMap<string, number>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  queueOptions: StudioPreviewRenderQueueRunOptions | undefined
  sessionIds: ReadonlySet<string>
  workspace: StudioWorkspaceState
}): StudioPreviewRenderPlan | undefined {
  if (!input.canvasViewportElement) return undefined

  const baseCompletedSessionIds = input.completionSource.completedSessionIdsFor(input.sessionIds)
  const basePlanInput = {
    activeRenderTimeoutMilliseconds: input.activeRenderTimeoutMilliseconds,
    canvas: input.canvas,
    canvasMovement: input.canvasMovement,
    canvasViewportPreset: input.canvasViewportPreset,
    columnLayoutByIndex: input.columnLayoutByIndex,
    columnMeasurementsByIndex: input.columnMeasurementsByIndex,
    completedSessionIds: baseCompletedSessionIds,
    currentSessionIds: input.sessionIds,
    frameStates: input.frameStates,
    mountedAtBySessionId: input.mountedAtBySessionId,
    previewGeometryStore: input.previewGeometryStore,
    queueOptions: input.queueOptions,
    viewport: studioPreviewRenderViewportForElement(input.canvasViewportElement),
    workspace: input.workspace,
  }
  const basePlan = createStudioPreviewRenderPlan(basePlanInput)

  const completionSessionIds = new Set([...input.sessionIds, ...basePlan.allVisibleSessionIds])
  const completedSessionIds = input.completionSource.completedSessionIdsFor(completionSessionIds)
  if (sameStudioPreviewRenderSessionIdSet(baseCompletedSessionIds, completedSessionIds)) return basePlan

  return createStudioPreviewRenderPlan({
    ...basePlanInput,
    completedSessionIds,
  })
}

function studioPreviewRenderViewportForElement(element: HTMLDivElement): StudioViewportRect {
  const rect = element.getBoundingClientRect()
  return {
    bottom: rect.height,
    left: 0,
    right: rect.width,
    top: 0,
  }
}

export function studioPreviewRenderExpansionCenterViewportPoint(
  viewport: StudioViewportRect,
): { x: number; y: number } {
  return {
    x: (viewport.left + viewport.right) / 2,
    y: (viewport.top + viewport.bottom) / 2,
  }
}

function shouldShowStudioPreviewRenderExpansionCenterPulse(requestPolicy: StudioPreviewRenderRequestPolicy): boolean {
  return requestPolicy.renderBudget === "normal" && requestPolicy.renderScope === "buffer"
}

function sameStudioPreviewRenderSessionIdSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false
  for (const sessionId of left) {
    if (!right.has(sessionId)) return false
  }

  return true
}

function studioPreviewRenderSessionIdsNotIn(sessionIds: ReadonlySet<string>, existingSessionIds: ReadonlySet<string>): string[] {
  const nextSessionIds: string[] = []
  for (const sessionId of sessionIds) {
    if (!existingSessionIds.has(sessionId)) nextSessionIds.push(sessionId)
  }

  return nextSessionIds
}

function studioCanvasMovement(previousCanvas: StudioCanvasTransform, nextCanvas: StudioCanvasTransform): StudioCanvasMovement {
  return {
    x: nextCanvas.x - previousCanvas.x,
    y: nextCanvas.y - previousCanvas.y,
  }
}

function isMeaningfulStudioCanvasMovement(movement: StudioCanvasMovement): boolean {
  return Math.hypot(movement.x, movement.y) >= 0.001
}

function syncRenderPreviewSessionMountedAt(
  mountedAt: Map<string, number>,
  currentSessionIds: ReadonlySet<string>,
  nextSessionIds: ReadonlySet<string>,
) {
  const now = studioPerformanceNow()
  for (const sessionId of nextSessionIds) {
    if (!currentSessionIds.has(sessionId) && !mountedAt.has(sessionId)) mountedAt.set(sessionId, now)
  }
  for (const sessionId of mountedAt.keys()) {
    if (!nextSessionIds.has(sessionId)) mountedAt.delete(sessionId)
  }
}

function commitStudioPreviewRenderSessions(
  previewRenderSessionStore: StudioPreviewRenderSessionStore,
  nextSessionIds: ReadonlySet<string>,
  visibleSessionIds: ReadonlySet<string>,
  options: { urgent: boolean },
): boolean {
  if (!options.urgent || typeof window === "undefined") {
    return previewRenderSessionStore.setSessionIds(nextSessionIds, visibleSessionIds)
  }

  let changed = false
  flushSync(() => {
    changed = previewRenderSessionStore.setSessionIds(nextSessionIds, visibleSessionIds)
  })
  return changed
}

function studioPerformanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

function dispatchStudioPreviewQueueDebug(detail: {
  canvas: StudioCanvasTransform
  canvasMovement?: StudioCanvasMovement
  completedCount: number
  currentCount: number
  includeBuffer: boolean
  itemCount: number
  maximumConcurrentRenderTasks: number
  minimumVisibleRenderTasks: number
  nextCount: number
  nextSessionIds: string[]
  newSessionIds: string[]
  newVisibleSessionIds: string[]
  renderExpansionCenterViewportPoint: { x: number; y: number }
  renderBudget: StudioPreviewRenderRequestPolicy["renderBudget"]
  renderScope: StudioPreviewRenderRequestPolicy["renderScope"]
  showRenderExpansionCenterPulse: boolean
  visibleRects: { canvasRect: StudioViewportRect; sessionId: string; viewportRect: StudioViewportRect }[]
  visibleCount: number
  visibleSessionIds: string[]
  viewportHeight: number
  viewportWidth: number
  useCanvasMovementRenderTaskLimit: boolean
}) {
  if (typeof window === "undefined") return
  const debugModes = new URLSearchParams(window.location.search)
    .getAll("debug")
    .join(",")
    .split(",")
    .map((mode) => mode.trim())
  if (!debugModes.includes("queue") && !debugModes.includes("preview-queue")) return

  document.documentElement.setAttribute("data-gtsx-preview-queue-debug", JSON.stringify(detail))
  window.dispatchEvent(new CustomEvent("gtsx:preview-queue-debug", { detail }))
}
