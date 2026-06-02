import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const loader = require("../loader.cjs") as (this: LoaderContextStub, source: string | Buffer, inputSourceMap: unknown) => void

type LoaderContextStub = {
  resourceQuery?: string
  resourcePath: string
  async(): LoaderCallback
  getOptions(): Record<string, unknown>
}

type LoaderCallback = (error: Error | null, code?: string, sourceMap?: unknown) => void

describe("gtsx Next React loader", () => {
  it("passes ordinary .g.tsx imports through without preview instrumentation", async () => {
    const transformPath = writeTransformModule(`
export function transformGTSXReactModule() {
  throw new Error("ordinary imports should not be transformed")
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "source",
      sourceMap: { version: 3 },
    })
  })

  it("transforms preview imports through the shared React transform module", async () => {
    const transformPath = writeTransformModule(`
export function transformGTSXReactModule(input) {
  return { code: [input.root, input.filePath, input.previewImportQuery, input.ensureUseClient, input.code].join("|"), filePath: input.filePath }
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        resourceQuery: "?gtsx-preview",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "/repo|/repo/src/Card.g.tsx|gtsx-preview||source",
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
        resourceQuery: "?gtsx-preview",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "source",
      sourceMap: { version: 3 },
    })
  })

  it("transpiles preview imports by default for stable Turbopack output", async () => {
    const transformPath = writeTransformModule(`
export function transformGTSXReactModule(input) {
  return { code: input.code + "|transformed", filePath: input.filePath }
}

export function transpileGTSXReactModuleCode(input) {
  return input.code + "|transpiled"
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        resourceQuery: "?gtsx-preview",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "source|transformed|transpiled",
      sourceMap: { version: 3 },
    })
  })

  it("can leave preview output untranspiled when explicitly disabled", async () => {
    const transformPath = writeTransformModule(`
export function transformGTSXReactModule(input) {
  return { code: input.code + "|transformed", filePath: input.filePath }
}

export function transpileGTSXReactModuleCode(input) {
  return input.code + "|transpiled"
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        resourceQuery: "?gtsx-preview",
        transformPath,
        transpilePreview: false,
      }),
    ).resolves.toEqual({
      code: "source|transformed",
      sourceMap: { version: 3 },
    })
  })
})

function runLoader(source: string | Buffer, options: Record<string, unknown>): Promise<{ code: string; sourceMap: unknown }> {
  return new Promise((resolve, reject) => {
    const { resourceQuery, ...loaderOptions } = options
    const context: LoaderContextStub = {
      resourceQuery: typeof resourceQuery === "string" ? resourceQuery : undefined,
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
        return loaderOptions
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
