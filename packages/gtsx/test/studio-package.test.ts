import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"
import { buildStudioManifest } from "../src/studio-manifest.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const studioRoot = join(repositoryRoot, "packages/studio")

describe("Studio package", () => {
  it("is checkable as a normal GTSX project", async () => {
    const check = await runCLI(["check", "src"], {
      cwd: studioRoot,
      stdout: "",
      stderr: "",
    })

    expect(check, `${check.stdout}\n${check.stderr}`).toMatchObject({ exitCode: 0 })
    expect(check.stdout).toContain("GTSX pure entry: src/components/StudioEmptyState.g.tsx")
    expect(check.stdout).toContain("- empty")
  })

  it("builds a Studio manifest for its own UI cases", () => {
    const manifest = buildStudioManifest({ cwd: studioRoot, projectRoot: "src" })

    expect(manifest.preview).toEqual({
      urlTemplate: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
      allUrlTemplate: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
    })
    expect(manifest.files.map((file) => file.path)).toEqual(["src/components/StudioEmptyState.g.tsx"])
    expect(manifest.files[0]?.components.map((component) => component.coordinate)).toEqual([
      "src/components/StudioEmptyState.g.tsx#default",
    ])
  })
})
