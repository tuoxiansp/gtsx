import { describe, expect, it } from "vitest"

import { readRunelightVuePreviewRouteParams } from "../src/index.js"

describe("Runelight Vue preview route params", () => {
  it("reads preview target params from URL search params", () => {
    const params = readRunelightVuePreviewRouteParams(
      new URLSearchParams("entry=src/UserCard.g.vue&frame=ready&chrome=0&pool=1&static=1&sessionId=session_1&frameOverride=userId:user_1"),
    )

    expect(params).toMatchObject({
      chrome: "0",
      entry: "src/UserCard.g.vue",
      frameName: "ready",
      poolMode: true,
      sessionId: "session_1",
      staticMode: true,
    })
    expect(params.frameOverrides).toEqual(new Map([["userId", "user_1"]]))
  })
})
