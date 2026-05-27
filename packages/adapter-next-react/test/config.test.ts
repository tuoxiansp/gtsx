import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { gtsxNextReact } from "../src/index.js"
import { readGTSXNextPreviewProps } from "../src/preview-route.js"

const require = createRequire(import.meta.url)

describe("gtsx Next React adapter", () => {
  it("adds webpack and turbopack rules for .g.tsx files", () => {
    const withGTSX = gtsxNextReact({ root: "/repo" })
    const config = withGTSX({
      allowedDevOrigins: ["127.0.0.1"],
    })

    const webpackConfig = config.webpack?.({}, {})
    const webpackRule = webpackConfig?.module?.rules?.[0]
    const turboRule = config.turbopack?.rules?.["*.g.tsx"]

    expect(webpackRule?.test?.test("Card.g.tsx")).toBe(true)
    expect(webpackRule?.enforce).toBe("pre")
    expect(webpackRule?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackRule?.use?.[0]?.options).toEqual({
      root: "/repo",
      transformPath: expect.stringContaining("react-transform.js"),
    })
    expect(webpackConfig?.resolve?.alias?.["@gtsx/adapter-next-react/preview-entries"]).toBe(
      "/repo/.gtsx/preview-entries.ts",
    )
    expect(turboRule).toEqual({
      loaders: [
        {
          loader: expect.stringContaining("loader.cjs"),
          options: { root: "/repo", transformPath: expect.stringContaining("react-transform.js") },
        },
      ],
      as: "*.tsx",
    })
    expect(config.turbopack?.resolveAlias?.["@gtsx/adapter-next-react/preview-entries"]).toBe("./.gtsx/preview-entries.ts")
  })

  it("preserves user webpack config and prepends existing turbopack rules", () => {
    const withGTSX = gtsxNextReact({ root: "/repo" })
    const config = withGTSX({
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
    expect(webpackConfig?.resolve?.alias?.["@gtsx/adapter-next-react/preview-entries"]).toBe(
      "/repo/.gtsx/preview-entries.ts",
    )
    expect(webpackConfig?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackConfig?.module?.rules?.[1]?.test?.test("other")).toBe(true)
    expect(Array.isArray(turboRule)).toBe(true)
    expect(config.turbopack?.resolveAlias?.["@gtsx/adapter-next-react/preview-entries"]).toBe("./.gtsx/preview-entries.ts")
    expect((turboRule as unknown[])[0]).toMatchObject({
      loaders: [
        {
          loader: expect.stringContaining("loader.cjs"),
          options: { root: "/repo", transformPath: expect.stringContaining("react-transform.js") },
        },
      ],
      as: "*.tsx",
    })
    expect((turboRule as unknown[])[1]).toEqual({ loaders: ["other-loader"], as: "*.tsx" })
  })

  it("preserves user aliases and supports a custom preview entries module id", () => {
    const withGTSX = gtsxNextReact({
      previewEntries: {
        moduleId: "@app/gtsx-preview-entries",
        outputFile: ".generated/gtsx-preview-entries.ts",
      },
      root: "/repo",
    })
    const config = withGTSX({
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
      "@app/gtsx-preview-entries": "/repo/.generated/gtsx-preview-entries.ts",
    })
    expect(config.turbopack?.resolveAlias).toMatchObject({
      "@app/existing": "/repo/existing.ts",
      "@app/gtsx-preview-entries": "./.generated/gtsx-preview-entries.ts",
    })
  })

  it("uses the configured project root for generated preview entries", () => {
    const root = mkdtempSync(join(tmpdir(), "gtsx-next-config-root-"))
    try {
      mkdirSync(join(root, "components"), { recursive: true })
      mkdirSync(join(root, "src"), { recursive: true })
      writeFileSync(join(root, "components/AppShell.g.tsx"), "export default function AppShell() { return null }\n")
      writeFileSync(join(root, "src/Ignored.g.tsx"), "export default function Ignored() { return null }\n")

      gtsxNextReact({
        config: {
          project: { root: "components" },
          preview: {},
        },
        root,
      })({})

      const output = readFileSync(join(root, ".gtsx/preview-entries.ts"), "utf8")
      expect(output).toContain('"components/AppShell.g.tsx"')
      expect(output).not.toContain("src/Ignored.g.tsx")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("writes a generated lazy preview entry registry for Next projects", () => {
    const root = mkdtempSync(join(tmpdir(), "gtsx-next-registry-"))
    try {
      mkdirSync(join(root, "src/components/ui"), { recursive: true })
      mkdirSync(join(root, "src/generated"), { recursive: true })
      writeFileSync(join(root, "src/components/ui/Toast.g.tsx"), "export default function Toast() { return null }\n")
      writeFileSync(join(root, "src/components/ui/Menu.g.tsx"), "export function Menu() { return null }\n")
      writeFileSync(join(root, "src/generated/Ignored.tsx"), "export default function Ignored() { return null }\n")

      gtsxNextReact({ root })({})

      const output = readFileSync(join(root, ".gtsx/preview-entries.ts"), "utf8")
      expect(output).toContain('"src/components/ui/Menu.g.tsx": () => import("../src/components/ui/Menu.g")')
      expect(output).toContain('"src/components/ui/Toast.g.tsx": () => import("../src/components/ui/Toast.g")')
      expect(output).not.toContain("Ignored")
      expect(output).toContain("export async function loadGTSXPreviewComponent")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("exposes a CommonJS entry for Next config loading", () => {
    const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
    const config = cjsEntry.gtsxNextReact({ root: "/repo" })({})

    expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.rules?.["*.g.tsx"]?.loaders?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.resolveAlias?.["@gtsx/adapter-next-react/preview-entries"]).toBe("./.gtsx/preview-entries.ts")
  })

  it("reads preview props from Next search params including child case overrides", () => {
    const props = readGTSXNextPreviewProps({
      case: "ready",
      chrome: "0",
      entry: "src/Card.g.tsx#default",
      gcase: ["src/Child.g.tsx#default:open", "src/Menu.g.tsx#default:hover"],
      pool: "1",
      sessionId: "session-1",
      static: "1",
    })

    expect(props).toMatchObject({
      caseName: "ready",
      chrome: "0",
      entry: "src/Card.g.tsx#default",
      pool: "1",
      sessionId: "session-1",
      staticMode: true,
    })
    expect([...props.caseOverrides!]).toEqual([
      ["src/Child.g.tsx#default", "open"],
      ["src/Menu.g.tsx#default", "hover"],
    ])
  })
})
