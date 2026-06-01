import type { StudioViewportPreset } from "./client"
import { studioCanvasScreenStableChromeReservedCanvasLength } from "./studio-canvas-screen-stable-chrome"

export const studioComponentCaseGridGap = 14
export const studioComponentCardTitleScreenGap = 8
export const studioComponentCardTitleScreenHeight = 9
export const studioComponentCaseLabelScreenGap = 5
export const studioComponentCaseLabelScreenMinHeight = 13
export const studioComponentCardTitleGap = studioCanvasScreenStableChromeReservedCanvasLength(studioComponentCardTitleScreenGap)
export const studioComponentCardTitleHeight = studioCanvasScreenStableChromeReservedCanvasLength(studioComponentCardTitleScreenHeight)
export const studioComponentCaseLabelGap = studioCanvasScreenStableChromeReservedCanvasLength(studioComponentCaseLabelScreenGap)
export const studioComponentCaseLabelMinHeight = studioCanvasScreenStableChromeReservedCanvasLength(
  studioComponentCaseLabelScreenMinHeight,
)
export const studioComponentCaseChromeHeight = studioComponentCaseLabelGap + studioComponentCaseLabelMinHeight
export const studioComponentCaseGridMinScale = 0.18
export const studioComponentCaseMismatchBorderOutset = 2

export function studioCaseGridMaxSide(viewportPreset: StudioViewportPreset, caseCount: number): number {
  const base = viewportPreset === "desktop" ? 860 : viewportPreset === "phone" ? 680 : 760
  return caseCount <= 1 ? Math.min(base, 720) : base
}
