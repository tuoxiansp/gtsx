import { describe, expect, it } from "vitest"

import { readRunelightReactPreviewRouteParams } from "../src/preview.js"

describe("Runelight React preview route params", () => {
  it("reads escaped frame overrides from URL search params", () => {
    const params = new URLSearchParams("entry=src/UserCard.g.tsx&frame=ready&frameOverride=src%252FChild.g.tsx%2523default%3Aopen%253Aerror")

    expect(readRunelightReactPreviewRouteParams(params).frameOverrides).toEqual(
      new Map([["src/Child.g.tsx#default", "open:error"]]),
    )
  })
})
