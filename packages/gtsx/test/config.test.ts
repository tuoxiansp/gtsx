import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { loadGTSXConfig, resolveGTSXConfig } from "../src/config.js"

describe("gtsx config", () => {
  it("loads project, route, preview, and Studio settings", () => {
    const root = mkdtempSync(join(tmpdir(), "gtsx-config-"))
    try {
      writeFileSync(
        join(root, "gtsx.config.ts"),
        `import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    root: "components",
    namespace: "demo-app",
    tsconfig: "tsconfig.app.json",
  },
  routes: {
    preview: "/dev/gtsx",
  },
  preview: {
    serve: "pnpm dev --port {port}",
    studioUrl: "http://localhost:{port}/dev/gtsx/studio",
    url: "http://localhost:{port}/dev/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://localhost:{port}/dev/gtsx?entry={entry}{gcase}",
  },
  studio: {
    manifestCacheTtlMs: 2500,
  },
})
`,
      )

      const result = loadGTSXConfig(root)
      expect(result.diagnostics).toEqual([])
      expect(result.config?.project?.namespace).toBe("demo-app")
      expect(resolveGTSXConfig(result.config!).project).toEqual({
        root: "components",
        namespace: "demo-app",
        tsconfig: "tsconfig.app.json",
      })
      expect(resolveGTSXConfig(result.config!).routes).toEqual({
        preview: "/dev/gtsx",
        studio: "/gtsx/studio",
        manifest: "/gtsx/studio/manifest",
      })
      expect(resolveGTSXConfig(result.config!).studio.manifestCacheTtlMs).toBe(2500)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("defaults project root, routes, and Studio cache ttl", () => {
    const resolved = resolveGTSXConfig({
      preview: {
        serve: "pnpm dev --port {port}",
      },
    })

    expect(resolved.project.root).toBe("src")
    expect(resolved.routes.preview).toBe("/gtsx")
    expect(resolved.routes.studio).toBe("/gtsx/studio")
    expect(resolved.routes.manifest).toBe("/gtsx/studio/manifest")
    expect(resolved.studio.manifestCacheTtlMs).toBe(1000)
  })
})
