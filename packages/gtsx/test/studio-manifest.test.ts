import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { buildStudioManifest } from "../src/studio-manifest.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const repositoryRoot = resolve(import.meta.dirname, "../../..")
const packageRoot = join(repositoryRoot, "packages/gtsx")
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

describe("GTSX Studio manifest", () => {
  it("returns stable static JSON for a project surface", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src/corpus" })

    expect(manifest).toEqual({
      version: 1,
      routes: {
        preview: "/gtsx",
        studio: "/gtsx/studio",
        manifest: "/gtsx/studio/manifest",
      },
      preview: {
        urlTemplate: "https://preview.test/gtsx?entry={entry}&case={case}&port={port}",
        allUrlTemplate: "/gtsx?entry={entry}{gcase}",
      },
      files: [
        {
          path: "src/corpus/Badge.g.tsx",
          groupId: "file:src/corpus/Badge.g.tsx",
          components: [
            {
              coordinate: "src/corpus/Badge.g.tsx#default",
              filePath: "src/corpus/Badge.g.tsx",
              exportName: "default",
              componentName: "Badge",
              mode: "pure",
              cases: [
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
          groupId: "file:src/corpus/StatusPanel.g.tsx",
          components: [
            {
              coordinate: "src/corpus/StatusPanel.g.tsx#default",
              filePath: "src/corpus/StatusPanel.g.tsx",
              exportName: "default",
              componentName: "StatusPanel",
              mode: "pure",
              cases: [
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

  it("lists multiple component exports from one file", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const multiExportFile = manifest.files.find((file) => file.path === "src/MultiExport.g.tsx")

    expect(multiExportFile?.components.map((component) => component.coordinate)).toEqual([
      "src/MultiExport.g.tsx#NamedBadge",
      "src/MultiExport.g.tsx#default",
    ])
    expect(multiExportFile?.components.map((component) => component.componentName)).toEqual(["NamedBadge", "DefaultBadge"])
    expect(multiExportFile?.components.flatMap((component) => component.cases.map((testCase) => testCase.name))).toEqual([
      "ready",
      "defaultReady",
    ])
  })

  it("preserves analyzer diagnostics on invalid component entries", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const dynamicCasesFile = manifest.files.find((file) => file.path === "src/DynamicCases.g.tsx")

    expect(dynamicCasesFile?.components).toHaveLength(1)
    expect(dynamicCasesFile?.components[0]?.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "contract-extraction",
        code: "non-static-case-key",
        file: expect.stringContaining("DynamicCases.g.tsx"),
      }),
    )
    expect(dynamicCasesFile?.diagnostics).toEqual(dynamicCasesFile?.components[0]?.diagnostics)
    expect(manifest.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "contract-extraction",
        code: "non-static-case-key",
        file: expect.stringContaining("DynamicCases.g.tsx"),
      }),
    )
  })

  it("does not list exported GTSX providers as component exports", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const userCardFile = manifest.files.find((file) => file.path === "src/UserCard.g.tsx")

    expect(userCardFile?.components.map((component) => component.coordinate)).toEqual(["src/UserCard.g.tsx#default"])
    expect(userCardFile?.components[0]?.providers).toEqual({
      ThemeGTSXProvider: {
        name: "ThemeGTSXProvider",
        cases: ["light", "dark"],
      },
    })
  })

  it("does not include runtime props, scope, provider values, DOM rects, or child trees", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const serialized = JSON.stringify(manifest)

    expect(serialized).not.toContain("Ada Lovelace")
    expect(serialized).not.toContain("onOpen")
    expect(serialized).not.toContain('"value"')
    expect(serialized).not.toContain("rect")
    expect(serialized).not.toContain("children")
  })

  it("returns configured preview URL templates for repository examples", () => {
    const manifest = buildStudioManifest({ cwd: examplesRoot, projectRoot: "src/cases" })

    expect(manifest.preview).toEqual({
      urlTemplate: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
      allUrlTemplate: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
    })
    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/cases/language/PrimitiveProps.g.tsx",
      "src/cases/stateful/DashboardShell.g.tsx",
      "src/cases/stateful/MultiExportPanel.g.tsx",
      "src/cases/stateful/NotificationBell.g.tsx",
      "src/cases/stateful/UserCard.g.tsx",
      "src/cases/ui/NotificationCenter.g.tsx",
    ])
  })

  it.each(playgroundProjects)("returns static manifests for playground fixture projects", (project) => {
    const manifest = buildStudioManifest({ cwd: project.root, projectRoot: project.projectRoot })

    expect(manifest.files.flatMap((file) => file.components.map((component) => component.coordinate))).toEqual(
      project.coordinates,
    )
    expect(manifest.diagnostics).toEqual([])
  })

  it("exposes the manifest builder through a server-only package subpath", () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))

    expect(packageJson.exports).toMatchObject({
      "./studio/server": {
        types: "./dist/studio-manifest.d.ts",
        import: "./dist/studio-manifest.js",
      },
    })
    expect(packageJson.exports["."]).not.toMatchObject({
      import: "./dist/studio-manifest.js",
    })
  })
})
