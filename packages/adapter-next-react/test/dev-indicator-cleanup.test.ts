import { describe, expect, it } from "vitest"

import {
  createNextDevIndicatorCleanupCss,
  isGTSXNextPreviewPath,
  nextDevIndicatorSelectors,
} from "../src/dev-indicator-cleanup.js"

describe("Next dev indicator cleanup", () => {
  it("only targets GTSX preview routes by default", () => {
    expect(isGTSXNextPreviewPath("/gtsx")).toBe(true)
    expect(isGTSXNextPreviewPath("/gtsx/studio")).toBe(true)
    expect(isGTSXNextPreviewPath("/account")).toBe(false)
    expect(isGTSXNextPreviewPath("/gtsx-other")).toBe(false)
  })

  it("builds a style rule for the known Next devtools indicator selectors", () => {
    expect(createNextDevIndicatorCleanupCss()).toBe(
      `${nextDevIndicatorSelectors.join(",")} { display: none !important; pointer-events: none !important; }`,
    )
  })
})
