import { describe, expect, it } from "vitest"

import {
  createNextDevIndicatorCleanupCss,
  isRunelightNextPreviewPath,
  nextDevIndicatorSelectors,
} from "../src/dev-indicator-cleanup.js"

describe("Next dev indicator cleanup", () => {
  it("only targets Runelight preview routes by default", () => {
    expect(isRunelightNextPreviewPath("/runelight")).toBe(true)
    expect(isRunelightNextPreviewPath("/runelight/session")).toBe(true)
    expect(isRunelightNextPreviewPath("/account")).toBe(false)
    expect(isRunelightNextPreviewPath("/runelight-other")).toBe(false)
  })

  it("builds a style rule for the known Next devtools indicator selectors", () => {
    expect(createNextDevIndicatorCleanupCss()).toBe(
      `${nextDevIndicatorSelectors.join(",")} { display: none !important; pointer-events: none !important; }`,
    )
  })
})
