import type { StudioViewportPreset } from "./client"
import { studioCanvasScreenStableChromeReservedCanvasLength } from "./studio-canvas-screen-stable-chrome"

export const studioComponentFrameGridGap = 14
export const studioComponentCardTitleScreenGap = 8
export const studioComponentCardTitleScreenHeight = 9
export const studioComponentFrameLabelScreenGap = 5
export const studioComponentFrameLabelScreenMinHeight = 13
export const studioComponentCardTitleGap = studioCanvasScreenStableChromeReservedCanvasLength(studioComponentCardTitleScreenGap)
export const studioComponentCardTitleHeight = studioCanvasScreenStableChromeReservedCanvasLength(studioComponentCardTitleScreenHeight)
export const studioComponentFrameLabelGap = studioCanvasScreenStableChromeReservedCanvasLength(studioComponentFrameLabelScreenGap)
export const studioComponentFrameLabelMinHeight = studioCanvasScreenStableChromeReservedCanvasLength(
  studioComponentFrameLabelScreenMinHeight,
)
export const studioComponentFrameChromeHeight = studioComponentFrameLabelGap + studioComponentFrameLabelMinHeight
export const studioComponentFrameGridMinScale = 0.18
export const studioComponentFrameMismatchBorderOutset = 2

export function studioFrameGridMaxSide(viewportPreset: StudioViewportPreset, frameCount: number): number {
  const base = viewportPreset === "desktop" ? 860 : viewportPreset === "phone" ? 680 : 760
  return frameCount <= 1 ? Math.min(base, 720) : base
}
