import { describe, expect, it } from "vitest"

import { readRunelightVuePreviewRouteParams } from "../src/preview.js"

describe("Runelight Vue preview route params", () => {
  it("reads preview target params from URL search params", () => {
    const params = readRunelightVuePreviewRouteParams(
      new URLSearchParams(
        "entry=src/UserCard.g.vue&frame=ready&chrome=0&pool=1&static=1&sessionId=session_1&frameOverride=userId:user_1&frameOverride=src%252FChild.g.vue%2523default%3Aopen%253Aerror",
      ),
    )

    expect(params).toMatchObject({
      chrome: "0",
      entry: "src/UserCard.g.vue",
      frameName: "ready",
      poolMode: true,
      sessionId: "session_1",
      staticMode: true,
    })
    expect(params.frameOverrides).toEqual(
      new Map([
        ["userId", "user_1"],
        ["src/Child.g.vue#default", "open:error"],
      ]),
    )
  })
})
