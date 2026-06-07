import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT, runelightPreviewSsrBootstrapScriptId } from "@runelight/core/preview-protocol"

import { runelightNextReact } from "../src/index.js"
import {
  createRunelightNextPreviewSsrScripts,
  readRunelightNextPreviewProps,
  shouldInstallRunelightNextPreviewSsrScripts,
} from "../src/preview-route.js"

const require = createRequire(import.meta.url)
const runelightConfig = {
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
  },
  preview: {},
}

function withNodeEnv<T>(nodeEnv: string, run: () => T): T {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = nodeEnv
  try {
    return run()
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previous
    }
  }
}

describe("runelight Next React adapter", () => {
  it("does not enable production preview entries or write generated files by default", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-production-disabled-"))
    try {
      withNodeEnv("production", () => {
        const nextConfig = {
          allowedDevOrigins: ["127.0.0.1"],
          webpack(current: unknown) {
            return current
          },
        }
        const config = runelightNextReact({ root })(nextConfig)

        expect(config).toBe(nextConfig)
        expect(existsSync(join(root, ".runelight/preview-entries.ts"))).toBe(false)
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("can explicitly enable production preview entries for projects that want to ship Runelight routes", () => {
    withNodeEnv("production", () => {
      const config = runelightNextReact({ config: runelightConfig, enabled: true, root: "/repo" })({})

      expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
      expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe("./.runelight/preview-entries.ts")
    })
  })

  it("adds webpack and turbopack rules for .g.tsx files", () => {
    const withRunelight = runelightNextReact({ config: runelightConfig, root: "/repo" })
    const config = withRunelight({
      allowedDevOrigins: ["127.0.0.1"],
    })

    const webpackConfig = config.webpack?.({}, {})
    const webpackRule = webpackConfig?.module?.rules?.[0]
    const turboRule = config.turbopack?.rules?.["*.g.tsx"]

    expect(webpackRule?.test?.test("Card.g.tsx")).toBe(true)
    expect(webpackRule?.enforce).toBe("pre")
    expect(webpackRule?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackRule?.use?.[0]?.options).toEqual({
      previewQuery: "runelight-preview",
      root: "/repo",
      transformPath: expect.stringContaining("react-transform.js"),
    })
    expect(webpackConfig?.resolve?.alias?.["@runelight/adapter-next-react/preview-entries"]).toBe(
      "/repo/.runelight/preview-entries.ts",
    )
    expect(turboRule).toEqual({
      loaders: [
        {
          loader: expect.stringContaining("loader.cjs"),
          options: {
            previewQuery: "runelight-preview",
            root: "/repo",
            transformPath: expect.stringContaining("react-transform.js"),
            transpilePreview: true,
          },
        },
      ],
    })
    expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe("./.runelight/preview-entries.ts")
  })

  it("preserves user webpack config and prepends existing turbopack rules", () => {
    const withRunelight = runelightNextReact({ config: runelightConfig, root: "/repo" })
    const config = withRunelight({
      webpack(current, _context) {
        current.module = { rules: [{ test: /other/ }] }
        return current
      },
      turbopack: {
        rules: {
          "*.g.tsx": [{ loaders: ["other-loader"], as: "*.tsx" }],
        },
      },
    })

    const webpackConfig = config.webpack?.({}, {})
    const turboRule = config.turbopack?.rules?.["*.g.tsx"]

    expect(webpackConfig?.module?.rules).toHaveLength(2)
    expect(webpackConfig?.resolve?.alias?.["@runelight/adapter-next-react/preview-entries"]).toBe(
      "/repo/.runelight/preview-entries.ts",
    )
    expect(webpackConfig?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackConfig?.module?.rules?.[1]?.test?.test("other")).toBe(true)
    expect(Array.isArray(turboRule)).toBe(true)
    expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe("./.runelight/preview-entries.ts")
    expect((turboRule as unknown[])[0]).toMatchObject({
      loaders: [
        {
          loader: expect.stringContaining("loader.cjs"),
          options: {
            previewQuery: "runelight-preview",
            root: "/repo",
            transformPath: expect.stringContaining("react-transform.js"),
            transpilePreview: true,
          },
        },
      ],
    })
    expect((turboRule as unknown[])[1]).toEqual({ loaders: ["other-loader"], as: "*.tsx" })
  })

  it("preserves user aliases and supports a custom preview entries module id", () => {
    const withRunelight = runelightNextReact({
      config: runelightConfig,
      previewEntries: {
        moduleId: "@app/runelight-preview-entries",
        outputFile: ".generated/runelight-preview-entries.ts",
      },
      root: "/repo",
    })
    const config = withRunelight({
      turbopack: {
        resolveAlias: {
          "@app/existing": "/repo/existing.ts",
        },
      },
      webpack(current) {
        current.resolve = {
          alias: {
            "@app/existing": "/repo/existing.ts",
          },
        }
        return current
      },
    })

    const webpackConfig = config.webpack?.({}, {})

    expect(webpackConfig?.resolve?.alias).toMatchObject({
      "@app/existing": "/repo/existing.ts",
      "@app/runelight-preview-entries": "/repo/.generated/runelight-preview-entries.ts",
    })
    expect(config.turbopack?.resolveAlias).toMatchObject({
      "@app/existing": "/repo/existing.ts",
      "@app/runelight-preview-entries": "./.generated/runelight-preview-entries.ts",
    })
  })

  it("uses the configured source root for generated preview entries", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-config-root-"))
    try {
      mkdirSync(join(root, "components"), { recursive: true })
      mkdirSync(join(root, "src"), { recursive: true })
      writeFileSync(join(root, "components/AppShell.g.tsx"), "export default function AppShell() { return null }\n")
      writeFileSync(join(root, "src/Ignored.g.tsx"), "export default function Ignored() { return null }\n")

      runelightNextReact({
        config: {
          project: { sourceRoot: "components", entryRoot: "components/app/runelight" },
          preview: {},
        },
        root,
      })({})

      const output = readFileSync(join(root, ".runelight/preview-entries.ts"), "utf8")
      expect(output).toContain('"components/AppShell.g.tsx"')
      expect(output).not.toContain("src/Ignored.g.tsx")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("loads runelight.config.ts from the project root when config is omitted", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-root-config-"))
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
  preview: {},
})
`,
      )

      runelightNextReact({ root })({})

      const output = readFileSync(join(root, ".runelight/preview-entries.ts"), "utf8")
      expect(output).toContain('"src/components/Card.g.tsx"')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("writes a generated lazy preview entry registry for Next projects", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-registry-"))
    try {
      mkdirSync(join(root, "src/components/ui"), { recursive: true })
      mkdirSync(join(root, "src/generated"), { recursive: true })
      writeFileSync(join(root, "src/components/ui/Toast.g.tsx"), "export default function Toast() { return null }\n")
      writeFileSync(join(root, "src/components/ui/Menu.g.tsx"), "export function Menu() { return null }\n")
      writeFileSync(join(root, "src/generated/Ignored.tsx"), "export default function Ignored() { return null }\n")

      runelightNextReact({ config: runelightConfig, root })({})

      const output = readFileSync(join(root, ".runelight/preview-entries.ts"), "utf8")
      expect(output).toContain('"src/components/ui/Menu.g.tsx": () => import("../src/components/ui/Menu.g?runelight-preview")')
      expect(output).toContain('"src/components/ui/Toast.g.tsx": () => import("../src/components/ui/Toast.g?runelight-preview")')
      expect(output).not.toContain("Ignored")
      expect(output).toContain("export async function loadRunelightPreviewComponent")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("includes the configured design workspace entry when present", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-design-registry-"))
    try {
      mkdirSync(join(root, "app/runelight/design"), { recursive: true })
      mkdirSync(join(root, "src/app/runelight/design"), { recursive: true })
      mkdirSync(join(root, "src/components/ui"), { recursive: true })
      writeFileSync(join(root, "app/runelight/design/RouteDesignHost.g.tsx"), "export default function RouteDesignHost() { return null }\n")
      writeFileSync(join(root, "src/app/runelight/design/SrcRouteDesignHost.g.tsx"), "export default function SrcRouteDesignHost() { return null }\n")
      writeFileSync(join(root, "src/components/ui/Toast.g.tsx"), "export default function Toast() { return null }\n")

      runelightNextReact({
        config: {
          project: {
            sourceRoot: "src",
            entryRoot: "src/app/runelight",
          },
          preview: {},
        },
        root,
      })({})

      const output = readFileSync(join(root, ".runelight/preview-entries.ts"), "utf8")
      expect(output).toContain('"src/app/runelight/design/SrcRouteDesignHost.g.tsx": () => import("../src/app/runelight/design/SrcRouteDesignHost.g?runelight-preview")')
      expect(output).not.toContain('"app/runelight/design/RouteDesignHost.g.tsx"')
      expect(output).toContain('"src/components/ui/Toast.g.tsx": () => import("../src/components/ui/Toast.g?runelight-preview")')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("installs a webpack preview entry watcher for dev-time file additions", () => {
    const config = runelightNextReact({ config: runelightConfig, root: "/repo" })({})
    const webpackConfig = config.webpack?.({ plugins: [] }, { dev: true })

    expect(
      webpackConfig?.plugins?.some(
        (plugin: unknown) => (plugin as { constructor?: { name?: string } }).constructor?.name === "RunelightNextPreviewEntriesPlugin",
      ),
    ).toBe(true)
  })

  it("exposes a CommonJS entry for Next config loading", () => {
    const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
    const config = cjsEntry.runelightNextReact({ config: runelightConfig, root: "/repo" })({})

    expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.rules?.["*.g.tsx"]?.loaders?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe("./.runelight/preview-entries.ts")
  })

  it("loads runelight.config.ts from the CommonJS entry when config is omitted", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-cjs-root-config-"))
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
  preview: {},
})
`,
      )

      const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
      cjsEntry.runelightNextReact({ root })({})

      const output = readFileSync(join(root, ".runelight/preview-entries.ts"), "utf8")
      expect(output).toContain('"src/components/Card.g.tsx"')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("reads preview props from Next search params including child frame overrides", () => {
    const props = readRunelightNextPreviewProps({
      frame: "ready",
      chrome: "0",
      entry: "src/Card.g.tsx#default",
      frameOverride: ["src/Child.g.tsx#default:open", "src/Menu.g.tsx#default:hover"],
      pool: "1",
      sessionId: "session-1",
      static: "1",
    })

    expect(props).toMatchObject({
      frameName: "ready",
      chrome: "0",
      entry: "src/Card.g.tsx#default",
      pool: "1",
      sessionId: "session-1",
      staticMode: true,
    })
    expect([...props.frameOverrides!]).toEqual([
      ["src/Child.g.tsx#default", "open"],
      ["src/Menu.g.tsx#default", "hover"],
    ])
  })

  it("installs SSR preview scripts only when the preview URL requires early render-target delivery", () => {
    const scripts = createRunelightNextPreviewSsrScripts({ pool: "1" })
    const scriptProps = scripts[0]

    expect(shouldInstallRunelightNextPreviewSsrScripts({ pool: "1" })).toBe(true)
    expect(shouldInstallRunelightNextPreviewSsrScripts({ pool: null })).toBe(false)
    expect(createRunelightNextPreviewSsrScripts({ pool: null })).toEqual([])
    expect(scriptProps?.id).toBe(runelightPreviewSsrBootstrapScriptId)
    expect(scriptProps?.strategy).toBe("beforeInteractive")
    expect(scriptProps?.dangerouslySetInnerHTML.__html).toBe(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT)
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("__runelightPreviewRenderTargetMailbox")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:render-accepted")
  })
})
