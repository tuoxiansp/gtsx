import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"

import { resolveRunelightConfig } from "@runelight/core"
import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { runelightReactContract } from "@runelight/react/contract"
import {
  createStudioManifest,
  createStudioManifestFromResolvedConfig,
  discoverStudioDesignManifest,
} from "../src/manifest.js"
import {
  createStudioBaselineManifest,
  createStudioManifestProvider,
  createStudioWorkspaceChangesProvider,
  createStudioWorkspaceChangesFromManifest,
  createStudioWorkspaceChangesSyncProvider,
} from "../src/manifest-server.js"

const fixtureRoot = join(import.meta.dirname, "../../core/test/fixtures/check-project")
const tsProjectScopeRoot = join(import.meta.dirname, "../../core/test/fixtures/ts-project-scope")
const repositoryRoot = resolve(import.meta.dirname, "../../..")
const packageRoot = join(repositoryRoot, "packages/studio")
const examplesRoot = join(repositoryRoot, "examples/react-vite")

type CreateStudioManifestOptions = NonNullable<Parameters<typeof createStudioManifest>[1]>

function buildStudioManifest(
  options: { additionalSourceRoots?: string[]; cwd: string; sourceRoot: string; tsconfigPath?: string } & CreateStudioManifestOptions,
) {
  const projectIndex = buildRunelightProjectIndex({
    additionalSourceRoots: options.additionalSourceRoots,
    contracts: [runelightReactContract],
    cwd: options.cwd,
    sourceRoot: options.sourceRoot,
    tsconfigPath: options.tsconfigPath,
  })
  return createStudioManifest(projectIndex, {
    cache: options.cache,
    design: options.design,
    additionalDiagnostics: options.additionalDiagnostics,
  })
}

function manifestJsonKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(manifestJsonKeys)

  return Object.entries(value).flatMap(([key, nested]) => [key, ...manifestJsonKeys(nested)])
}

describe("Runelight Studio manifest", () => {
  it("returns stable static JSON for a project surface", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src/corpus",
    })

    expect(manifest).toEqual({
      version: 1,
      routes: {
        changes: "/runelight/studio/changes",
        events: "/runelight/studio/events",
        preview: "/runelight",
        studio: "/runelight/studio",
        manifest: "/runelight/studio/manifest",
      },
      files: [
        {
          path: "src/corpus/Badge.g.tsx",
          sourceHash: expect.any(String),
          components: [
            {
              coordinate: "src/corpus/Badge.g.tsx#default",
              filePath: "src/corpus/Badge.g.tsx",
              sourceHash: expect.any(String),
              exportName: "default",
              componentName: "Badge",
              mode: "pure",
              frameVisualSignatures: {
                neutral: expect.any(String),
                success: expect.any(String),
              },
              frameDependencies: {
                neutral: [],
                success: [],
              },
              frames: [
                { kind: "pure", name: "neutral" },
                { kind: "pure", name: "success" },
              ],
              providers: {},
              visualSignature: expect.any(String),
              diagnostics: [],
            },
          ],
          diagnostics: [],
        },
        {
          path: "src/corpus/StatusPanel.g.tsx",
          sourceHash: expect.any(String),
          components: [
            {
              coordinate: "src/corpus/StatusPanel.g.tsx#default",
              filePath: "src/corpus/StatusPanel.g.tsx",
              sourceHash: expect.any(String),
              exportName: "default",
              componentName: "StatusPanel",
              mode: "pure",
              frameVisualSignatures: {
                error: expect.any(String),
                loading: expect.any(String),
              },
              frameDependencies: {
                error: [],
                loading: [],
              },
              frames: [
                { kind: "pure", name: "loading" },
                { kind: "pure", name: "error" },
              ],
              providers: {},
              visualSignature: expect.any(String),
              diagnostics: [],
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    })
  })

  it("uses fixed Studio routes from a Runelight project index", () => {
    const projectIndex = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src/corpus" })

    const manifest = createStudioManifest(projectIndex)

    expect(manifest.routes).toEqual({
      changes: "/runelight/studio/changes",
      events: "/runelight/studio/events",
      preview: "/runelight",
      studio: "/runelight/studio",
      manifest: "/runelight/studio/manifest",
    })
    expect(manifest.diagnostics).toEqual(projectIndex.diagnostics)
  })

  it("appends additional diagnostics to project index diagnostics", () => {
    const projectIndex = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src/corpus" })

    const manifest = createStudioManifest(projectIndex, {
      additionalDiagnostics: [
        {
          stage: "adapter-configuration",
          severity: "warning",
          code: "studio-test-diagnostic",
          message: "Studio test diagnostic.",
        },
      ],
    })

    expect(manifest.diagnostics).toEqual([
      ...projectIndex.diagnostics,
      expect.objectContaining({ code: "studio-test-diagnostic" }),
    ])
  })

  it("carries a configured cache namespace into the browser manifest", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src/corpus",
      cache: { namespace: "fixture-project" },
    })

    expect(manifest.cache).toEqual({ namespace: "fixture-project" })
  })

  it("omits blank cache namespaces from the browser manifest", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src/corpus",
      cache: { namespace: "  " },
    })

    expect(manifest.cache).toBeUndefined()
  })

  it("creates a cached Studio manifest provider from runelight config", async () => {
    const getManifest = await createStudioManifestProvider({
      cwd: fixtureRoot,
      config: {
        contracts: ["@runelight/react/contract"],
        project: {
          sourceRoot: "src/corpus",
          entryRoot: "app/runelight",
          namespace: "fixture-project",
        },
        host: {
          command: "vite --host 127.0.0.1 --port {port} --strictPort",
        },
      },
    })
    const manifest = getManifest()

    expect(manifest.cache).toEqual({ namespace: "fixture-project" })
    expect(manifest.routes).toEqual({
      changes: "/runelight/studio/changes",
      events: "/runelight/studio/events",
      preview: "/runelight",
      studio: "/runelight/studio",
      manifest: "/runelight/studio/manifest",
    })
    expect(manifest.files.map((file) => file.path)).toEqual([
      "app/runelight/design/DesignSketch.g.tsx",
      "src/corpus/Badge.g.tsx",
      "src/corpus/StatusPanel.g.tsx",
    ])
  })

  it("creates an async Studio workspace changes provider", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-async-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      writeFileSync(join(cwd, ".gitkeep"), "")
      execFileSync("git", ["add", ".gitkeep"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(
        join(cwd, "src/New.g.tsx"),
        [
          "export default function NewCard() { return <span>new</span> }",
          "NewCard.frames = { live: { props: {} } }",
          "",
        ].join("\n"),
      )

      const createChanges = await createStudioWorkspaceChangesProvider({
        cwd,
        config: {
          contracts: ["@runelight/react/contract"],
          project: {
            sourceRoot: "src",
            entryRoot: "src/app/runelight",
          },
        },
      })
      const changesPromise = createChanges()

      expect(typeof changesPromise.then).toBe("function")
      await expect(changesPromise).resolves.toMatchObject({
        version: 1,
        base: { kind: "git", baselineRoot: "src/app/runelight/.runelight/baselines/HEAD", ref: "HEAD" },
        items: [
          {
            kind: "added",
            filePath: "src/New.g.tsx",
            surface: "frames",
          },
        ],
      })
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("reuses workspace changes results while the workspace signature is stable", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-cached-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      writeFileSync(join(cwd, ".gitkeep"), "")
      execFileSync("git", ["add", ".gitkeep"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(
        join(cwd, "src/New.g.tsx"),
        [
          "export default function NewCard() { return <span>new</span> }",
          "NewCard.frames = { live: { props: {} } }",
          "",
        ].join("\n"),
      )

      const createChanges = await createStudioWorkspaceChangesSyncProvider({
        cwd,
        config: {
          contracts: ["@runelight/react/contract"],
          project: {
            sourceRoot: "src",
            entryRoot: "src/app/runelight",
          },
        },
      })

      const first = createChanges()
      const second = createChanges()
      expect(second).toBe(first)

      writeFileSync(
        join(cwd, "src/Second.g.tsx"),
        [
          "export default function SecondCard() { return <span>second</span> }",
          "SecondCard.frames = { live: { props: {} } }",
          "",
        ].join("\n"),
      )
      const third = createChanges()
      expect(third).not.toBe(first)
      expect(third.items.map((item) => item.filePath)).toEqual(["src/New.g.tsx", "src/Second.g.tsx"])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("describes Git workspace changes and affected root paths", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Child.g.tsx"),
        [
          "export default function Child() { return <span>child</span> }",
          "Child.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/Root.g.tsx"),
        [
          'import Child from "./Child.g"',
          "",
          "export default function Root() { return <Child /> }",
          "Root.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/Deleted.g.tsx"),
        [
          "export default function DeletedCard() { return <span>deleted</span> }",
          "DeletedCard.frames = { live: { props: {} } }",
          "",
        ].join("\n"),
      )
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      execFileSync("git", ["add", "src"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(
        join(cwd, "src/Child.g.tsx"),
        [
          "export default function Child() { return <strong>changed</strong> }",
          "Child.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      rmSync(join(cwd, "src/Deleted.g.tsx"))
      writeFileSync(
        join(cwd, "src/New.g.tsx"),
        [
          "export default function NewCard() { return <span>new</span> }",
          "NewCard.frames = { live: { props: {} } }",
          "",
        ].join("\n"),
      )

      const manifest = buildStudioManifest({ cwd, sourceRoot: "src" })
      const baselineManifest = createStudioBaselineManifest({
        contracts: [runelightReactContract],
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })
      const changes = createStudioWorkspaceChangesFromManifest(manifest, {
        baselineManifest,
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })

      expect(changes.items.map((item) => [item.kind, item.filePath])).toEqual([
        ["modified", "src/Child.g.tsx"],
        ["deleted", "src/Deleted.g.tsx"],
        ["added", "src/New.g.tsx"],
      ])
      expect(changes.items[0].impacts[0].path.map((segment) => segment.componentName)).toEqual(["Root", "Child"])
      expect(changes.items[1].deletedSummary?.componentNames).toEqual(["DeletedCard"])
      expect(changes.items[1].baselineFile?.path).toBe("src/app/runelight/.runelight/baselines/HEAD/src/Deleted.g.tsx")
      expect(changes.items[1].baselineFile?.components[0]?.componentName).toBe("DeletedCard")
      expect(changes.items[1].baselineImpacts?.[0]?.rootCoordinate).toBe("src/app/runelight/.runelight/baselines/HEAD/src/Deleted.g.tsx#default")
      expect(changes.base).toMatchObject({
        kind: "git",
        baselineRoot: "src/app/runelight/.runelight/baselines/HEAD",
        ref: "HEAD",
      })
      if (changes.base.kind !== "git") throw new Error("Expected git-backed workspace changes")
      expect(changes.base.manifest?.files.map((file) => file.path)).toContain("src/app/runelight/.runelight/baselines/HEAD/src/Root.g.tsx")
      expect(changes.items[2].currentFile?.components[0].componentName).toBe("NewCard")
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("does not build a baseline manifest for added-only workspace changes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-added-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      writeFileSync(join(cwd, ".gitkeep"), "")
      execFileSync("git", ["add", ".gitkeep"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(
        join(cwd, "src/New.g.tsx"),
        [
          "export default function NewCard() { return <span>new</span> }",
          "NewCard.frames = { live: { props: {} } }",
          "",
        ].join("\n"),
      )

      const manifest = buildStudioManifest({ cwd, sourceRoot: "src" })
      let baselineBuilt = false
      const changes = createStudioWorkspaceChangesFromManifest(manifest, {
        baselineManifest: () => {
          baselineBuilt = true
          throw new Error("baseline should not be built for added-only changes")
        },
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })

      expect(baselineBuilt).toBe(false)
      expect(changes.base).toEqual({
        kind: "git",
        baselineRoot: "src/app/runelight/.runelight/baselines/HEAD",
        ref: "HEAD",
      })
      expect(changes.items.map((item) => [item.kind, item.filePath])).toEqual([["added", "src/New.g.tsx"]])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("omits changed protocol files that have no previewable GUI surface", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-non-visual-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(join(cwd, "src/Helper.g.tsx"), "export const helperValue = 1\n")
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      execFileSync("git", ["add", "src"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(join(cwd, "src/Helper.g.tsx"), "export const helperValue = 2\n")

      const manifest = buildStudioManifest({ cwd, sourceRoot: "src" })
      const baselineManifest = createStudioBaselineManifest({
        contracts: [runelightReactContract],
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })
      const changes = createStudioWorkspaceChangesFromManifest(manifest, {
        baselineManifest,
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })

      expect(changes.items).toEqual([])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("omits modified components when static visual signatures are unchanged", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-static-non-visual-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          "const ignored = 1",
          "export default function Card() { return <span>same</span> }",
          "Card.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      execFileSync("git", ["add", "src"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          "const ignored = 2",
          "export default function Card() { return <span>same</span> }",
          "Card.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )

      const manifest = buildStudioManifest({ cwd, sourceRoot: "src" })
      const baselineManifest = createStudioBaselineManifest({
        contracts: [runelightReactContract],
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })
      const changes = createStudioWorkspaceChangesFromManifest(manifest, {
        baselineManifest,
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })

      expect(changes.items).toEqual([])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("omits modified components when only frame mock data changes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-frame-mock-only-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          "export default function Card(props: { label: string }) {",
          "  return <span>{props.label}</span>",
          "}",
          'Card.frames = { ready: { props: { label: "Before" } } }',
          "",
        ].join("\n"),
      )
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      execFileSync("git", ["add", "src"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          "export default function Card(props: { label: string }) {",
          "  return <span>{props.label}</span>",
          "}",
          'Card.frames = { ready: { props: { label: "After" } } }',
          "",
        ].join("\n"),
      )

      const manifest = buildStudioManifest({ cwd, sourceRoot: "src" })
      const baselineManifest = createStudioBaselineManifest({
        contracts: [runelightReactContract],
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })
      const changes = createStudioWorkspaceChangesFromManifest(manifest, {
        baselineManifest,
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })

      expect(changes.items).toEqual([])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("does not keep an unchanged dependency just because an affected root changed elsewhere", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-unchanged-dependency-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Child.g.tsx"),
        [
          "const ignored = 1",
          "export default function Child() { return <span>child</span> }",
          "Child.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/Root.g.tsx"),
        [
          'import Child from "./Child.g"',
          "export default function Root() { return <section><Child /><b>before</b></section> }",
          "Root.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      execFileSync("git", ["init"], { cwd, stdio: "ignore" })
      execFileSync("git", ["config", "user.email", "runelight@example.test"], { cwd })
      execFileSync("git", ["config", "user.name", "Runelight Test"], { cwd })
      execFileSync("git", ["add", "src"], { cwd })
      execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "ignore" })
      writeFileSync(
        join(cwd, "src/Child.g.tsx"),
        [
          "const ignored = 2",
          "export default function Child() { return <span>child</span> }",
          "Child.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/Root.g.tsx"),
        [
          'import Child from "./Child.g"',
          "export default function Root() { return <section><Child /><b>after</b></section> }",
          "Root.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )

      const manifest = buildStudioManifest({ cwd, sourceRoot: "src" })
      const baselineManifest = createStudioBaselineManifest({
        contracts: [runelightReactContract],
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })
      const changes = createStudioWorkspaceChangesFromManifest(manifest, {
        baselineManifest,
        cwd,
        entryRoot: "src/app/runelight",
        sourceRoot: "src",
      })

      expect(changes.items.map((item) => item.filePath)).toEqual(["src/Root.g.tsx"])
      expect(changes.items[0]?.impacts[0]?.frames).toEqual([{ kind: "changed", name: "ready" }])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("discovers local design frames under the configured route entry", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-design-"))

    try {
      mkdirSync(join(cwd, "components/app/runelight/design/nested"), { recursive: true })
      writeFileSync(
        join(cwd, "components/app/runelight/design/alpha.g.tsx"),
        [
          "export function AlphaDesign() { return null }",
          "AlphaDesign.frames = {",
          "  live: { props: {} },",
          "  dense: { props: {} },",
          "}",
          "",
        ].join("\n"),
      )
      writeFileSync(join(cwd, "components/app/runelight/design/current-design.tsx"), "export function CurrentDesign() { return null }\n")
      writeFileSync(join(cwd, "components/app/runelight/design/missing.g.tsx"), "export default function MissingDesign() { return null }\n")
      writeFileSync(
        join(cwd, "components/app/runelight/design/nested/beta.g.tsx"),
        ["export function BetaDesign() { return null }", "BetaDesign.frames = { live: { props: {} } }", ""].join("\n"),
      )
      const projectIndex = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "components" })

      expect(discoverStudioDesignManifest(projectIndex, "components/app/runelight")).toEqual({
        frames: [
          {
            id: "components/app/runelight/design/alpha.g.tsx#AlphaDesign:live",
            entry: "components/app/runelight/design/alpha.g.tsx#AlphaDesign",
            filePath: "components/app/runelight/design/alpha.g.tsx",
            title: "AlphaDesign",
            exportName: "AlphaDesign",
            frameName: "live",
          },
          {
            id: "components/app/runelight/design/alpha.g.tsx#AlphaDesign:dense",
            entry: "components/app/runelight/design/alpha.g.tsx#AlphaDesign",
            filePath: "components/app/runelight/design/alpha.g.tsx",
            title: "AlphaDesign",
            exportName: "AlphaDesign",
            frameName: "dense",
          },
          {
            id: "components/app/runelight/design/missing.g.tsx#default:missing-frames",
            entry: "components/app/runelight/design/missing.g.tsx#default",
            filePath: "components/app/runelight/design/missing.g.tsx",
            title: "MissingDesign",
            exportName: "default",
            frameName: "missing-frames",
          },
          {
            id: "components/app/runelight/design/nested/beta.g.tsx#BetaDesign:live",
            entry: "components/app/runelight/design/nested/beta.g.tsx#BetaDesign",
            filePath: "components/app/runelight/design/nested/beta.g.tsx",
            title: "BetaDesign",
            exportName: "BetaDesign",
            frameName: "live",
          },
        ],
      })
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("discovers route design frames outside the component workspace", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-route-design-"))

    try {
      mkdirSync(join(cwd, "src/components"), { recursive: true })
      mkdirSync(join(cwd, "src/app/runelight/design"), { recursive: true })
      writeFileSync(
        join(cwd, "src/app/runelight/design/checkout-flow.g.tsx"),
        ["export default function CheckoutFlow() { return null }", "CheckoutFlow.frames = { live: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      const manifest = buildStudioManifest({
        additionalSourceRoots: ["src/app/runelight/design"],
        cwd,
        design: discoverStudioDesignManifest(
          buildRunelightProjectIndex({
            additionalSourceRoots: ["src/app/runelight/design"],
            contracts: [runelightReactContract],
            cwd,
            sourceRoot: "src",
          }),
          "src/app/runelight",
        ),
        sourceRoot: "src",
      })

      expect(manifest.design?.frames).toEqual([
        {
          id: "src/app/runelight/design/checkout-flow.g.tsx#default:live",
          entry: "src/app/runelight/design/checkout-flow.g.tsx#default",
          filePath: "src/app/runelight/design/checkout-flow.g.tsx",
          title: "CheckoutFlow",
          exportName: "default",
          frameName: "live",
        },
      ])
      expect(manifest.files.map((file) => file.path)).toEqual(["src/app/runelight/design/checkout-flow.g.tsx", "src/components/Card.g.tsx"])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("adds route design frames when creating a manifest from runelight config", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-studio-route-design-config-"))

    try {
      mkdirSync(join(cwd, "src/components"), { recursive: true })
      mkdirSync(join(cwd, "src/app/runelight/design"), { recursive: true })
      writeFileSync(
        join(cwd, "src/app/runelight/design/checkout-flow.g.tsx"),
        ["export default function CheckoutFlow() { return null }", "CheckoutFlow.frames = { live: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/components/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      const projectIndex = buildRunelightProjectIndex({
        additionalSourceRoots: ["src/app/runelight/design"],
        contracts: [runelightReactContract],
        cwd,
        sourceRoot: "src",
      })
      const manifest = createStudioManifestFromResolvedConfig(projectIndex, resolveRunelightConfig({
        contracts: ["@runelight/react/contract"],
        project: { sourceRoot: "src", entryRoot: "src/app/runelight" },
        host: { command: "vite --host 127.0.0.1 --port {port} --strictPort" },
      }))

      expect(manifest.design?.frames.map((frame) => frame.id)).toEqual(["src/app/runelight/design/checkout-flow.g.tsx#default:live"])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("builds files from the selected TypeScript project scope", () => {
    const manifest = buildStudioManifest({
      cwd: tsProjectScopeRoot,
      sourceRoot: "src",
      tsconfigPath: join(tsProjectScopeRoot, "tsconfig.json"),
    })

    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/app/runelight/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("builds files from the nearest TypeScript project scope by default", () => {
    const manifest = buildStudioManifest({ cwd: tsProjectScopeRoot, sourceRoot: "src" })

    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/app/runelight/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("lists multiple component exports from one file", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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

  it("does not list exported Runelight providers as component exports", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const serialized = JSON.stringify(manifest)
    const manifestKeys = manifestJsonKeys(manifest)

    expect(serialized).not.toContain("Ada Lovelace")
    expect(serialized).not.toContain("onOpen")
    expect(serialized).not.toContain('"value"')
    expect(manifestKeys).not.toContain("rect")
    expect(manifestKeys).not.toContain("children")
  })

  it("returns repository example entries", () => {
    const manifest = buildStudioManifest({
      cwd: examplesRoot,
      sourceRoot: "src/frames",
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

  it("exposes server-safe manifest and static Studio entrypoints", () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))

    expect(packageJson.exports).toEqual({
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
      "./static-app": {
        types: "./dist/static-app.d.ts",
        import: "./dist/static-app.js",
        default: "./dist/static-app.js",
      },
    })
    expect(packageJson.private).toBeUndefined()
    expect(packageJson.files).toEqual(["dist"])
    expect(packageJson.dependencies).toEqual({
      "@runelight/changes": "workspace:*",
    })
    expect(packageJson.peerDependencies).toEqual({
      "@runelight/core": "workspace:*",
    })
    expect(packageJson.peerDependenciesMeta).toBeUndefined()
  })


})
