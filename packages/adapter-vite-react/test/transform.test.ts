import { resolve } from "node:path"

import { buildGTSXProjectIndex } from "gtsx/project-index"
import { describe, expect, it } from "vitest"

import { gtsxViteReact } from "../src/index.js"
import { createGTSXVitePreviewComponentLoader, type GTSXPreviewModule } from "../src/preview.js"

describe("gtsx Vite React adapter", () => {
  it("transforms .g.tsx modules through the shared React transform", () => {
    const plugin = gtsxViteReact({ root: "/repo" })
    const result = plugin.transform(
      `
export default function Card(props: { label: string }) {
  return <span>{props.label}</span>
}

Card.cases = {
  ready: { props: { label: "Ready" } },
}
`,
      "/repo/src/Card.g.tsx?import",
    )

    expect(result?.code).toContain('import { defineGComponent as __gtsxDefineGComponent } from "gtsx"')
    expect(result?.code).toContain('const Card = __gtsxDefineGComponent("src/Card.g.tsx#default", CardGTSXImpl)')
  })

  it("does not expose a Studio manifest virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: "src" })
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
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: "src" })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:gtsx/project-index")
    expect(projectIndex).toEqual(buildGTSXProjectIndex({ cwd: fixtureRoot, projectRoot: "src" }))
    expect(JSON.stringify(projectIndex)).not.toContain("/gtsx/studio")
    expect(JSON.stringify(projectIndex)).not.toContain("urlTemplate")
  })

  it("loads project indexes from a selected TypeScript project scope", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/ts-project-scope")
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: ".", tsconfigPath: "tsconfig.json" })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual(["src/Child.g.tsx", "src/Included.g.tsx"])
  })

  it("loads project indexes from the nearest TypeScript project scope by default", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/ts-project-scope")
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: "." })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual(["src/Child.g.tsx", "src/Included.g.tsx"])
  })

  it("loads resolved gtsx config through a virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({
      config: {
        project: {
          namespace: "fixture-project",
          root: "src/corpus",
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
    expect(config.project).toMatchObject({ namespace: "fixture-project", root: "src/corpus" })
    expect(config.routes).toMatchObject({ preview: "/preview", studio: "/gtsx/studio" })
  })

  it("uses gtsx config for the virtual project index scope", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({
      config: {
        project: {
          root: "src/corpus",
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

  it("creates a preview component loader from a Vite module glob and project root", async () => {
    function Card() {
      return null
    }
    const modules: Record<string, () => Promise<GTSXPreviewModule>> = {
      "./components/Card.g.tsx": async () => ({ default: Card }),
    }
    const loadComponent = createGTSXVitePreviewComponentLoader(modules, { projectRoot: "src" })

    await expect(loadComponent("src/components/Card.g.tsx#default")).resolves.toBe(Card)
    await expect(loadComponent("src/components/Missing.g.tsx#default")).resolves.toBeUndefined()
  })
})
