import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"

import { buildGTSXProjectIndex } from "@gtsx/core/project-index"
import { createStudioManifest, studioUrlSearchFromSearchParams } from "../src/index.js"
import { createStudioManifestProvider, discoverStudioDesignManifest } from "../src/manifest-server.js"

const fixtureRoot = join(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
const tsProjectScopeRoot = join(import.meta.dirname, "../../gtsx/test/fixtures/ts-project-scope")
const repositoryRoot = resolve(import.meta.dirname, "../../..")
const packageRoot = join(repositoryRoot, "packages/studio")
const examplesRoot = join(repositoryRoot, "examples")
const playgroundProjects = [
  {
    root: join(repositoryRoot, "playground/tanstack-start-root-provider-error"),
    projectRoot: "src/routes",
    coordinates: ["src/routes/__root.g.tsx#default"],
  },
  {
    root: join(repositoryRoot, "playground/next-app-router-init-structure"),
    projectRoot: "components",
    coordinates: ["components/AppShell.g.tsx#default"],
  },
  {
    root: join(repositoryRoot, "playground/vite-react-ts-tanstack-router"),
    projectRoot: "src/routes",
    coordinates: ["src/routes/AppRoute.g.tsx#default"],
  },
]

type CreateStudioManifestOptions = NonNullable<Parameters<typeof createStudioManifest>[1]>

function buildStudioManifest(
  options: { cwd: string; projectRoot?: string; tsconfigPath?: string } & CreateStudioManifestOptions,
) {
  const projectIndex = buildGTSXProjectIndex({
    cwd: options.cwd,
    projectRoot: options.projectRoot,
    tsconfigPath: options.tsconfigPath,
  })
  return createStudioManifest(projectIndex, {
    cache: options.cache,
    preview: options.preview,
    routes: options.routes,
    diagnostics: options.diagnostics,
  })
}

function manifestJsonKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(manifestJsonKeys)

  return Object.entries(value).flatMap(([key, nested]) => [key, ...manifestJsonKeys(nested)])
}

describe("GTSX Studio manifest", () => {
  it("returns stable static JSON for a project surface", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src/corpus",
      preview: { urlTemplate: "https://preview.test/gtsx?entry={entry}&frame={frame}&port={port}" },
    })

    expect(manifest).toEqual({
      version: 1,
      routes: {
        preview: "/gtsx",
        studio: "/gtsx/studio",
        manifest: "/gtsx/studio/manifest",
      },
      preview: {
        urlTemplate: "https://preview.test/gtsx?entry={entry}&frame={frame}&port={port}",
        allUrlTemplate: "/gtsx?entry={entry}{gframe}",
      },
      files: [
        {
          path: "src/corpus/Badge.g.tsx",
          sourceHash: expect.any(String),
          groupId: "file:src/corpus/Badge.g.tsx",
          components: [
            {
              coordinate: "src/corpus/Badge.g.tsx#default",
              filePath: "src/corpus/Badge.g.tsx",
              sourceHash: expect.any(String),
              exportName: "default",
              componentName: "Badge",
              mode: "pure",
              frames: [
                { kind: "pure", name: "neutral" },
                { kind: "pure", name: "success" },
              ],
              providers: {},
              diagnostics: [],
            },
          ],
          diagnostics: [],
        },
        {
          path: "src/corpus/StatusPanel.g.tsx",
          sourceHash: expect.any(String),
          groupId: "file:src/corpus/StatusPanel.g.tsx",
          components: [
            {
              coordinate: "src/corpus/StatusPanel.g.tsx#default",
              filePath: "src/corpus/StatusPanel.g.tsx",
              sourceHash: expect.any(String),
              exportName: "default",
              componentName: "StatusPanel",
              mode: "pure",
              frames: [
                { kind: "pure", name: "loading" },
                { kind: "pure", name: "error" },
              ],
              providers: {},
              diagnostics: [],
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    })
  })

  it("assembles Studio route and grouping concerns from a GTSX project index", () => {
    const projectIndex = buildGTSXProjectIndex({ cwd: fixtureRoot, projectRoot: "src/corpus" })

    const manifest = createStudioManifest(projectIndex, {
      preview: {
        urlTemplate: "https://preview.test/gtsx?entry={entry}&frame={frame}",
      },
      routes: {
        studio: "/custom/studio",
      },
    })

    expect(manifest.routes).toEqual({
      preview: "/gtsx",
      studio: "/custom/studio",
      manifest: "/gtsx/studio/manifest",
    })
    expect(manifest.preview).toEqual({
      urlTemplate: "https://preview.test/gtsx?entry={entry}&frame={frame}",
      allUrlTemplate: "/gtsx?entry={entry}{gframe}",
    })
    expect(manifest.files.map((file) => file.groupId)).toEqual([
      "file:src/corpus/Badge.g.tsx",
      "file:src/corpus/StatusPanel.g.tsx",
    ])
    expect(manifest.diagnostics).toEqual(projectIndex.diagnostics)
  })

  it("carries a configured cache namespace into the browser manifest", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src/corpus",
      cache: { namespace: "fixture-project" },
    })

    expect(manifest.cache).toEqual({ namespace: "fixture-project" })
  })

  it("creates a cached Studio manifest provider from gtsx config", () => {
    const getManifest = createStudioManifestProvider({
      cwd: fixtureRoot,
      config: {
        project: {
          root: "src/corpus",
          namespace: "fixture-project",
        },
        routes: {
          preview: "/preview",
          studio: "/studio",
          manifest: "/studio/manifest",
        },
        preview: {
          serve: "pnpm dev --port {port}",
        },
        studio: {
          manifestCacheTtlMs: 60_000,
        },
      },
    })
    const manifest = getManifest()

    expect(manifest.cache).toEqual({ namespace: "fixture-project" })
    expect(manifest.routes).toEqual({
      preview: "/preview",
      studio: "/studio",
      manifest: "/studio/manifest",
    })
    expect(manifest.preview).toEqual({
      urlTemplate: "/preview?entry={entry}&frame={frame}{gframe}",
      allUrlTemplate: "/preview?entry={entry}{gframe}",
    })
    expect(manifest.files.map((file) => file.path)).toEqual(["src/corpus/Badge.g.tsx", "src/corpus/StatusPanel.g.tsx"])
  })

  it("discovers local design frames under the configured project root", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gtsx-studio-design-"))

    try {
      mkdirSync(join(cwd, "components/gtsx/design/nested"), { recursive: true })
      writeFileSync(join(cwd, "components/gtsx/design/DesignHost.g.tsx"), "export default function DesignHost() { return null }\n")
      writeFileSync(join(cwd, "components/gtsx/design/current-design.tsx"), "export function CurrentDesign() { return null }\n")
      writeFileSync(join(cwd, "components/gtsx/design/nested/SecondFrame.g.tsx"), "export default function SecondFrame() { return null }\n")

      expect(discoverStudioDesignManifest(cwd, "components")).toEqual({
        frames: [
          {
            id: "components/gtsx/design/DesignHost.g.tsx#default",
            entry: "components/gtsx/design/DesignHost.g.tsx#default",
            filePath: "components/gtsx/design/DesignHost.g.tsx",
            title: "DesignHost",
            exportName: "default",
            frameName: "live",
          },
          {
            id: "components/gtsx/design/nested/SecondFrame.g.tsx#default",
            entry: "components/gtsx/design/nested/SecondFrame.g.tsx#default",
            filePath: "components/gtsx/design/nested/SecondFrame.g.tsx",
            title: "SecondFrame",
            exportName: "default",
            frameName: "live",
          },
        ],
      })
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("serializes Studio route search params without losing repeated values", () => {
    expect(
      studioUrlSearchFromSearchParams({
        canvasX: "12",
        debug: ["pool", "layout"],
        selection: "component:src/Card.g.tsx#default",
      }),
    ).toBe("canvasX=12&debug=pool&debug=layout&selection=component%3Asrc%2FCard.g.tsx%23default")
  })

  it("builds files from the selected TypeScript project scope", () => {
    const manifest = buildStudioManifest({
      cwd: tsProjectScopeRoot,
      tsconfigPath: join(tsProjectScopeRoot, "tsconfig.json"),
    })

    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/Child.g.tsx",
      "src/gtsx/design/Sketch.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("builds files from the nearest TypeScript project scope by default", () => {
    const manifest = buildStudioManifest({ cwd: tsProjectScopeRoot })

    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/Child.g.tsx",
      "src/gtsx/design/Sketch.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("lists multiple component exports from one file", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const multiExportFile = manifest.files.find((file) => file.path === "src/MultiExport.g.tsx")

    expect(multiExportFile?.components.map((component) => component.coordinate)).toEqual([
      "src/MultiExport.g.tsx#NamedBadge",
      "src/MultiExport.g.tsx#default",
    ])
    expect(multiExportFile?.components.map((component) => component.componentName)).toEqual(["NamedBadge", "DefaultBadge"])
    expect(multiExportFile?.components.flatMap((component) => component.frames.map((frame) => frame.name))).toEqual([
      "ready",
      "defaultReady",
    ])
  })

  it("preserves analyzer diagnostics on invalid component entries", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const dynamicFramesFile = manifest.files.find((file) => file.path === "src/DynamicFrames.g.tsx")

    expect(dynamicFramesFile?.components).toHaveLength(1)
    expect(dynamicFramesFile?.components[0]?.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "contract-extraction",
        code: "non-static-frame-key",
        file: expect.stringContaining("DynamicFrames.g.tsx"),
      }),
    )
    expect(dynamicFramesFile?.diagnostics).toEqual(dynamicFramesFile?.components[0]?.diagnostics)
    expect(manifest.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "contract-extraction",
        code: "non-static-frame-key",
        file: expect.stringContaining("DynamicFrames.g.tsx"),
      }),
    )
  })

  it("does not list exported GTSX providers as component exports", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const userCardFile = manifest.files.find((file) => file.path === "src/UserCard.g.tsx")

    expect(userCardFile?.components.map((component) => component.coordinate)).toEqual(["src/UserCard.g.tsx#default"])
    expect(userCardFile?.components[0]?.providers).toEqual({
      ThemeProvider: {
        name: "ThemeProvider",
        frames: [],
        variants: ["light", "dark"],
      },
    })
  })

  it("does not include runtime props, scope, provider values, DOM rects, or child trees", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const serialized = JSON.stringify(manifest)
    const manifestKeys = manifestJsonKeys(manifest)

    expect(serialized).not.toContain("Ada Lovelace")
    expect(serialized).not.toContain("onOpen")
    expect(serialized).not.toContain('"value"')
    expect(manifestKeys).not.toContain("rect")
    expect(manifestKeys).not.toContain("children")
  })

  it("returns configured preview URL templates for repository examples", () => {
    const manifest = buildStudioManifest({
      cwd: examplesRoot,
      projectRoot: "src/frames",
      preview: {
        urlTemplate: "http://localhost:{port}/gtsx?entry={entry}&frame={frame}{gframe}",
        allUrlTemplate: "http://localhost:{port}/gtsx?entry={entry}{gframe}",
      },
    })

    expect(manifest.preview).toEqual({
      urlTemplate: "http://localhost:{port}/gtsx?entry={entry}&frame={frame}{gframe}",
      allUrlTemplate: "http://localhost:{port}/gtsx?entry={entry}{gframe}",
    })
    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/frames/language/PrimitiveProps.g.tsx",
      "src/frames/stateful/DashboardShell.g.tsx",
      "src/frames/stateful/MultiExportPanel.g.tsx",
      "src/frames/stateful/NotificationBell.g.tsx",
      "src/frames/stateful/UserCard.g.tsx",
      "src/frames/ui/NotificationCenter.g.tsx",
    ])
  })

  it.each(playgroundProjects)("returns static manifests for playground fixture projects", (project) => {
    const manifest = buildStudioManifest({ cwd: project.root, projectRoot: project.projectRoot })

    expect(manifest.files.flatMap((file) => file.components.map((component) => component.coordinate))).toEqual(
      project.coordinates,
    )
    expect(manifest.diagnostics).toEqual([])
  })

  it("exposes server-safe manifest and browser Studio entrypoints", () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))

    expect(packageJson.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
        default: "./dist/index.js",
      },
      "./client": {
        types: "./dist/client-entry.d.ts",
        import: "./dist/client.js",
        default: "./dist/client.js",
      },
      "./manifest": {
        types: "./dist/manifest.d.ts",
        import: "./dist/manifest.js",
        default: "./dist/manifest.js",
      },
      "./manifest-server": {
        types: "./dist/manifest-server.d.ts",
        import: "./dist/manifest-server.js",
        default: "./dist/manifest-server.js",
      },
    })
    expect(packageJson.private).toBeUndefined()
    expect(packageJson.files).toEqual(["dist"])
    expect(packageJson.dependencies).toBeUndefined()
  })


})
