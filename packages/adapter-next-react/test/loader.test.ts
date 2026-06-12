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

describe("runelight Next React loader", () => {
  it("elides ordinary .g.tsx imports without preview instrumentation", async () => {
    const transformPath = writeTransformModule(`
export function transformRunelightReactModule(input) {
  return { code: [input.root, input.filePath, input.previewImportQuery ?? "", input.code].join("|"), filePath: input.filePath }
}

export function transpileRunelightReactPreviewModule() {
  throw new Error("ordinary imports should not use preview transpilation")
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "/repo|/repo/src/Card.g.tsx||source",
      sourceMap: { version: 3 },
    })
  })

  it("transforms preview imports through the shared React transform module", async () => {
    const transformPath = writeTransformModule(`
export function transformRunelightReactModule(input) {
  return { code: [input.root, input.filePath, input.previewImportQuery, input.ensureUseClient, input.code].join("|"), filePath: input.filePath }
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        resourceQuery: "?runelight-preview",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "/repo|/repo/src/Card.g.tsx|runelight-preview||source",
      sourceMap: { version: 3 },
    })
  })

  it("passes original source through when the shared transform returns null", async () => {
    const transformPath = writeTransformModule(`
export function transformRunelightReactModule() {
  return null
}
`)

    await expect(
      runLoader(Buffer.from("source"), {
        root: "/repo",
        resourceQuery: "?runelight-preview",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "source",
      sourceMap: { version: 3 },
    })
  })

  it("transpiles preview imports by default for stable Turbopack output", async () => {
    const transformPath = writeTransformModule(`
export function transformRunelightReactModule(input) {
  return { code: input.code + "|transformed", filePath: input.filePath }
}

export function transpileRunelightReactPreviewModule(input) {
  return input.code + "|transpiled"
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        resourceQuery: "?runelight-preview",
        transformPath,
      }),
    ).resolves.toEqual({
      code: "source|transformed|transpiled",
      sourceMap: { version: 3 },
    })
  })

  it("can leave preview output untranspiled when explicitly disabled", async () => {
    const transformPath = writeTransformModule(`
export function transformRunelightReactModule(input) {
  return { code: input.code + "|transformed", filePath: input.filePath }
}

export function transpileRunelightReactPreviewModule(input) {
  return input.code + "|transpiled"
}
`)

    await expect(
      runLoader("source", {
        root: "/repo",
        resourceQuery: "?runelight-preview",
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
  const directory = mkdtempSync(join(tmpdir(), "runelight-next-loader-"))
  const filePath = join(directory, "transform.mjs")
  writeFileSync(filePath, source)
  process.on("exit", () => rmSync(directory, { force: true, recursive: true }))
  return filePath
}
