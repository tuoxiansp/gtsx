import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { runelightReactContract } from "@runelight/react/contract"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runelightViteReact as createPublicRunelightViteReact } from "../src/index.js"
import { createRunelightVitePreviewComponentLoader, type RunelightReactPreviewModule } from "../src/preview.js"

type TestTransformResult = { code: string; map: null } | null
type TestRunelightViteReactPlugin = {
  apply?: unknown
  buildStart(this: unknown): void
  config(): {
    define: Record<string, string>
    optimizeDeps: {
      exclude: string[]
      include: string[]
    }
  }
  configResolved(config: { command?: "build" | "serve"; root: string }): void
  configureServer(server: unknown): void
  generateBundle(this: unknown, outputOptions: unknown, bundle: Record<string, unknown>): Promise<void>
  handleHotUpdate?(context: unknown): unknown[] | undefined
  hotUpdate?(context: unknown): unknown[] | undefined
  load(id: string | null): Promise<TestTransformResult>
  resolveId(id: string): string | null
  transform(code: string, id: string): TestTransformResult
}

const runelightViteReact = createPublicRunelightViteReact as (
  options?: Parameters<typeof createPublicRunelightViteReact>[0],
) => TestRunelightViteReactPlugin

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

const runelightConfig = {
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
  },
  host: {
    command: "vite --host 127.0.0.1 --port {port} --strictPort",
  },
}

describe("runelight Vite React adapter", () => {
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

  it("keeps .g.tsx component transforms available during Vite builds", () => {
    const plugin = runelightViteReact({ root: "/repo" })

    expect(plugin.apply).toBeUndefined()
  })

  it("exposes Runelight dev mode to the Vite browser entry", () => {
    const plugin = runelightViteReact({ root: "/repo" })

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
      const plugin = runelightViteReact({ root: "/repo" })

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

  it("elides frames from ordinary .g.tsx imports without loading runelight.config.ts", () => {
    const plugin = runelightViteReact({ root: "/repo" })
    const result = plugin.transform(
      `
export default function Card(props: { label: string }) {
  return <span>{props.label}</span>
}

Card.frames = {
  ready: { props: { label: "Ready" } },
}
`,
      "/repo/src/Card.g.tsx?import",
    )

    expect(result?.code).not.toContain("Card.frames")
    expect(result?.code).not.toContain("__runelightDefineGComponent")
  })

  it("applies the preview transform to Runelight preview imports", () => {
    const plugin = runelightViteReact({ root: "/repo" })
    const result = plugin.transform(
      `
export default function Card(props: { label: string }) {
  return <span>{props.label}</span>
}

Card.frames = {
  ready: { props: { label: "Ready" } },
}
`,
      "/repo/src/Card.g.tsx?runelight-preview",
    )

    expect(result?.code).toContain('import { defineGComponent as __runelightDefineGComponent } from "@runelight/react/runtime"')
    expect(result?.code).toContain('const Card = __runelightDefineGComponent("src/Card.g.tsx#default", CardRunelightImpl)')
    expect(result?.code).toContain("Card.frames")
  })

  it("does not expose a Studio manifest virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({ root: fixtureRoot })
    plugin.configResolved({ root: fixtureRoot })

    expect(plugin.resolveId("virtual:runelight/studio-manifest")).toBeNull()
  })

  it("does not require consumers to expose internal runtime dependencies at the project root", () => {
    const plugin = runelightViteReact({ root: "/repo" })

    expect(plugin.config()).toMatchObject({
      optimizeDeps: {
        include: [
          "@runelight/react > react-tracked",
          "@runelight/react > react-tracked > use-context-selector",
          "@runelight/react > react-tracked > use-context-selector > scheduler",
        ],
        exclude: [
          "@runelight/core",
          "@runelight/react",
          "@runelight/studio",
          "@runelight/adapter-vite-react",
          "typescript",
          "virtual:runelight/preview-config",
          "virtual:runelight/project-index",
        ],
      },
    })
  })

  it("serves the prebuilt Studio app, assets, and manifest from the Vite dev server", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-studio-host-"))
    const studioDirectory = join(root, "studio-app")

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      mkdirSync(join(studioDirectory, "assets"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(studioDirectory, "index.html"),
        '<!doctype html><div id="root"></div><script type="module" src="/runelight/studio/assets/studio.js"></script>',
      )
      writeFileSync(join(studioDirectory, "assets/studio.js"), "window.__runelightStudio = true")
      mockStudioStaticApp.directory = studioDirectory

      const plugin = runelightViteReact({ config: runelightConfig, root })
      plugin.configResolved({ root })
      const server = createViteMiddlewareHarness()
      plugin.configureServer(server)

      const htmlResponse = await server.request("/runelight/studio")
      const assetResponse = await server.request("/runelight/studio/assets/studio.js")
      const manifestResponse = await server.request("/runelight/studio/manifest")
      const manifest = JSON.parse(manifestResponse.body)

      expect(htmlResponse).toMatchObject({ statusCode: 200 })
      expect(htmlResponse.headers["content-type"]).toContain("text/html")
      expect(htmlResponse.body).toContain("/runelight/studio/assets/studio.js")
      expect(assetResponse).toMatchObject({ statusCode: 200, body: "window.__runelightStudio = true" })
      expect(assetResponse.headers["content-type"]).toContain("text/javascript")
      expect(manifestResponse).toMatchObject({ statusCode: 200 })
      expect(manifestResponse.headers["content-type"]).toContain("application/json")
      expect(manifest.routes).toMatchObject({
        preview: "/runelight",
        studio: "/runelight/studio",
        manifest: "/runelight/studio/manifest",
      })
      expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(["src/components/Card.g.tsx"])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("emits production preview and Studio assets only when explicitly configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-production-expose-"))
    const studioDirectory = join(root, "studio-app")
    const previousRunelightDev = process.env.RUNELIGHT_DEV
    delete process.env.RUNELIGHT_DEV

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      mkdirSync(join(studioDirectory, "assets"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(join(root, "src/preview.tsx"), "export function RunelightPreviewApp() { return null }\n")
      writeFileSync(
        join(studioDirectory, "index.html"),
        '<!doctype html><div id="root"></div><script type="module" src="/runelight/studio/assets/studio.js"></script>',
      )
      writeFileSync(join(studioDirectory, "assets/studio.js"), "window.__runelightStudio = true")
      mockStudioStaticApp.directory = studioDirectory

      const disabled = runelightViteReact({
        config: runelightConfig,
        root,
      })
      disabled.configResolved({ command: "build", root })

      expect(disabled.resolveId("virtual:runelight/preview-config")).toBeNull()
      expect(disabled.transformIndexHtml()).toBeUndefined()

      const enabled = runelightViteReact({
        config: {
          ...runelightConfig,
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
      const previewEntry = await enabled.load(previewEntryId)
      expect(previewEntry?.code).toContain("RunelightPreviewApp")
      expect(previewEntry?.code).toContain("src/preview.tsx")

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
      expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(["src/components/Card.g.tsx"])
    } finally {
      rmSync(root, { force: true, recursive: true })
      if (previousRunelightDev === undefined) {
        delete process.env.RUNELIGHT_DEV
      } else {
        process.env.RUNELIGHT_DEV = previousRunelightDev
      }
    }
  })

  it("loads a low-level Runelight project index through a virtual module", async () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({ config: runelightConfig, root: fixtureRoot })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:runelight/project-index")
    const loaded = await plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:runelight/project-index")
    expect(projectIndex).toEqual(buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src" }))
    expect(JSON.stringify(projectIndex)).not.toContain("/runelight/studio")
  })

  it("uses configured contracts for the virtual project index", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-react-configured-contract-"))

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.fake"), "fake source\n")
      writeFileSync(join(root, "fake-contract.mjs"), [
        "export default {",
        "  id: \"fake\",",
        "  isEntryFile(filePath) {",
        "    return filePath.endsWith(\".g.fake\")",
        "  },",
        "  analyzeEntry({ entry }) {",
        "    return { entry, mode: \"pure\", defaultExport: true, frames: [{ kind: \"pure\", name: \"ready\" }], providers: {}, diagnostics: [] }",
        "  },",
        "  indexFile({ cwd, file }) {",
        "    const analysis = this.analyzeEntry({ cwd, entry: `${file.filePath}#default` })",
        "    return {",
        "      components: [{",
        "        coordinate: analysis.entry,",
        "        filePath: file.filePath,",
        "        sourceHash: file.sourceHash,",
        "        exportName: \"default\",",
        "        componentName: \"FakeCard\",",
        "        mode: analysis.mode,",
        "        frames: analysis.frames,",
        "        providers: analysis.providers,",
        "        diagnostics: analysis.diagnostics,",
        "      }],",
        "      diagnostics: analysis.diagnostics,",
        "    }",
        "  },",
        "}",
        "",
      ].join("\n"))

      const plugin = runelightViteReact({
        config: {
          contracts: ["./fake-contract.mjs"],
          project: {
            sourceRoot: "src",
            entryRoot: "app/runelight",
          },
        },
        root,
      })
      plugin.configResolved({ root })

      const loaded = await plugin.load(plugin.resolveId("virtual:runelight/project-index"))
      const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

      expect(projectIndex.files.map((file) => file.path)).toEqual(["src/components/Card.g.fake"])
      expect(projectIndex.files[0]?.components[0]?.componentName).toBe("FakeCard")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("loads project indexes from a selected TypeScript project scope", async () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/ts-project-scope")
    const plugin = runelightViteReact({
      config: {
        contracts: ["@runelight/react/contract"],
        project: {
          sourceRoot: ".",
          entryRoot: "src/app/runelight",
          tsconfig: "tsconfig.json",
        },
        host: {
          command: "vite --host 127.0.0.1 --port {port} --strictPort",
        },
      },
      root: fixtureRoot,
    })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:runelight/project-index")
    const loaded = await plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual([
      "src/app/runelight/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("loads route design entries into the virtual project index", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-route-design-index-"))

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      mkdirSync(join(root, "src/app/runelight/design"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(root, "src/app/runelight/design/Sketch.g.tsx"),
        ["export default function Sketch() { return null }", "Sketch.frames = { live: { props: {} } }", ""].join("\n"),
      )

      const plugin = runelightViteReact({ config: runelightConfig, root })
      plugin.configResolved({ root })

      const loaded = await plugin.load(plugin.resolveId("virtual:runelight/project-index"))
      const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

      expect(projectIndex.files.map((file) => file.path)).toEqual([
        "src/app/runelight/design/Sketch.g.tsx",
        "src/components/Card.g.tsx",
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("loads project indexes from the nearest TypeScript project scope by default", async () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/ts-project-scope")
    const plugin = runelightViteReact({
      config: {
        contracts: ["@runelight/react/contract"],
        project: {
          sourceRoot: ".",
          entryRoot: "src/app/runelight",
        },
        host: {
          command: "vite --host 127.0.0.1 --port {port} --strictPort",
        },
      },
      root: fixtureRoot,
    })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:runelight/project-index")
    const loaded = await plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual([
      "src/app/runelight/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("loads resolved runelight config through a virtual module", async () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({
      config: {
        contracts: ["@runelight/react/contract"],
        project: {
          namespace: "fixture-project",
          sourceRoot: "src/corpus",
          entryRoot: "app/runelight",
        },
        host: {
          command: "vite --host 127.0.0.1 --port {port} --strictPort",
        },
      },
      root: fixtureRoot,
    })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:runelight/preview-config")
    const loaded = await plugin.load(resolvedId)
    const config = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:runelight/preview-config")
    expect(config).toEqual({ project: { sourceRoot: "src/corpus" } })
  })

  it("loads runelight.config.ts from the Vite project root when config is omitted", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-root-config-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.tsx"), "export default function Card() { return null }\n")
      writeFileSync(
        join(root, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
  },
  host: {
    command: "vite --host 127.0.0.1 --port {port} --strictPort",
  },
})
`,
      )

      const plugin = runelightViteReact({ root })
      plugin.configResolved({ root })

      const loaded = await plugin.load(plugin.resolveId("virtual:runelight/project-index"))
      const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

      expect(projectIndex.files.map((file) => file.path)).toEqual(["src/components/Card.g.tsx"])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("uses runelight config for the virtual project index scope", async () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({
      config: {
        contracts: ["@runelight/react/contract"],
        project: {
          sourceRoot: "src/corpus",
          entryRoot: "app/runelight",
        },
        host: {
          command: "vite --host 127.0.0.1 --port {port} --strictPort",
        },
      },
      root: fixtureRoot,
    })
    plugin.configResolved({ root: fixtureRoot })

    const loaded = await plugin.load(plugin.resolveId("virtual:runelight/project-index"))
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual([
      "app/runelight/design/DesignSketch.g.tsx",
      "src/corpus/Badge.g.tsx",
      "src/corpus/StatusPanel.g.tsx",
    ])
  })

  it("creates a preview component loader from a Vite module glob and source root", async () => {
    function Card() {
      return null
    }
    const modules: Record<string, () => Promise<RunelightReactPreviewModule>> = {
      "../app/runelight/design/GiftFeature.g.tsx": async () => ({ default: Card }),
      "/app/runelight/design/RootGiftFeature.g.tsx": async () => ({ default: Card }),
      "./components/Card.g.tsx": async () => ({ default: Card }),
    }
    const loadComponent = createRunelightVitePreviewComponentLoader(modules, { sourceRoot: "src" })

    await expect(loadComponent("src/components/Card.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("app/runelight/design/GiftFeature.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("app/runelight/design/RootGiftFeature.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("src/components/Missing.g.tsx#default")).resolves.toBeUndefined()
  })

  it("invalidates the virtual project index when a Runelight file changes", () => {
    const plugin = runelightViteReact({ config: runelightConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const virtualModule = { id: "\0virtual:runelight/project-index" }
    const changedModule = { id: "/repo/src/app/runelight/design/NewSketch.g.tsx" }
    const invalidated: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/runelight/design/NewSketch.g.tsx",
      modules: [changedModule],
      server: {
        moduleGraph: {
          getModuleById(id: string) {
            return id === "\0virtual:runelight/project-index" ? virtualModule : undefined
          },
          invalidateModule(module: unknown) {
            invalidated.push(module)
          },
        },
      },
    })

    expect(invalidated).toEqual([virtualModule])
    expect(updatedModules).toEqual([changedModule, virtualModule])
  })

  it("invalidates Vite virtual project index modules stored under encoded URLs", () => {
    const plugin = runelightViteReact({ config: runelightConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const virtualModule = { id: "/@id/__x00__virtual:runelight/project-index" }
    const changedModule = { id: "/repo/src/app/runelight/design/NewSketch.g.tsx" }
    const invalidated: unknown[] = []
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/runelight/design/NewSketch.g.tsx",
      modules: [changedModule],
      server: {
        moduleGraph: {
          getModuleById() {
            return undefined
          },
          invalidateModule(module: unknown) {
            invalidated.push(module)
          },
          urlToModuleMap: new Map([["/@id/__x00__virtual:runelight/project-index", virtualModule]]),
        },
        ws: {
          send(payload: unknown) {
            websocketPayloads.push(payload)
          },
        },
      },
    })

    expect(invalidated).toEqual([virtualModule])
    expect(websocketPayloads).toEqual([{ type: "full-reload" }])
    expect(updatedModules).toEqual([changedModule, virtualModule])
  })

  it("invalidates the Vite module graph when the virtual project index module is not addressable", () => {
    const plugin = runelightViteReact({ config: runelightConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const changedModule = { id: "/repo/src/app/runelight/design/NewSketch.g.tsx" }
    let invalidatedAll = false
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/runelight/design/NewSketch.g.tsx",
      modules: [changedModule],
      server: {
        moduleGraph: {
          getModuleById() {
            return undefined
          },
          invalidateAll() {
            invalidatedAll = true
          },
          invalidateModule() {
            throw new Error("Expected invalidateAll fallback")
          },
        },
        ws: {
          send(payload: unknown) {
            websocketPayloads.push(payload)
          },
        },
      },
    })

    expect(invalidatedAll).toBe(true)
    expect(websocketPayloads).toEqual([{ type: "full-reload" }])
    expect(updatedModules).toEqual([changedModule])
  })

  it("invalidates project indexes for created Runelight files through Vite's hotUpdate hook", () => {
    const plugin = runelightViteReact({ config: runelightConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const virtualModule = { id: "\0virtual:runelight/project-index" }
    const invalidated: unknown[] = []
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.hotUpdate?.({
      file: "/repo/src/app/runelight/design/NewSketch.g.tsx",
      modules: [],
      server: {
        moduleGraph: {
          getModuleById(id: string) {
            return id === "\0virtual:runelight/project-index" ? virtualModule : undefined
          },
          invalidateModule(module: unknown) {
            invalidated.push(module)
          },
        },
        ws: {
          send(payload: unknown) {
            websocketPayloads.push(payload)
          },
        },
      },
    })

    expect(invalidated).toEqual([virtualModule])
    expect(websocketPayloads).toEqual([{ type: "full-reload" }])
    expect(updatedModules).toEqual([virtualModule])
  })

  it("watches the source root and entry design parent during Vite dev", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-watch-"))

    try {
      const plugin = runelightViteReact({ config: runelightConfig, root })
      const watched: string[] = []

      plugin.configureServer?.({
        watcher: {
          add(paths: string | string[]) {
            watched.push(...(Array.isArray(paths) ? paths : [paths]))
          },
        },
      })

      expect(watched).toEqual([
        join(root, "src"),
        join(root, "src/app/runelight"),
        join(root, "src/app/runelight/design"),
      ])
      expect(existsSync(join(root, "src/app/runelight/design"))).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})

type ViteMiddlewareResponse = {
  body: string
  headers: Record<string, string>
  statusCode: number
}

function createViteMiddlewareHarness() {
  type Middleware = (request: { method?: string; url?: string }, response: unknown, next: () => void) => void
  const middlewares: Middleware[] = []

  return {
    middlewares: {
      use(handler: Middleware) {
        middlewares.push(handler)
      },
    },
    watcher: {
      add() {},
    },
    async request(url: string): Promise<ViteMiddlewareResponse> {
      let index = 0
      const response: ViteMiddlewareResponse = {
        body: "",
        headers: {},
        statusCode: 404,
      }
      await new Promise<void>((resolveRequest) => {
        const writableResponse = {
          get statusCode() {
            return response.statusCode
          },
          set statusCode(nextStatusCode: number) {
            response.statusCode = nextStatusCode
          },
          setHeader(name: string, value: string) {
            response.headers[name.toLowerCase()] = value
          },
          end(body = "") {
            response.body = String(body)
            resolveRequest()
          },
        }
        const next = () => {
          const middleware = middlewares[index++]
          if (!middleware) {
            resolveRequest()
            return
          }

          middleware({ method: "GET", url }, writableResponse, next)
        }

        next()
      })

      return response
    },
  }
}
