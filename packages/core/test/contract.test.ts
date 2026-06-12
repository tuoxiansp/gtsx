import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { resolveRunelightContractReferences } from "../src/contract.js"

describe("Runelight contract references", () => {
  it("loads contract modules from default exports", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-contract-default-"))

    try {
      writeFileSync(
        join(root, "contract.mjs"),
        `export default {
  id: "fake",
  isEntryFile() {
    return false
  },
  analyzeEntry() {
    return { entry: "", mode: "unknown", defaultExport: false, frames: [], providers: {}, diagnostics: [] }
  },
  indexFile() {
    return { components: [], diagnostics: [] }
  },
}
`,
      )

      const contracts = await resolveRunelightContractReferences(["./contract.mjs"], { cwd: root })

      expect(contracts).toHaveLength(1)
      expect(contracts[0]?.id).toBe("fake")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("rejects contract modules that only export a generic runelightContract alias", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-contract-generic-alias-"))

    try {
      writeFileSync(
        join(root, "contract.mjs"),
        `export const runelightContract = {
  id: "fake",
  isEntryFile() {
    return false
  },
  analyzeEntry() {
    return { entry: "", mode: "unknown", defaultExport: false, frames: [], providers: {}, diagnostics: [] }
  },
  indexFile() {
    return { components: [], diagnostics: [] }
  },
}
`,
      )

      await expect(resolveRunelightContractReferences(["./contract.mjs"], { cwd: root })).rejects.toThrow(
        "must default export a contract",
      )
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
