import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const packageRoot = join(repositoryRoot, "packages/core")

describe("Core package surface", () => {
  it("exposes the public core subpaths", () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))

    expect(packageJson.exports["./runtime-values"]).toEqual({
      types: "./dist/runtime-values.d.ts",
      import: "./dist/runtime-values.js",
      default: "./dist/runtime-values.js",
    })
    expect(packageJson.exports["./boundary-rect"]).toEqual({
      types: "./dist/boundary-rect.d.ts",
      import: "./dist/boundary-rect.js",
      default: "./dist/boundary-rect.js",
    })
    expect(packageJson.exports["./preview-protocol"]).toEqual({
      types: "./dist/preview-protocol.d.ts",
      import: "./dist/preview-protocol.js",
      default: "./dist/preview-protocol.js",
    })
  })
})
