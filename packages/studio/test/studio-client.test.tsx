import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { buildGTSXProjectIndex } from "gtsx/project-index"
import { describe, expect, it, vi } from "vitest"

import {
  StudioShell,
  StudioWorkspaceView,
  createStudioManifest,
  applyStudioCardSelectionAction,
  applyStudioPreviewMessage,
  applyStudioPreviewMessageToFrameStates,
  applyStudioCanvasWheel,
  changeStudioComponentCase,
  changeStudioCanvasViewportPreset,
  changeStudioViewportPreset,
  computeStudioCaseGridLayout,
  componentCardLayoutWidth,
  computeStudioColumnLayout,
  createStudioCanvasTransformFromUrl,
  createStudioPreviewPoolUrl,
  createStudioRuntimeValuesRequest,
  createStudioWorkspaceStateFromUrl,
  createStudioWorkspaceState,
  createStudioWorkspaceUrlSearchParams,
  currentStudioPreviewTargets,
  isGPreviewProtocolMessage,
  isStudioPreviewPoolDisabled,
  isStudioPreviewPoolDebugEnabled,
  mergeStudioPreviewFrameState,
  previewSessionId,
  queuedStudioPreviewSessionIds,
  replaceStudioCanvasUrlState,
  revealStudioCanvasRect,
  rootStudioManifestComponents,
  selectedStudioCaseName,
  selectStudioRuntimeInstance,
  selectStudioComponent,
  studioPreviewCacheKey,
  studioPreviewRenderQueueOptionsFromParams,
  studioPreviewRenderTargetFromUrl,
  studioPreviewWarmupTargets,
} from "../src/index.js"
import ComponentCard from "../src/components/ComponentCard.g.js"
import LazyPreviewFrame from "../src/components/LazyPreviewFrame.g.js"
import PreviewCaseSheet from "../src/components/PreviewCaseSheet.g.js"
import PreviewMessage from "../src/components/PreviewMessage.g.js"
import { studioPreviewIframeBorrowKey } from "../src/preview-iframe-pool.js"
import { studioPreviewIndexedDBNamespace } from "../src/preview-cache-indexeddb.js"
import {
  isRectNearViewport,
  shouldRenderStudioPreview,
  studioPreviewPreloadMargin,
  studioPreviewRetainMargin,
  visibleStudioPreviewSessionIds,
} from "../src/preview-lazy-loading.js"

const fixtureRoot = join(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
const examplesRoot = join(import.meta.dirname, "../../../examples")
const studioRoot = join(import.meta.dirname, "..")

type CreateStudioManifestOptions = NonNullable<Parameters<typeof createStudioManifest>[1]>

function buildStudioManifest(
  options: { cwd: string; projectRoot?: string; tsconfigPath?: string } & CreateStudioManifestOptions,
) {
  const projectIndex = buildGTSXProjectIndex({
    cwd: options.cwd,
    projectRoot: options.projectRoot,
    tsconfigPath: options.tsconfigPath,
  })
  return createStudioManifest(projectIndex, {
    cache: options.cache,
    preview: options.preview,
    routes: options.routes,
    diagnostics: options.diagnostics,
  })
}

describe("GTSX Studio shell", () => {
  it("renders preview route messages from a GTSX visual component", () => {
    const html = renderToStaticMarkup(<PreviewMessage title="Missing entry" detail="Pass an entry query parameter." />)

    expect(html).toContain('data-gtsx-preview-message="true"')
    expect(html).toContain("Missing entry")
    expect(html).toContain("Pass an entry query parameter.")
  })

  it("renders preview case sheets from real case data", () => {
    function ExamplePreviewComponent(props: { label: string }) {
      return <div data-example-preview>{props.label}</div>
    }

    const html = renderToStaticMarkup(
      <PreviewCaseSheet
        component={ExamplePreviewComponent}
        entry="src/Example.g.tsx#default"
        selectedCases={[
          {
            name: "ready",
            testCase: {
              props: { label: "Ready preview" },
            },
          },
        ]}
      />,
    )

    expect(html).toContain('data-gtsx-preview-case="ready"')
    expect(html).toContain("src/Example.g.tsx#default / ready")
    expect(html).toContain("Ready preview")
  })

  it("renders every exported component from the selected file group in the first column", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(cardCoordinates(html)).toEqual(["src/MultiExport.g.tsx#NamedBadge", "src/MultiExport.g.tsx#default"])
    expect(html).toContain("NamedBadge")
    expect(html).toContain("DefaultBadge")
  })

  it("renders only the selected component in the first column", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const html = renderToStaticMarkup(
      <StudioShell manifest={manifest} selection="component:src/MultiExport.g.tsx#NamedBadge" />,
    )

    expect(cardCoordinates(html)).toEqual(["src/MultiExport.g.tsx#NamedBadge"])
  })

  it("renders root components in the first column by default", () => {
    const manifest = buildStudioManifest({ cwd: examplesRoot, projectRoot: "src/cases", routes: { preview: "/gtsx" } })
    const expectedRootCoordinates = [
      "src/cases/language/PrimitiveProps.g.tsx#default",
      "src/cases/stateful/DashboardShell.g.tsx#default",
      "src/cases/stateful/MultiExportPanel.g.tsx#NamedPanel",
      "src/cases/stateful/MultiExportPanel.g.tsx#default",
      "src/cases/stateful/UserCard.g.tsx#default",
      "src/cases/ui/NotificationCenter.g.tsx#default",
    ]

    expect(rootStudioManifestComponents(manifest).map((component) => component.coordinate)).toEqual(expectedRootCoordinates)
    expect(cardCoordinates(renderToStaticMarkup(<StudioShell manifest={manifest} />))).toEqual(expectedRootCoordinates)
  })

  it("defers cache-namespaced Studio card layout until browser preview geometry cache hydration", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
      cache: { namespace: "fixture-project" },
    })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="component:src/UserCard.g.tsx#default" />)

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-gtsx-canvas-viewport="true"')
    expect(cardCoordinates(html)).toEqual([])
  })

  it("names the Studio package's outer visual root as Studio", () => {
    const manifest = buildStudioManifest({ cwd: studioRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const roots = rootStudioManifestComponents(manifest)

    expect(roots.map((component) => component.componentName)).toContain("Studio")
    expect(roots.map((component) => component.componentName)).not.toContain("ViewportPresetTabs")
  })

  it("renders the canvas without the component index sidebar", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(html).not.toContain("GTSX component index")
    expect(html).not.toContain("data-gtsx-sidebar-preview-coordinate")
    expect(html).toContain('data-gtsx-viewport-preset="tablet"')
  })

  it("renders the canvas without top chrome or redundant card metadata", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(html).not.toContain("Drag to pan")
    expect(html).not.toContain("data-gtsx-canvas-control")
    expect(html).not.toContain(">Root<")
    expect(html).not.toContain(">Level 2<")
    expect(html).not.toContain(">2 components<")
    expect(html).not.toContain(">ready</span>")
    expect(html).not.toContain(">defaultReady</span>")
    expect(html).toContain("height:100%")
    expect(html).toContain(">NamedBadge<")
    expect(html).toContain(">DefaultBadge<")
  })

  it("contains trackpad browser gestures inside the canvas viewport", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="component:src/UserCard.g.tsx#default" />)

    expect(html).toContain('data-gtsx-canvas-viewport="true"')
    expect(html).toContain("touch-action:none")
    expect(html).toContain("overscroll-behavior:contain")
  })

  it("zooms the canvas quickly around the trackpad focal point", () => {
    const next = applyStudioCanvasWheel(
      { x: 40, y: 40, scale: 1 },
      {
        clientX: 200,
        clientY: 160,
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -10,
        metaKey: false,
        viewportLeft: 0,
        viewportTop: 0,
      },
    )

    expect(next.scale).toBeGreaterThan(1.1)
    expect(screenPointForCanvasPoint(next, { x: 160, y: 120 })).toEqual({
      x: expect.closeTo(200),
      y: expect.closeTo(160),
    })
  })

  it("pans the canvas with two-finger wheel movement", () => {
    expect(
      applyStudioCanvasWheel(
        { x: 40, y: 40, scale: 1 },
        {
          clientX: 0,
          clientY: 0,
          ctrlKey: false,
          deltaMode: 0,
          deltaX: 24,
          deltaY: -12,
          metaKey: false,
          viewportLeft: 0,
          viewportTop: 0,
        },
      ),
    ).toEqual({ x: 16, y: 52, scale: 1 })
  })

  it("reveals a canvas card outside the unobstructed viewport", () => {
    expect(
      revealStudioCanvasRect(
        { x: 40, y: 40, scale: 1 },
        {
          blockerRects: [{ left: 1056, right: 1280, top: 0, bottom: 720 }],
          rect: { left: 980, right: 1220, top: 80, bottom: 220 },
          viewportRect: { left: 0, right: 1280, top: 0, bottom: 720 },
        },
      ),
    ).toEqual({ x: -148, y: 40, scale: 1 })

    expect(
      revealStudioCanvasRect(
        { x: 40, y: 40, scale: 1 },
        {
          rect: { left: -260, right: -20, top: 760, bottom: 920 },
          viewportRect: { left: 0, right: 1280, top: 0, bottom: 720 },
        },
      ),
    ).toEqual({ x: 324, y: -184, scale: 1 })
  })

  it("leaves an oversized canvas card alone while it intersects the viewport", () => {
    expect(
      revealStudioCanvasRect(
        { x: 40, y: 40, scale: 1 },
        {
          rect: { left: 80, right: 1180, top: -120, bottom: 900 },
          viewportRect: { left: 0, right: 1280, top: 0, bottom: 720 },
        },
      ),
    ).toEqual({ x: 40, y: 40, scale: 1 })
  })

  it("places drilldown columns from the right edge of the local vertical band", () => {
    expect(
      computeStudioColumnLayout({
        columns: [
          {
            componentCoordinates: ["root-wide", "root-parent"],
          },
          {
            componentCoordinates: ["child"],
            parentCoordinate: "root-parent",
          },
        ],
        margin: 40,
        measurementsByIndex: {
          0: {
            height: 760,
            cardRectsByCoordinate: {
              "root-wide": { left: 0, right: 900, top: 0, bottom: 260 },
              "root-parent": { left: 0, right: 280, top: 500, bottom: 620 },
            },
          },
          1: {
            height: 220,
            cardRectsByCoordinate: {
              child: { left: 0, right: 320, top: 0, bottom: 160 },
            },
          },
        },
      }),
    ).toEqual({
      0: { x: 0, y: 0 },
      1: { x: 320, y: 500 },
    })
  })

  it("keeps a drilldown column clear of earlier columns in the same vertical band", () => {
    expect(
      computeStudioColumnLayout({
        columns: [
          {
            componentCoordinates: ["root"],
          },
          {
            componentCoordinates: ["middle", "lower"],
            parentCoordinate: "root",
          },
          {
            componentCoordinates: ["leaf"],
            parentCoordinate: "middle",
          },
        ],
        margin: 40,
        measurementsByIndex: {
          0: {
            height: 240,
            cardRectsByCoordinate: {
              root: { left: 0, right: 300, top: 0, bottom: 120 },
            },
          },
          1: {
            height: 460,
            cardRectsByCoordinate: {
              middle: { left: 0, right: 240, top: 0, bottom: 120 },
              lower: { left: 0, right: 520, top: 180, bottom: 300 },
            },
          },
          2: {
            height: 300,
            cardRectsByCoordinate: {
              leaf: { left: 0, right: 160, top: 0, bottom: 120 },
            },
          },
        },
      }),
    ).toEqual({
      0: { x: 0, y: 0 },
      1: { x: 340, y: 0 },
      2: { x: 900, y: 0 },
    })
  })

  it("packs component case previews into a square-leaning grid", () => {
    expect(
      computeStudioCaseGridLayout({
        items: [
          { width: 320, height: 320 },
          { width: 320, height: 320 },
          { width: 320, height: 320 },
          { width: 320, height: 320 },
        ],
        maxSide: 760,
      }),
    ).toMatchObject({
      columns: 2,
      previewScale: 1,
      rows: 2,
      width: 654,
    })

    const singleTabletCase = computeStudioCaseGridLayout({ items: [{ width: 768, height: 1024 }], maxSide: 760 })

    expect(singleTabletCase.columns).toBe(1)
    expect(singleTabletCase.height).toBeLessThanOrEqual(760)
    expect(singleTabletCase.previewScale).toBeLessThan(1)
  })

  it("uses one preview scale for every component card in the canvas", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const state = createStudioWorkspaceState(manifest, "file:src/MultiExport.g.tsx")
    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/MultiExport.g.tsx#NamedBadge:ready": {
            expectedSessionId: "src/MultiExport.g.tsx#NamedBadge:ready",
            ready: true,
            size: { width: 2400, height: 2400 },
            tree: [
              {
                id: "large",
                coordinate: "src/MultiExport.g.tsx#NamedBadge",
                rect: { x: 0, y: 0, width: 2400, height: 2400 },
                children: [],
              },
            ],
          },
          "src/MultiExport.g.tsx#default:defaultReady": {
            expectedSessionId: "src/MultiExport.g.tsx#default:defaultReady",
            ready: true,
            size: { width: 320, height: 240 },
            tree: [
              {
                id: "small",
                coordinate: "src/MultiExport.g.tsx#default",
                rect: { x: 0, y: 0, width: 120, height: 80 },
                children: [],
              },
            ],
          },
        }}
        manifest={manifest}
        workspace={state}
      />,
    )
    const scales = caseGridPreviewScales(html)

    expect(scales).toHaveLength(2)
    expect(new Set(scales).size).toBe(1)
    expect(Number(scales[0])).toBeLessThan(1)
  })

  it("uses normalized rendered component bounds as the component selection target", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")
    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/UserCard.g.tsx#default:loading": {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            tree: [
              {
                id: "root",
                coordinate: "src/UserCard.g.tsx#default",
                rect: { x: 10, y: 20, width: 100, height: 32 },
                children: [],
              },
            ],
          },
        }}
        manifest={manifest}
        workspace={state}
      />,
    )

    expect(cardSelectTargets(html)).toEqual(["src/UserCard.g.tsx#default"])
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).not.toContain('data-gtsx-card-select-target="card"')
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("left:10px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("top:16px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("width:100px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("height:32px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).not.toContain("<button")
  })

  it("clips component hit targets to the preview viewport", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <ComponentCard
        component={component}
        frameState={{
          expectedSessionId: "src/UserCard.g.tsx#default:loading",
          ready: true,
          tree: [
            {
              id: "root",
              coordinate: "src/UserCard.g.tsx#default",
              rect: { x: 0, y: 12, width: 900, height: 120 },
              children: [],
            },
          ],
        }}
        manifest={manifest}
        selected
        selectedCaseName="loading"
        viewportPreset="phone"
      />,
    )

    expect(selectionOutlineHtml(html)).toBe("")
    expect(boundsHitTargetHtml(html)).toContain("width:390px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("width:390px")
    expect(previewFrameTagHtml(html, "src/UserCard.g.tsx#default:loading@phone")).not.toContain("content-visibility:auto")
    expect(previewFrameTagHtml(html, "src/UserCard.g.tsx#default:loading@phone")).not.toContain("contain:layout paint style")
  })

  it("highlights the selected component case collection as one target", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <ComponentCard
        caseFrameStates={{
          loading: {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            tree: [{ id: "loading", coordinate: "src/UserCard.g.tsx#default", rect: { x: 0, y: 12, width: 320, height: 88 }, children: [] }],
          },
          ready: {
            expectedSessionId: "src/UserCard.g.tsx#default:ready",
            ready: true,
            tree: [{ id: "ready", coordinate: "src/UserCard.g.tsx#default", rect: { x: 0, y: 24, width: 320, height: 96 }, children: [] }],
          },
        }}
        component={component}
        manifest={manifest}
        selected
        selectedCaseName="loading"
        viewportPreset="tablet"
      />,
    )

    const selectedGrid = caseGridHtml(html, "src/UserCard.g.tsx#default")
    expect(selectedGrid).toContain('data-gtsx-case-grid-selected="true"')
    expect(selectedGrid).toContain("outline:1px solid #0d99ff")
    expect(selectedGrid).not.toContain("box-shadow")
    expect(selectedGrid).not.toContain("border-radius")
    expect(selectionOutlineCount(html)).toBe(0)
    expect(html).not.toContain("data-gtsx-case-tile-selected")
  })

  it("keeps preview rendering containment below selection overlays", () => {
    const html = renderToStaticMarkup(
      <LazyPreviewFrame
        data-gtsx-preview-session-id="src/Icon.g.tsx#default:ready@phone"
        boundaryRect={{ x: 0, y: 0, width: 96, height: 96 }}
        coordinate="src/Icon.g.tsx#default"
        previewUrl="/gtsx?entry=src%2FIcon.g.tsx%23default&case=ready&chrome=0"
        selectedBoundaryRect={{ x: 0, y: 0, width: 96, height: 96 }}
        shouldLoad
        size={{ width: 390, height: 844 }}
        sessionId="src/Icon.g.tsx#default:ready"
        title="Icon preview"
        viewportPreset="phone"
      />,
    )

    expect(previewFrameTagHtml(html, "src/Icon.g.tsx#default:ready@phone")).toContain("overflow:visible")
    expect(previewFrameTagHtml(html, "src/Icon.g.tsx#default:ready@phone")).not.toContain("content-visibility:auto")
    expect(previewFrameTagHtml(html, "src/Icon.g.tsx#default:ready@phone")).not.toContain("contain:layout paint style")
    expect(previewClipHtml(html)).toContain("content-visibility:auto")
    expect(previewClipHtml(html)).toContain("contain:layout paint style")
    expect(previewClipHtml(html)).toContain("overflow:hidden")
    expect(selectionOutlineHtml(html)).toContain('data-gtsx-selection-outline="true"')
  })

  it("does not enter card selected state from sidebar or drilldown state alone", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      [
        {
          id: "root",
          coordinate: "src/UserCard.g.tsx#default",
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
        },
      ],
    )

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/UserCard.g.tsx#default:loading": {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            tree: [
              {
                id: "root",
                coordinate: "src/UserCard.g.tsx#default",
                rect: { x: 10, y: 20, width: 100, height: 32 },
                children: [],
              },
            ],
          },
        }}
        manifest={manifest}
        workspace={state}
      />,
    )

    expect(selectedCardCoordinates(html)).toEqual([])
    expect(selectionOutlineHtml(html)).toBe("")
  })

  it("only selects one UI card from pointer activation and clears it from non-card actions", () => {
    expect(
      applyStudioCardSelectionAction(undefined, {
        type: "activate-card",
        coordinate: "src/UserCard.g.tsx#default",
        source: "keyboard",
      }),
    ).toBeUndefined()

    expect(
      applyStudioCardSelectionAction(undefined, {
        type: "activate-card",
        coordinate: "src/UserCard.g.tsx#default",
        source: "pointer",
      }),
    ).toBe("src/UserCard.g.tsx#default")

    expect(
      applyStudioCardSelectionAction("src/UserCard.g.tsx#default", {
        type: "activate-card",
        coordinate: "src/MultiExport.g.tsx#NamedBadge",
        source: "pointer",
      }),
    ).toBe("src/MultiExport.g.tsx#NamedBadge")

    expect(applyStudioCardSelectionAction("src/MultiExport.g.tsx#NamedBadge", { type: "clear" })).toBeUndefined()
  })

  it("restores the initial Studio workspace from URL search params", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const html = renderToStaticMarkup(
      <StudioShell
        manifest={manifest}
        urlSearch="selection=component%3Asrc%2FUserCard.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&case=src%2FUserCard.g.tsx%23default%3Aready"
      />,
    )

    expect(cardCoordinates(html)).toEqual(["src/UserCard.g.tsx#default"])
    expect(previewSources(html)).toEqual([
      "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=loading&chrome=0&sessionId=src%2FUserCard.g.tsx%23default%3Aloading&static=1",
      "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0&sessionId=src%2FUserCard.g.tsx%23default%3Aready&static=1",
    ])
  })

  it("renders lazy preview placeholders from component coordinates and first statically enumerable cases", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
    })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(previewSources(html)).toEqual([
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&case=ready&chrome=0&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready&static=1",
      "/gtsx?entry=src%2FMultiExport.g.tsx%23default&case=defaultReady&chrome=0&sessionId=src%2FMultiExport.g.tsx%23default%3AdefaultReady&static=1",
    ])
    expect(iframeSources(html)).toEqual([])
    expect(html).not.toContain("Preview will load when visible.")
    expect(previewFrameHtml(html, "src/MultiExport.g.tsx#NamedBadge:ready")).not.toContain("background:#ffffff")
    expect(previewFrameHtml(html, "src/MultiExport.g.tsx#NamedBadge:ready")).not.toContain("border:1px solid #e5e7eb")
  })

  it("treats transformed preview bounds near the viewport as loadable", () => {
    const viewport = { bottom: 720, left: 0, right: 1280, top: 0 }

    expect(studioPreviewRetainMargin).toBeGreaterThan(studioPreviewPreloadMargin)
    expect(isRectNearViewport({ bottom: -1, left: 80, right: 360, top: -240 }, viewport, studioPreviewPreloadMargin)).toBe(true)
    expect(isRectNearViewport({ bottom: -400, left: 80, right: 360, top: -640 }, viewport, studioPreviewPreloadMargin)).toBe(false)
    expect(isRectNearViewport({ bottom: 300, left: 1281, right: 1520, top: 40 }, viewport, studioPreviewPreloadMargin)).toBe(true)
    expect(isRectNearViewport({ bottom: 300, left: 1700, right: 1920, top: 40 }, viewport, studioPreviewPreloadMargin)).toBe(false)
  })

  it("retains loaded previews near the viewport and releases distant previews", () => {
    const viewport = { bottom: 720, left: 0, right: 1280, top: 0 }
    const betweenPreloadAndRetain = {
      bottom: -studioPreviewPreloadMargin - 10,
      left: 80,
      right: 360,
      top: -studioPreviewPreloadMargin - 240,
    }
    const beyondRetain = {
      bottom: -studioPreviewRetainMargin - 10,
      left: 80,
      right: 360,
      top: -studioPreviewRetainMargin - 240,
    }

    expect(shouldRenderStudioPreview(false, betweenPreloadAndRetain, viewport)).toBe(false)
    expect(shouldRenderStudioPreview(true, betweenPreloadAndRetain, viewport)).toBe(true)
    expect(shouldRenderStudioPreview(true, beyondRetain, viewport)).toBe(false)
  })

  it("computes preview visibility centrally from canvas coordinates", () => {
    expect(
      [...visibleStudioPreviewSessionIds({
        canvas: { x: -420, y: -120, scale: 1 },
        currentSessionIds: new Set(["retained"]),
        items: [
          {
            rect: { bottom: 260, left: 360, right: 640, top: 40 },
            sessionIds: ["visible-a", "visible-b"],
          },
          {
            rect: { bottom: 260, left: 2200, right: 2460, top: 40 },
            sessionIds: ["far"],
          },
          {
            rect: { bottom: 260, left: -1320, right: -1120, top: 40 },
            sessionIds: ["retained"],
          },
        ],
        viewport: { bottom: 720, left: 0, right: 1280, top: 0 },
      })].sort(),
    ).toEqual(["retained", "visible-a", "visible-b"])
  })

  it("queues preview rendering by viewport priority and active render budget", () => {
    const queueInput = {
      canvas: { x: 0, y: 0, scale: 1 },
      items: [
        {
          rect: { bottom: 100, left: 0, right: 100, top: 0 },
          sessionIds: ["visible-a", "visible-b", "visible-c"],
        },
        {
          rect: { bottom: 250, left: 0, right: 100, top: 150 },
          sessionIds: ["near-a", "near-b"],
        },
      ],
      maxActive: 2,
      maxLength: 5,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds(queueInput)]).toEqual(["visible-a", "visible-b"])
    expect(
      [...queuedStudioPreviewSessionIds({
        ...queueInput,
        completedSessionIds: new Set(["visible-a"]),
        currentSessionIds: new Set(["visible-a", "visible-b"]),
      })],
    ).toEqual(["visible-a", "visible-b", "visible-c", "near-a"])
    expect(
      [...queuedStudioPreviewSessionIds({
        ...queueInput,
        currentSessionIds: new Set(["visible-a"]),
        maxActive: 1,
      })],
    ).toEqual(["visible-a", "visible-b"])
    expect(
      [...queuedStudioPreviewSessionIds({
        ...queueInput,
        activeSessionIds: new Set(["visible-a"]),
        currentSessionIds: new Set(["visible-a"]),
        maxActive: 1,
      })],
    ).toEqual(["visible-a"])
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(["done"]),
        currentSessionIds: new Set(["done"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["new-a", "new-b", "done"],
          },
        ],
        maxActive: 2,
        maxLength: 3,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["new-a", "new-b", "done"])
  })

  it("spreads active render work across visible cards before deeper case rounds", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["top-a", "top-b"],
          },
          {
            rect: { bottom: 100, left: 140, right: 240, top: 0 },
            sessionIds: ["bottom-a", "bottom-b"],
          },
        ],
        maxActive: 2,
        maxLength: 4,
        viewport: { bottom: 100, left: 0, right: 240, top: 0 },
      })],
    ).toEqual(["top-a", "bottom-a"])
  })

  it("reorders the preview render queue when the canvas moves", () => {
    const input = {
      items: [
        {
          rect: { bottom: 100, left: 0, right: 100, top: 0 },
          sessionIds: ["top-a", "top-b"],
        },
        {
          rect: { bottom: 320, left: 0, right: 100, top: 220 },
          sessionIds: ["lower-a", "lower-b"],
        },
      ],
      maxActive: 2,
      maxLength: 4,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds({ ...input, canvas: { x: 0, y: 0, scale: 1 } })]).toEqual(["top-a", "top-b"])
    expect([...queuedStudioPreviewSessionIds({ ...input, canvas: { x: 0, y: -220, scale: 1 } })]).toEqual([
      "lower-a",
      "lower-b",
    ])
  })

  it("caps pending preview queue length without dropping completed mounted previews", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(["a", "b", "c"]),
        currentSessionIds: new Set(["a", "b", "c"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["a", "b", "c"],
          },
        ],
        maxActive: 1,
        maxLength: 2,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["a", "b", "c"])
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["a", "b", "c", "d"],
          },
        ],
        maxActive: 4,
        maxLength: 2,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["a", "b"])
  })

  it("uses an adjustable preload buffer for near-canvas preview work", () => {
    const input = {
      canvas: { x: 0, y: 0, scale: 1 },
      items: [
        {
          rect: { bottom: 550, left: 0, right: 100, top: 450 },
          sessionIds: ["buffered"],
        },
      ],
      maxActive: 2,
      maxLength: 4,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds({ ...input, preloadMargin: 100 })]).toEqual([])
    expect([...queuedStudioPreviewSessionIds({ ...input, preloadMargin: 500 })]).toEqual(["buffered"])
  })

  it("creates stable pooled iframe URLs and render targets for preview slots", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })

    expect(createStudioPreviewPoolUrl(manifest)).toBe("/gtsx?chrome=0&pool=1")
    expect(
      studioPreviewRenderTargetFromUrl(
        "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0&sessionId=session-1&static=1&gcase=src%2FChild.g.tsx%23default%3Aopen",
        "fallback-session",
      ),
    ).toEqual({
      caseName: "ready",
      caseOverrides: [["src/Child.g.tsx#default", "open"]],
      chrome: "0",
      entry: "src/UserCard.g.tsx#default",
      sessionId: "session-1",
      staticMode: true,
    })
  })

  it("derives warmup previews near the selected workspace path without duplicating active cards", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const state = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      [
        {
          id: "root",
          coordinate: "src/UserCard.g.tsx#default",
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
        },
      ],
    )

    const activeTargets = currentStudioPreviewTargets(manifest, state)
    const warmupTargets = studioPreviewWarmupTargets(manifest, state)

    expect(activeTargets.map((target) => target.sessionId)).toEqual([
      "src/UserCard.g.tsx#default:loading",
      "src/UserCard.g.tsx#default:ready",
      "src/MultiExport.g.tsx#NamedBadge:ready",
    ])
    expect(warmupTargets.map((target) => target.sessionId)).not.toContain("src/UserCard.g.tsx#default:loading")
    expect(warmupTargets.map((target) => target.sessionId)).not.toContain("src/UserCard.g.tsx#default:ready")
    expect(warmupTargets.map((target) => target.sessionId)).not.toContain("src/MultiExport.g.tsx#NamedBadge:ready")
  })

  it("uses cached preview geometry while the active preview is still loading", () => {
    expect(
      mergeStudioPreviewFrameState(
        "src/UserCard.g.tsx#default:ready",
        {
          expectedSessionId: "src/UserCard.g.tsx#default:ready",
          ready: true,
        },
        {
          expectedSessionId: "warmup:tablet\nsrc/UserCard.g.tsx#default\nready",
          ready: true,
          size: { width: 768, height: 1024 },
          tree: [
            {
              id: "root",
              coordinate: "src/UserCard.g.tsx#default",
              rect: { x: 0, y: 12, width: 320, height: 88 },
              children: [],
            },
          ],
        },
      ),
    ).toMatchObject({
      expectedSessionId: "src/UserCard.g.tsx#default:ready",
      ready: true,
      size: { width: 768, height: 1024 },
      tree: [
        {
          rect: { x: 0, y: 12, width: 320, height: 88 },
        },
      ],
    })
  })

  it("uses cached preview geometry for component case previews", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        workspace={createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")}
        previewCache={{
          [studioPreviewCacheKey(component, "ready", "tablet")]: {
            lastUsedAt: 1,
            frameState: {
              expectedSessionId: `warmup:${studioPreviewCacheKey(component, "ready", "tablet")}`,
              ready: true,
              tree: [
                {
                  id: "root",
                  coordinate: "src/UserCard.g.tsx#default",
                  rect: { x: 0, y: 0, width: 320, height: 88 },
                  children: [],
                },
              ],
            },
          },
        }}
        manifest={manifest}
      />,
    )

    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:ready")).toContain("height:104px")
    expect(casePreviewFrameHtml(html, "ready")).not.toContain("height:1024px")
    expect(html).toContain('data-gtsx-case-grid-columns="2"')
    expect(html).not.toContain("data-gtsx-case-sidebar")
  })

  it("invalidates preview cache keys when the component source hash changes", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    expect(studioPreviewCacheKey({ ...component, sourceHash: "hash-a" }, "ready", "tablet")).not.toBe(
      studioPreviewCacheKey({ ...component, sourceHash: "hash-b" }, "ready", "tablet"),
    )
  })

  it("uses a project namespace for the browser preview geometry cache", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
      cache: { namespace: "yuckuolie" },
    })

    expect(studioPreviewIndexedDBNamespace(manifest)).toBe("project:yuckuolie")
  })

  it("derives a stable fallback namespace from the Studio manifest shape", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const namespace = studioPreviewIndexedDBNamespace(manifest)
    const renamedManifest = {
      ...manifest,
      files: manifest.files.map((file, index) => (index === 0 ? { ...file, path: `renamed/${file.path}` } : file)),
    }

    expect(namespace).toMatch(/^manifest:/)
    expect(studioPreviewIndexedDBNamespace(renamedManifest)).not.toBe(namespace)
  })

  it("uses tablet viewport sizing by default", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
    })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/UserCard.g.tsx#default:loading": {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            size: { width: 320, height: 420 },
          },
        }}
        manifest={manifest}
        workspace={state}
      />,
    )

    expect(html).toContain('data-gtsx-preview-session-id="src/UserCard.g.tsx#default:loading"')
    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:loading")).toContain("width:768px")
    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:loading")).toContain("height:1024px")
  })

  it("uses fixed viewport presets instead of content-height sizing", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const workspace = changeStudioViewportPreset(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      "src/UserCard.g.tsx#default",
      "phone",
    )

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/UserCard.g.tsx#default:loading": {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            size: { width: 320, height: 420 },
          },
        }}
        manifest={manifest}
        workspace={workspace}
      />,
    )

    expect(html).toContain("Viewport")
    expect(html).toContain('data-gtsx-viewport-preset="phone"')
    expect(html).toContain("width:390px")
    expect(html).toContain("height:844px")
    expect(html).not.toContain("height:420px")
  })

  it("applies the floating viewport preset to every canvas component", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const workspace = {
      ...createStudioWorkspaceState(manifest, "file:src/MultiExport.g.tsx"),
      canvasViewportPreset: "phone" as const,
      selectedViewportPresetByCoordinate: {
        "src/MultiExport.g.tsx#NamedBadge": "desktop" as const,
        "src/MultiExport.g.tsx#default": "tablet" as const,
      },
    }

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={workspace} />)

    expect(canvasViewportPresets(html)).toEqual(["phone", "phone"])
  })

  it("separates preview sessions by non-tablet viewport preset", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    expect(previewSessionId(component, "ready")).toBe("src/UserCard.g.tsx#default:ready")
    expect(previewSessionId(component, "ready", "tablet")).toBe("src/UserCard.g.tsx#default:ready")
    expect(previewSessionId(component, "ready", "desktop")).toBe("src/UserCard.g.tsx#default:ready@desktop")
    expect(previewSessionId(component, "ready", "phone")).toBe("src/UserCard.g.tsx#default:ready@phone")
  })

  it("reads preview pool debug mode from URL params", () => {
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debug=pool"))).toBe(true)
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debug=layout,pool"))).toBe(true)
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debug=layout&debug=pool"))).toBe(true)
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debug=layout&debug=preview-pool"))).toBe(true)
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debug=no-pool"))).toBe(true)
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debugPool=1"))).toBe(true)
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debugPool=0"))).toBe(true)
    expect(isStudioPreviewPoolDebugEnabled(new URLSearchParams("debug=layout"))).toBe(false)
  })

  it("reads preview pool disable mode from URL params", () => {
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debug=no-pool"))).toBe(true)
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debug=layout,disable-pool"))).toBe(true)
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debug=layout&debug=without-pool"))).toBe(true)
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debugPool=0"))).toBe(true)
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debugPool=false"))).toBe(true)
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debugPool=off"))).toBe(true)
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debug=pool"))).toBe(false)
    expect(isStudioPreviewPoolDisabled(new URLSearchParams("debugPool=1"))).toBe(false)
  })

  it("reads preview render queue limits from URL params", () => {
    expect(
      studioPreviewRenderQueueOptionsFromParams(
        new URLSearchParams(
          "previewQueueActive=3&previewQueueLength=9&previewQueueBuffer=640&previewQueueRetain=1800&previewQueueActiveTimeout=900",
        ),
      ),
    ).toEqual({
      activeTimeoutMs: 900,
      maxActive: 3,
      maxLength: 9,
      preloadMargin: 640,
      retainMargin: 1800,
    })
    expect(studioPreviewRenderQueueOptionsFromParams(new URLSearchParams("queueActive=4&queueLength=12&queueBuffer=700"))).toEqual({
      activeTimeoutMs: undefined,
      maxActive: 4,
      maxLength: 12,
      preloadMargin: 700,
      retainMargin: undefined,
    })
    expect(studioPreviewRenderQueueOptionsFromParams(new URLSearchParams("queueActive=0&queueLength=nope"))).toEqual({
      activeTimeoutMs: undefined,
      maxActive: undefined,
      maxLength: undefined,
      preloadMargin: undefined,
      retainMargin: undefined,
    })
  })

  it("can disable the Studio preview iframe pool from debug URL params", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })

    expect(renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="debug=pool" />)).toContain(
      'data-gtsx-preview-iframe-pool="true"',
    )
    expect(renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="debug=pool" />)).toContain(
      'data-gtsx-preview-iframe-pool-stats="true"',
    )
    expect(renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="debug=no-pool" />)).not.toContain(
      'data-gtsx-preview-iframe-pool="true"',
    )
  })

  it("stores viewport as a single canvas-level preset across drilldown columns", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const parentState = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      [
        {
          id: "root",
          coordinate: "src/UserCard.g.tsx#default",
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
        },
      ],
    )
    const childState = selectStudioComponent(parentState, manifest, "src/MultiExport.g.tsx#NamedBadge", [])
    const nextState = changeStudioCanvasViewportPreset(
      {
        ...childState,
        selectedViewportPresetByCoordinate: {
          "src/UserCard.g.tsx#default": "desktop",
          "src/MultiExport.g.tsx#NamedBadge": "phone",
        },
      },
      "tablet",
    )

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={nextState} />)

    expect(nextState.canvasViewportPreset).toBe("tablet")
    expect(canvasViewportPresets(html)).toEqual(["tablet", "tablet", "tablet"])
    expect(nextState.selectedViewportPresetByCoordinate).toEqual({})
  })

  it("restores canvas viewport when the sidebar changes selection", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const restored = createStudioWorkspaceStateFromUrl(
      manifest,
      new URLSearchParams("selection=component%3Asrc%2FMultiExport.g.tsx%23NamedBadge&canvasViewport=phone"),
    )

    expect(restored.selection).toBe("component:src/MultiExport.g.tsx#NamedBadge")
    expect(restored.workspace.canvasViewportPreset).toBe("phone")
    expect(canvasViewportPresets(renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={restored.workspace} />))).toEqual([
      "phone",
    ])
  })

  it("uses component bounds height instead of viewport position for canvas card layout", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/UserCard.g.tsx#default:loading": {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            tree: [
              {
                id: "root",
                coordinate: "src/UserCard.g.tsx#default",
                rect: { x: 0, y: 12, width: 320, height: 88 },
                children: [],
              },
            ],
          },
        }}
        manifest={manifest}
        workspace={state}
      />,
    )

    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:loading")).toContain("height:88px")
  })

  it("uses component bounds width instead of viewport position for card column layout", () => {
    expect(
      componentCardLayoutWidth(
        { width: 1280 },
        [
          {
            id: "root",
            coordinate: "src/UserCard.g.tsx#default",
            rect: { x: 0, y: 0, width: 520, height: 240 },
            children: [],
          },
        ],
        "src/UserCard.g.tsx#default",
      ),
    ).toBe(536)

    expect(
      componentCardLayoutWidth(
        { width: 1280 },
        [
          {
            id: "root",
            coordinate: "src/UserCard.g.tsx#default",
            rect: { x: 420, y: 0, width: 360, height: 240 },
            children: [],
          },
        ],
        "src/UserCard.g.tsx#default",
      ),
    ).toBe(392)

    expect(componentCardLayoutWidth({ width: 1280 }, undefined, "src/UserCard.g.tsx#default")).toBe(1308)
  })

  it("renders a card-level error for invalid preview targets", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const dynamicCasesFile = manifest.files.find((file) => file.path === "src/DynamicCases.g.tsx")
    if (!dynamicCasesFile) throw new Error("Missing DynamicCases fixture")

    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/DynamicCases.g.tsx" />)

    expect(cardCoordinates(html)).toEqual(["src/DynamicCases.g.tsx#default"])
    expect(iframeSources(html)).toEqual([])
    expect(html).toContain("Preview unavailable")
    expect(html).toContain("non-static-case-key")
  })

  it("isolates iframe render failures to one card with reproduction details", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
    })
    const state = createStudioWorkspaceState(manifest, "file:src/MultiExport.g.tsx")

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/MultiExport.g.tsx#NamedBadge:ready": {
            expectedSessionId: "src/MultiExport.g.tsx#NamedBadge:ready",
            ready: true,
            error: {
              message: "Cannot read properties of undefined",
              stack: "TypeError: Cannot read properties of undefined\n    at NamedBadge",
            },
          },
        }}
        manifest={manifest}
        workspace={state}
      />,
    )

    expect(html).toContain("Preview unavailable")
    expect(html).toContain("src/MultiExport.g.tsx#NamedBadge")
    expect(html).toContain("ready")
    expect(html).toContain("Cannot read properties of undefined")
    expect(html).toContain("TypeError: Cannot read properties of undefined")
    expect(html).toContain(
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&amp;case=ready&amp;chrome=0&amp;sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready&amp;static=1",
    )
    expect(previewSources(html)).toContain(
      "/gtsx?entry=src%2FMultiExport.g.tsx%23default&case=defaultReady&chrome=0&sessionId=src%2FMultiExport.g.tsx%23default%3AdefaultReady&static=1",
    )
  })

  it("ignores stale iframe session messages", () => {
    const state = applyStudioPreviewMessage(
      {
        expectedSessionId: "current-session",
        ready: false,
      },
      {
        type: "gtsx:tree",
        protocolVersion: 1,
        sessionId: "stale-session",
        tree: [
          {
            id: "stale",
            coordinate: "src/Stale.g.tsx#default",
            children: [],
          },
        ],
      },
    )

    expect(state).toEqual({
      expectedSessionId: "current-session",
      ready: false,
    })
    expect(
      applyStudioPreviewMessage(state, {
        type: "gtsx:ready",
        protocolVersion: 1,
        sessionId: "current-session",
      }),
    ).toEqual({
      expectedSessionId: "current-session",
      ready: true,
    })
  })

  it("clears transient preview errors after a session reports ready again", () => {
    const state = applyStudioPreviewMessage(
      {
        expectedSessionId: "current-session",
        ready: false,
        error: {
          message: "Unknown GTSX entry: src/Transient.g.tsx#default",
        },
      },
      {
        type: "gtsx:ready",
        protocolVersion: 1,
        sessionId: "current-session",
      },
    )

    expect(state).toEqual({
      expectedSessionId: "current-session",
      ready: true,
    })
  })

  it("updates frame state only for active iframe sessions", () => {
    const current = {
      "current-session": {
        expectedSessionId: "current-session",
        ready: false,
      },
    }

    expect(
      applyStudioPreviewMessageToFrameStates(
        current,
        {
          type: "gtsx:ready",
          protocolVersion: 1,
          sessionId: "stale-session",
        },
        new Set(["current-session"]),
      ),
    ).toBe(current)

    expect(
      applyStudioPreviewMessageToFrameStates(
        current,
        {
          type: "gtsx:ready",
          protocolVersion: 1,
          sessionId: "current-session",
        },
        new Set(["current-session"]),
      ),
    ).toEqual({
      "current-session": {
        expectedSessionId: "current-session",
        ready: true,
      },
    })
  })

  it("keeps pooled iframe handshake messages out of session frame state", () => {
    expect(isGPreviewProtocolMessage({ type: "gtsx:pool-ready", protocolVersion: 1 })).toBe(false)
    expect(isGPreviewProtocolMessage({ type: "gtsx:ready", protocolVersion: 1, sessionId: "session-1" })).toBe(true)
    expect(isGPreviewProtocolMessage({ type: "gtsx:ready", protocolVersion: 1 })).toBe(false)
  })

  it("keeps pooled iframe borrow identity stable across render target and size updates", () => {
    const input = {
      size: { width: 768, height: 1024 },
      slot: {
        previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
        sessionId: "src/UserCard.g.tsx#default:ready",
        title: "UserCard ready preview",
      },
    }

    expect(studioPreviewIframeBorrowKey({ ...input, onPreviewFrameMount() {} })).toBe(
      studioPreviewIframeBorrowKey({ ...input, onPreviewFrameMount() {} }),
    )
    expect(studioPreviewIframeBorrowKey({ ...input, size: { width: 390, height: 844 } })).toBe(
      studioPreviewIframeBorrowKey(input),
    )
    expect(
      studioPreviewIframeBorrowKey({
        ...input,
        slot: { ...input.slot, previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=error&chrome=0" },
      }),
    ).toBe(studioPreviewIframeBorrowKey(input))
    expect(
      studioPreviewIframeBorrowKey({
        ...input,
        slot: { ...input.slot, sessionId: "src/UserCard.g.tsx#default:error" },
      }),
    ).not.toBe(studioPreviewIframeBorrowKey(input))
  })

  it("stores runtime values responses by boundary id", () => {
    const state = applyStudioPreviewMessage(
      {
        expectedSessionId: "current-session",
        ready: true,
      },
      {
        type: "gtsx:values",
        protocolVersion: 1,
        sessionId: "current-session",
        values: {
          boundaryId: "gtsx-boundary:1",
          props: { type: "object", constructorName: "Object", entries: [] },
          scope: { type: "undefined" },
          providerValues: [],
        },
      },
    )

    expect(state.valuesByBoundaryId).toEqual({
      "gtsx-boundary:1": {
        boundaryId: "gtsx-boundary:1",
        props: { type: "object", constructorName: "Object", entries: [] },
        scope: { type: "undefined" },
        providerValues: [],
      },
    })
  })

  it("creates a child column from the selected component boundary tree", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const nextState = selectStudioComponent(state, manifest, "src/UserCard.g.tsx#default", [
      {
        id: "root",
        coordinate: "src/UserCard.g.tsx#default",
        children: [
          { id: "child-1", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] },
          { id: "child-2", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] },
          { id: "child-3", coordinate: "src/MultiExport.g.tsx#default", children: [] },
        ],
      },
    ])

    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      ["src/UserCard.g.tsx#default"],
      ["src/MultiExport.g.tsx#NamedBadge", "src/MultiExport.g.tsx#default"],
    ])
    expect(nextState.columns[1]?.parentCoordinate).toBe("src/UserCard.g.tsx#default")
    expect(nextState.selectedCoordinatePath).toEqual(["src/UserCard.g.tsx#default"])
  })

  it("creates drilldown from all case trees without storing a highlighted case", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const coordinate = "src/UserCard.g.tsx#default"
    const state = changeStudioComponentCase(createStudioWorkspaceState(manifest, `component:${coordinate}`), coordinate, "ready")

    const nextState = selectStudioComponent(state, manifest, coordinate, [
      [{ id: "loading", coordinate, children: [] }],
      [
        {
          id: "ready",
          coordinate,
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#default", children: [] }],
        },
      ],
    ])
    const params = createStudioWorkspaceUrlSearchParams(`component:${coordinate}`, nextState)

    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      [coordinate],
      ["src/MultiExport.g.tsx#default"],
    ])
    expect(nextState.selectedCaseByCoordinate).toEqual({})
    expect(params.toString()).toContain("path=src%2FUserCard.g.tsx%23default")
    expect(params.toString()).not.toContain("case=")
  })

  it("does not create an empty drilldown column for components without GTSX children", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const nextState = selectStudioComponent(state, manifest, "src/UserCard.g.tsx#default", [
      {
        id: "root",
        coordinate: "src/UserCard.g.tsx#default",
        children: [],
      },
    ])

    expect(nextState.columns).toHaveLength(1)
    expect(nextState.selectedCoordinatePath).toEqual(["src/UserCard.g.tsx#default"])
  })

  it("discards columns to the right when selecting from an earlier column", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "file:src/MultiExport.g.tsx")
    const stateWithChildColumn = selectStudioComponent(state, manifest, "src/MultiExport.g.tsx#NamedBadge", [
      {
        id: "root",
        coordinate: "src/MultiExport.g.tsx#NamedBadge",
        children: [{ id: "child", coordinate: "src/UserCard.g.tsx#default", children: [] }],
      },
    ])

    const nextState = selectStudioComponent(stateWithChildColumn, manifest, "src/MultiExport.g.tsx#default", [
      {
        id: "root",
        coordinate: "src/MultiExport.g.tsx#default",
        children: [],
      },
    ])

    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      ["src/MultiExport.g.tsx#NamedBadge", "src/MultiExport.g.tsx#default"],
    ])
    expect(nextState.selectedCoordinatePath).toEqual(["src/MultiExport.g.tsx#default"])
  })

  it("selects duplicate drilldown coordinates by their clicked column instance", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const parentCoordinate = "src/UserCard.g.tsx#default"
    const branchCoordinate = "src/MultiExport.g.tsx#default"
    const sharedCoordinate = "src/MultiExport.g.tsx#NamedBadge"
    const parentState = selectStudioComponent(createStudioWorkspaceState(manifest, `component:${parentCoordinate}`), manifest, parentCoordinate, [
      {
        id: "parent",
        coordinate: parentCoordinate,
        children: [
          { id: "branch", coordinate: branchCoordinate, children: [] },
          { id: "shared-parent-child", coordinate: sharedCoordinate, children: [] },
        ],
      },
    ])
    const branchState = selectStudioComponent(parentState, manifest, branchCoordinate, [
      {
        id: "branch",
        coordinate: branchCoordinate,
        children: [{ id: "shared-branch-child", coordinate: sharedCoordinate, children: [] }],
      },
    ], { columnIndex: 1 })

    const selectedFromBranch = selectStudioComponent(branchState, manifest, sharedCoordinate, [], { columnIndex: 2 })
    const selectedFromParent = selectStudioComponent(branchState, manifest, sharedCoordinate, [], { columnIndex: 1 })

    expect(branchState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      [parentCoordinate],
      [branchCoordinate, sharedCoordinate],
      [sharedCoordinate],
    ])
    expect(selectedFromBranch.selectedCoordinatePath).toEqual([parentCoordinate, branchCoordinate, sharedCoordinate])
    expect(selectedFromParent.selectedCoordinatePath).toEqual([parentCoordinate, sharedCoordinate])
    expect(selectedFromParent.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      [parentCoordinate],
      [branchCoordinate, sharedCoordinate],
    ])
  })

  it("renders workspace drilldown columns", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      [
        {
          id: "root",
          coordinate: "src/UserCard.g.tsx#default",
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
        },
      ],
    )

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={state} />)

    expect(columnCount(html)).toBe(2)
    expect(cardCoordinates(html)).toEqual(["src/UserCard.g.tsx#default", "src/MultiExport.g.tsx#NamedBadge"])
    expect(html).toContain('data-gtsx-column-parent-coordinate="src/UserCard.g.tsx#default"')
  })

  it("uses the first statically enumerable case by default", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const component = manifest.files
      .flatMap((file) => file.components)
      .find((candidate) => candidate.coordinate === "src/MultiExport.g.tsx#default")
    if (!component) throw new Error("Missing component")

    expect(selectedStudioCaseName(createStudioWorkspaceState(manifest), component)).toBe("defaultReady")
  })

  it("stores selected cases per component coordinate and clears deeper columns", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/Badge.g.tsx#default"),
      manifest,
      "src/Badge.g.tsx#default",
      [
        {
          id: "root",
          coordinate: "src/Badge.g.tsx#default",
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#default", children: [] }],
        },
      ],
    )

    const nextState = changeStudioComponentCase(state, "src/Badge.g.tsx#default", "warning")

    expect(nextState.selectedCaseByCoordinate).toEqual({
      "src/Badge.g.tsx#default": "warning",
    })
    expect(nextState.columns).toHaveLength(1)
    expect(nextState.selectedCoordinatePath).toEqual(["src/Badge.g.tsx#default"])
  })

  it("keeps drilldown columns when changing the highlighted component case", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/Badge.g.tsx#default"),
      manifest,
      "src/Badge.g.tsx#default",
      [
        {
          id: "root",
          coordinate: "src/Badge.g.tsx#default",
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#default", children: [] }],
        },
      ],
    )
    const childState = selectStudioComponent(state, manifest, "src/MultiExport.g.tsx#default", [])

    const nextState = changeStudioComponentCase(childState, "src/Badge.g.tsx#default", "warning", { keepDrilldown: true })

    expect(nextState.selectedCaseByCoordinate).toEqual({
      "src/Badge.g.tsx#default": "warning",
    })
    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      ["src/Badge.g.tsx#default"],
      ["src/MultiExport.g.tsx#default"],
    ])
    expect(nextState.selectedCoordinatePath).toEqual(["src/Badge.g.tsx#default", "src/MultiExport.g.tsx#default"])
  })

  it("renders the selected case in the component iframe URL", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const state = changeStudioComponentCase(
      createStudioWorkspaceState(manifest, "component:src/Badge.g.tsx#default"),
      "src/Badge.g.tsx#default",
      "warning",
    )

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={state} />)

    expect(previewSources(html)).toEqual([
      "/gtsx?entry=src%2FBadge.g.tsx%23default&case=neutral&chrome=0&sessionId=src%2FBadge.g.tsx%23default%3Aneutral&static=1",
      "/gtsx?entry=src%2FBadge.g.tsx%23default&case=warning&chrome=0&sessionId=src%2FBadge.g.tsx%23default%3Awarning&static=1",
    ])
  })

  it("keeps ancestor preview URLs stable when selected child cases change", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const parentState = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      [
        {
          id: "root",
          coordinate: "src/UserCard.g.tsx#default",
          children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
        },
      ],
    )
    const childState = changeStudioComponentCase(
      selectStudioComponent(parentState, manifest, "src/MultiExport.g.tsx#NamedBadge", []),
      "src/MultiExport.g.tsx#NamedBadge",
      "ready",
    )

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={childState} />)
    const sources = previewSources(html)

    expect(sources[0]).toContain("entry=src%2FUserCard.g.tsx%23default")
    expect(sources[0]).toContain("case=loading")
    expect(sources[0]).not.toContain("gcase=")
    expect(sources[0]).toContain("sessionId=src%2FUserCard.g.tsx%23default%3Aloading")
    expect(sources[1]).toContain("entry=src%2FUserCard.g.tsx%23default")
    expect(sources[1]).toContain("case=ready")
    expect(sources[1]).not.toContain("gcase=")
    expect(sources[2]).toBe(
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&case=ready&chrome=0&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready&static=1",
    )
    expect(createStudioRuntimeValuesRequest(manifest, childState, "child")?.sessionId).toBe(
      "src/UserCard.g.tsx#default:loading",
    )
  })

  it("renders floating viewport controls without the Inspector panel", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={state} />)

    expect(html).not.toContain(">Inspector<")
    expect(html).toContain('data-gtsx-floating-viewport-controls="true"')
    expect(viewportControlNames(html)).toEqual(["phone", "tablet", "desktop"])
    expect(html).toContain('data-gtsx-viewport-tab-highlight="true"')
  })

  it("does not render runtime instance Inspector UI", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const parentTree = [
      {
        id: "parent",
        coordinate: "src/UserCard.g.tsx#default",
        children: [
          {
            id: "child-1",
            coordinate: "src/MultiExport.g.tsx#NamedBadge",
            rect: { x: 10, y: 20, width: 100, height: 32 },
            children: [],
          },
          {
            id: "child-2",
            coordinate: "src/MultiExport.g.tsx#NamedBadge",
            rect: { x: 10, y: 60, width: 100, height: 32 },
            children: [],
          },
        ],
      },
    ]
    const parentState = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      parentTree,
    )
    const childState = selectStudioComponent(parentState, manifest, "src/MultiExport.g.tsx#NamedBadge", [])

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/UserCard.g.tsx#default:loading": {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            tree: parentTree,
          },
        }}
        manifest={manifest}
        workspace={childState}
      />,
    )

    expect(html).not.toContain(">Instances<")
    expect(runtimeInstanceIds(html)).toEqual([])
  })

  it("targets the parent preview session when requesting values for a selected child instance", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const parentState = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      [
        {
          id: "parent",
          coordinate: "src/UserCard.g.tsx#default",
          children: [{ id: "child-1", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
        },
      ],
    )
    const childState = selectStudioComponent(parentState, manifest, "src/MultiExport.g.tsx#NamedBadge", [])

    expect(createStudioRuntimeValuesRequest(manifest, childState, "child-1")).toEqual({
      sessionId: "src/UserCard.g.tsx#default:loading",
      message: {
        type: "gtsx:request-values",
        protocolVersion: 1,
        sessionId: "src/UserCard.g.tsx#default:loading",
        boundaryId: "child-1",
      },
    })
  })

  it("does not render runtime values in the removed Inspector panel", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const parentTree = [
      {
        id: "parent",
        coordinate: "src/UserCard.g.tsx#default",
        children: [{ id: "child-1", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
      },
    ]
    const parentState = selectStudioComponent(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      manifest,
      "src/UserCard.g.tsx#default",
      parentTree,
    )
    const childState = selectStudioRuntimeInstance(
      selectStudioComponent(parentState, manifest, "src/MultiExport.g.tsx#NamedBadge", []),
      "src/MultiExport.g.tsx#NamedBadge",
      "child-1",
    )

    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        frameStates={{
          "src/UserCard.g.tsx#default:loading": {
            expectedSessionId: "src/UserCard.g.tsx#default:loading",
            ready: true,
            tree: parentTree,
            valuesByBoundaryId: {
              "child-1": {
                boundaryId: "child-1",
                props: {
                  type: "object",
                  constructorName: "Object",
                  entries: [{ key: "label", value: { type: "string", value: "Agent inbox" } }],
                },
                scope: {
                  type: "object",
                  constructorName: "Object",
                  entries: [{ key: "expanded", value: { type: "boolean", value: true } }],
                },
                providerValues: [{ providerName: "ThemeGTSXProvider", value: { type: "string", value: "dark" } }],
              },
            },
          },
        }}
        manifest={manifest}
        workspace={childState}
      />,
    )

    expect(html).not.toContain(">Values<")
    expect(html).not.toContain("Agent inbox")
    expect(html).not.toContain("ThemeGTSXProvider")
  })

  it("round-trips restorable workspace state through URL params without runtime values", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const workspace = selectStudioRuntimeInstance(
      {
        canvasViewportPreset: "phone",
        columns: [
          {
            components: [
              manifest.files
                .flatMap((file) => file.components)
                .find((component) => component.coordinate === "src/UserCard.g.tsx#default")!,
            ],
          },
          {
            components: [
              manifest.files
                .flatMap((file) => file.components)
                .find((component) => component.coordinate === "src/MultiExport.g.tsx#NamedBadge")!,
            ],
          },
        ],
        selectedCaseByCoordinate: {
          "src/UserCard.g.tsx#default": "ready",
          "src/MultiExport.g.tsx#NamedBadge": "ready",
        },
        selectedCoordinatePath: ["src/UserCard.g.tsx#default", "src/MultiExport.g.tsx#NamedBadge"],
        selectedRuntimeInstanceByCoordinate: {
          "src/MultiExport.g.tsx#NamedBadge": "gtsx-boundary:1",
        },
        selectedViewportPresetByCoordinate: {},
      },
      "src/MultiExport.g.tsx#NamedBadge",
      "gtsx-boundary:1",
    )

    const params = createStudioWorkspaceUrlSearchParams("component:src/UserCard.g.tsx#default", workspace)
    const serialized = params.toString()

    expect(serialized).toContain("selection=component%3Asrc%2FUserCard.g.tsx%23default")
    expect(serialized).toContain("canvasViewport=phone")
    expect(serialized).toContain("path=src%2FUserCard.g.tsx%23default")
    expect(serialized).toContain("case=src%2FUserCard.g.tsx%23default%3Aready")
    expect(serialized).toContain("instance=src%2FMultiExport.g.tsx%23NamedBadge%3Agtsx-boundary%3A1")
    expect(serialized).not.toContain("Agent%20inbox")
    expect(serialized).not.toContain("props")
    expect(serialized).not.toContain("scope")
    expect(serialized).not.toContain("provider")

    const restored = createStudioWorkspaceStateFromUrl(manifest, new URLSearchParams(serialized))

    expect(restored.warning).toBeUndefined()
    expect(restored.selection).toBe("component:src/UserCard.g.tsx#default")
    expect(restored.workspace.canvasViewportPreset).toBe("phone")
    expect(restored.workspace.selectedCoordinatePath).toEqual([
      "src/UserCard.g.tsx#default",
      "src/MultiExport.g.tsx#NamedBadge",
    ])
    expect(restored.workspace.selectedCaseByCoordinate).toEqual({
      "src/UserCard.g.tsx#default": "ready",
      "src/MultiExport.g.tsx#NamedBadge": "ready",
    })
    expect(restored.workspace.selectedRuntimeInstanceByCoordinate).toEqual({
      "src/MultiExport.g.tsx#NamedBadge": "gtsx-boundary:1",
    })
  })

  it("round-trips canvas drag and zoom state through URL params", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const workspace = createStudioWorkspaceState(manifest, "file:src/MultiExport.g.tsx")
    const params = createStudioWorkspaceUrlSearchParams("file:src/MultiExport.g.tsx", workspace, {
      x: 123.4567,
      y: -8.7654,
      scale: 1.23456,
    })
    const serialized = params.toString()

    expect(serialized).toContain("canvasX=123.457")
    expect(serialized).toContain("canvasY=-8.765")
    expect(serialized).toContain("canvasScale=1.235")
    expect(createStudioCanvasTransformFromUrl(new URLSearchParams("canvasX=10&canvasY=20&canvasScale=9"))).toEqual({
      x: 10,
      y: 20,
      scale: 2.5,
    })
    expect(createStudioWorkspaceStateFromUrl(manifest, params).canvas).toEqual({
      x: 123.457,
      y: -8.765,
      scale: 1.235,
    })
  })

  it("renders the initial canvas transform restored from URL params", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const html = renderToStaticMarkup(
      <StudioShell
        manifest={manifest}
        urlSearch="selection=file%3Asrc%2FMultiExport.g.tsx&canvasX=120&canvasY=-30&canvasScale=1.25"
      />,
    )

    expect(html).toContain("transform:translate(120px, -30px) scale(1.25)")
  })

  it("replaces the current URL for canvas-only changes instead of pushing history", () => {
    const pushState = vi.fn()
    const replaceState = vi.fn()
    const originalWindow = Reflect.get(globalThis, "window") as Window | undefined
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        history: { pushState, replaceState },
        location: {
          pathname: "/gtsx/studio",
          search: "?selection=file%3Asrc%2FMultiExport.g.tsx",
        },
      },
    })

    try {
      replaceStudioCanvasUrlState({ x: 120, y: -30, scale: 1.25 })
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window")
      } else {
        Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
      }
    }

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledWith(
      { gtsxStudio: true },
      "",
      "/gtsx/studio?selection=file%3Asrc%2FMultiExport.g.tsx&canvasX=120&canvasY=-30&canvasScale=1.25",
    )
  })

  it("restores previous and next workspace states from browser history URL entries", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const previousParams = new URLSearchParams(
      "selection=component%3Asrc%2FUserCard.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&case=src%2FUserCard.g.tsx%23default%3Aloading",
    )
    const nextParams = new URLSearchParams(
      "selection=component%3Asrc%2FUserCard.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&path=src%2FMultiExport.g.tsx%23NamedBadge&case=src%2FUserCard.g.tsx%23default%3Aready&instance=src%2FMultiExport.g.tsx%23NamedBadge%3Agtsx-boundary%3A1",
    )

    expect(createStudioWorkspaceStateFromUrl(manifest, previousParams).workspace).toMatchObject({
      selectedCoordinatePath: ["src/UserCard.g.tsx#default"],
      selectedCaseByCoordinate: {
        "src/UserCard.g.tsx#default": "loading",
      },
      selectedRuntimeInstanceByCoordinate: {},
    })
    expect(createStudioWorkspaceStateFromUrl(manifest, nextParams).workspace).toMatchObject({
      selectedCoordinatePath: ["src/UserCard.g.tsx#default", "src/MultiExport.g.tsx#NamedBadge"],
      selectedCaseByCoordinate: {
        "src/UserCard.g.tsx#default": "ready",
      },
      selectedRuntimeInstanceByCoordinate: {
        "src/MultiExport.g.tsx#NamedBadge": "gtsx-boundary:1",
      },
    })
  })

  it("degrades invalid URL state to the nearest valid selection with a visible warning", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const restored = createStudioWorkspaceStateFromUrl(
      manifest,
      new URLSearchParams(
        "selection=component%3Asrc%2FMissing.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&path=src%2FMissingChild.g.tsx%23default&case=src%2FUserCard.g.tsx%23default%3Amissing&instance=src%2FMissingChild.g.tsx%23default%3Agtsx-boundary%3A9",
      ),
    )

    expect(restored.warning).toBe("Invalid Studio URL state was ignored.")
    expect(restored.selection).toBe("roots")
    expect(restored.workspace.selectedCoordinatePath).toEqual(["src/UserCard.g.tsx#default"])
    expect(restored.workspace.selectedCaseByCoordinate).toEqual({})
    expect(restored.workspace.selectedRuntimeInstanceByCoordinate).toEqual({})

    const html = renderToStaticMarkup(
      <StudioWorkspaceView manifest={manifest} urlWarning={restored.warning} workspace={restored.workspace} />,
    )

    expect(html).toContain("Invalid Studio URL state was ignored.")
  })
})

function cardCoordinates(html: string): string[] {
  return [...html.matchAll(/data-gtsx-card-coordinate="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function screenPointForCanvasPoint(transform: { x: number; y: number; scale: number }, point: { x: number; y: number }) {
  return {
    x: transform.x + point.x * transform.scale,
    y: transform.y + point.y * transform.scale,
  }
}

function cardSelectTargets(html: string): string[] {
  return [...html.matchAll(/data-gtsx-card-select-coordinate="([^"]+)"[^>]+data-gtsx-card-select-target="component-bounds"/g)].map(
    (match) => match[1] ?? "",
  )
}

function boundsHitTargetHtml(html: string): string {
  return html.match(/<div[^>]+data-gtsx-card-select-coordinate="[^"]+"[^>]+data-gtsx-card-select-target="component-bounds"[^>]*>/)?.[0] ?? ""
}

function selectedCardCoordinates(html: string): string[] {
  return [...html.matchAll(/<article[^>]+data-gtsx-card-coordinate="([^"]+)"[^>]+data-gtsx-card-selected="true"/g)].map(
    (match) => match[1] ?? "",
  )
}

function selectionOutlineHtml(html: string): string {
  return html.match(/<div[^>]+data-gtsx-selection-outline="true"[^>]*>/)?.[0] ?? ""
}

function selectionOutlineCount(html: string): number {
  return [...html.matchAll(/data-gtsx-selection-outline="true"/g)].length
}

function caseGridHtml(html: string, coordinate: string): string {
  return html.match(new RegExp(`<div[^>]+data-gtsx-case-grid="${escapeRegExp(coordinate)}"[^>]*>`))?.[0] ?? ""
}

function caseGridPreviewScales(html: string): string[] {
  return [...html.matchAll(/data-gtsx-case-grid-preview-scale="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function previewClipHtml(html: string): string {
  return html.match(/<div[^>]+data-gtsx-preview-clip="true"[^>]*>/)?.[0] ?? ""
}

function previewFrameTagHtml(html: string, sessionId: string): string {
  return html.match(new RegExp(`<div[^>]+data-gtsx-preview-session-id="${escapeRegExp(sessionId)}"[^>]*>`))?.[0] ?? ""
}

function cardHtml(html: string, coordinate: string): string {
  return (
    html.match(new RegExp(`<article[^>]+data-gtsx-card-coordinate="${escapeRegExp(coordinate)}"[\\s\\S]*?</article>`))?.[0] ?? ""
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function iframeSources(html: string): string[] {
  return [...html.matchAll(/<iframe[^>]+>/g)]
    .filter((match) => !(match[0] ?? "").includes("data-gtsx-sidebar-preview-frame"))
    .flatMap((match) => {
      const source = match[0]?.match(/src="([^"]+)"/)?.[1]
      return source ? [source.replaceAll("&amp;", "&")] : []
    })
}

function previewSources(html: string): string[] {
  return [...html.matchAll(/data-gtsx-preview-src="([^"]+)"/g)].map((match) => (match[1] ?? "").replaceAll("&amp;", "&"))
}

function previewFrameHtml(html: string, sessionId: string): string {
  return html.match(new RegExp(`<div[^>]+data-gtsx-preview-session-id="${escapeRegExp(sessionId)}"[\\s\\S]*?</div>`))?.[0] ?? ""
}

function casePreviewFrameHtml(html: string, caseName: string): string {
  return html.match(new RegExp(`<div[^>]+data-gtsx-case-preview-frame="${escapeRegExp(caseName)}"[^>]*>`))?.[0] ?? ""
}

function canvasViewportPresets(html: string): string[] {
  return [...html.matchAll(/<div[^>]+data-gtsx-preview-session-id="[^"]+"[^>]+data-gtsx-preview-src="[^"]+"[^>]+data-gtsx-viewport-preset="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  )
}

function columnCount(html: string): number {
  return [...html.matchAll(/data-gtsx-column-index="/g)].length
}

function caseControlNames(html: string): string[] {
  return [...html.matchAll(/data-gtsx-case-control="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function viewportControlNames(html: string): string[] {
  return [...html.matchAll(/data-gtsx-viewport-control="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function runtimeInstanceIds(html: string): string[] {
  return [...html.matchAll(/data-gtsx-runtime-instance-id="([^"]+)"/g)].map((match) => match[1] ?? "")
}
