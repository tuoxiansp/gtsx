import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  runelightBaselineRootFromEntryRoot,
  runelightGeneratedRootFromEntryRoot,
  loadRunelightConfig,
  resolveRunelightConfig,
} from "../src/config.js"

describe("runelight config", () => {
  it("loads project, Host, and internal Studio settings", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-config-"))
    try {
      writeFileSync(
        join(root, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
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
    exposeInProduction: true,
  },
})
`,
      )

      const result = loadRunelightConfig(root)
      expect(result.diagnostics).toEqual([])
      expect(result.config?.contracts).toEqual(["@runelight/react/contract"])
      expect(result.config?.project?.namespace).toBe("demo-app")
      expect(resolveRunelightConfig(result.config!).project).toEqual({
        sourceRoot: "components",
        entryRoot: "app/runelight",
        namespace: "demo-app",
        tsconfig: "tsconfig.app.json",
      })
      expect(resolveRunelightConfig(result.config!).host.command).toBe("pnpm dev --port {port}")
      expect(resolveRunelightConfig(result.config!).routes).toEqual({
        events: "/runelight/studio/events",
        preview: "/runelight",
        studio: "/runelight/studio",
        manifest: "/runelight/studio/manifest",
      })
      expect(resolveRunelightConfig(result.config!).studio.exposeInProduction).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("normalizes project roots and defaults routes and internal Studio settings", () => {
    const resolved = resolveRunelightConfig({
      contracts: ["@runelight/react/contract"],
      project: {
        sourceRoot: "src",
        entryRoot: "app/runelight",
      },
      host: {
        command: "pnpm dev --port {port}",
      },
    })

    expect(resolved.project.sourceRoot).toBe("src")
    expect(resolved.project.entryRoot).toBe("app/runelight")
    expect(resolved.routes.preview).toBe("/runelight")
    expect(resolved.routes.studio).toBe("/runelight/studio")
    expect(resolved.routes.manifest).toBe("/runelight/studio/manifest")
    expect(resolved.studio.exposeInProduction).toBe(false)
  })

  it("derives generated Runelight roots from the local entry root", () => {
    expect(runelightGeneratedRootFromEntryRoot("src/app/runelight")).toBe("src/app/runelight/.runelight")
    expect(runelightBaselineRootFromEntryRoot("src/app/runelight")).toBe("src/app/runelight/.runelight/baselines/HEAD")
    expect(runelightGeneratedRootFromEntryRoot(".")).toBe(".runelight")
  })

  it("reports missing public config skeleton fields when loading config", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-config-invalid-"))
    try {
      writeFileSync(
        join(root, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  host: {
    command: "pnpm dev --port {port}",
  },
})
`,
      )

      const result = loadRunelightConfig(root)
      expect(result.config).toBeUndefined()
      expect(result.diagnostics).toMatchObject([
        {
          code: "missing-contracts",
        },
        {
          code: "missing-entry-root",
        },
        {
          code: "missing-source-root",
        },
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("reports config contracts that are not string specifiers", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-config-invalid-contracts-"))
    try {
      writeFileSync(
        join(root, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: [{}],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
  },
})
`,
      )

      const result = loadRunelightConfig(root)
      expect(result.config).toBeUndefined()
      expect(result.diagnostics).toMatchObject([
        {
          code: "invalid-contracts",
        },
      ])
      expect(result.diagnostics[0]?.message).toContain("string specifiers")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("reports host commands that cannot accept a Runelight-owned port", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-config-invalid-host-command-"))
    try {
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
    command: "pnpm dev",
  },
})
`,
      )

      const result = loadRunelightConfig(root)
      expect(result.config).toBeUndefined()
      expect(result.diagnostics).toMatchObject([
        {
          code: "invalid-host-command",
        },
      ])
      expect(result.diagnostics[0]?.message).toContain("{port}")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
