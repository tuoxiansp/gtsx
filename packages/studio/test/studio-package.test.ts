import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { runelightReactContract } from "@runelight/react/contract"
import { runCLI } from "../../core/src/cli.js"
import { createStudioManifest } from "../src/manifest.js"
import { resolveRunelightStudioAppAssetPath } from "../src/static-app.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const studioRoot = join(repositoryRoot, "packages/studio")

function buildStudioManifest(options: { cwd: string; sourceRoot: string }) {
  return createStudioManifest(buildRunelightProjectIndex({ ...options, contracts: [runelightReactContract] }))
}

describe("Studio package", () => {
  it("builds a precompiled Studio app that can fetch the project manifest", () => {
    execFileSync("pnpm", ["build:app"], { cwd: studioRoot, stdio: "pipe" })

    const htmlPath = resolveRunelightStudioAppAssetPath("index.html")
    const html = readFileSync(htmlPath, "utf8")

    expect(existsSync(htmlPath)).toBe(true)
    expect(html).toContain("<div id=\"root\"></div>")
    expect(html).toContain("/assets/")
    expect(html).not.toContain("virtual:runelight")
  })

  it("is checkable as a normal Runelight project", async () => {
    const check = await runCLI(["check", "src"], {
      cwd: studioRoot,
      stdout: "",
      stderr: "",
    })

    expect(check, `${check.stdout}\n${check.stderr}`).toMatchObject({ exitCode: 0 })
    expect(check.stdout).toContain("Runelight pure entry: src/components/BufferedPreviewIframe.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/ComponentBoundsHitTarget.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/ComponentCard.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/FileGroupLink.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/LazyPreviewFrame.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/PreviewFrameSheet.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/PreviewError.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/PreviewMessage.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/SelectedBoundaryOutline.g.tsx")
    expect(check.stdout).toContain("Runelight scope entry: src/components/SidebarComponentPreview.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/StudioDesignWorkspace.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/StudioEmptyState.g.tsx")
    expect(check.stdout).toContain("Runelight scope entry: src/components/StudioWorkspaceView.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/components/ViewportPresetTabs.g.tsx")
    expect(check.stdout).toContain("- active")
    expect(check.stdout).toContain("- chromeHidden")
    expect(check.stdout).toContain("- chromeVisible")
    expect(check.stdout).toContain("- debugQueue")
    expect(check.stdout).toContain("- debugQueueObserved")
    expect(check.stdout).toContain("- empty")
    expect(check.stdout).toContain("- loadedPhone")
    expect(check.stdout).toContain("- loading")
    expect(check.stdout).toContain("- missingEntry")
    expect(check.stdout).toContain("- renderFailure")
    expect(check.stdout).toContain("- selectedComponent")
    expect(check.stdout).toContain("- selectedReady")
    expect(check.stdout).toContain("- tabletLoaded")
    expect(check.stdout).toContain("- userCardBounds")
    expect(check.stdout).toContain("- userCardSelected")
    expect(check.stdout).toContain("- unknownFrame")
    expect(check.stdout).toContain("- tabletSelected")
  })

  it("builds a Studio manifest for its own UI frames", () => {
    const manifest = buildStudioManifest({ cwd: studioRoot, sourceRoot: "src" })

    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/components/BufferedPreviewIframe.g.tsx",
      "src/components/ComponentBoundsHitTarget.g.tsx",
      "src/components/ComponentCard.g.tsx",
      "src/components/FileGroupLink.g.tsx",
      "src/components/LazyPreviewFrame.g.tsx",
      "src/components/PreviewError.g.tsx",
      "src/components/PreviewFrameSheet.g.tsx",
      "src/components/PreviewMessage.g.tsx",
      "src/components/SelectedBoundaryOutline.g.tsx",
      "src/components/SidebarComponentPreview.g.tsx",
      "src/components/StudioDesignWorkspace.g.tsx",
      "src/components/StudioEmptyState.g.tsx",
      "src/components/StudioWorkspaceView.g.tsx",
      "src/components/ViewportPresetTabs.g.tsx",
    ])
    expect(manifest.files.flatMap((file) => file.components.map((component) => component.coordinate))).toEqual([
      "src/components/BufferedPreviewIframe.g.tsx#default",
      "src/components/ComponentBoundsHitTarget.g.tsx#default",
      "src/components/ComponentCard.g.tsx#default",
      "src/components/FileGroupLink.g.tsx#default",
      "src/components/LazyPreviewFrame.g.tsx#default",
      "src/components/PreviewError.g.tsx#default",
      "src/components/PreviewFrameSheet.g.tsx#default",
      "src/components/PreviewMessage.g.tsx#default",
      "src/components/SelectedBoundaryOutline.g.tsx#default",
      "src/components/SidebarComponentPreview.g.tsx#default",
      "src/components/StudioDesignWorkspace.g.tsx#default",
      "src/components/StudioEmptyState.g.tsx#default",
      "src/components/StudioWorkspaceView.g.tsx#default",
      "src/components/ViewportPresetTabs.g.tsx#default",
    ])
  })
})
