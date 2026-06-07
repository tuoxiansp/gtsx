import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { loadRunelightConfig, resolveRunelightConfig } from "../src/config.js"

describe("runelight config", () => {
  it("loads project, route, preview, and Studio settings", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-config-"))
    try {
      writeFileSync(
        join(root, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "components",
    entryRoot: "app/runelight",
    namespace: "demo-app",
    tsconfig: "tsconfig.app.json",
  },
  routes: {
    preview: "/dev/runelight",
  },
  preview: {
    serve: "pnpm dev --port {port}",
    studioUrl: "http://localhost:{port}/dev/runelight/studio",
    url: "http://localhost:{port}/dev/runelight?entry={entry}&frame={frame}{frameOverrides}",
    allUrl: "http://localhost:{port}/dev/runelight?entry={entry}{frameOverrides}",
  },
  studio: {
    manifestCacheTtlMs: 2500,
  },
})
`,
      )

      const result = loadRunelightConfig(root)
      expect(result.diagnostics).toEqual([])
      expect(result.config?.project?.namespace).toBe("demo-app")
      expect(resolveRunelightConfig(result.config!).project).toEqual({
        sourceRoot: "components",
        entryRoot: "app/runelight",
        namespace: "demo-app",
        tsconfig: "tsconfig.app.json",
      })
      expect(resolveRunelightConfig(result.config!).routes).toEqual({
        preview: "/dev/runelight",
        studio: "/runelight/studio",
        manifest: "/runelight/studio/manifest",
      })
      expect(resolveRunelightConfig(result.config!).studio.manifestCacheTtlMs).toBe(2500)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("defaults source root, routes, and Studio cache ttl", () => {
    const resolved = resolveRunelightConfig({
      preview: {
        serve: "pnpm dev --port {port}",
      },
    })

    expect(resolved.project.sourceRoot).toBe("src")
    expect(resolved.project.entryRoot).toBeUndefined()
    expect(resolved.routes.preview).toBe("/runelight")
    expect(resolved.routes.studio).toBe("/runelight/studio")
    expect(resolved.routes.manifest).toBe("/runelight/studio/manifest")
    expect(resolved.studio.manifestCacheTtlMs).toBe(1000)
  })
})
