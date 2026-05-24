import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { buildGTSXProjectIndex } from "../src/project-index.js"
import { buildStudioManifest, createStudioManifest, selectStudioManifestProvider } from "../src/studio-manifest.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const tsProjectScopeRoot = join(import.meta.dirname, "fixtures/ts-project-scope")
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

  it("assembles Studio route and grouping concerns from a GTSX project index", () => {
    const projectIndex = buildGTSXProjectIndex({ cwd: fixtureRoot, projectRoot: "src/corpus" })

    const manifest = createStudioManifest(projectIndex, {
      preview: {
        urlTemplate: "https://preview.test/gtsx?entry={entry}&case={case}",
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
      urlTemplate: "https://preview.test/gtsx?entry={entry}&case={case}",
      allUrlTemplate: "/gtsx?entry={entry}{gcase}",
    })
    expect(manifest.files.map((file) => file.groupId)).toEqual([
      "file:src/corpus/Badge.g.tsx",
      "file:src/corpus/StatusPanel.g.tsx",
    ])
    expect(manifest.diagnostics).toEqual(projectIndex.diagnostics)
  })

  it("builds files from the selected TypeScript project scope", () => {
    const manifest = buildStudioManifest({
      cwd: tsProjectScopeRoot,
      tsconfigPath: join(tsProjectScopeRoot, "tsconfig.json"),
    })

    expect(manifest.files.map((file) => file.path)).toEqual(["src/Included.g.tsx"])
  })

  it("builds files from the nearest TypeScript project scope by default", () => {
    const manifest = buildStudioManifest({ cwd: tsProjectScopeRoot })

    expect(manifest.files.map((file) => file.path)).toEqual(["src/Included.g.tsx"])
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
      "./project-index": {
        types: "./dist/project-index.d.ts",
        import: "./dist/project-index.js",
      },
      "./studio/manifest": {
        types: "./dist/studio-manifest-model.d.ts",
        import: "./dist/studio-manifest-model.js",
      },
      "./studio/server": {
        types: "./dist/studio-manifest.d.ts",
        import: "./dist/studio-manifest.js",
      },
    })
    expect(packageJson.exports["."]).not.toMatchObject({
      import: "./dist/studio-manifest.js",
    })
  })

  it("selects server route manifests before virtual module manifests and diagnoses missing providers", () => {
    const serverManifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src/corpus" })
    const virtualManifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })

    expect(
      selectStudioManifestProvider([
        { kind: "virtual-module", manifest: virtualManifest },
        { kind: "server-route", manifest: serverManifest },
      ]),
    ).toEqual({
      kind: "server-route",
      manifest: serverManifest,
      diagnostics: [],
    })
    expect(selectStudioManifestProvider([{ kind: "virtual-module", manifest: virtualManifest }])).toEqual({
      kind: "virtual-module",
      manifest: virtualManifest,
      diagnostics: [],
    })
    expect(selectStudioManifestProvider([])).toMatchObject({
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: "missing-studio-manifest-provider",
        },
      ],
    })
  })
})
