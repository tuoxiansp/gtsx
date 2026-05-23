import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "../../..")

describe("GTSX Studio installer prompt", () => {
  it("documents the route contract, helper imports, manifest providers, and verification steps", () => {
    const prompt = readFileSync(resolve(repositoryRoot, "docs/gtsx-studio-installer-prompt.md"), "utf8")

    expect(prompt).toContain("/gtsx")
    expect(prompt).toContain("/gtsx/studio")
    expect(prompt).toContain("/gtsx/studio/manifest")
    expect(prompt).toContain("gtsx/studio/client")
    expect(prompt).toContain("gtsx/studio/server")
    expect(prompt).toContain("server/API route manifest provider")
    expect(prompt).toContain("virtual module fallback")
    expect(prompt).toContain("Do not create a public manifest watcher fallback")
    expect(prompt).toContain("Open Studio")
    expect(prompt).toContain("render at least one component card")
  })
})
