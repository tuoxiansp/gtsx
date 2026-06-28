import { afterEach, describe, expect, it, vi } from "vitest"
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT,
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID,
} from "@runelight/core/preview-protocol"

import { runelightNextReact } from "../src/index.js"
import {
  createRunelightNextPreviewSsrScripts,
  isRunelightNextPreviewRouteEnabled,
  readRunelightNextPreviewProps,
} from "../src/preview-route.js"
import {
  createRunelightNextStudioAssetResponse,
  createRunelightNextStudioResponse,
} from "../src/studio-route.js"
import { createRunelightNextStudioManifestResponse } from "../src/studio-manifest-route.js"

const mockStudioStaticApp = vi.hoisted(() => ({
  directory: "",
}))

type RuntimeImportGlobal = typeof globalThis & {
  __runelightAdapterNextRuntimeImport?: <Module>(specifier: string) => Promise<Module>
}

vi.mock("@runelight/studio/static-app", () => ({
  resolveRunelightStudioAppAssetPath(assetPath = "index.html") {
    const normalizedAssetPath = assetPath.replace(/^\/+/, "")
    return `${mockStudioStaticApp.directory}/${normalizedAssetPath}`
  },
  resolveRunelightStudioAppDirectory() {
    return mockStudioStaticApp.directory
  },
}))

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
const productionRunelightConfig = {
  ...runelightConfig,
  studio: {
    exposeInProduction: true,
  },
}
const defaultGeneratedRoot = "src/app/runelight/.runelight"
const defaultPreviewEntriesFile = `${defaultGeneratedRoot}/preview-entries.ts`
const defaultBaselineRoot = `${defaultGeneratedRoot}/baselines/HEAD`

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

function withRunelightDevEnv<T>(run: () => T): T {
  const previous = process.env.RUNELIGHT_DEV
  process.env.RUNELIGHT_DEV = "1"
  try {
    return run()
  } finally {
    if (previous === undefined) {
      delete process.env.RUNELIGHT_DEV
    } else {
      process.env.RUNELIGHT_DEV = previous
    }
  }
}

describe("runelight Next React adapter", () => {
  afterEach(() => {
    mockStudioStaticApp.directory = ""
    delete (globalThis as RuntimeImportGlobal).__runelightAdapterNextRuntimeImport
  })

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

        expect(config).not.toBe(nextConfig)
        expect(existsSync(join(root, defaultPreviewEntriesFile))).toBe(false)
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("serves prebuilt Studio HTML, assets, and manifest through App Router route helpers", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-studio-route-"))
    const studioDirectory = join(root, "studio-app")

    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      mkdirSync(join(studioDirectory, "assets"), { recursive: true })
      writeFileSync(
        join(root, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(studioDirectory, "index.html"),
        '<!doctype html><div id="root"></div><script type="module" src="/runelight/studio/assets/studio.js"></script>',
      )
      writeFileSync(join(studioDirectory, "assets/studio.js"), "window.__runelightStudio = true")
      mockStudioStaticApp.directory = studioDirectory
      ;(globalThis as RuntimeImportGlobal).__runelightAdapterNextRuntimeImport = (specifier) => import(specifier)

      const htmlResponse = await createRunelightNextStudioResponse({ config: productionRunelightConfig })
      const assetResponse = await createRunelightNextStudioAssetResponse(["studio.js"], {
        config: productionRunelightConfig,
      })
      const manifestResponse = await createRunelightNextStudioManifestResponse({
        config: productionRunelightConfig,
        cwd: root,
      })
      const manifest = await manifestResponse.json()

      expect(htmlResponse.status).toBe(200)
      expect(htmlResponse.headers.get("content-type")).toContain("text/html")
      await expect(htmlResponse.text()).resolves.toContain("/runelight/studio/assets/studio.js")
      expect(assetResponse.status).toBe(200)
      expect(assetResponse.headers.get("content-type")).toContain("text/javascript")
      await expect(assetResponse.text()).resolves.toBe("window.__runelightStudio = true")
      expect(manifestResponse.status).toBe(200)
      expect(manifest.routes).toMatchObject({
        changes: "/runelight/studio/changes",
        events: "/runelight/studio/events",
        preview: "/runelight",
        studio: "/runelight/studio",
        manifest: "/runelight/studio/manifest",
      })
      expect(manifestResponse.headers.get("cache-control")).toBe("no-store")
      expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(["src/components/Card.g.tsx"])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("keeps the static Studio route module decoupled from manifest server code", () => {
    const studioRouteSource = readFileSync(new URL("../src/studio-route.ts", import.meta.url), "utf8")

    expect(studioRouteSource).not.toContain("@runelight/studio/manifest-server")
    expect(studioRouteSource).not.toContain("createStudioManifestProvider")
  })

  it("turns on Studio and preview route helpers from the internal Studio exposure config", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-studio-config-exposed-"))
    const studioDirectory = join(root, "studio-app")
    try {
      mkdirSync(studioDirectory, { recursive: true })
      writeFileSync(join(studioDirectory, "index.html"), "<!doctype html><div>Studio</div>")
      mockStudioStaticApp.directory = studioDirectory

      const htmlResponse = await createRunelightNextStudioResponse({
        config: productionRunelightConfig,
      })

      expect(htmlResponse.status).toBe(200)
      expect(isRunelightNextPreviewRouteEnabled({ config: productionRunelightConfig })).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("keeps Studio route helpers disabled in production by default", async () => {
    await withNodeEnv("production", async () => {
      const response = await createRunelightNextStudioResponse()

      expect(response.status).toBe(404)
    })
  })

  it("enables preview entries under Runelight dev mode", () => {
    withRunelightDevEnv(() => {
      const config = runelightNextReact({ config: runelightConfig, root: "/repo" })({})

      expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
      expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe(`./${defaultPreviewEntriesFile}`)
    })
  })

  it("adds adapter-owned Studio sidecar rewrites under Runelight dev mode", async () => {
    await withRunelightDevEnv(async () => {
      const config = runelightNextReact({ config: runelightConfig, root: "/repo" })({})
      expect(typeof config.rewrites).toBe("function")
      const rewrites = await (config.rewrites as () => Promise<Array<{ destination: string; source: string }>>)()

      expect(Array.isArray(rewrites)).toBe(true)
      expect(rewrites?.[0]).toMatchObject({
        source: "/runelight/studio/events",
        destination: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/runelight\/studio\/events$/),
      })
      expect(rewrites?.[1]).toMatchObject({
        source: "/runelight/studio/changes",
        destination: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/runelight\/studio\/changes$/),
      })
    })
  })

  it("preserves user rewrites when adding Studio sidecar rewrites", async () => {
    await withRunelightDevEnv(async () => {
      const config = runelightNextReact({ config: runelightConfig, root: "/repo-with-rewrites" })({
        async rewrites() {
          return {
            beforeFiles: [{ source: "/before", destination: "/before-destination" }],
            afterFiles: [{ source: "/after", destination: "/after-destination" }],
          }
        },
      })
      const rewrites = await config.rewrites?.()

      expect(rewrites).toMatchObject({
        beforeFiles: [
          {
            source: "/runelight/studio/events",
            destination: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/runelight\/studio\/events$/),
          },
          {
            source: "/runelight/studio/changes",
            destination: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/runelight\/studio\/changes$/),
          },
          { source: "/before", destination: "/before-destination" },
        ],
        afterFiles: [{ source: "/after", destination: "/after-destination" }],
      })
    })
  })

  it("enables production preview entries from the internal Studio exposure config", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-production-exposed-"))
    try {
      withNodeEnv("production", () => {
        const config = runelightNextReact({
          config: productionRunelightConfig,
          root,
        })({})

        expect(config.webpack?.({}, {})?.resolve?.alias?.["@runelight/adapter-next-react/preview-entries"]).toBe(
          join(root, defaultPreviewEntriesFile),
        )
        expect(existsSync(join(root, defaultPreviewEntriesFile))).toBe(true)
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("adds webpack and turbopack rules for .g.tsx files", () => {
    const withRunelight = runelightNextReact({ config: productionRunelightConfig, root: "/repo" })
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
    expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe(`./${defaultPreviewEntriesFile}`)
  })

  it("aliases adapter route helpers for Turbopack package subpath resolution", () => {
    const withRunelight = runelightNextReact({ config: productionRunelightConfig, root: "/repo" })
    const config = withRunelight({})

    expect(config.turbopack?.resolveAlias).toMatchObject({
      "@runelight/adapter-next-react/preview": expect.stringMatching(/preview\.(ts|js)$/),
      "@runelight/adapter-next-react/preview-route": expect.stringMatching(/preview-route\.(ts|js)$/),
      "@runelight/adapter-next-react/studio-route": expect.stringMatching(/studio-route\.(ts|js)$/),
      "@runelight/adapter-next-react/studio-manifest-route": expect.stringMatching(/studio-manifest-route\.(ts|js)$/),
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

      const config = runelightNextReact({ config: productionRunelightConfig, root })({})
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
    const withRunelight = runelightNextReact({ config: productionRunelightConfig, root: "/repo" })
    const config = withRunelight({
      serverExternalPackages: ["sharp", "@runelight/studio"],
    })

    expect(config.serverExternalPackages).toEqual(["sharp", "@runelight/studio", "@runelight/core"])
  })

  it("preserves user webpack config and prepends existing turbopack rules", () => {
    const withRunelight = runelightNextReact({ config: productionRunelightConfig, root: "/repo" })
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
      `/repo/${defaultPreviewEntriesFile}`,
    )
    expect(webpackConfig?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackConfig?.module?.rules?.[1]?.test?.test("other")).toBe(true)
    expect(Array.isArray(turboRule)).toBe(true)
    expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe(`./${defaultPreviewEntriesFile}`)
    expect((turboRule as unknown[])[0]).toMatchObject({
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
    expect((turboRule as unknown[])[1]).toEqual({ loaders: ["other-loader"], as: "*.tsx" })
  })

  it("preserves user aliases and points preview entries at the entry generated root", () => {
    const withRunelight = runelightNextReact({
      config: productionRunelightConfig,
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
      "@runelight/adapter-next-react/preview-entries": `/repo/${defaultPreviewEntriesFile}`,
    })
    expect(config.turbopack?.resolveAlias).toMatchObject({
      "@app/existing": "/repo/existing.ts",
      "@runelight/adapter-next-react/preview-entries": `./${defaultPreviewEntriesFile}`,
    })
  })

  it("places default generated preview entries under the Runelight entry .runelight directory", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-source-root-registry-"))
    try {
      mkdirSync(join(root, "src/components"), { recursive: true })
      writeFileSync(join(root, "src/components/Card.g.tsx"), "export default function Card() { return null }\n")

      const config = runelightNextReact({
        config: productionRunelightConfig,
        root,
      })({})
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

      runelightNextReact({
        config: {
          contracts: ["@runelight/react/contract"],
          project: { sourceRoot: "components", entryRoot: "components/app/runelight" },
          host: {
            command: "next dev -H 127.0.0.1 -p {port}",
          },
          studio: {
            exposeInProduction: true,
          },
        },
        root,
      })({})

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
  studio: {
    exposeInProduction: true,
  },
})
`,
      )

      runelightNextReact({ root })({})

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

      runelightNextReact({ config: productionRunelightConfig, root })({})

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

  it("includes adapter-owned HEAD baseline entries in dev preview registries", () => {
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
      const baselineSource = readFileSync(join(root, defaultBaselineRoot, "src/components/Card.g.tsx"), "utf8")
      const baselineKey = JSON.parse(readFileSync(join(root, defaultBaselineRoot, ".baseline-key"), "utf8"))
      expect(output).toContain(
        `"${defaultBaselineRoot}/src/components/Card.g.tsx": () => import("./baselines/HEAD/src/components/Card.g?runelight-preview")`,
      )
      expect(baselineKey).toMatchObject({
        baselineRoot: defaultBaselineRoot,
        entryRoot: "src/app/runelight",
        runtimeImportSpecifier: "@runelight/react/runtime",
        sourceRoot: "src",
      })
      expect(baselineSource).toContain('from "@runelight/react/runtime"')
      expect(baselineSource).not.toContain('from "@runelight/core"')
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
          contracts: ["@runelight/react/contract"],
          project: {
            sourceRoot: "src",
            entryRoot: "src/app/runelight",
          },
          host: {
            command: "next dev -H 127.0.0.1 -p {port}",
          },
          studio: {
            exposeInProduction: true,
          },
        },
        root,
      })({})

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
      expect(output).toContain('"src/app/runelight/design/SrcRouteDesignHost.g.tsx": () => import("../design/SrcRouteDesignHost.g?runelight-preview")')
      expect(output).not.toContain('"app/runelight/design/RouteDesignHost.g.tsx"')
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
    const config = cjsEntry.runelightNextReact({ config: productionRunelightConfig, root: "/repo" })({})

    expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.rules?.["*.g.tsx"]?.loaders?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.resolveAlias?.["@runelight/adapter-next-react/preview-entries"]).toBe(`./${defaultPreviewEntriesFile}`)
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
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
  },
  host: {
    command: "next dev -H 127.0.0.1 -p {port}",
  },
  studio: {
    exposeInProduction: true,
  },
})
`,
      )

      const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
      cjsEntry.runelightNextReact({ root })({})

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
      expect(output).toContain('"src/components/Card.g.tsx"')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("enables production preview entries from the CommonJS entry root config", () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-next-cjs-production-config-"))
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
    entryRoot: "src/app/runelight",
  },
  host: {
    command: "next dev -H 127.0.0.1 -p {port}",
  },
  studio: {
    exposeInProduction: true,
  },
})
`,
      )

      withNodeEnv("production", () => {
        const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
        cjsEntry.runelightNextReact({ root })({})
      })

      const output = readFileSync(join(root, defaultPreviewEntriesFile), "utf8")
      expect(output).toContain('"src/components/Card.g.tsx"')
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
