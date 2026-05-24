import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { buildGTSXProjectIndex } from "gtsx/project-index"
import { runCLI } from "../../gtsx/src/cli.js"
import { createStudioManifest } from "../src/index.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const studioRoot = join(repositoryRoot, "packages/studio")

function buildStudioManifest(options: { cwd: string; projectRoot?: string }) {
  return createStudioManifest(buildGTSXProjectIndex(options))
}

describe("Studio package", () => {
  it("is checkable as a normal GTSX project", async () => {
    const check = await runCLI(["check", "src"], {
      cwd: studioRoot,
      stdout: "",
      stderr: "",
    })

    expect(check, `${check.stdout}\n${check.stderr}`).toMatchObject({ exitCode: 0 })
    expect(check.stdout).toContain("GTSX pure entry: src/components/StudioEmptyState.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/ViewportPresetTabs.g.tsx")
    expect(check.stdout).toContain("- empty")
    expect(check.stdout).toContain("- tabletSelected")
  })

  it("builds a Studio manifest for its own UI cases", () => {
    const manifest = buildStudioManifest({ cwd: studioRoot, projectRoot: "src" })

    expect(manifest.preview).toEqual({
      urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
      allUrlTemplate: "/gtsx?entry={entry}{gcase}",
    })
    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/components/StudioEmptyState.g.tsx",
      "src/components/ViewportPresetTabs.g.tsx",
    ])
    expect(manifest.files.flatMap((file) => file.components.map((component) => component.coordinate))).toEqual([
      "src/components/StudioEmptyState.g.tsx#default",
      "src/components/ViewportPresetTabs.g.tsx#default",
    ])
  })
})
