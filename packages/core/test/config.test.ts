import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { loadRunelightConfig, resolveRunelightConfig } from "../src/config.js"

describe("runelight config", () => {
  it("loads project, Host, and Studio settings", () => {
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
  host: {
    command: "pnpm dev --port {port}",
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
      expect(resolveRunelightConfig(result.config!).host.command).toBe("pnpm dev --port {port}")
      expect(resolveRunelightConfig(result.config!).routes).toEqual({
        preview: "/runelight",
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
      host: {
        command: "pnpm dev --port {port}",
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
