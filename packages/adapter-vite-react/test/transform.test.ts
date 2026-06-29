import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { runelightReactContract } from "@runelight/react/contract"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runelightViteReact as createPublicRunelightViteReact } from "../src/index.js"
import { createRunelightVitePreviewComponentLoader, type RunelightReactPreviewModule } from "../src/preview.js"

type TestTransformResult = { code: string; map: null } | null
type TestRunelightViteReactPlugin = {
  apply?: unknown
  config(): {
    define: Record<string, string>
    optimizeDeps: {
      exclude: string[]
      include: string[]
    }
    resolve: {
      dedupe: string[]
    }
  }
  configResolved(config: { root: string }): void
  configureServer(server: unknown): void
  handleHotUpdate?(context: unknown): unknown[] | undefined
  hotUpdate?(context: unknown): unknown[] | undefined
  load(id: string | null): Promise<TestTransformResult>
  resolveId(id: string): string | null
  transform(code: string, id: string): TestTransformResult
}

const runelightViteReact = createPublicRunelightViteReact as (
  options?: Parameters<typeof createPublicRunelightViteReact>[0],
) => TestRunelightViteReactPlugin

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

  it("dedupes React runtime packages for linked local Runelight packages", () => {
    const plugin = runelightViteReact({ root: "/repo" })

    expect(plugin.config()).toMatchObject({
      resolve: {
        dedupe: ["react", "react-dom"],
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
  ready: { description: "ready frame", props: { label: "Ready" } },
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
  ready: { description: "ready frame", props: { label: "Ready" } },
}
`,
      "/repo/src/Card.g.tsx?runelight-preview",
    )

    expect(result?.code).toContain('import { defineGComponent as __runelightDefineGComponent } from "@runelight/react/runtime"')
    expect(result?.code).toContain('const Card = __runelightDefineGComponent("src/Card.g.tsx#default", CardRunelightImpl)')
    expect(result?.code).toContain("Card.frames")
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
            "@runelight/adapter-vite-react",
            "typescript",
          "virtual:runelight/preview-config",
          "virtual:runelight/project-index",
        ],
      },
    })
  })

  it("serves the Runelight session endpoint from the Vite dev server", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-session-host-"))
    const previousProjectKey = process.env.RUNELIGHT_PROJECT_KEY
    const previousSessionId = process.env.RUNELIGHT_SESSION_ID

    try {
      process.env.RUNELIGHT_DEV = "1"
      process.env.RUNELIGHT_PROJECT_KEY = "project-key"
      process.env.RUNELIGHT_SESSION_ID = "session-id"

      const plugin = runelightViteReact({ config: runelightConfig, root })
      plugin.configResolved({ root })
      const server = createViteMiddlewareHarness()
      plugin.configureServer(server)

      const sessionResponse = await server.request("/runelight/session")
      expect(sessionResponse).toMatchObject({ statusCode: 200 })
      expect(sessionResponse.headers["cache-control"]).toBe("no-store")
      expect(JSON.parse(sessionResponse.body)).toEqual({
        serveSession: {
          projectKey: "project-key",
          sessionId: "session-id",
        },
      })
    } finally {
      if (previousProjectKey === undefined) delete process.env.RUNELIGHT_PROJECT_KEY
      else process.env.RUNELIGHT_PROJECT_KEY = previousProjectKey
      if (previousSessionId === undefined) delete process.env.RUNELIGHT_SESSION_ID
      else process.env.RUNELIGHT_SESSION_ID = previousSessionId
      rmSync(root, { force: true, recursive: true })
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
    expect(JSON.stringify(projectIndex)).not.toContain("/runelight/session")
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
      "src/Child.g.tsx",
      "src/Included.g.tsx",
      "src/Sketch.g.tsx",
    ])
  })

  it("does not load entry-root files outside the configured source root", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-entry-root-index-"))

    try {
      mkdirSync(join(root, "app/runelight"), { recursive: true })
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(root, "app/runelight/Sketch.g.tsx"),
        ["export default function Sketch() { return null }", "Sketch.frames = { live: { props: {} } }", ""].join("\n"),
      )

      const plugin = runelightViteReact({
        config: {
          ...runelightConfig,
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

      expect(projectIndex.files.map((file) => file.path)).toEqual(["src/components/Card.g.tsx"])
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
      "src/Child.g.tsx",
      "src/Included.g.tsx",
      "src/Sketch.g.tsx",
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

    expect(projectIndex.files.map((file) => file.path)).toEqual(["src/corpus/Badge.g.tsx", "src/corpus/StatusPanel.g.tsx"])
  })

  it("creates a preview component loader from a Vite module glob and source root", async () => {
    function Card() {
      return null
    }
    const modules: Record<string, () => Promise<RunelightReactPreviewModule>> = {
      "../scratch/GiftFeature.g.tsx": async () => ({ default: Card }),
      "/scratch/RootGiftFeature.g.tsx": async () => ({ default: Card }),
      "./components/Card.g.tsx": async () => ({ default: Card }),
    }
    const loadComponent = createRunelightVitePreviewComponentLoader(modules, { sourceRoot: "src" })

    await expect(loadComponent("src/components/Card.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("scratch/GiftFeature.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("scratch/RootGiftFeature.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("src/components/Missing.g.tsx#default")).resolves.toBeUndefined()
  })

  it("invalidates the virtual project index when a Runelight file changes", () => {
    const plugin = runelightViteReact({ config: runelightConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const virtualModule = { id: "\0virtual:runelight/project-index" }
    const changedModule = { id: "/repo/src/app/runelight/NewSketch.g.tsx" }
    const invalidated: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/runelight/NewSketch.g.tsx",
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
    const changedModule = { id: "/repo/src/app/runelight/NewSketch.g.tsx" }
    const invalidated: unknown[] = []
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/runelight/NewSketch.g.tsx",
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
    const changedModule = { id: "/repo/src/app/runelight/NewSketch.g.tsx" }
    let invalidatedAll = false
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/runelight/NewSketch.g.tsx",
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
      file: "/repo/src/app/runelight/NewSketch.g.tsx",
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

  it("watches the source root and entry root during Vite dev without creating a design directory", () => {
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
      ])
      expect(existsSync(join(root, "src/app/runelight/design"))).toBe(false)
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
  type Middleware = (request: { method?: string; on?(event: "close", listener: () => void): void; url?: string }, response: unknown, next: () => void) => void
  const middlewares: Middleware[] = []
  const watcherListeners: Array<(eventName: string, path: string) => void> = []

  return {
    middlewares: {
      use(handler: Middleware) {
        middlewares.push(handler)
      },
    },
    watcher: {
      add() {},
      on(event: "all", listener: (eventName: string, path: string) => void) {
        if (event === "all") watcherListeners.push(listener)
      },
    },
    emitWatcher(eventName: string, path: string) {
      for (const listener of watcherListeners) listener(eventName, path)
    },
    async open(url: string): Promise<{ close(): void; response: ViteMiddlewareResponse }> {
      let index = 0
      const closeListeners: Array<() => void> = []
      const response: ViteMiddlewareResponse = {
        body: "",
        headers: {},
        statusCode: 404,
      }
      await new Promise<void>((resolveOpen) => {
        let resolved = false
        const resolveOnce = () => {
          if (resolved) return
          resolved = true
          resolveOpen()
        }
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
          write(body = "") {
            response.body += String(body)
            resolveOnce()
          },
          end(body = "") {
            response.body += String(body)
            resolveOnce()
          },
        }
        const next = () => {
          const middleware = middlewares[index++]
          if (!middleware) {
            resolveOnce()
            return
          }

          middleware({
            method: "GET",
            on(event, listener) {
              if (event === "close") closeListeners.push(listener)
            },
            url,
          }, writableResponse, next)
        }

        next()
      })

      return {
        close() {
          for (const listener of closeListeners) listener()
        },
        response,
      }
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
