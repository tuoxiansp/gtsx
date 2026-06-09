import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "../../..")

describe("design skill references", () => {
  // DESIGN_REFERENCE.md is intentionally duplicated so each design skill stays
  // self-contained when copied into a target project. The content is
  // framework-agnostic aesthetic guidance and must not drift between copies.
  it("keeps the React and Vue DESIGN_REFERENCE.md byte-identical", () => {
    const react = readFileSync(join(repositoryRoot, "skills/design-runelight-react/DESIGN_REFERENCE.md"), "utf8")
    const vue = readFileSync(join(repositoryRoot, "skills/design-runelight-vue/DESIGN_REFERENCE.md"), "utf8")

    expect(vue).toBe(react)
  })
})
