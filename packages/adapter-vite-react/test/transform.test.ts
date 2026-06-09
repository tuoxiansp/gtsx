import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runelightViteReact } from "../src/index.js"
import { createRunelightVitePreviewComponentLoader, type RunelightPreviewModule } from "../src/preview.js"

const runelightConfig = {
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
  })

  it("keeps .g.tsx component transforms available during Vite builds", () => {
    const plugin = runelightViteReact({ root: "/repo" })

    expect(plugin.apply).toBeUndefined()
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

    expect(result?.code).toContain('import { defineGComponent as __runelightDefineGComponent } from "@runelight/core"')
    expect(result?.code).toContain('const Card = __runelightDefineGComponent("src/Card.g.tsx#default", CardRunelightImpl)')
    expect(result?.code).toContain("Card.frames")
  })

  it("does not expose a Studio manifest virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({ root: fixtureRoot, sourceRoot: "src" })
    plugin.configResolved({ root: fixtureRoot })

    expect(plugin.resolveId("virtual:runelight/studio-manifest")).toBeNull()
  })

  it("does not require consumers to expose internal runtime dependencies at the project root", () => {
    const plugin = runelightViteReact({ root: "/repo" })

    expect(plugin.config()).toMatchObject({
      optimizeDeps: {
        include: [
          "@runelight/core > react-tracked",
          "@runelight/core > react-tracked > use-context-selector",
          "@runelight/core > react-tracked > use-context-selector > scheduler",
        ],
        exclude: [
          "@runelight/core",
          "@runelight/preview-react",
          "@runelight/studio",
          "@runelight/adapter-vite-react",
          "typescript",
          "virtual:runelight/config",
          "virtual:runelight/project-index",
        ],
      },
    })
  })

  it("serves the prebuilt Studio app, assets, and manifest from the Vite dev server", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-studio-host-"))
    const studioAppDirectory = join(root, "studio-app")

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      mkdirSync(join(studioAppDirectory, "assets"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(studioAppDirectory, "index.html"),
        '<!doctype html><div id="root"></div><script type="module" src="/runelight/studio/assets/studio.js"></script>',
      )
      writeFileSync(join(studioAppDirectory, "assets/studio.js"), "window.__runelightStudio = true")

      const plugin = runelightViteReact({ config: runelightConfig, root, studioAppDirectory })
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

  it("loads a low-level Runelight project index through a virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({ config: runelightConfig, root: fixtureRoot })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:runelight/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:runelight/project-index")
    expect(projectIndex).toEqual(buildRunelightProjectIndex({ cwd: fixtureRoot, sourceRoot: "src" }))
    expect(JSON.stringify(projectIndex)).not.toContain("/runelight/studio")
    expect(JSON.stringify(projectIndex)).not.toContain("urlTemplate")
  })

  it("loads project indexes from a selected TypeScript project scope", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/ts-project-scope")
    const plugin = runelightViteReact({
      config: {
        project: {
          sourceRoot: ".",
          entryRoot: "src/app/runelight",
        },
        host: {
          command: "vite --host 127.0.0.1 --port {port} --strictPort",
        },
      },
      root: fixtureRoot,
      tsconfigPath: "tsconfig.json",
    })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:runelight/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual([
      "src/app/runelight/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("loads route design entries into the virtual project index", () => {
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

      const loaded = plugin.load(plugin.resolveId("virtual:runelight/project-index"))
      const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

      expect(projectIndex.files.map((file) => file.path)).toEqual([
        "src/app/runelight/design/Sketch.g.tsx",
        "src/components/Card.g.tsx",
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("loads project indexes from the nearest TypeScript project scope by default", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/ts-project-scope")
    const plugin = runelightViteReact({
      config: {
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
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual([
      "src/app/runelight/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("loads resolved runelight config through a virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({
      config: {
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

    const resolvedId = plugin.resolveId("virtual:runelight/config")
    const loaded = plugin.load(resolvedId)
    const config = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:runelight/config")
    expect(config.project).toMatchObject({ namespace: "fixture-project", sourceRoot: "src/corpus" })
    expect(config.routes).toMatchObject({ preview: "/runelight", studio: "/runelight/studio" })
  })

  it("loads runelight.config.ts from the Vite project root when config is omitted", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-root-config-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.tsx"), "export default function Card() { return null }\n")
      writeFileSync(
        join(root, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
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

      const loaded = plugin.load(plugin.resolveId("virtual:runelight/project-index"))
      const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

      expect(projectIndex.files.map((file) => file.path)).toEqual(["src/components/Card.g.tsx"])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("uses runelight config for the virtual project index scope", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../core/test/fixtures/check-project")
    const plugin = runelightViteReact({
      config: {
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

    const loaded = plugin.load(plugin.resolveId("virtual:runelight/project-index"))
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual(["src/corpus/Badge.g.tsx", "src/corpus/StatusPanel.g.tsx"])
  })

  it("creates a preview component loader from a Vite module glob and source root", async () => {
    function Card() {
      return null
    }
    const modules: Record<string, () => Promise<RunelightPreviewModule>> = {
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
