export const studioPreviewLoadCheckEvent = "gtsx:studio-preview-load-check"
export const studioPreviewPreloadMargin = 360
export const studioPreviewRetainMargin = 1600
export const studioPreviewLoadCheckMinInterval = 120
export const studioPreviewLoadCheckSettledDelay = 80

export type StudioViewportRect = {
  bottom: number
  left: number
  right: number
  top: number
}

let loadCheckThrottleTimer = 0
let loadCheckSettledTimer = 0
let lastLoadCheckAt = 0

export function dispatchStudioPreviewLoadCheck(): void {
  if (typeof window === "undefined") return
  if (loadCheckThrottleTimer) {
    window.clearTimeout(loadCheckThrottleTimer)
    loadCheckThrottleTimer = 0
  }
  if (loadCheckSettledTimer) {
    window.clearTimeout(loadCheckSettledTimer)
    loadCheckSettledTimer = 0
  }
  lastLoadCheckAt = performance.now()
  window.dispatchEvent(new Event(studioPreviewLoadCheckEvent))
}

export function scheduleStudioPreviewLoadCheck(
  options: { minInterval?: number; settledDelay?: number } = {},
): void {
  if (typeof window === "undefined") return

  const minInterval = options.minInterval ?? studioPreviewLoadCheckMinInterval
  const now = performance.now()
  const elapsed = now - lastLoadCheckAt

  if (elapsed >= minInterval) {
    if (loadCheckThrottleTimer) {
      window.clearTimeout(loadCheckThrottleTimer)
      loadCheckThrottleTimer = 0
    }
    dispatchStudioPreviewLoadCheck()
  } else if (!loadCheckThrottleTimer) {
    loadCheckThrottleTimer = window.setTimeout(() => {
      loadCheckThrottleTimer = 0
      dispatchStudioPreviewLoadCheck()
    }, Math.max(0, minInterval - elapsed))
  }

  if (options.settledDelay !== undefined) {
    if (loadCheckSettledTimer) window.clearTimeout(loadCheckSettledTimer)
    loadCheckSettledTimer = window.setTimeout(() => {
      loadCheckSettledTimer = 0
      dispatchStudioPreviewLoadCheck()
    }, options.settledDelay)
  }
}

export function isElementNearViewport(element: HTMLElement, margin = studioPreviewPreloadMargin): boolean {
  return isRectNearViewport(element.getBoundingClientRect(), viewportRect(), margin)
}

export function shouldRenderStudioPreview(
  currentlyRendered: boolean,
  rect: StudioViewportRect,
  viewport: StudioViewportRect,
): boolean {
  const margin = currentlyRendered ? studioPreviewRetainMargin : studioPreviewPreloadMargin
  return isRectNearViewport(rect, viewport, margin)
}

export function shouldRenderElementPreview(element: HTMLElement, currentlyRendered: boolean): boolean {
  return shouldRenderStudioPreview(currentlyRendered, element.getBoundingClientRect(), viewportRect())
}

export function isRectNearViewport(rect: StudioViewportRect, viewport: StudioViewportRect, margin: number): boolean {
  return (
    rect.bottom >= viewport.top - margin &&
    rect.right >= viewport.left - margin &&
    rect.top <= viewport.bottom + margin &&
    rect.left <= viewport.right + margin
  )
}

function viewportRect(): StudioViewportRect {
  return {
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
    top: 0,
  }
}
