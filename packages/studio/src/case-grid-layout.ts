import type { StudioViewportPreset } from "./client"

export const studioComponentCaseGridGap = 14
export const studioComponentCaseChromeHeight = 21
export const studioComponentCaseGridMinScale = 0.18

export function studioCaseGridMaxSide(viewportPreset: StudioViewportPreset, caseCount: number): number {
  const base = viewportPreset === "desktop" ? 860 : viewportPreset === "phone" ? 680 : 760
  return caseCount <= 1 ? Math.min(base, 720) : base
}
