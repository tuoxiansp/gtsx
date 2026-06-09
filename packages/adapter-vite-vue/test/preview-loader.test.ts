import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runelightViteVue } from "../src/index.js"
import { createRunelightViteVuePreviewComponentLoader } from "../src/preview.js"

describe("Vite Vue preview loader", () => {
  const previousRunelightDev = process.env.RUNELIGHT_DEV

  beforeEach(() => {
    process.env.RUNELIGHT_DEV = "1"
  })

  afterEach(() => {
    if (previousRunelightDev === undefined) {
      delete process.env.RUNELIGHT_DEV
    } else {
      process.env.RUNELIGHT_DEV = previousRunelightDev
    }
  })

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

  it("transforms preview SFC modules through the adapter-owned runtime export", () => {
    const plugin = runelightViteVue({ root: "/repo" })
    const result = plugin.transform(
      [
        "<template>",
        "  <section>{{ status }}</section>",
        "</template>",
        "<script setup lang=\"ts\">",
        "const status = useRemoteStatus()",
        "</script>",
        "<g:frames>",
        "export default { ready: { scope: { status: 'ready' } } }",
        "</g:frames>",
      ].join("\n"),
      "/repo/src/UserCard.g.vue?runelight-vue-preview",
    )

    expect(result?.code).toContain('import { useRunelightVueFrame } from "@runelight/adapter-vite-vue/preview"')
    expect(result?.code).not.toContain('import { useRunelightVueFrame } from "@runelight/preview-vue"')
  })

  it("elides frames from ordinary Vue imports", () => {
    const plugin = runelightViteVue({ root: "/repo" })
    const result = plugin.transform(
      [
        "<template>",
        "  <section>{{ status }}</section>",
        "</template>",
        "<script setup lang=\"ts\">",
        "const status = useRemoteStatus()",
        "</script>",
        "<g:frames>",
        "export default { ready: { scope: { status: 'ready' } } }",
        "</g:frames>",
      ].join("\n"),
      "/repo/src/UserCard.g.vue",
    )

    expect(result?.code).toContain("<template>")
    expect(result?.code).not.toContain("<g:frames>")
  })
})
