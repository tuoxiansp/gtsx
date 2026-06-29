import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT,
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID,
} from "@runelight/core/preview-protocol"
import { describe, expect, it } from "vitest"

import { runelightNextReact } from "../src/index.js"
import {
  createRunelightNextPreviewSsrScripts,
  isRunelightNextPreviewRouteEnabled,
  readRunelightNextPreviewProps,
} from "../src/preview-route.js"
import { createRunelightNextSessionResponse } from "../src/session-route.js"

const require = createRequire(import.meta.url)
const runelightConfig = {
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
  },
  host: {
    command: "next dev -H 127.0.0.1 -p {port}",
  },
}
const defaultGeneratedRoot = "src/app/runelight/.runelight"
const defaultPreviewEntriesFile = `${defaultGeneratedRoot}/preview-entries.ts`
const defaultBaselineDirectory = `${defaultGeneratedRoot}/baselines`

function withNodeEnv<T>(nodeEnv: string, run: () => T): T {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = nodeEnv
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
}

function withRunelightDevEnv<T>(run: () => T): T {
  const previous = process.env.RUNELIGHT_DEV
  process.env.RUNELIGHT_DEV = "1"
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.RUNELIGHT_DEV
    else process.env.RUNELIGHT_DEV = previous
  }
}

describe("runelight Next React adapter", () => {
  it("does not expose the generated preview entries module as a package subpath", () => {
    const packageJson = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as {
      exports: Record<string, unknown>
    }

    expect(packageJson.exports["./preview"]).toBeDefined()
    expect(packageJson.exports["./preview-route"]).toBeDefined()
    expect(packageJson.exports["./session-route"]).toBeDefined()
    expect(packageJson.exports["./preview-entries"]).toBeUndefined()
  })

  it("does not enable preview entries or write generated files outside Runelight dev mode", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-dev-disabled-"))
    try {
      withNodeEnv("production", () => {
        const nextConfig = {
          allowedDevOrigins: ["127.0.0.1"],
          webpack(current: unknown) {
            return current
          },
        }
        const config = runelightNextReact({ root })(nextConfig)

        expect(config).not.toBe(nextConfig)
        expect(existsSync(join(root, defaultPreviewEntriesFile))).toBe(false)
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("serves the Runelight session route helper in Runelight dev mode", async () => {
    const previousProjectKey = process.env.RUNELIGHT_PROJECT_KEY
    const previousSessionId = process.env.RUNELIGHT_SESSION_ID

    try {
      process.env.RUNELIGHT_PROJECT_KEY = "project-key"
      process.env.RUNELIGHT_SESSION_ID = "session-id"
      await withRunelightDevEnv(async () => {
        const response = createRunelightNextSessionResponse()

        expect(response.status).toBe(200)
        expect(response.headers.get("cache-control")).toBe("no-store")
        await expect(response.json()).resolves.toEqual({
          serveSession: {
            projectKey: "project-key",
            sessionId: "session-id",
          },
        })
      })
    } finally {
      if (previousProjectKey === undefined) delete process.env.RUNELIGHT_PROJECT_KEY
      else process.env.RUNELIGHT_PROJECT_KEY = previousProjectKey
      if (previousSessionId === undefined) delete process.env.RUNELIGHT_SESSION_ID
      else process.env.RUNELIGHT_SESSION_ID = previousSessionId
    }
  })

  it("keeps Runelight route helpers disabled in production", () => {
    withNodeEnv("production", () => {
      const response = createRunelightNextSessionResponse()

      expect(response.status).toBe(404)
      expect(isRunelightNextPreviewRouteEnabled()).toBe(false)
    })
  })

  it("enables preview entries under Runelight dev mode", () => {
    withRunelightDevEnv(() => {
      const config = runelightNextReact({ config: runelightConfig, root: "/repo" })({})

      expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
      expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe(`./${defaultPreviewEntriesFile}`)
    })
  })

  it("adds webpack and turbopack rules for .g.tsx files", () => {
    const config = withRunelightDevEnv(() => {
      const withRunelight = runelightNextReact({ config: runelightConfig, root: "/repo" })
      return withRunelight({
        allowedDevOrigins: ["127.0.0.1"],
      })
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
      transformPath: expect.stringContaining("contract.js"),
    })
    expect(webpackConfig?.resolve?.alias?.["@runelight/adapter-next-react/preview-entries"]).toBe(
      `/repo/${defaultPreviewEntriesFile}`,
    )
    expect(turboRule).toEqual({
      loaders: [
        {
          loader: expect.stringContaining("loader.cjs"),
          options: {
            previewQuery: "runelight-preview",
            root: "/repo",
            transformPath: expect.stringContaining("contract.js"),
            transpilePreview: true,
          },
        },
      ],
    })
    expect(config.turbopack?.resolveAlias).toMatchObject({
      "@runelight/adapter-next-react/preview": expect.stringMatching(/preview\.(ts|js)$/),
      "@runelight/adapter-next-react/preview-route": expect.stringMatching(/preview-route\.(ts|js)$/),
      "@runelight/adapter-next-react/session-route": expect.stringMatching(/session-route\.(ts|js)$/),
      "@runelight/adapter-next-react/preview-entries": `./${defaultPreviewEntriesFile}`,
    })
  })

  it("widens the Turbopack root when a linked adapter package points outside the project", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-turbopack-root-"))
    const linkedAdapter = mkdtempSync(join(tmpdir(), "runelight-next-linked-adapter-"))

    try {
      mkdirSync(join(root, "node_modules/@runelight"), { recursive: true })
      mkdirSync(join(linkedAdapter, "dist"), { recursive: true })
      writeFileSync(join(linkedAdapter, "dist/preview.js"), "export {}\n")
      symlinkSync(linkedAdapter, join(root, "node_modules/@runelight/adapter-next-react"), "dir")

      const config = withRunelightDevEnv(() => runelightNextReact({ config: runelightConfig, root })({}))
      const turbopackRoot = config.turbopack?.root

      expect(turbopackRoot).toEqual(expect.any(String))
      expect(realpathSync(root).startsWith(turbopackRoot)).toBe(true)
      expect(realpathSync(linkedAdapter).startsWith(turbopackRoot)).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
      rmSync(linkedAdapter, { force: true, recursive: true })
    }
  })

  it("externalizes Runelight server-only packages while preserving user Next config", () => {
    const config = runelightNextReact({ config: runelightConfig, root: "/repo" })({
      serverExternalPackages: ["sharp"],
    })

    expect(config.serverExternalPackages).toEqual(["sharp", "@runelight/core"])
  })

  it("preserves user webpack config, aliases, and existing turbopack rules", () => {
    const config = withRunelightDevEnv(() => {
      const withRunelight = runelightNextReact({ config: runelightConfig, root: "/repo" })
      return withRunelight({
        turbopack: {
          resolveAlias: {
            "@app/existing": "/repo/existing.ts",
          },
          rules: {
            "*.g.tsx": [{ loaders: ["other-loader"], as: "*.tsx" }],
          },
        },
        webpack(current) {
          current.module = { rules: [{ test: /other/ }] }
          current.resolve = { alias: { "@app/existing": "/repo/existing.ts" } }
          return current
        },
      })
    })

    const webpackConfig = config.webpack?.({}, {})
    const turboRule = config.turbopack?.rules?.["*.g.tsx"]

    expect(webpackConfig?.module?.rules).toHaveLength(2)
    expect(webpackConfig?.resolve?.alias).toMatchObject({
      "@app/existing": "/repo/existing.ts",
      "@runelight/adapter-next-react/preview-entries": `/repo/${defaultPreviewEntriesFile}`,
    })
    expect(webpackConfig?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackConfig?.module?.rules?.[1]?.test?.test("other")).toBe(true)
    expect(config.turbopack?.resolveAlias).toMatchObject({
      "@app/existing": "/repo/existing.ts",
      "@runelight/adapter-next-react/preview-entries": `./${defaultPreviewEntriesFile}`,
    })
    expect(Array.isArray(turboRule)).toBe(true)
    expect((turboRule as unknown[])[1]).toEqual({ loaders: ["other-loader"], as: "*.tsx" })
  })

  it("places default generated preview entries under the Runelight entry .runelight directory", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-source-root-registry-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.tsx"), "export default function Card() { return null }\n")

      const config = withRunelightDevEnv(() => runelightNextReact({
        config: runelightConfig,
        root,
      })({}))
      const webpackConfig = config.webpack?.({}, {})
      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")

      expect(existsSync(join(root, ".runelight/preview-entries.ts"))).toBe(false)
      expect(output).toContain('"src/components/Card.g.tsx": () => import("../../../components/Card.g?runelight-preview")')
      expect(webpackConfig?.resolve?.alias).toMatchObject({
        "@runelight/adapter-next-react/preview-entries": join(root, defaultPreviewEntriesFile),
      })
      expect(config.turbopack?.resolveAlias).toMatchObject({
        "@runelight/adapter-next-react/preview-entries": `./${defaultPreviewEntriesFile}`,
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("uses the configured source root for generated preview entries", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-config-root-"))
    try {
      mkdirSync(join(root, "components"), { recursive: true })
      mkdirSync(join(root, "src"), { recursive: true })
      writeFileSync(join(root, "components/AppShell.g.tsx"), "export default function AppShell() { return null }\n")
      writeFileSync(join(root, "src/Ignored.g.tsx"), "export default function Ignored() { return null }\n")

      withRunelightDevEnv(() => {
        runelightNextReact({
          config: {
            contracts: ["@runelight/react/contract"],
            project: { sourceRoot: "components", entryRoot: "components/app/runelight" },
            host: {
              command: "next dev -H 127.0.0.1 -p {port}",
            },
          },
          root,
        })({})
      })

      const output = readFileSync(join(root, "components/app/runelight/.runelight/preview-entries.ts"), "utf8")
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
      writeRunelightConfig(root)

      withRunelightDevEnv(() => {
        runelightNextReact({ root })({})
      })

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
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

      withRunelightDevEnv(() => {
        runelightNextReact({ config: runelightConfig, root })({})
      })

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
      expect(output).toContain('"src/components/ui/Menu.g.tsx": () => import("../../../components/ui/Menu.g?runelight-preview")')
      expect(output).toContain('"src/components/ui/Toast.g.tsx": () => import("../../../components/ui/Toast.g?runelight-preview")')
      expect(output).not.toContain("Ignored")
      expect(output).toContain("export async function loadRunelightNextPreviewComponent")
      expect(output).not.toContain("export const runelightNextPreviewEntryLoaders")
      expect(output).not.toContain("export function parseRunelightNextPreviewEntry")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("does not generate adapter-owned HEAD baseline entries during Next dev startup", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-baseline-registry-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        [
          'import { createGScopeHook, type GFrames } from "@runelight/core"',
          "export default function Card() { return null }",
          "Card.frames = { ready: { props: {} } } satisfies GFrames<Record<string, never>>",
          "",
        ].join("\n"),
      )
      execFileSync("git", ["init"], { cwd: root, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd: root })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd: root })
      execFileSync("git", ["add", "src"], { cwd: root })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd: root, stdio: "ignore" })

      withRunelightDevEnv(() => {
        runelightNextReact({ config: runelightConfig, root })({})
      })

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
      expect(output).toContain(
        '"src/components/Card.g.tsx": () => import("../../../components/Card.g?runelight-preview")',
      )
      expect(output).not.toContain("baselines/HEAD")
      expect(existsSync(join(root, defaultBaselineDirectory))).toBe(false)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("includes source-root preview entries and ignores root-level entry files outside source root", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-preview-registry-"))
    try {
      mkdirSync(join(root, "app/runelight"), { recursive: true })
      mkdirSync(join(root, "src/app/runelight"), { recursive: true })
      mkdirSync(join(root, "src/components/ui"), { recursive: true })
      writeFileSync(join(root, "app/runelight/RouteHost.g.tsx"), "export default function RouteHost() { return null }\n")
      writeFileSync(join(root, "src/app/runelight/SrcRouteHost.g.tsx"), "export default function SrcRouteHost() { return null }\n")
      writeFileSync(join(root, "src/components/ui/Toast.g.tsx"), "export default function Toast() { return null }\n")

      withRunelightDevEnv(() => {
        runelightNextReact({
          config: {
            contracts: ["@runelight/react/contract"],
            project: {
              sourceRoot: "src",
              entryRoot: "src/app/runelight",
            },
            host: {
              command: "next dev -H 127.0.0.1 -p {port}",
            },
          },
          root,
        })({})
      })

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
      expect(output).toContain('"src/app/runelight/SrcRouteHost.g.tsx": () => import("../SrcRouteHost.g?runelight-preview")')
      expect(output).not.toContain('"app/runelight/RouteHost.g.tsx"')
      expect(output).toContain('"src/components/ui/Toast.g.tsx": () => import("../../../components/ui/Toast.g?runelight-preview")')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("installs a webpack preview entry watcher for dev-time file additions", () => {
    const config = withRunelightDevEnv(() => runelightNextReact({ config: runelightConfig, root: "/repo" })({}))
    const webpackConfig = config.webpack?.({ plugins: [] }, { dev: true })

    expect(
      webpackConfig?.plugins?.some(
        (plugin: unknown) => (plugin as { constructor?: { name?: string } }).constructor?.name === "RunelightNextPreviewEntriesPlugin",
      ),
    ).toBe(true)
  })

  it("exposes a CommonJS entry for Next config loading", () => {
    const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
    const config = withRunelightDevEnv(() => cjsEntry.runelightNextReact({ config: runelightConfig, root: "/repo" })({}))

    expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.rules?.["*.g.tsx"]?.loaders?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe(`./${defaultPreviewEntriesFile}`)
  })

  it("loads runelight.config.ts from the CommonJS entry when config is omitted", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-cjs-root-config-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.tsx"), "export default function Card() { return null }\n")
      writeRunelightConfig(root)

      const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
      withRunelightDevEnv(() => {
        cjsEntry.runelightNextReact({ root })({})
      })

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
      expect(output).toContain('"src/components/Card.g.tsx"')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("does not enable preview entries from the CommonJS entry root config in production", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-cjs-production-config-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.tsx"), "export default function Card() { return null }\n")
      writeRunelightConfig(root)

      withNodeEnv("production", () => {
        const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
        cjsEntry.runelightNextReact({ root })({})
      })

      expect(existsSync(join(root, defaultPreviewEntriesFile))).toBe(false)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("reads preview props from Next search params including child frame and input overrides", () => {
    const props = readRunelightNextPreviewProps({
      frame: "ready",
      chrome: "0",
      entry: "src/Card.g.tsx#default",
      frameOverride: ["src/Child.g.tsx#default:open", "src/Menu.g.tsx#default:hover", "src%2FDialog.g.tsx%23default:open%3Aerror"],
      inputOverride: ["src/Toast.g.tsx#Toast:top", "src%2FBanner.g.tsx%23default:warning"],
      pool: "1",
      sessionId: "session-1",
    })

    expect(props).toMatchObject({
      chrome: "0",
      entry: "src/Card.g.tsx#default",
      frameName: "ready",
      pool: "1",
      sessionId: "session-1",
      staticMode: false,
    })
    expect([...props.frameOverrides!]).toEqual([
      ["src/Child.g.tsx#default", "open"],
      ["src/Menu.g.tsx#default", "hover"],
      ["src/Dialog.g.tsx#default", "open:error"],
    ])
    expect([...props.inputOverrides!]).toEqual([
      ["src/Toast.g.tsx#Toast", "top"],
      ["src/Banner.g.tsx#default", "warning"],
    ])
  })

  it("installs SSR preview scripts only when the preview URL requires early render-target delivery", () => {
    const scripts = createRunelightNextPreviewSsrScripts({ pool: "1" })
    const scriptProps = scripts[0]

    expect(createRunelightNextPreviewSsrScripts({ pool: null })).toEqual([])
    expect(scriptProps?.id).toBe(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID)
    expect(scriptProps?.strategy).toBe("beforeInteractive")
    expect(scriptProps?.dangerouslySetInnerHTML.__html).toBe(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT)
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("__runelightPreviewRenderTargetMailbox")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:render-accepted")
  })
})

function writeRunelightConfig(root: string): void {
  writeFileSync(
    join(root, "runelight.config.ts"),
    `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
  },
  host: {
    command: "next dev -H 127.0.0.1 -p {port}",
  },
})
`,
  )
}
