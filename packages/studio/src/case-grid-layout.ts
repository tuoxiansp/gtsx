import type { StudioViewportPreset } from "./client"

export const studioComponentCaseGridGap = 14
export const studioComponentCardTitleGap = 8
export const studioComponentCardTitleHeight = 9
export const studioComponentCaseChromeHeight = 18
export const studioComponentCaseLabelGap = 5
export const studioComponentCaseLabelMinHeight = studioComponentCaseChromeHeight - studioComponentCaseLabelGap
export const studioComponentCaseGridMinScale = 0.18
export const studioComponentCaseMismatchBorderOutset = 2

export function studioCaseGridMaxSide(viewportPreset: StudioViewportPreset, caseCount: number): number {
  const base = viewportPreset === "desktop" ? 860 : viewportPreset === "phone" ? 680 : 760
  return caseCount <= 1 ? Math.min(base, 720) : base
}
