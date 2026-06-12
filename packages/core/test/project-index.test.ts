import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import type { RunelightContract } from "../src/contract.js"
import { buildRunelightProjectIndex, createCachedRunelightProjectIndexBuilder } from "../src/project-index.js"

describe("Runelight project index", () => {
  it("indexes files through injected contracts", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-core-index-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(join(cwd, "src/Card.g.fake"), "fake source\n")

      const index = buildRunelightProjectIndex({
        contracts: [fakeContract("fake")],
        cwd,
        sourceRoot: "src",
      })

      expect(index.files).toHaveLength(1)
      expect(index.files[0]).toMatchObject({
        path: "src/Card.g.fake",
        sourceHash: expect.any(String),
        components: [
          {
            coordinate: "src/Card.g.fake#default",
            filePath: "src/Card.g.fake",
            sourceHash: expect.any(String),
            exportName: "default",
            componentName: "Card",
            mode: "pure",
            frames: [{ kind: "pure", name: "ready" }],
            providers: {},
            diagnostics: [],
          },
        ],
        diagnostics: [],
      })
      expect(index.diagnostics).toEqual([])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("reports missing contracts", () => {
    const index = buildRunelightProjectIndex({
      contracts: [],
      cwd: ".",
      sourceRoot: "src",
    })

    expect(index).toMatchObject({
      version: 1,
      files: [],
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: "missing-contracts",
        },
      ],
    })
  })

  it("reports duplicate contract ids", () => {
    const index = buildRunelightProjectIndex({
      contracts: [fakeContract("fake"), fakeContract("fake", "Duplicate")],
      cwd: ".",
      sourceRoot: "src",
    })

    expect(index).toMatchObject({
      version: 1,
      files: [],
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: "duplicate-contracts",
          message: expect.stringContaining("fake"),
        },
      ],
    })
  })

  it("includes contract ids in the short-lived cache key", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-core-index-cache-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(join(cwd, "src/Card.g.fake"), "fake source\n")
      const buildProjectIndex = createCachedRunelightProjectIndexBuilder({ ttlMs: 60_000 })
      const first = buildProjectIndex({ contracts: [fakeContract("a")], cwd, sourceRoot: "src" })
      const second = buildProjectIndex({ contracts: [fakeContract("a")], cwd, sourceRoot: "src" })
      const differentContract = buildProjectIndex({ contracts: [fakeContract("b")], cwd, sourceRoot: "src" })

      expect(second).toBe(first)
      expect(differentContract).not.toBe(first)
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("preserves contract order in the short-lived cache key", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-core-index-cache-order-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(join(cwd, "src/Card.g.fake"), "fake source\n")
      const buildProjectIndex = createCachedRunelightProjectIndexBuilder({ ttlMs: 60_000 })
      const first = buildProjectIndex({
        contracts: [fakeContract("a", "First"), fakeContract("b", "Second")],
        cwd,
        sourceRoot: "src",
      })
      const reordered = buildProjectIndex({
        contracts: [fakeContract("b", "Second"), fakeContract("a", "First")],
        cwd,
        sourceRoot: "src",
      })

      expect(first.files[0]?.components[0]?.componentName).toBe("First")
      expect(reordered.files[0]?.components[0]?.componentName).toBe("Second")
      expect(reordered).not.toBe(first)
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })
})

function fakeContract(id: string, componentName = "Card"): RunelightContract {
  return {
    id,
    isEntryFile(filePath) {
      return filePath.endsWith(".g.fake")
    },
    analyzeEntry({ entry }) {
      return {
        entry,
        mode: "pure",
        defaultExport: true,
        frames: [{ kind: "pure", name: "ready" }],
        providers: {},
        diagnostics: [],
      }
    },
    indexFile({ cwd: _cwd, file }) {
      const analysis = this.analyzeEntry({ cwd: _cwd, entry: `${file.filePath}#default` })
      return {
        components: [
          {
            coordinate: analysis.entry,
            filePath: file.filePath,
            sourceHash: file.sourceHash,
            exportName: "default",
            componentName,
            mode: analysis.mode,
            frames: analysis.frames,
            providers: analysis.providers,
            diagnostics: analysis.diagnostics,
          },
        ],
        diagnostics: analysis.diagnostics,
      }
    },
  }
}
