import type { StudioCanvasTransform } from "./client"

export const studioCanvasTransformChangedEventType = "runelight:studio-canvas-transform-changed"

export function dispatchStudioCanvasTransformChangedEvent(canvas: StudioCanvasTransform) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(studioCanvasTransformChangedEventType, { detail: canvas }))
}
