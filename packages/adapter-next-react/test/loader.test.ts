import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const loader = require("../loader.cjs") as (this: LoaderContextStub, source: string | Buffer, inputSourceMap: unknown) => void

type LoaderContextStub = {
  resourcePath: string
  async(): LoaderCallback
  getOptions(): Record<string, unknown>
}

type LoaderCallback = (error: Error | null, code?: string, sourceMap?: unknown) => void

describe("gtsx Next React loader", () => {
  it("transforms source through the shared React transform module", async () => {
    const transformPath = writeTransformModule(`
export function transformGTSXReactModule(input) {
  return { code: [input.root, input.filePath, input.code].join("|"), filePath: input.filePath }
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "/repo|/repo/src/Card.g.tsx|source",
      sourceMap: { version: 3 },
    })
  })

  it("passes original source through when the shared transform returns null", async () => {
    const transformPath = writeTransformModule(`
export function transformGTSXReactModule() {
  return null
}
`)

    await expect(
      runLoader(Buffer.from("source"), {
        root: "/repo",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "source",
      sourceMap: { version: 3 },
    })
  })
})

function runLoader(source: string | Buffer, options: Record<string, unknown>): Promise<{ code: string; sourceMap: unknown }> {
  return new Promise((resolve, reject) => {
    const context: LoaderContextStub = {
      resourcePath: "/repo/src/Card.g.tsx",
      async() {
        return (error, code, sourceMap) => {
          if (error) {
            reject(error)
            return
          }

          resolve({ code: code ?? "", sourceMap })
        }
      },
      getOptions() {
        return options
      },
    }

    loader.call(context, source, { version: 3 })
  })
}

function writeTransformModule(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "gtsx-next-loader-"))
  const filePath = join(directory, "transform.mjs")
  writeFileSync(filePath, source)
  process.on("exit", () => rmSync(directory, { force: true, recursive: true }))
  return filePath
}
