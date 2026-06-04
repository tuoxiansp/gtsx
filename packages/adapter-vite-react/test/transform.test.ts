import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { buildGTSXProjectIndex } from "@gtsx/core/project-index"
import { describe, expect, it } from "vitest"

import { gtsxViteReact } from "../src/index.js"
import { createGTSXVitePreviewComponentLoader, type GTSXPreviewModule } from "../src/preview.js"

const gtsxConfig = {
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/gtsx",
  },
  preview: {},
}

describe("gtsx Vite React adapter", () => {
  it("keeps .g.tsx component transforms available during Vite builds", () => {
    const plugin = gtsxViteReact({ root: "/repo" })

    expect(plugin.apply).toBeUndefined()
  })

  it("transforms .g.tsx modules through the shared React transform without loading gtsx.config.ts", () => {
    const plugin = gtsxViteReact({ root: "/repo" })
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

    expect(result?.code).toContain('import { defineGComponent as __gtsxDefineGComponent } from "@gtsx/core"')
    expect(result?.code).toContain('const Card = __gtsxDefineGComponent("src/Card.g.tsx#default", CardGTSXImpl)')
  })

  it("does not expose a Studio manifest virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({ root: fixtureRoot, sourceRoot: "src" })
    plugin.configResolved({ root: fixtureRoot })

    expect(plugin.resolveId("virtual:gtsx/studio-manifest")).toBeNull()
  })

  it("pre-optimizes CommonJS runtime dependencies needed by packed consumers", () => {
    const plugin = gtsxViteReact({ root: "/repo" })

    expect(plugin.config()).toMatchObject({
      optimizeDeps: {
        include: ["react-tracked", "scheduler", "use-context-selector"],
      },
    })
  })

  it("loads a low-level GTSX project index through a virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({ config: gtsxConfig, root: fixtureRoot })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:gtsx/project-index")
    expect(projectIndex).toEqual(buildGTSXProjectIndex({ cwd: fixtureRoot, sourceRoot: "src" }))
    expect(JSON.stringify(projectIndex)).not.toContain("/gtsx/studio")
    expect(JSON.stringify(projectIndex)).not.toContain("urlTemplate")
  })

  it("loads project indexes from a selected TypeScript project scope", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/ts-project-scope")
    const plugin = gtsxViteReact({
      config: {
        project: {
          sourceRoot: ".",
          entryRoot: "src/app/gtsx",
        },
        preview: {},
      },
      root: fixtureRoot,
      tsconfigPath: "tsconfig.json",
    })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual([
      "src/app/gtsx/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("loads route design entries into the virtual project index", () => {
    const root = mkdtempSync(join(tmpdir(), "gtsx-vite-route-design-index-"))

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      mkdirSync(join(root, "src/app/gtsx/design"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(root, "src/app/gtsx/design/Sketch.g.tsx"),
        ["export default function Sketch() { return null }", "Sketch.frames = { live: { props: {} } }", ""].join("\n"),
      )

      const plugin = gtsxViteReact({ config: gtsxConfig, root })
      plugin.configResolved({ root })

      const loaded = plugin.load(plugin.resolveId("virtual:gtsx/project-index"))
      const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

      expect(projectIndex.files.map((file) => file.path)).toEqual([
        "src/app/gtsx/design/Sketch.g.tsx",
        "src/components/Card.g.tsx",
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("loads project indexes from the nearest TypeScript project scope by default", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/ts-project-scope")
    const plugin = gtsxViteReact({
      config: {
        project: {
          sourceRoot: ".",
          entryRoot: "src/app/gtsx",
        },
        preview: {},
      },
      root: fixtureRoot,
    })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual([
      "src/app/gtsx/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("loads resolved gtsx config through a virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({
      config: {
        project: {
          namespace: "fixture-project",
          sourceRoot: "src/corpus",
          entryRoot: "app/gtsx",
        },
        routes: {
          preview: "/preview",
        },
        preview: {},
      },
      root: fixtureRoot,
    })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/config")
    const loaded = plugin.load(resolvedId)
    const config = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:gtsx/config")
    expect(config.project).toMatchObject({ namespace: "fixture-project", sourceRoot: "src/corpus" })
    expect(config.routes).toMatchObject({ preview: "/preview", studio: "/gtsx/studio" })
  })

  it("loads gtsx.config.ts from the Vite project root when config is omitted", () => {
    const root = mkdtempSync(join(tmpdir(), "gtsx-vite-root-config-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.tsx"), "export default function Card() { return null }\n")
      writeFileSync(
        join(root, "gtsx.config.ts"),
        `import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/gtsx",
  },
  preview: {},
})
`,
      )

      const plugin = gtsxViteReact({ root })
      plugin.configResolved({ root })

      const loaded = plugin.load(plugin.resolveId("virtual:gtsx/project-index"))
      const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

      expect(projectIndex.files.map((file) => file.path)).toEqual(["src/components/Card.g.tsx"])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("uses gtsx config for the virtual project index scope", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({
      config: {
        project: {
          sourceRoot: "src/corpus",
          entryRoot: "app/gtsx",
        },
        preview: {},
      },
      root: fixtureRoot,
    })
    plugin.configResolved({ root: fixtureRoot })

    const loaded = plugin.load(plugin.resolveId("virtual:gtsx/project-index"))
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual(["src/corpus/Badge.g.tsx", "src/corpus/StatusPanel.g.tsx"])
  })

  it("creates a preview component loader from a Vite module glob and source root", async () => {
    function Card() {
      return null
    }
    const modules: Record<string, () => Promise<GTSXPreviewModule>> = {
      "../app/gtsx/design/GiftFeature.g.tsx": async () => ({ default: Card }),
      "/app/gtsx/design/RootGiftFeature.g.tsx": async () => ({ default: Card }),
      "./components/Card.g.tsx": async () => ({ default: Card }),
    }
    const loadComponent = createGTSXVitePreviewComponentLoader(modules, { sourceRoot: "src" })

    await expect(loadComponent("src/components/Card.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("app/gtsx/design/GiftFeature.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("app/gtsx/design/RootGiftFeature.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("src/components/Missing.g.tsx#default")).resolves.toBeUndefined()
  })

  it("invalidates the virtual project index when a GTSX file changes", () => {
    const plugin = gtsxViteReact({ config: gtsxConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const virtualModule = { id: "\0virtual:gtsx/project-index" }
    const changedModule = { id: "/repo/src/app/gtsx/design/NewSketch.g.tsx" }
    const invalidated: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/gtsx/design/NewSketch.g.tsx",
      modules: [changedModule],
      server: {
        moduleGraph: {
          getModuleById(id: string) {
            return id === "\0virtual:gtsx/project-index" ? virtualModule : undefined
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
    const plugin = gtsxViteReact({ config: gtsxConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const virtualModule = { id: "/@id/__x00__virtual:gtsx/project-index" }
    const changedModule = { id: "/repo/src/app/gtsx/design/NewSketch.g.tsx" }
    const invalidated: unknown[] = []
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/gtsx/design/NewSketch.g.tsx",
      modules: [changedModule],
      server: {
        moduleGraph: {
          getModuleById() {
            return undefined
          },
          invalidateModule(module: unknown) {
            invalidated.push(module)
          },
          urlToModuleMap: new Map([["/@id/__x00__virtual:gtsx/project-index", virtualModule]]),
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
    const plugin = gtsxViteReact({ config: gtsxConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const changedModule = { id: "/repo/src/app/gtsx/design/NewSketch.g.tsx" }
    let invalidatedAll = false
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.handleHotUpdate?.({
      file: "/repo/src/app/gtsx/design/NewSketch.g.tsx",
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

  it("invalidates project indexes for created GTSX files through Vite's hotUpdate hook", () => {
    const plugin = gtsxViteReact({ config: gtsxConfig, root: "/repo" })
    plugin.configResolved({ root: "/repo" })
    const virtualModule = { id: "\0virtual:gtsx/project-index" }
    const invalidated: unknown[] = []
    const websocketPayloads: unknown[] = []

    const updatedModules = plugin.hotUpdate?.({
      file: "/repo/src/app/gtsx/design/NewSketch.g.tsx",
      modules: [],
      server: {
        moduleGraph: {
          getModuleById(id: string) {
            return id === "\0virtual:gtsx/project-index" ? virtualModule : undefined
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
    const root = mkdtempSync(join(tmpdir(), "gtsx-vite-watch-"))

    try {
      const plugin = gtsxViteReact({ config: gtsxConfig, root })
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
        join(root, "src/app/gtsx"),
        join(root, "src/app/gtsx/design"),
      ])
      expect(existsSync(join(root, "src/app/gtsx/design"))).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
