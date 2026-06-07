import { describe, expect, it } from "vitest"

import { createRunelightViteVuePreviewComponentLoader } from "../src/preview.js"

describe("Vite Vue preview loader", () => {
  it("maps Vite glob keys with preview queries back to Runelight Vue entry coordinates", async () => {
    const component = { frames: { ready: { props: {}, scope: { status: "ready" } } } }
    const loader = createRunelightViteVuePreviewComponentLoader(
      {
        "./UserCard.g.vue?runelight-vue-preview": async () => ({ default: component }),
      },
      { sourceRoot: "src" },
    )

    await expect(loader("src/UserCard.g.vue#default")).resolves.toBe(component)
  })
})
