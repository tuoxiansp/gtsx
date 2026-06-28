import { describe, expect, it } from "vitest"

import { readRunelightReactPreviewRouteParams } from "../src/preview.js"

describe("Runelight React preview route params", () => {
  it("reads escaped frame and input overrides from URL search params", () => {
    const params = new URLSearchParams(
      "entry=src/UserCard.g.tsx&frame=ready&frameOverride=src%252FChild.g.tsx%2523default%3Aopen%253Aerror&inputOverride=src%252FToast.g.tsx%2523Toast%3Atop",
    )
    const routeParams = readRunelightReactPreviewRouteParams(params)

    expect(routeParams.frameOverrides).toEqual(
      new Map([["src/Child.g.tsx#default", "open:error"]]),
    )
    expect(routeParams.inputOverrides).toEqual(
      new Map([["src/Toast.g.tsx#Toast", "top"]]),
    )
  })
})
