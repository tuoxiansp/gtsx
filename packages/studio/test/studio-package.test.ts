import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { buildGTSXProjectIndex } from "gtsx/project-index"
import { runCLI } from "../../gtsx/src/cli.js"
import { createStudioManifest } from "../src/index.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const studioRoot = join(repositoryRoot, "packages/studio")

function buildStudioManifest(options: { cwd: string; projectRoot?: string }) {
  return createStudioManifest(buildGTSXProjectIndex(options))
}

describe("Studio package", () => {
  it("is checkable as a normal GTSX project", async () => {
    const check = await runCLI(["check", "src"], {
      cwd: studioRoot,
      stdout: "",
      stderr: "",
    })

    expect(check, `${check.stdout}\n${check.stderr}`).toMatchObject({ exitCode: 0 })
    expect(check.stdout).toContain("GTSX pure entry: src/components/BufferedPreviewIframe.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/CasePreviewCard.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/ComponentBoundsHitTarget.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/ComponentCard.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/FileGroupLink.g.tsx")
    expect(check.stdout).toContain("GTSX scope entry: src/components/LazyPreviewFrame.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/PreviewCaseSheet.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/PreviewError.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/PreviewMessage.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/SelectedBoundaryOutline.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/SelectedComponentCasesSidebar.g.tsx")
    expect(check.stdout).toContain("GTSX scope entry: src/components/SidebarComponentPreview.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/StudioEmptyState.g.tsx")
    expect(check.stdout).toContain("GTSX scope entry: src/components/StudioWorkspaceView.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/components/ViewportPresetTabs.g.tsx")
    expect(check.stdout).toContain("- active")
    expect(check.stdout).toContain("- chromeHidden")
    expect(check.stdout).toContain("- chromeVisible")
    expect(check.stdout).toContain("- empty")
    expect(check.stdout).toContain("- loadedPhone")
    expect(check.stdout).toContain("- loading")
    expect(check.stdout).toContain("- missingEntry")
    expect(check.stdout).toContain("- readySelected")
    expect(check.stdout).toContain("- renderFailure")
    expect(check.stdout).toContain("- selectedComponent")
    expect(check.stdout).toContain("- selectedReady")
    expect(check.stdout).toContain("- tabletLoaded")
    expect(check.stdout).toContain("- userCardBounds")
    expect(check.stdout).toContain("- userCardSelected")
    expect(check.stdout).toContain("- unknownCase")
    expect(check.stdout).toContain("- tabletSelected")
  })

  it("builds a Studio manifest for its own UI cases", () => {
    const manifest = buildStudioManifest({ cwd: studioRoot, projectRoot: "src" })

    expect(manifest.preview).toEqual({
      urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
      allUrlTemplate: "/gtsx?entry={entry}{gcase}",
    })
    expect(manifest.files.map((file) => file.path)).toEqual([
      "src/components/BufferedPreviewIframe.g.tsx",
      "src/components/CasePreviewCard.g.tsx",
      "src/components/ComponentBoundsHitTarget.g.tsx",
      "src/components/ComponentCard.g.tsx",
      "src/components/FileGroupLink.g.tsx",
      "src/components/LazyPreviewFrame.g.tsx",
      "src/components/PreviewCaseSheet.g.tsx",
      "src/components/PreviewError.g.tsx",
      "src/components/PreviewMessage.g.tsx",
      "src/components/SelectedBoundaryOutline.g.tsx",
      "src/components/SelectedComponentCasesSidebar.g.tsx",
      "src/components/SidebarComponentPreview.g.tsx",
      "src/components/StudioEmptyState.g.tsx",
      "src/components/StudioWorkspaceView.g.tsx",
      "src/components/ViewportPresetTabs.g.tsx",
    ])
    expect(manifest.files.flatMap((file) => file.components.map((component) => component.coordinate))).toEqual([
      "src/components/BufferedPreviewIframe.g.tsx#default",
      "src/components/CasePreviewCard.g.tsx#default",
      "src/components/ComponentBoundsHitTarget.g.tsx#default",
      "src/components/ComponentCard.g.tsx#default",
      "src/components/FileGroupLink.g.tsx#default",
      "src/components/LazyPreviewFrame.g.tsx#default",
      "src/components/PreviewCaseSheet.g.tsx#default",
      "src/components/PreviewError.g.tsx#default",
      "src/components/PreviewMessage.g.tsx#default",
      "src/components/SelectedBoundaryOutline.g.tsx#default",
      "src/components/SelectedComponentCasesSidebar.g.tsx#default",
      "src/components/SidebarComponentPreview.g.tsx#default",
      "src/components/StudioEmptyState.g.tsx#default",
      "src/components/StudioWorkspaceView.g.tsx#default",
      "src/components/ViewportPresetTabs.g.tsx#default",
    ])
  })
})
