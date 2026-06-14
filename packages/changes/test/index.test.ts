import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  classifyRunelightWorkspaceVisualChange,
  createRunelightWorkspaceChangesReport,
  createRunelightWorkspaceChangesReportFromGit,
} from "../src/index.js"

const testBaselineRoot = "src/app/runelight/.runelight/baselines/HEAD"
const testBaselinePathPrefix = `${testBaselineRoot}/`

describe("Runelight workspace visual changes", () => {
  it("marks a modified file unchanged when its component visual graph is stable", () => {
    const currentFile = {
      path: "src/Card.g.tsx",
      components: [
        {
          coordinate: "src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/Card.g.tsx",
          frames: [{ name: "ready" }],
          frameDependencies: { ready: [] },
          frameVisualSignatures: { ready: "frame:same" },
          visualSignature: "jsx:same",
        },
      ],
    }
    const baselineFile = {
      path: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
      components: [
        {
          coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
          frames: [{ name: "ready" }],
          frameDependencies: { ready: [] },
          frameVisualSignatures: { ready: "frame:same" },
          visualSignature: "jsx:same",
        },
      ],
    }

    expect(
      classifyRunelightWorkspaceVisualChange({
        baselineFile,
        baselineGraph: { files: [baselineFile] },
        baselinePathPrefix: testBaselinePathPrefix,
        currentFile,
        currentGraph: { files: [currentFile] },
      }),
    ).toEqual({
      changedComponentKeys: [],
      frameChangesByComponentKey: {
        "src/Card.g.tsx#default": [{ kind: "unchanged", name: "ready" }],
      },
      kind: "unchanged",
      unknownComponentKeys: [],
    })
  })

  it("marks a parent affected when a recursive child signature changes", () => {
    const currentChild = {
      coordinate: "src/Child.g.tsx#default",
      exportName: "default",
      filePath: "src/Child.g.tsx",
      frames: [{ name: "ready" }],
      frameDependencies: { ready: [] },
      frameVisualSignatures: { ready: "jsx:child-new" },
      visualSignature: "jsx:child-new",
    }
    const currentRoot = {
      coordinate: "src/Root.g.tsx#default",
      dependencies: ["src/Child.g.tsx#default"],
      exportName: "default",
      filePath: "src/Root.g.tsx",
      frames: [{ name: "ready" }],
      frameDependencies: { ready: ["src/Child.g.tsx#default"] },
      frameVisualSignatures: { ready: "jsx:root" },
      visualSignature: "jsx:root",
    }
    const baselineChild = {
      coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx#default",
      exportName: "default",
      filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx",
      frames: [{ name: "ready" }],
      frameDependencies: { ready: [] },
      frameVisualSignatures: { ready: "jsx:child-old" },
      visualSignature: "jsx:child-old",
    }
    const baselineRoot = {
      coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Root.g.tsx#default",
      dependencies: ["src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx#default"],
      exportName: "default",
      filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Root.g.tsx",
      frames: [{ name: "ready" }],
      frameDependencies: { ready: ["src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx#default"] },
      frameVisualSignatures: { ready: "jsx:root" },
      visualSignature: "jsx:root",
    }
    const currentFile = { path: "src/Root.g.tsx", components: [currentRoot] }
    const baselineFile = { path: "src/app/runelight/.runelight/baselines/HEAD/src/Root.g.tsx", components: [baselineRoot] }

    expect(
      classifyRunelightWorkspaceVisualChange({
        baselineFile,
        baselineGraph: { files: [{ path: "src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx", components: [baselineChild] }, baselineFile] },
        baselinePathPrefix: testBaselinePathPrefix,
        currentFile,
        currentGraph: { files: [{ path: "src/Child.g.tsx", components: [currentChild] }, currentFile] },
      }).kind,
    ).toBe("changed")
  })

  it("only marks frames affected by frame-level dependencies", () => {
    const currentChild = {
      coordinate: "src/Child.g.tsx#default",
      exportName: "default",
      filePath: "src/Child.g.tsx",
      frames: [{ name: "ready" }],
      frameDependencies: { ready: [] },
      frameVisualSignatures: { ready: "jsx:child-new" },
      visualSignature: "jsx:child-new",
    }
    const currentRoot = {
      coordinate: "src/Root.g.tsx#default",
      dependencies: ["src/Child.g.tsx#default"],
      frameDependencies: {
        plain: [],
        withChild: ["src/Child.g.tsx#default"],
      },
      exportName: "default",
      filePath: "src/Root.g.tsx",
      frames: [{ name: "plain" }, { name: "withChild" }],
      frameVisualSignatures: { plain: "jsx:root-plain", withChild: "jsx:root-with-child" },
      visualSignature: "jsx:root",
    }
    const baselineChild = {
      coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx#default",
      exportName: "default",
      filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx",
      frames: [{ name: "ready" }],
      frameDependencies: { ready: [] },
      frameVisualSignatures: { ready: "jsx:child-old" },
      visualSignature: "jsx:child-old",
    }
    const baselineRoot = {
      coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Root.g.tsx#default",
      dependencies: ["src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx#default"],
      frameDependencies: {
        plain: [],
        withChild: ["src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx#default"],
      },
      exportName: "default",
      filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Root.g.tsx",
      frames: [{ name: "plain" }, { name: "withChild" }],
      frameVisualSignatures: { plain: "jsx:root-plain", withChild: "jsx:root-with-child" },
      visualSignature: "jsx:root",
    }
    const currentFile = { path: "src/Root.g.tsx", components: [currentRoot] }
    const baselineFile = { path: "src/app/runelight/.runelight/baselines/HEAD/src/Root.g.tsx", components: [baselineRoot] }

    expect(
      classifyRunelightWorkspaceVisualChange({
        baselineFile,
        baselineGraph: { files: [{ path: "src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx", components: [baselineChild] }, baselineFile] },
        baselinePathPrefix: testBaselinePathPrefix,
        currentFile,
        currentGraph: { files: [{ path: "src/Child.g.tsx", components: [currentChild] }, currentFile] },
      }).frameChangesByComponentKey["src/Root.g.tsx#default"],
    ).toEqual([
      { kind: "unchanged", name: "plain" },
      { kind: "changed", name: "withChild" },
    ])
  })

  it("treats missing frame dependencies as an unknown stale manifest contract", () => {
    const currentFile = {
      path: "src/Card.g.tsx",
      components: [
        {
          coordinate: "src/Card.g.tsx#default",
          dependencies: ["src/Child.g.tsx#default"],
          exportName: "default",
          filePath: "src/Card.g.tsx",
          frames: [{ name: "ready" }],
          frameVisualSignatures: { ready: "same" },
          visualSignature: "same",
        },
      ],
    }
    const baselineFile = {
      path: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
      components: [
        {
          coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx#default",
          dependencies: ["src/app/runelight/.runelight/baselines/HEAD/src/Child.g.tsx#default"],
          exportName: "default",
          filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
          frames: [{ name: "ready" }],
          frameVisualSignatures: { ready: "same" },
          visualSignature: "same",
        },
      ],
    }

    expect(
      classifyRunelightWorkspaceVisualChange({
        baselineFile,
        baselineGraph: { files: [baselineFile] },
        baselinePathPrefix: testBaselinePathPrefix,
        currentFile,
        currentGraph: { files: [currentFile] },
      }),
    ).toMatchObject({
      kind: "unknown",
      unknownComponentKeys: ["src/Card.g.tsx#default"],
      frameChangesByComponentKey: {
        "src/Card.g.tsx#default": [{ kind: "unknown", name: "ready" }],
      },
    })
  })

  it("classifies per-frame additions, deletions, and changes", () => {
    const currentFile = {
      path: "src/Card.g.tsx",
      components: [
        {
          coordinate: "src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/Card.g.tsx",
          frames: [{ name: "ready" }, { name: "newFrame" }, { name: "changed" }],
          frameDependencies: { changed: [], newFrame: [], ready: [] },
          frameVisualSignatures: {
            ready: "same",
            newFrame: "new",
            changed: "after",
          },
          visualSignature: "component-after",
        },
      ],
    }
    const baselineFile = {
      path: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
      components: [
        {
          coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
          frames: [{ name: "ready" }, { name: "deletedFrame" }, { name: "changed" }],
          frameDependencies: { changed: [], deletedFrame: [], ready: [] },
          frameVisualSignatures: {
            ready: "same",
            deletedFrame: "old",
            changed: "before",
          },
          visualSignature: "component-before",
        },
      ],
    }

    expect(
      classifyRunelightWorkspaceVisualChange({
        baselineFile,
        baselineGraph: { files: [baselineFile] },
        baselinePathPrefix: testBaselinePathPrefix,
        currentFile,
        currentGraph: { files: [currentFile] },
      }).frameChangesByComponentKey["src/Card.g.tsx#default"],
    ).toEqual([
      { kind: "changed", name: "changed" },
      { kind: "deleted", name: "deletedFrame" },
      { kind: "added", name: "newFrame" },
      { kind: "unchanged", name: "ready" },
    ])
  })

  it("keeps unknown changes visible when visual signatures are unavailable", () => {
    const currentFile = {
      path: "src/Card.g.tsx",
      components: [
        {
          coordinate: "src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/Card.g.tsx",
        },
      ],
    }
    const baselineFile = {
      path: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
      components: [
        {
          coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
        },
      ],
    }

    expect(
      classifyRunelightWorkspaceVisualChange({
        baselineFile,
        baselineGraph: { files: [baselineFile] },
        baselinePathPrefix: testBaselinePathPrefix,
        currentFile,
        currentGraph: { files: [currentFile] },
      }).kind,
    ).toBe("unknown")
  })

  it("creates a stable workspace changes report for automation", () => {
    const currentFile = {
      path: "src/Card.g.tsx",
      components: [
        {
          coordinate: "src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/Card.g.tsx",
          frames: [{ name: "ready" }],
          frameDependencies: { ready: [] },
          frameVisualSignatures: { ready: "after" },
          visualSignature: "after",
        },
      ],
    }
    const baselineFile = {
      path: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
      components: [
        {
          coordinate: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx#default",
          exportName: "default",
          filePath: "src/app/runelight/.runelight/baselines/HEAD/src/Card.g.tsx",
          frames: [{ name: "ready" }],
          frameDependencies: { ready: [] },
          frameVisualSignatures: { ready: "before" },
          visualSignature: "before",
        },
      ],
    }

    expect(
      createRunelightWorkspaceChangesReport({
        baselineGraph: { files: [baselineFile] },
        baselinePathPrefix: testBaselinePathPrefix,
        currentGraph: { files: [currentFile] },
        statuses: [{ kind: "modified", path: "src/Card.g.tsx" }],
      }),
    ).toMatchObject({
      schemaVersion: 1,
      summary: {
        files: { added: 0, deleted: 0, modified: 1 },
        ui: { added: 0, changed: 1, deleted: 0, unchanged: 0, unknown: 0 },
      },
      components: [
        {
          codeStatus: "modified",
          coordinate: "src/Card.g.tsx#default",
          file: "src/Card.g.tsx",
          frames: [{ name: "ready", status: "changed" }],
          uiStatus: "changed",
        },
      ],
    })
  })

  it("creates a workspace changes report from git status and a HEAD baseline", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-changes-"))
    const filePath = "src/Card.g.tsx"
    try {
      mkdirSync(resolve(cwd, "src"), { recursive: true })
      writeFileSync(resolve(cwd, filePath), "before\n")
      git(cwd, "init")
      git(cwd, "config", "user.email", "runelight@example.com")
      git(cwd, "config", "user.name", "Runelight")
      git(cwd, "add", filePath)
      git(cwd, "commit", "-m", "baseline")

      writeFileSync(resolve(cwd, filePath), "after\n")

      expect(
        createRunelightWorkspaceChangesReportFromGit({
          baselineRoot: testBaselineRoot,
          cwd,
          pathspecs: ["src"],
          sourceRoot: "src",
          buildCurrentGraph: () => graphFromFile(cwd, filePath),
          buildBaselineGraph: ({ cwd: baselineCwd }) => graphFromFile(baselineCwd, filePath),
        }),
      ).toMatchObject({
        base: { kind: "git", ref: "HEAD" },
        components: [
          {
            codeStatus: "modified",
            coordinate: "src/Card.g.tsx#default",
            frames: [{ name: "ready", status: "changed" }],
            uiStatus: "changed",
          },
        ],
        diagnostics: [],
        summary: {
          files: { added: 0, deleted: 0, modified: 1 },
          ui: { added: 0, changed: 1, deleted: 0, unchanged: 0, unknown: 0 },
        },
      })
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })
})

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-C", cwd, ...args], {
    stdio: ["ignore", "ignore", "ignore"],
  })
}

function graphFromFile(cwd: string, filePath: string) {
  const source = readFileSync(resolve(cwd, filePath), "utf8").trim()
  return {
    files: [
      {
        path: filePath,
        components: [
          {
            coordinate: `${filePath}#default`,
            exportName: "default",
            filePath,
            frames: [{ name: "ready" }],
            frameDependencies: { ready: [] },
            frameVisualSignatures: { ready: source },
            visualSignature: source,
          },
        ],
      },
    ],
  }
}
