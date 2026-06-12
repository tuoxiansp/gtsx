import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runelightViteVue as createPublicRunelightViteVue } from "../src/index.js"
import { createRunelightViteVuePreviewComponentLoader } from "../src/preview.js"

type TestTransformResult = { code: string; map: null } | null
type TestRunelightViteVuePlugin = {
  buildStart(this: unknown): void
  config(): {
    define: Record<string, string>
  }
  configResolved(config: { command?: "build" | "serve"; root: string }): void
  generateBundle(this: unknown, outputOptions: unknown, bundle: Record<string, unknown>): Promise<void>
  load(id: string): Promise<TestTransformResult>
  resolveId(id: string): string | null
  transform(code: string, id: string): TestTransformResult
  transformIndexHtml(): Array<{ children: string; tag: string }> | undefined
}

const runelightViteVue = createPublicRunelightViteVue as unknown as (
  options?: Parameters<typeof createPublicRunelightViteVue>[0],
) => TestRunelightViteVuePlugin

const mockStudioStaticApp = vi.hoisted(() => ({
  directory: "",
}))

vi.mock("@runelight/studio/static-app", () => ({
  resolveRunelightStudioAppAssetPath(assetPath = "index.html") {
    const normalizedAssetPath = assetPath.replace(/^\/+/, "")
    return `${mockStudioStaticApp.directory}/${normalizedAssetPath}`
  },
  resolveRunelightStudioAppDirectory() {
    return mockStudioStaticApp.directory
  },
}))

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
    mockStudioStaticApp.directory = ""
  })

  it("maps Vite glob keys with preview queries back to Runelight Vue entry coordinates", async () => {
    const component = { frames: { ready: { props: {}, scope: { status: "ready" } } } }
    const loader = createRunelightViteVuePreviewComponentLoader(
      {
        "./UserCard.g.vue?runelight-preview": async () => ({ default: component }),
      },
      { sourceRoot: "src" },
    )

    await expect(loader("src/UserCard.g.vue#default")).resolves.toBe(component)
  })

  it("exposes Runelight dev mode to the Vite browser entry", () => {
    const plugin = runelightViteVue({ root: "/repo" })

    expect(plugin.config()).toMatchObject({
      define: {
        __RUNELIGHT_DEV__: "true",
      },
    })
  })

  it("keeps the Vite browser entry disabled outside runelight serve", () => {
    const previousRunelightDev = process.env.RUNELIGHT_DEV
    delete process.env.RUNELIGHT_DEV

    try {
      const plugin = runelightViteVue({ root: "/repo" })

      expect(plugin.config()).toMatchObject({
        define: {
          __RUNELIGHT_DEV__: "false",
        },
      })
    } finally {
      if (previousRunelightDev === undefined) {
        delete process.env.RUNELIGHT_DEV
      } else {
        process.env.RUNELIGHT_DEV = previousRunelightDev
      }
    }
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
      "/repo/src/UserCard.g.vue?runelight-preview",
    )

    expect(result?.code).toContain('import { useRunelightVueFrame } from "@runelight/adapter-vite-vue/preview"')
    expect(result?.code).not.toContain('import { useRunelightVueFrame } from "@runelight/vue/preview"')
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

  it("emits production preview and Studio assets when configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-vue-production-expose-"))
    const studioDirectory = join(root, "studio-app")
    const previousRunelightDev = process.env.RUNELIGHT_DEV
    delete process.env.RUNELIGHT_DEV

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      mkdirSync(join(studioDirectory, "assets"), { recursive: true })
      writeFileSync(
        join(root, "src/components/UserCard.g.vue"),
        [
          "<template>",
          "  <section>{{ status }}</section>",
          "</template>",
          "<script setup lang=\"ts\">",
          "defineProps<{ status: string }>()",
          "</script>",
          "<g:frames>",
          "export default { ready: { props: { status: 'Ready' } } }",
          "</g:frames>",
          "",
        ].join("\n"),
      )
      writeFileSync(join(root, "src/preview.ts"), "export function createRunelightVuePreviewApp() { return {} }\n")
      writeFileSync(
        join(studioDirectory, "index.html"),
        '<!doctype html><div id="root"></div><script type="module" src="/runelight/studio/assets/studio.js"></script>',
      )
      writeFileSync(join(studioDirectory, "assets/studio.js"), "window.__runelightStudio = true")
      mockStudioStaticApp.directory = studioDirectory

      const disabled = runelightViteVue({
        config: {
          contracts: ["@runelight/vue/contract"],
          project: {
            sourceRoot: "src",
            entryRoot: "src/app/runelight",
          },
        },
        root,
      })
      disabled.configResolved({ command: "build", root })

      expect(disabled.resolveId("virtual:runelight/preview-config")).toBeNull()
      expect(disabled.transformIndexHtml()).toBeUndefined()

      const enabled = runelightViteVue({
        config: {
          contracts: ["@runelight/vue/contract"],
          project: {
            sourceRoot: "src",
            entryRoot: "src/app/runelight",
          },
          studio: {
            exposeInProduction: true,
          },
        },
        root,
      })
      enabled.configResolved({ command: "build", root })

      const emitted: Array<{ fileName?: string; id?: string; source?: string | Buffer; type: "asset" | "chunk" }> = []
      const context = {
        emitFile(file: { fileName?: string; id?: string; source?: string | Buffer; type: "asset" | "chunk" }) {
          emitted.push(file)
          return `ref-${emitted.length}`
        },
        getFileName() {
          return "assets/runelight-preview.js"
        },
      }

      enabled.buildStart.call(context)

      const previewEntryId = enabled.resolveId("virtual:runelight/production-preview-entry")
      if (!previewEntryId) throw new Error("Expected production preview entry to resolve.")
      const previewEntry = await enabled.load(previewEntryId)
      expect(previewEntry?.code).toContain('import { createApp } from "vue"')
      expect(previewEntry?.code).toContain("createRunelightVuePreviewApp")
      expect(previewEntry?.code).toContain("src/preview.ts")

      const transformed = enabled.transform(
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
        `${root}/src/components/UserCard.g.vue?runelight-preview`,
      )
      expect(transformed?.code).toContain('import { useRunelightVueFrame } from "@runelight/adapter-vite-vue/preview"')

      await enabled.generateBundle.call(context, {}, {
        "assets/runelight-preview.js": {
          fileName: "assets/runelight-preview.js",
          type: "chunk",
          viteMetadata: {
            importedCss: new Set(["assets/runelight-preview.css"]),
          },
        },
      })

      const emittedAssets = emitted.filter((file) => file.type === "asset")
      expect(emittedAssets.map((file) => file.fileName).sort()).toEqual([
        "runelight/index.html",
        "runelight/studio/assets/studio.js",
        "runelight/studio/index.html",
        "runelight/studio/manifest",
      ])
      expect(String(emittedAssets.find((file) => file.fileName === "runelight/index.html")?.source)).toContain(
        "/assets/runelight-preview.css",
      )

      const manifest = JSON.parse(String(emittedAssets.find((file) => file.fileName === "runelight/studio/manifest")?.source))
      expect(manifest.routes.preview).toBe("/runelight/")
      expect(manifest.routes.studio).toBe("/runelight/studio/")
      expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(["src/components/UserCard.g.vue"])
    } finally {
      rmSync(root, { force: true, recursive: true })
      if (previousRunelightDev === undefined) {
        delete process.env.RUNELIGHT_DEV
      } else {
        process.env.RUNELIGHT_DEV = previousRunelightDev
      }
    }
  })
})
