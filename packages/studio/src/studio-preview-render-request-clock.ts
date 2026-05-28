import type { StudioCanvasTransform } from "./client"
import {
  defaultStudioPreviewRenderQueueActiveRenderTimeoutMilliseconds,
  defaultStudioPreviewRenderQueueBufferRenderDelayMilliseconds,
  defaultStudioPreviewRenderQueueRenderDebounceMilliseconds,
  defaultStudioPreviewRenderQueueRenderThrottleMilliseconds,
  type StudioPreviewRenderQueueOptions,
} from "./preview-render-queue"
import {
  mergeStudioPreviewRenderRequestPolicies,
  movingCanvasBufferedPreviewRenderRequestPolicy,
  normalBufferedPreviewRenderRequestPolicy,
  normalVisiblePreviewRenderRequestPolicy,
  studioPreviewRenderRequestPolicyFromSchedulerRunOptions,
  type StudioPreviewRenderRequestPolicy,
  type StudioPreviewRenderSchedulerRunOptions,
} from "./studio-preview-render-request-policy"

export type StudioPreviewRenderRequestClock = {
  dispose: () => void
  flushRenderRequest: (canvas?: StudioCanvasTransform, options?: StudioPreviewRenderSchedulerRunOptions) => void
  requestBufferedRender: (canvas?: StudioCanvasTransform) => void
  requestCanvasMovementRender: (canvas?: StudioCanvasTransform) => void
  requestRenderAfterPreviewCompletion: () => void
}

export type StudioPreviewRenderRequestClockScheduler = {
  cancelAnimationFrame: (id: number) => void
  clearTimeout: (id: number) => void
  now: () => number
  requestAnimationFrame: (callback: () => void) => number
  setTimeout: (callback: () => void, delayMilliseconds: number) => number
}

export function createStudioPreviewRenderRequestClock(input: {
  getCanvas: () => StudioCanvasTransform
  getRenderQueueOptions: () => StudioPreviewRenderQueueOptions | undefined
  runRenderRequest: (canvas: StudioCanvasTransform, requestPolicy: StudioPreviewRenderRequestPolicy) => boolean
  scheduler?: StudioPreviewRenderRequestClockScheduler
}): StudioPreviewRenderRequestClock {
  const scheduler = input.scheduler ?? studioPreviewRenderRequestClockBrowserScheduler()
  let activeTimeout = 0
  let animationFrame = 0
  let bufferRenderDelayTimeout = 0
  let canvasThrottleTimeout = 0
  let idleTimeout = 0
  let lastCanvasMovementAt: number | undefined
  let lastCanvasRunAt: number | undefined
  let scheduledRunPolicy: StudioPreviewRenderRequestPolicy | null = null

  const clearTimeoutByName = (name: "active" | "bufferRenderDelay" | "canvasThrottle" | "idle") => {
    if (!scheduler) return
    if (name === "active" && activeTimeout) {
      scheduler.clearTimeout(activeTimeout)
      activeTimeout = 0
    }
    if (name === "bufferRenderDelay" && bufferRenderDelayTimeout) {
      scheduler.clearTimeout(bufferRenderDelayTimeout)
      bufferRenderDelayTimeout = 0
    }
    if (name === "canvasThrottle" && canvasThrottleTimeout) {
      scheduler.clearTimeout(canvasThrottleTimeout)
      canvasThrottleTimeout = 0
    }
    if (name === "idle" && idleTimeout) {
      scheduler.clearTimeout(idleTimeout)
      idleTimeout = 0
    }
  }

  const movementIsActive = () => studioCanvasPreviewRenderMovementIsActive(lastCanvasMovementAt, input.getRenderQueueOptions(), scheduler)

  const renderRequestPolicyForCurrentMovementState = (): StudioPreviewRenderRequestPolicy => {
    if (movementIsActive()) return movingCanvasBufferedPreviewRenderRequestPolicy
    if (bufferRenderDelayTimeout) return normalVisiblePreviewRenderRequestPolicy
    return normalBufferedPreviewRenderRequestPolicy
  }

  const executeRenderRequest = (canvas: StudioCanvasTransform, requestPolicy: StudioPreviewRenderRequestPolicy) => {
    if (input.runRenderRequest(canvas, requestPolicy)) scheduleActiveRenderTimeout()
  }

  const scheduleFrame = (requestPolicy: StudioPreviewRenderRequestPolicy) => {
    scheduledRunPolicy = mergeStudioPreviewRenderRequestPolicies(scheduledRunPolicy, requestPolicy)
    if (!scheduler) return
    if (animationFrame) return

    animationFrame = scheduler.requestAnimationFrame(() => {
      animationFrame = 0
      const nextRequestPolicy = scheduledRunPolicy ?? normalBufferedPreviewRenderRequestPolicy
      scheduledRunPolicy = null
      executeRenderRequest(input.getCanvas(), nextRequestPolicy)
    })
  }

  const requestRenderForCurrentMovementState = () => {
    scheduleFrame(renderRequestPolicyForCurrentMovementState())
  }

  const scheduleActiveRenderTimeout = () => {
    if (!scheduler) return

    clearTimeoutByName("active")
    const timeoutMilliseconds = positivePreviewQueueActiveTimeout(
      input.getRenderQueueOptions()?.activeRenderTimeoutMilliseconds ??
        defaultStudioPreviewRenderQueueActiveRenderTimeoutMilliseconds,
    )
    if (timeoutMilliseconds === undefined) return

    activeTimeout = scheduler.setTimeout(() => {
      activeTimeout = 0
      requestRenderForCurrentMovementState()
    }, timeoutMilliseconds + 16)
  }

  const debounceFullRenderAfterCanvasMovement = () => {
    if (!scheduler) return
    const renderDebounceMilliseconds = nonNegativePreviewQueueDelay(
      input.getRenderQueueOptions()?.renderDebounceMilliseconds,
      defaultStudioPreviewRenderQueueRenderDebounceMilliseconds,
    )
    const bufferRenderDelayMilliseconds = nonNegativePreviewQueueDelay(
      input.getRenderQueueOptions()?.bufferRenderDelayMilliseconds,
      defaultStudioPreviewRenderQueueBufferRenderDelayMilliseconds,
    )
    if (renderDebounceMilliseconds <= 0) {
      clearTimeoutByName("idle")
      clearTimeoutByName("bufferRenderDelay")
      scheduleFrame(normalBufferedPreviewRenderRequestPolicy)
      return
    }

    clearTimeoutByName("idle")
    clearTimeoutByName("bufferRenderDelay")
    idleTimeout = scheduler.setTimeout(() => {
      idleTimeout = 0
      scheduleFrame(normalVisiblePreviewRenderRequestPolicy)
      if (bufferRenderDelayMilliseconds <= 0) {
        scheduleFrame(normalBufferedPreviewRenderRequestPolicy)
        return
      }

      bufferRenderDelayTimeout = scheduler.setTimeout(() => {
        bufferRenderDelayTimeout = 0
        scheduleFrame(normalBufferedPreviewRenderRequestPolicy)
      }, bufferRenderDelayMilliseconds)
    }, renderDebounceMilliseconds)
  }

  const requestVisibleThenBufferedRender = () => {
    if (!scheduler) {
      executeRenderRequest(input.getCanvas(), normalBufferedPreviewRenderRequestPolicy)
      return
    }

    const bufferRenderDelayMilliseconds = nonNegativePreviewQueueDelay(
      input.getRenderQueueOptions()?.bufferRenderDelayMilliseconds,
      defaultStudioPreviewRenderQueueBufferRenderDelayMilliseconds,
    )
    clearTimeoutByName("bufferRenderDelay")
    scheduleFrame(normalVisiblePreviewRenderRequestPolicy)
    if (bufferRenderDelayMilliseconds <= 0) {
      scheduleFrame(normalBufferedPreviewRenderRequestPolicy)
      return
    }

    bufferRenderDelayTimeout = scheduler.setTimeout(() => {
      bufferRenderDelayTimeout = 0
      scheduleFrame(normalBufferedPreviewRenderRequestPolicy)
    }, bufferRenderDelayMilliseconds)
  }

  const runCanvasMovementRender = (canvas: StudioCanvasTransform) => {
    lastCanvasRunAt = studioPreviewRenderRequestClockNow(scheduler)
    executeRenderRequest(canvas, movingCanvasBufferedPreviewRenderRequestPolicy)
  }

  const throttleCanvasMovementRender = (canvas: StudioCanvasTransform) => {
    if (!scheduler) {
      runCanvasMovementRender(canvas)
      return
    }

    const renderThrottleMilliseconds = nonNegativePreviewQueueDelay(
      input.getRenderQueueOptions()?.renderThrottleMilliseconds,
      defaultStudioPreviewRenderQueueRenderThrottleMilliseconds,
    )
    if (renderThrottleMilliseconds <= 0) {
      clearTimeoutByName("canvasThrottle")
      runCanvasMovementRender(canvas)
      return
    }

    const now = scheduler.now()
    const elapsed = lastCanvasRunAt === undefined ? renderThrottleMilliseconds : now - lastCanvasRunAt
    if (elapsed >= renderThrottleMilliseconds) {
      clearTimeoutByName("canvasThrottle")
      runCanvasMovementRender(canvas)
      return
    }

    if (canvasThrottleTimeout) return

    canvasThrottleTimeout = scheduler.setTimeout(() => {
      canvasThrottleTimeout = 0
      runCanvasMovementRender(input.getCanvas())
    }, Math.max(0, renderThrottleMilliseconds - elapsed))
  }

  return {
    dispose() {
      if (scheduler && animationFrame) scheduler.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      scheduledRunPolicy = null
      clearTimeoutByName("active")
      clearTimeoutByName("bufferRenderDelay")
      clearTimeoutByName("canvasThrottle")
      clearTimeoutByName("idle")
    },
    flushRenderRequest(canvas = input.getCanvas(), options: StudioPreviewRenderSchedulerRunOptions = {}) {
      if (scheduler && animationFrame) scheduler.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      scheduledRunPolicy = null
      clearTimeoutByName("bufferRenderDelay")
      executeRenderRequest(canvas, studioPreviewRenderRequestPolicyFromSchedulerRunOptions(options))
    },
    requestBufferedRender() {
      requestVisibleThenBufferedRender()
    },
    requestCanvasMovementRender(canvas = input.getCanvas()) {
      lastCanvasMovementAt = studioPreviewRenderRequestClockNow(scheduler)
      throttleCanvasMovementRender(canvas)
      debounceFullRenderAfterCanvasMovement()
    },
    requestRenderAfterPreviewCompletion() {
      requestRenderForCurrentMovementState()
    },
  }
}

function studioCanvasPreviewRenderMovementIsActive(
  lastCanvasMovementAt: number | undefined,
  options: StudioPreviewRenderQueueOptions | undefined,
  scheduler: StudioPreviewRenderRequestClockScheduler | undefined,
): boolean {
  if (lastCanvasMovementAt === undefined) return false
  const renderDebounceMilliseconds = nonNegativePreviewQueueDelay(
    options?.renderDebounceMilliseconds,
    defaultStudioPreviewRenderQueueRenderDebounceMilliseconds,
  )
  return (
    renderDebounceMilliseconds > 0 &&
    studioPreviewRenderRequestClockNow(scheduler) - lastCanvasMovementAt < renderDebounceMilliseconds
  )
}

function positivePreviewQueueActiveTimeout(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

function nonNegativePreviewQueueDelay(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function studioPreviewRenderRequestClockNow(scheduler: StudioPreviewRenderRequestClockScheduler | undefined): number {
  if (scheduler) return scheduler.now()
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

function studioPreviewRenderRequestClockBrowserScheduler(): StudioPreviewRenderRequestClockScheduler | undefined {
  if (typeof window === "undefined") return undefined
  return {
    cancelAnimationFrame(id) {
      window.cancelAnimationFrame(id)
    },
    clearTimeout(id) {
      window.clearTimeout(id)
    },
    now() {
      return studioPreviewRenderRequestClockNow(undefined)
    },
    requestAnimationFrame(callback) {
      return window.requestAnimationFrame(callback)
    },
    setTimeout(callback, delayMilliseconds) {
      return window.setTimeout(callback, delayMilliseconds)
    },
  }
}
