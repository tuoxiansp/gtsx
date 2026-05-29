import { join } from "node:path"
import type { GBoundaryTreeNode } from "@gtsx/core"
import { renderToStaticMarkup } from "react-dom/server"
import { buildGTSXProjectIndex } from "@gtsx/core/project-index"
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
  createStudioPreviewGeometryCacheStore,
  createStudioPreviewMessageFlush,
  createStudioPreviewRenderCompletionSource,
  createStudioPreviewRenderPlan,
  createStudioPreviewRenderSessionStore,
  createStudioRuntimeValuesRequest,
  createStudioWorkspaceStateFromUrl,
  createStudioWorkspaceState,
  createStudioWorkspaceUrlSearchParams,
  defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement,
  defaultStudioPreviewRenderQueueMinimumVisibleRenderTasksDuringCanvasMovement,
  isGPreviewProtocolMessage,
  isStudioPreviewPoolDisabled,
  isStudioPreviewPoolDebugEnabled,
  isStudioPreviewQueueDebugEnabled,
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
  studioPreviewGeometryCacheKeys,
  studioPreviewRenderPlanHasIncompleteVisibleRenderTasks,
  studioPreviewVisibilityItems,
  studioPreviewRenderQueueOptionsFromParams,
  studioPreviewRenderTargetFromUrl,
  visibleQueuedStudioPreviewSessionIds,
} from "../src/index.js"
import ComponentCard from "../src/components/ComponentCard.g.js"
import LazyPreviewFrame from "../src/components/LazyPreviewFrame.g.js"
import PreviewCaseSheet from "../src/components/PreviewCaseSheet.g.js"
import PreviewMessage from "../src/components/PreviewMessage.g.js"
import {
  selectStudioPreviewIframePoolEntryForBorrow,
  studioPreviewIframeBorrowInputNeedsRender,
  studioPreviewIframeBorrowKey,
  studioPreviewIframePendingRenderPostKey,
  studioPreviewIframePoolPlacementForAnchor,
  studioPreviewIframePoolEntryNeedsPendingRenderPost,
  studioPreviewIframePoolNextPendingRenderDeliveryAttemptCount,
} from "../src/preview-iframe-pool.js"
import { studioPreviewIndexedDBNamespace } from "../src/preview-cache-indexeddb.js"
import {
  mergeStudioPreviewRenderRequestPolicies,
  mergeStudioPreviewRenderSchedulerRunOptions,
  studioPreviewRenderQueueOptionsForRun,
} from "../src/studio-preview-render-request-policy.js"
import { chooseStudioCanvasWheelZoomFocalPoint } from "../src/use-studio-canvas-controller.js"
import {
  createStudioPreviewRenderRequestClock,
  type StudioPreviewRenderRequestClockScheduler,
} from "../src/studio-preview-render-request-clock.js"
import { createStudioPreviewRenderObservation } from "../src/studio-preview-render-observation.js"
import { studioPreviewRenderExpansionCenterViewportPoint } from "../src/use-studio-preview-render-scheduler.js"
import {
  isRectNearViewport,
  shouldRenderStudioPreview,
  studioPreviewRenderBufferMargin,
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

function createFakeStudioPreviewRenderRequestClockScheduler(): StudioPreviewRenderRequestClockScheduler & {
  advanceTime: (milliseconds: number) => void
  flushAnimationFrames: () => void
} {
  let currentTime = 0
  let nextId = 1
  const animationFrames = new Map<number, () => void>()
  const timeouts = new Map<number, { at: number; callback: () => void }>()

  return {
    advanceTime(milliseconds) {
      const targetTime = currentTime + milliseconds
      while (true) {
        const nextTimeout = [...timeouts.entries()]
          .filter(([, timeout]) => timeout.at <= targetTime)
          .sort(([, left], [, right]) => left.at - right.at)[0]
        if (!nextTimeout) break

        const [id, timeout] = nextTimeout
        currentTime = timeout.at
        timeouts.delete(id)
        timeout.callback()
      }
      currentTime = targetTime
    },
    cancelAnimationFrame(id) {
      animationFrames.delete(id)
    },
    clearTimeout(id) {
      timeouts.delete(id)
    },
    flushAnimationFrames() {
      const callbacks = [...animationFrames.values()]
      animationFrames.clear()
      for (const callback of callbacks) callback()
    },
    now() {
      return currentTime
    },
    requestAnimationFrame(callback) {
      const id = nextId++
      animationFrames.set(id, callback)
      return id
    },
    setTimeout(callback, delayMilliseconds) {
      const id = nextId++
      timeouts.set(id, { at: currentTime + delayMilliseconds, callback })
      return id
    },
  }
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

  it("keeps cache-namespaced Studio card layout in server HTML before browser cache hydration", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
      cache: { namespace: "fixture-project" },
    })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="component:src/UserCard.g.tsx#default" />)

    expect(html).toContain('data-gtsx-canvas-viewport="true"')
    expect(cardCoordinates(html)).toEqual(["src/UserCard.g.tsx#default"])
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
    expect(html).toContain("overscroll-behavior:none")
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

  it("keeps trackpad pinch zoom anchored to an explicit canvas focal point", () => {
    const next = applyStudioCanvasWheel(
      { x: 40, y: 40, scale: 1 },
      {
        clientX: 0,
        clientY: 0,
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -10,
        focalViewportX: 320,
        focalViewportY: 240,
        metaKey: false,
        viewportLeft: 0,
        viewportTop: 0,
      },
    )

    expect(screenPointForCanvasPoint(next, { x: 280, y: 200 })).toEqual({
      x: expect.closeTo(320),
      y: expect.closeTo(240),
    })
  })

  it("chooses the current wheel point before stale remembered pointer points for canvas zoom", () => {
    expect(
      chooseStudioCanvasWheelZoomFocalPoint({
        eventViewportPoint: { x: 320, y: 240 },
        lastKnownPointerViewportPoint: { x: 80, y: 90 },
        viewportSize: { height: 720, width: 1280 },
      }),
    ).toEqual({ x: 320, y: 240 })
    expect(
      chooseStudioCanvasWheelZoomFocalPoint({
        eventViewportPoint: { x: -1, y: 240 },
        lastKnownPointerViewportPoint: { x: 80, y: 90 },
        viewportSize: { height: 720, width: 1280 },
      }),
    ).toEqual({ x: 80, y: 90 })
    expect(
      chooseStudioCanvasWheelZoomFocalPoint({
        eventViewportPoint: { x: -1, y: 240 },
        lastKnownPointerViewportPoint: null,
        viewportSize: { height: 720, width: 1280 },
      }),
    ).toEqual({ x: 640, y: 360 })
  })

  it("uses a fresh remembered pointer point when trackpad zoom reports no wheel point", () => {
    expect(
      chooseStudioCanvasWheelZoomFocalPoint({
        eventViewportPoint: undefined,
        lastKnownPointerAgeMilliseconds: 120,
        lastKnownPointerViewportPoint: { x: 420, y: 260 },
        viewportSize: { height: 720, width: 1280 },
      }),
    ).toEqual({ x: 420, y: 260 })
    expect(
      chooseStudioCanvasWheelZoomFocalPoint({
        eventViewportPoint: { x: 0, y: 0 },
        lastKnownPointerAgeMilliseconds: 120,
        lastKnownPointerViewportPoint: { x: 420, y: 260 },
        viewportSize: { height: 720, width: 1280 },
      }),
    ).toEqual({ x: 420, y: 260 })
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
    expect(previewClipHtml(html)).not.toContain("content-visibility:auto")
    expect(previewClipHtml(html)).not.toContain("contain-intrinsic-size")
    expect(previewClipHtml(html)).toContain("contain:layout paint style")
    expect(previewClipHtml(html)).toContain("overflow:hidden")
    expect(selectionOutlineHtml(html)).toContain('data-gtsx-selection-outline="true"')
  })

  it("shows the per-case render lifecycle in preview queue debug mode", () => {
    const html = renderToStaticMarkup(
      <LazyPreviewFrame
        data-gtsx-preview-session-id="src/Icon.g.tsx#default:ready@phone"
        boundaryRect={{ x: 0, y: 0, width: 96, height: 96 }}
        coordinate="src/Icon.g.tsx#default"
        debugPreviewQueue
        frameState={{
          expectedSessionId: "src/Icon.g.tsx#default:ready",
          ready: false,
        }}
        previewUrl="/gtsx?entry=src%2FIcon.g.tsx%23default&case=ready&chrome=0"
        shouldLoad
        size={{ width: 390, height: 844 }}
        sessionId="src/Icon.g.tsx#default:ready"
        title="Icon preview"
        viewportPreset="phone"
      />,
    )

    expect(html).toContain('data-gtsx-preview-render-lifecycle="rendering"')
    expect(html).toContain('data-gtsx-preview-render-queued="true"')
    expect(html).toContain('data-gtsx-preview-render-visible="false"')
    expect(html).toContain('data-gtsx-preview-render-iframe-origin="pending"')
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

    expect(isRectNearViewport({ bottom: -1, left: 80, right: 360, top: -240 }, viewport, studioPreviewRenderBufferMargin)).toBe(true)
    expect(
      isRectNearViewport(
        {
          bottom: -studioPreviewRenderBufferMargin - 1,
          left: 80,
          right: 360,
          top: -studioPreviewRenderBufferMargin - 240,
        },
        viewport,
        studioPreviewRenderBufferMargin,
      ),
    ).toBe(false)
    expect(isRectNearViewport({ bottom: 300, left: 1281, right: 1520, top: 40 }, viewport, studioPreviewRenderBufferMargin)).toBe(true)
    expect(
      isRectNearViewport(
        {
          bottom: 300,
          left: viewport.right + studioPreviewRenderBufferMargin + 1,
          right: viewport.right + studioPreviewRenderBufferMargin + 220,
          top: 40,
        },
        viewport,
        studioPreviewRenderBufferMargin,
      ),
    ).toBe(false)
  })

  it("uses the render buffer as the offscreen recycle boundary", () => {
    const viewport = { bottom: 720, left: 0, right: 1280, top: 0 }
    const insideRenderBuffer = {
      bottom: -studioPreviewRenderBufferMargin + 10,
      left: 80,
      right: 360,
      top: -studioPreviewRenderBufferMargin - 220,
    }
    const outsideRenderBuffer = {
      bottom: -studioPreviewRenderBufferMargin - 10,
      left: 80,
      right: 360,
      top: -studioPreviewRenderBufferMargin - 240,
    }

    expect(shouldRenderStudioPreview(false, insideRenderBuffer, viewport)).toBe(true)
    expect(shouldRenderStudioPreview(true, insideRenderBuffer, viewport)).toBe(true)
    expect(shouldRenderStudioPreview(false, outsideRenderBuffer, viewport)).toBe(false)
    expect(shouldRenderStudioPreview(true, outsideRenderBuffer, viewport)).toBe(false)
  })

  it("computes preview visibility centrally from canvas coordinates", () => {
    expect(
      [...visibleStudioPreviewSessionIds({
        canvas: { x: -420, y: -120, scale: 1 },
        currentSessionIds: new Set(["buffered"]),
        items: [
          {
            rect: { bottom: 260, left: 360, right: 640, top: 40 },
            sessionIds: ["visible-a", "visible-b"],
          },
          {
            rect: { bottom: 260, left: 8400, right: 8660, top: 40 },
            sessionIds: ["far"],
          },
          {
            rect: { bottom: 260, left: -620, right: -420, top: 40 },
            sessionIds: ["buffered"],
          },
        ],
        viewport: { bottom: 720, left: 0, right: 1280, top: 0 },
      })].sort(),
    ).toEqual(["buffered", "visible-a", "visible-b"])
  })

  it("queues visible preview work before spending the active render budget on buffered work", () => {
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
      maximumConcurrentRenderTasks: 2,
      maximumRenderTaskCount: 5,
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
        maximumConcurrentRenderTasks: 1,
      })],
    ).toEqual(["visible-a", "visible-b"])
    expect(
      [...queuedStudioPreviewSessionIds({
        ...queueInput,
        activeSessionIds: new Set(["visible-a"]),
        currentSessionIds: new Set(["visible-a"]),
        maximumConcurrentRenderTasks: 1,
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
        maximumConcurrentRenderTasks: 2,
        maximumRenderTaskCount: 3,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["new-a", "new-b", "done"])
  })

  it("round-robins visible preview work inside the render budget", () => {
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
        maximumConcurrentRenderTasks: 2,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 240, top: 0 },
      })],
    ).toEqual(["top-a", "bottom-a"])
  })

  it("orders visible preview work from the viewport center before buffered work", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 80 },
            sessionIds: ["visible-edge"],
          },
          {
            rect: { bottom: 55, left: 45, right: 55, top: 45 },
            sessionIds: ["visible-center"],
          },
          {
            rect: { bottom: 220, left: 45, right: 55, top: 210 },
            sessionIds: ["buffered-near"],
          },
        ],
        maximumConcurrentRenderTasks: 3,
        maximumRenderTaskCount: 3,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible-center", "visible-edge", "buffered-near"])
  })

  it("separates visible preview queue tasks from buffered queued work", () => {
    const input = {
      canvas: { x: 0, y: 0, scale: 1 },
      items: [
        {
          rect: { bottom: 100, left: 0, right: 100, top: 0 },
          sessionIds: ["visible-a", "visible-b"],
        },
        {
          rect: { bottom: 220, left: 0, right: 100, top: 160 },
          sessionIds: ["buffered"],
        },
      ],
      maximumConcurrentRenderTasks: 8,
      renderBufferMargin: 200,
      maximumRenderTaskCount: 8,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }
    const queued = queuedStudioPreviewSessionIds(input)

    expect([...queued]).toEqual(["visible-a", "visible-b", "buffered"])
    expect([...visibleQueuedStudioPreviewSessionIds(input, queued)]).toEqual(["visible-a", "visible-b"])
  })

  it("orders buffered preview work in the canvas movement direction", () => {
    const input = {
      canvas: { x: 0, y: 0, scale: 1 },
      items: [
        {
          rect: { bottom: -20, left: 0, right: 100, top: -120 },
          sessionIds: ["above-near"],
        },
        {
          rect: { bottom: 220, left: 0, right: 100, top: 120 },
          sessionIds: ["below-near"],
        },
        {
          rect: { bottom: 460, left: 0, right: 100, top: 360 },
          sessionIds: ["below-far"],
        },
      ],
      maximumConcurrentRenderTasks: 3,
      maximumRenderTaskCount: 3,
      renderBufferMargin: 500,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds({ ...input, canvasMovement: { x: 0, y: -40 } })]).toEqual([
      "below-near",
      "below-far",
      "above-near",
    ])
    expect([...queuedStudioPreviewSessionIds({ ...input, canvasMovement: { x: 0, y: 40 } })]).toEqual([
      "above-near",
      "below-near",
      "below-far",
    ])
  })

  it("prefers visible work over lower-priority active buffered renders", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        activeSessionIds: new Set(["buffered-active"]),
        canvas: { x: 0, y: 0, scale: 1 },
        currentSessionIds: new Set(["buffered-active"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["visible"],
          },
          {
            rect: { bottom: 460, left: 0, right: 100, top: 360 },
            sessionIds: ["buffered-active"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible"])
  })

  it("keeps visible active renders on screen when the movement render budget is exhausted", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        activeSessionIds: new Set(["visible-active", "buffered-active"]),
        canvas: { x: 0, y: 0, scale: 1 },
        currentSessionIds: new Set(["visible-active", "buffered-active"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["visible-active", "visible-new"],
          },
          {
            rect: { bottom: 460, left: 0, right: 100, top: 360 },
            sessionIds: ["buffered-active"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible-active"])
  })

  it("uses the visible render floor before buffered work during canvas movement", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["visible-a", "visible-b", "visible-c", "visible-d"],
          },
          {
            rect: { bottom: 300, left: 0, right: 100, top: 200 },
            sessionIds: ["buffered"],
          },
        ],
        maximumConcurrentRenderTasks: 3,
        maximumRenderTaskCount: 8,
        minimumVisibleRenderTasks: 3,
        renderBufferMargin: 400,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible-a", "visible-b", "visible-c"])
  })

  it("caps the visible render floor by the maximum concurrent render task budget", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["visible-a", "visible-b", "visible-c", "visible-d"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 8,
        minimumVisibleRenderTasks: 3,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible-a"])
  })

  it("keeps mounted buffered previews outside the active render budget", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(["visible-ready", "buffered-ready", "buffered-extra"]),
        currentSessionIds: new Set(["visible-ready", "buffered-ready", "buffered-extra"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["visible-ready", "visible-new"],
          },
          {
            rect: { bottom: 460, left: 0, right: 100, top: 360 },
            sessionIds: ["buffered-ready", "buffered-extra"],
          },
        ],
        maximumConcurrentRenderTasks: 2,
        maximumRenderTaskCount: 6,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible-ready", "visible-new", "buffered-ready", "buffered-extra"])
  })

  it("keeps mounted buffered previews within the render buffer during visible-only scheduler runs", () => {
    const visibleOnlyOptions = studioPreviewRenderQueueOptionsForRun(
      { renderBufferMargin: 500 },
      { includeBuffer: false },
    )

    expect(visibleOnlyOptions).toEqual({ renderBufferMargin: 500, includeBufferedRenderTasks: false })
    expect(
      [...queuedStudioPreviewSessionIds({
        ...visibleOnlyOptions,
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(["buffered-ready"]),
        currentSessionIds: new Set(["buffered-ready"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["visible-new"],
          },
          {
            rect: { bottom: 460, left: 0, right: 100, top: 360 },
            sessionIds: ["buffered-ready"],
          },
          {
            rect: { bottom: 460, left: 140, right: 240, top: 360 },
            sessionIds: ["buffered-new"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible-new", "buffered-ready"])
  })

  it("uses the smaller canvas-movement render task limit only for moving canvas runs", () => {
    expect(
      studioPreviewRenderQueueOptionsForRun(
        {
          maximumConcurrentRenderTasks: 16,
          maximumConcurrentRenderTasksDuringCanvasMovement: 3,
          minimumVisibleRenderTasksDuringCanvasMovement: 5,
          renderBufferMargin: 500,
        },
        { includeBuffer: false, useCanvasMovementRenderTaskLimit: true },
      ),
    ).toEqual({
      includeBufferedRenderTasks: false,
      maximumConcurrentRenderTasks: 3,
      maximumConcurrentRenderTasksDuringCanvasMovement: 3,
      minimumVisibleRenderTasks: 5,
      minimumVisibleRenderTasksDuringCanvasMovement: 5,
      renderBufferMargin: 500,
    })

    expect(
      studioPreviewRenderQueueOptionsForRun(
        {
          maximumConcurrentRenderTasks: 16,
          maximumConcurrentRenderTasksDuringCanvasMovement: 3,
          minimumVisibleRenderTasksDuringCanvasMovement: 5,
          renderBufferMargin: 500,
        },
        { includeBuffer: true, useCanvasMovementRenderTaskLimit: true },
      ),
    ).toEqual({
      maximumConcurrentRenderTasks: 3,
      maximumConcurrentRenderTasksDuringCanvasMovement: 3,
      minimumVisibleRenderTasks: 5,
      minimumVisibleRenderTasksDuringCanvasMovement: 5,
      renderBufferMargin: 500,
    })

    expect(
      studioPreviewRenderQueueOptionsForRun(
        {
          maximumConcurrentRenderTasks: 16,
          maximumConcurrentRenderTasksDuringCanvasMovement: 3,
        },
        { includeBuffer: false },
      ),
    ).toEqual({
      includeBufferedRenderTasks: false,
      maximumConcurrentRenderTasks: 16,
      maximumConcurrentRenderTasksDuringCanvasMovement: 3,
    })

    expect(
      studioPreviewRenderQueueOptionsForRun(
        { maximumConcurrentRenderTasks: 16 },
        { useCanvasMovementRenderTaskLimit: true },
      ),
    ).toEqual({
      maximumConcurrentRenderTasks: defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement,
      minimumVisibleRenderTasks: defaultStudioPreviewRenderQueueMinimumVisibleRenderTasksDuringCanvasMovement,
    })
  })

  it("merges scheduled preview render runs without coupling buffer scope to movement dispatch", () => {
    expect(
      mergeStudioPreviewRenderRequestPolicies(
        { renderBudget: "canvas-movement", renderScope: "visible" },
        { renderBudget: "normal", renderScope: "buffer" },
      ),
    ).toEqual({ renderBudget: "normal", renderScope: "buffer" })
    expect(
      mergeStudioPreviewRenderSchedulerRunOptions(null, {
        includeBuffer: true,
        useCanvasMovementRenderTaskLimit: true,
      }),
    ).toEqual({ includeBuffer: true, useCanvasMovementRenderTaskLimit: true })
    expect(
      mergeStudioPreviewRenderSchedulerRunOptions(
        { includeBuffer: true, useCanvasMovementRenderTaskLimit: true },
        { includeBuffer: true, useCanvasMovementRenderTaskLimit: true },
      ),
    ).toEqual({ includeBuffer: true, useCanvasMovementRenderTaskLimit: true })
    expect(
      mergeStudioPreviewRenderSchedulerRunOptions(
        { includeBuffer: true, useCanvasMovementRenderTaskLimit: true },
        { includeBuffer: true },
      ),
    ).toEqual({ includeBuffer: true, useCanvasMovementRenderTaskLimit: false })
    expect(
      mergeStudioPreviewRenderSchedulerRunOptions(
        { includeBuffer: false, useCanvasMovementRenderTaskLimit: true },
        { includeBuffer: true, useCanvasMovementRenderTaskLimit: true },
      ),
    ).toEqual({ includeBuffer: true, useCanvasMovementRenderTaskLimit: true })
  })

  it("reports the render expansion center in viewport coordinates", () => {
    expect(
      studioPreviewRenderExpansionCenterViewportPoint({
        bottom: 720,
        left: 0,
        right: 1280,
        top: 0,
      }),
    ).toEqual({ x: 640, y: 360 })
  })

  it("observes scroll render response from visible session completions", () => {
    let now = 1_000
    const observation = createStudioPreviewRenderObservation({ now: () => now })

    expect(
      observation.observeQueueRun({
        newVisibleSessionIds: ["visible-a", "visible-b"],
        renderBudget: "canvas-movement",
        renderScope: "buffer",
        visibleSessionIds: ["visible-a", "visible-b"],
      }).scrollResponse,
    ).toEqual({
      completedVisibleSessionCount: 0,
      firstVisibleCompletionMilliseconds: undefined,
      latestVisibleCompletionMilliseconds: undefined,
      pendingVisibleSessionCount: 2,
      startedAtMilliseconds: 1_000,
      visibleSessionCount: 2,
    })

    now += 42
    expect(
      observation.observePreviewTiming({ sessionId: "visible-b", type: "gtsx:ready" }).scrollResponse,
    ).toMatchObject({
      completedVisibleSessionCount: 1,
      firstVisibleCompletionMilliseconds: 42,
      latestVisibleCompletionMilliseconds: 42,
      pendingVisibleSessionCount: 1,
      visibleSessionCount: 2,
    })
  })

  it("observes full-buffer render speed from queue and preview timing events", () => {
    let now = 2_000
    const observation = createStudioPreviewRenderObservation({ now: () => now })

    observation.observeQueueRun({
      newSessionIds: ["a", "b"],
      nextSessionIds: ["a", "b", "already-mounted"],
      renderBudget: "normal",
      renderScope: "buffer",
    })
    now += 50
    observation.observePreviewTiming({ sessionId: "a", type: "gtsx:ready" })
    now += 50

    expect(observation.observePreviewTiming({ sessionId: "b", type: "gtsx:error" }).fullRender).toMatchObject({
      completedSessionCount: 2,
      firstCompletionMilliseconds: 50,
      latestCompletionMilliseconds: 100,
      pendingSessionCount: 0,
      renderCompletionsPerSecond: 20,
      sessionCount: 2,
    })
  })

  it("does not reset render observations when a queue run reports no new tasks", () => {
    let now = 3_000
    const observation = createStudioPreviewRenderObservation({ now: () => now })

    observation.observeQueueRun({
      newSessionIds: ["a"],
      nextSessionIds: ["a"],
      renderBudget: "normal",
      renderScope: "buffer",
    })
    now += 25
    observation.observePreviewTiming({ sessionId: "a", type: "gtsx:ready" })
    now += 25

    expect(
      observation.observeQueueRun({
        newSessionIds: [],
        nextSessionIds: ["a", "already-mounted"],
        renderBudget: "normal",
        renderScope: "buffer",
      }).fullRender,
    ).toMatchObject({
      completedSessionCount: 1,
      latestCompletionMilliseconds: 25,
      pendingSessionCount: 0,
      sessionCount: 1,
    })
  })

  it("does not start a scroll response observation for an explicit empty new visible task set", () => {
    const observation = createStudioPreviewRenderObservation({ now: () => 4_000 })

    expect(
      observation.observeQueueRun({
        newVisibleSessionIds: [],
        renderBudget: "canvas-movement",
        renderScope: "buffer",
        visibleSessionIds: ["already-mounted"],
      }).scrollResponse,
    ).toBeUndefined()
  })

  it("drives canvas movement and idle visible-first render requests from one request clock", () => {
    const scheduler = createFakeStudioPreviewRenderRequestClockScheduler()
    const canvas = { x: 0, y: 0, scale: 1 }
    const requestPolicies: Array<{ renderBudget: string; renderScope: string }> = []
    const clock = createStudioPreviewRenderRequestClock({
      getCanvas: () => canvas,
      getRenderQueueOptions: () => ({
        activeRenderTimeoutMilliseconds: 5_000,
        bufferRenderDelayMilliseconds: 240,
        renderDebounceMilliseconds: 120,
        renderThrottleMilliseconds: 100,
      }),
      runRenderRequest: (_nextCanvas, requestPolicy) => {
        requestPolicies.push(requestPolicy)
        return true
      },
      scheduler,
    })

    clock.requestCanvasMovementRender(canvas)
    expect(requestPolicies).toEqual([{ renderBudget: "canvas-movement", renderScope: "buffer" }])

    scheduler.advanceTime(120)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "buffer" },
      { renderBudget: "normal", renderScope: "visible" },
    ])

    scheduler.advanceTime(240)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "buffer" },
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "buffer" },
    ])

    clock.dispose()
  })

  it("keeps idle visible and buffer render requests behind the movement delays", () => {
    const scheduler = createFakeStudioPreviewRenderRequestClockScheduler()
    const canvas = { x: 0, y: 0, scale: 1 }
    const requestPolicies: Array<{ renderBudget: string; renderScope: string }> = []
    const clock = createStudioPreviewRenderRequestClock({
      getCanvas: () => canvas,
      getRenderQueueOptions: () => ({
        activeRenderTimeoutMilliseconds: 5_000,
        bufferRenderDelayMilliseconds: 240,
        renderDebounceMilliseconds: 500,
        renderThrottleMilliseconds: 100,
      }),
      runRenderRequest: (_nextCanvas, requestPolicy) => {
        requestPolicies.push(requestPolicy)
        return true
      },
      scheduler,
    })

    clock.requestCanvasMovementRender(canvas)
    scheduler.advanceTime(100)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([{ renderBudget: "canvas-movement", renderScope: "buffer" }])

    scheduler.advanceTime(400)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "buffer" },
      { renderBudget: "normal", renderScope: "visible" },
    ])

    scheduler.advanceTime(240)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "buffer" },
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "buffer" },
    ])

    clock.dispose()
  })

  it("keeps completion-driven requests visible-only while buffered idle render is delayed", () => {
    const scheduler = createFakeStudioPreviewRenderRequestClockScheduler()
    const canvas = { x: 0, y: 0, scale: 1 }
    const requestPolicies: Array<{ renderBudget: string; renderScope: string }> = []
    const clock = createStudioPreviewRenderRequestClock({
      getCanvas: () => canvas,
      getRenderQueueOptions: () => ({
        bufferRenderDelayMilliseconds: 300,
        renderDebounceMilliseconds: 100,
        renderThrottleMilliseconds: 100,
      }),
      runRenderRequest: (_nextCanvas, requestPolicy) => {
        requestPolicies.push(requestPolicy)
        return true
      },
      scheduler,
    })

    clock.requestCanvasMovementRender(canvas)
    scheduler.advanceTime(100)
    scheduler.flushAnimationFrames()
    clock.requestRenderAfterPreviewCompletion()
    scheduler.flushAnimationFrames()

    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "buffer" },
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "visible" },
    ])

    scheduler.advanceTime(300)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "buffer" },
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "buffer" },
    ])

    clock.dispose()
  })

  it("starts ordinary preview render requests with visible work before buffered work", () => {
    const scheduler = createFakeStudioPreviewRenderRequestClockScheduler()
    const canvas = { x: 0, y: 0, scale: 1 }
    const requestPolicies: Array<{ renderBudget: string; renderScope: string }> = []
    const clock = createStudioPreviewRenderRequestClock({
      getCanvas: () => canvas,
      getRenderQueueOptions: () => ({
        bufferRenderDelayMilliseconds: 300,
      }),
      runRenderRequest: (_nextCanvas, requestPolicy) => {
        requestPolicies.push(requestPolicy)
        return true
      },
      scheduler,
    })

    clock.requestBufferedRender(canvas)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([{ renderBudget: "normal", renderScope: "visible" }])

    scheduler.advanceTime(300)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "buffer" },
    ])

    clock.dispose()
  })

  it("keeps moving-canvas runs on the render buffer with a smaller render task limit", () => {
    const input = {
      canvas: { x: 0, y: 0, scale: 1 },
      items: [
        {
          rect: { bottom: 100, left: 0, right: 100, top: 0 },
          sessionIds: ["visible-a", "visible-b"],
        },
        {
          rect: { bottom: 700, left: 0, right: 100, top: 600 },
          sessionIds: ["buffered-a", "buffered-b"],
        },
      ],
      ...studioPreviewRenderQueueOptionsForRun(
        {
          maximumConcurrentRenderTasks: 8,
          maximumConcurrentRenderTasksDuringCanvasMovement: 1,
          renderBufferMargin: 640,
        },
        { includeBuffer: true, useCanvasMovementRenderTaskLimit: true },
      ),
      maximumRenderTaskCount: 8,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds(input)]).toEqual(["visible-a"])
    expect([...queuedStudioPreviewSessionIds({
      ...input,
      completedSessionIds: new Set(["visible-a"]),
      currentSessionIds: new Set(["visible-a"]),
    })]).toEqual(["visible-a", "visible-b"])
    expect([...queuedStudioPreviewSessionIds({
      ...input,
      completedSessionIds: new Set(["visible-a", "visible-b"]),
      currentSessionIds: new Set(["visible-a", "visible-b"]),
    })]).toEqual(["visible-a", "visible-b", "buffered-a"])
    expect([...queuedStudioPreviewSessionIds({
      ...input,
      ...studioPreviewRenderQueueOptionsForRun(
        {
          maximumConcurrentRenderTasks: 8,
          maximumConcurrentRenderTasksDuringCanvasMovement: 1,
          renderBufferMargin: 640,
        },
        { includeBuffer: false, useCanvasMovementRenderTaskLimit: true },
      ),
      completedSessionIds: new Set(["visible-a", "visible-b"]),
      currentSessionIds: new Set(["visible-a", "visible-b"]),
    })]).toEqual(["visible-a", "visible-b"])
  })

  it("drops mounted previews outside the render buffer once they are no longer queued", () => {
    expect([...queuedStudioPreviewSessionIds({
      canvas: { x: 0, y: 0, scale: 1 },
      completedSessionIds: new Set(["completed-offscreen"]),
      currentSessionIds: new Set(["completed-offscreen"]),
      items: [
        {
          rect: { bottom: 900, left: 0, right: 100, top: 800 },
          sessionIds: ["completed-offscreen"],
        },
      ],
      renderBufferMargin: 100,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    })]).toEqual([])
  })

  it("uses measured case preview rects as canvas visibility items", () => {
    const component = {
      cases: [{ name: "ready" }, { name: "loading" }],
      coordinate: "src/Card.g.tsx#default",
    }
    const readySessionId = previewSessionId(component as any, "ready")
    const loadingSessionId = previewSessionId(component as any, "loading")

    expect(
      studioPreviewVisibilityItems(
        {
          columns: [{ components: [component], parentCoordinate: undefined }],
          selectedCoordinatePath: [],
          selectedViewportPresetByCoordinate: {},
        } as any,
        "tablet",
        { 0: { x: 100, y: 200 } },
        {
          0: {
            cardRectsByCoordinate: {
              "src/Card.g.tsx#default": { bottom: 320, left: 0, right: 240, top: 0 },
            },
            height: 320,
            previewFrameRectsBySessionId: {
              [readySessionId]: { bottom: 100, left: 8, right: 108, top: 20 },
              [loadingSessionId]: { bottom: 250, left: 118, right: 218, top: 170 },
            },
          },
        },
      ),
    ).toEqual([
      { rect: { bottom: 300, left: 108, right: 208, top: 220 }, sessionIds: [readySessionId] },
      { rect: { bottom: 450, left: 218, right: 318, top: 370 }, sessionIds: [loadingSessionId] },
    ])
  })

  it("keeps canvas visibility fallback at case preview granularity before frame rects are measured", () => {
    const component = {
      cases: [{ name: "first" }, { name: "center" }, { name: "last" }],
      coordinate: "src/Card.g.tsx#default",
    }
    const sessionIds = component.cases.map((testCase) => previewSessionId(component as any, testCase.name, "tablet"))

    const visibilityItems = studioPreviewVisibilityItems(
      {
        columns: [{ components: [component], parentCoordinate: undefined }],
        selectedCoordinatePath: [],
        selectedViewportPresetByCoordinate: {},
      } as any,
      "tablet",
      { 0: { x: 100, y: 200 } },
      {
        0: {
          cardRectsByCoordinate: {
            "src/Card.g.tsx#default": { bottom: 1800, left: 0, right: 1700, top: 0 },
          },
          height: 1800,
          previewFrameRectsBySessionId: {},
        },
      },
    )

    expect(visibilityItems.map((item) => item.sessionIds)).toEqual(sessionIds.map((sessionId) => [sessionId]))
    expect(new Set(visibilityItems.map((item) => `${item.rect.left},${item.rect.top}`)).size).toBe(sessionIds.length)
  })

  it("uses fallback case preview visibility for center-first render planning before frame rects are measured", () => {
    const component = {
      cases: [{ name: "first" }, { name: "center" }, { name: "last" }],
      coordinate: "src/Card.g.tsx#default",
    }
    const centerSessionId = previewSessionId(component as any, "center", "tablet")
    const workspace = {
      columns: [{ components: [component], parentCoordinate: undefined }],
      selectedCoordinatePath: [],
      selectedViewportPresetByCoordinate: {},
    } as any
    const columnMeasurementsByIndex = {
      0: {
        cardRectsByCoordinate: {
          "src/Card.g.tsx#default": { bottom: 1800, left: 0, right: 1700, top: 0 },
        },
        height: 1800,
        previewFrameRectsBySessionId: {},
      },
    }
    const fallbackItems = studioPreviewVisibilityItems(workspace, "tablet", { 0: { x: 0, y: 0 } }, columnMeasurementsByIndex)
    const centerItem = fallbackItems.find((item) => item.sessionIds[0] === centerSessionId)
    if (!centerItem) throw new Error("Missing center fallback visibility item")

    const plan = createStudioPreviewRenderPlan({
      canvas: { x: 0, y: 0, scale: 1 },
      canvasViewportPreset: "tablet",
      columnLayoutByIndex: { 0: { x: 0, y: 0 } },
      columnMeasurementsByIndex,
      completedSessionIds: new Set<string>(),
      currentSessionIds: new Set<string>(),
      mountedAtBySessionId: new Map<string, number>(),
      queueOptions: {
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 1,
        renderBufferMargin: 0,
      },
      viewport: centerItem.rect,
      workspace,
    })

    expect([...plan.nextSessionIds]).toEqual([centerSessionId])
  })

  it("creates one render plan for queue membership and visible completion state", () => {
    const component = {
      cases: [{ name: "ready" }, { name: "loading" }],
      coordinate: "src/Card.g.tsx#default",
    }
    const readySessionId = previewSessionId(component as any, "ready", "tablet")
    const loadingSessionId = previewSessionId(component as any, "loading", "tablet")
    const baseInput = {
      canvas: { x: 0, y: 0, scale: 1 },
      canvasViewportPreset: "tablet" as const,
      columnLayoutByIndex: { 0: { x: 0, y: 0 } },
      columnMeasurementsByIndex: {
        0: {
          cardRectsByCoordinate: {
            "src/Card.g.tsx#default": { bottom: 260, left: 0, right: 100, top: 0 },
          },
          height: 260,
          previewFrameRectsBySessionId: {
            [readySessionId]: { bottom: 100, left: 0, right: 100, top: 0 },
            [loadingSessionId]: { bottom: 260, left: 0, right: 100, top: 160 },
          },
        },
      },
      currentSessionIds: new Set<string>(),
      mountedAtBySessionId: new Map<string, number>(),
      queueOptions: {
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        renderBufferMargin: 500,
      },
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      workspace: {
        columns: [{ components: [component], parentCoordinate: undefined }],
        selectedCoordinatePath: [],
        selectedViewportPresetByCoordinate: {},
      } as any,
    }

    const plan = createStudioPreviewRenderPlan({
      ...baseInput,
      completedSessionIds: new Set<string>(),
    })

    expect([...plan.nextSessionIds]).toEqual([readySessionId])
    expect([...plan.visibleSessionIds]).toEqual([readySessionId])
    expect([...plan.allVisibleSessionIds]).toEqual([readySessionId])
    expect(plan.hasIncompleteVisibleRenderTasks).toBe(true)
    expect(plan.visibleRects.map((rect) => rect.sessionId)).toEqual([readySessionId])

    expect(
      createStudioPreviewRenderPlan({
        ...baseInput,
        completedSessionIds: new Set([readySessionId]),
      }).hasIncompleteVisibleRenderTasks,
    ).toBe(false)
    expect(
      studioPreviewRenderPlanHasIncompleteVisibleRenderTasks(new Set([readySessionId]), new Set([readySessionId])),
    ).toBe(false)
  })

  it("adapts preview completion facts from frame state or geometry cache storage", () => {
    const frameStateSource = createStudioPreviewRenderCompletionSource({
      frameStates: {
        "frame-error": {
          error: { message: "Preview unavailable" },
          expectedSessionId: "frame-error",
          ready: false,
        },
        "frame-ready": {
          expectedSessionId: "frame-ready",
          ready: true,
        },
        "frame-running": {
          expectedSessionId: "frame-running",
          ready: false,
        },
      },
      previewGeometryStore: undefined,
    })

    expect([...frameStateSource.completedSessionIdsFor(new Set(["frame-ready"]))].sort()).toEqual([
      "frame-error",
      "frame-ready",
    ])

    const geometryStore = createStudioPreviewGeometryCacheStore({
      cacheKeys: ["tablet\nhash\nsrc/Card.g.tsx#default\nready"],
      namespace: "completion-source-test",
    })
    geometryStore.putMessages([
      {
        target: { cacheKey: "tablet\nhash\nsrc/Card.g.tsx#default\nready" },
        message: {
          protocolVersion: 1,
          sessionId: "geometry-ready",
          type: "gtsx:ready",
        },
      },
    ], new Set(["geometry-ready"]))

    const geometrySource = createStudioPreviewRenderCompletionSource({
      frameStates: undefined,
      previewGeometryStore: geometryStore,
    })

    expect([...geometrySource.completedSessionIdsFor(new Set(["geometry-ready", "geometry-missing"]))]).toEqual([
      "geometry-ready",
    ])
    expect([...geometrySource.completedSessionIdsFor(new Set(["geometry-missing"]))]).toEqual([])
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
      maximumConcurrentRenderTasks: 2,
      maximumRenderTaskCount: 4,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds({ ...input, canvas: { x: 0, y: 0, scale: 1 } })]).toEqual(["top-a", "top-b"])
    expect([...queuedStudioPreviewSessionIds({ ...input, canvas: { x: 0, y: -220, scale: 1 } })]).toEqual([
      "lower-a",
      "lower-b",
    ])
  })

  it("accounts for canvas scale when choosing visible preview work", () => {
    const input = {
      canvas: { x: 40, y: -2360, scale: 0.6 },
      items: [
        {
          rect: { bottom: 2368, left: 0, right: 320, top: 1788 },
          sessionIds: ["above-if-scaled"],
        },
        {
          rect: { bottom: 4726, left: 0, right: 320, top: 4147 },
          sessionIds: ["visible-at-scale"],
        },
      ],
      maximumConcurrentRenderTasks: 4,
      renderBufferMargin: 0,
      maximumRenderTaskCount: 4,
      viewport: { bottom: 720, left: 0, right: 1280, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds(input)]).toEqual(["visible-at-scale"])
    expect([...visibleQueuedStudioPreviewSessionIds(input)]).toEqual(["visible-at-scale"])
  })

  it("uses explicit preview queue safety cap without dropping completed mounted previews", () => {
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
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 2,
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
        maximumConcurrentRenderTasks: 4,
        maximumRenderTaskCount: 2,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["a", "b"])
  })

  it("does not apply a small default preview queue length cap", () => {
    const sessionIds = Array.from({ length: 24 }, (_, index) => `case-${index}`)

    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds,
          },
        ],
        maximumConcurrentRenderTasks: 32,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(sessionIds)
  })

  it("caps mounted buffered previews without dropping visible previews", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        canvas: { x: 0, y: 0, scale: 1 },
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["visible-a", "visible-b", "visible-c"],
          },
          {
            rect: { bottom: 230, left: 0, right: 100, top: 130 },
            sessionIds: ["buffered-a", "buffered-b", "buffered-c"],
          },
        ],
        maximumConcurrentRenderTasks: 6,
        maximumMountedPreviewSessions: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["visible-a", "visible-b", "visible-c", "buffered-a"])
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
      maximumConcurrentRenderTasks: 2,
      maximumRenderTaskCount: 4,
      viewport: { bottom: 100, left: 0, right: 100, top: 0 },
    }

    expect([...queuedStudioPreviewSessionIds({ ...input, renderBufferMargin: 100 })]).toEqual([])
    expect([...queuedStudioPreviewSessionIds({ ...input, renderBufferMargin: 500 })]).toEqual(["buffered"])
  })

  it("notifies only preview sessions whose subscribed membership fact changes", () => {
    const store = createStudioPreviewRenderSessionStore()
    const visibleRenderListener = vi.fn()
    const visibleTaskListener = vi.fn()
    const bufferedRenderListener = vi.fn()
    const bufferedTaskListener = vi.fn()

    const unsubscribeVisibleRender = store.subscribeToRenderSession("visible", visibleRenderListener)
    store.subscribeToVisibleSession("visible", visibleTaskListener)
    store.subscribeToRenderSession("buffered", bufferedRenderListener)
    store.subscribeToVisibleSession("buffered", bufferedTaskListener)

    expect(store.setSessionIds(new Set(["visible"]), new Set(["visible"]))).toBe(true)
    expect(visibleRenderListener).toHaveBeenCalledTimes(1)
    expect(visibleTaskListener).toHaveBeenCalledTimes(1)
    expect(bufferedRenderListener).not.toHaveBeenCalled()
    expect(bufferedTaskListener).not.toHaveBeenCalled()
    expect(store.hasSessionId("visible")).toBe(true)
    expect(store.isVisibleSessionId("visible")).toBe(true)

    expect(store.setSessionIds(new Set(["visible"]), new Set(["visible"]))).toBe(false)
    expect(visibleRenderListener).toHaveBeenCalledTimes(1)
    expect(visibleTaskListener).toHaveBeenCalledTimes(1)

    expect(store.setSessionIds(new Set(["visible", "buffered"]), new Set(["visible"]))).toBe(true)
    expect(visibleRenderListener).toHaveBeenCalledTimes(1)
    expect(visibleTaskListener).toHaveBeenCalledTimes(1)
    expect(bufferedRenderListener).toHaveBeenCalledTimes(1)
    expect(bufferedTaskListener).not.toHaveBeenCalled()

    expect(store.setSessionIds(new Set(["visible", "buffered"]), new Set())).toBe(true)
    expect(visibleRenderListener).toHaveBeenCalledTimes(1)
    expect(visibleTaskListener).toHaveBeenCalledTimes(2)
    expect(bufferedRenderListener).toHaveBeenCalledTimes(1)
    expect(bufferedTaskListener).not.toHaveBeenCalled()
    expect(store.hasSessionId("visible")).toBe(true)
    expect(store.isVisibleSessionId("visible")).toBe(false)

    expect(store.setSessionIds(new Set(["buffered"]), new Set())).toBe(true)
    expect(visibleRenderListener).toHaveBeenCalledTimes(2)
    expect(visibleTaskListener).toHaveBeenCalledTimes(2)
    expect(bufferedRenderListener).toHaveBeenCalledTimes(1)
    expect(bufferedTaskListener).not.toHaveBeenCalled()

    unsubscribeVisibleRender()
    expect(store.setSessionIds(new Set(["visible", "buffered"]), new Set(["visible"]))).toBe(true)
    expect(visibleRenderListener).toHaveBeenCalledTimes(2)
    expect(visibleTaskListener).toHaveBeenCalledTimes(3)
    expect(bufferedRenderListener).toHaveBeenCalledTimes(1)
    expect(bufferedTaskListener).not.toHaveBeenCalled()
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

  it("uses cached preview geometry while the active preview is still loading", () => {
    expect(
      mergeStudioPreviewFrameState(
        "src/UserCard.g.tsx#default:ready",
        {
          expectedSessionId: "src/UserCard.g.tsx#default:ready",
          ready: true,
        },
        {
          expectedSessionId: "cached:tablet\nsrc/UserCard.g.tsx#default\nready",
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
              expectedSessionId: `cached:${studioPreviewCacheKey(component, "ready", "tablet")}`,
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

  it("derives geometry cache keys for every manifest case and canvas viewport", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const expectedKeys = manifest.files.flatMap((file) =>
      file.components.flatMap((component) =>
        component.cases.flatMap((testCase) =>
          (["phone", "tablet", "desktop"] as const).map((viewportPreset) =>
            studioPreviewCacheKey(component, testCase.name, viewportPreset),
          ),
        ),
      ),
    )

    expect(studioPreviewGeometryCacheKeys(manifest).sort()).toEqual([...new Set(expectedKeys)].sort())
  })

  it("keeps preview geometry cache updates inside the cache store", () => {
    const store = createStudioPreviewGeometryCacheStore({
      cacheKeys: ["tablet\nhash\nsrc/UserCard.g.tsx#default\nready"],
      namespace: "project:fixture",
    })
    const userCardListener = vi.fn()
    const unrelatedListener = vi.fn()
    store.subscribe(["src/UserCard.g.tsx#default:ready", "tablet\nhash\nsrc/UserCard.g.tsx#default\nready"], userCardListener)
    store.subscribe(["src/Other.g.tsx#default:ready", "tablet\nhash\nsrc/Other.g.tsx#default\nready"], unrelatedListener)

    const update = store.putMessages([
      {
        target: { cacheKey: "tablet\nhash\nsrc/UserCard.g.tsx#default\nready" },
        message: {
          type: "gtsx:tree",
          protocolVersion: 1,
          sessionId: "src/UserCard.g.tsx#default:ready",
          tree: [
            {
              id: "root",
              coordinate: "src/UserCard.g.tsx#default",
              rect: { x: 0, y: 12, width: 320, height: 88 },
              children: [],
            },
          ],
        },
      },
    ], new Set(["src/UserCard.g.tsx#default:ready"]))

    expect(update.changed).toBe(true)
    expect(userCardListener).toHaveBeenCalledTimes(1)
    expect(unrelatedListener).not.toHaveBeenCalled()
    expect(update.snapshot).toBe(store.getSnapshot())
    expect(store.getFrameState("src/UserCard.g.tsx#default:ready")?.tree?.[0]?.rect).toEqual({
      x: 0,
      y: 12,
      width: 320,
      height: 88,
    })
    expect(Object.keys(update.entriesToWrite)).toEqual(["tablet\nhash\nsrc/UserCard.g.tsx#default\nready"])
    expect(store.getSnapshot()["tablet\nhash\nsrc/UserCard.g.tsx#default\nready"]?.frameState.tree?.[0]?.rect).toEqual({
      x: 0,
      y: 12,
      width: 320,
      height: 88,
    })
    expect(
      store.getLayoutFrameState(
        "src/UserCard.g.tsx#default:ready",
        "tablet\nhash\nsrc/UserCard.g.tsx#default\nready",
      )?.tree?.[0]?.rect,
    ).toEqual({
      x: 0,
      y: 12,
      width: 320,
      height: 88,
    })
    expect(store.markSessionRenderStarted("src/UserCard.g.tsx#default:ready")).toBe(true)
    expect(userCardListener).toHaveBeenCalledTimes(2)
    expect(store.getFrameState("src/UserCard.g.tsx#default:ready")).toEqual({
      expectedSessionId: "src/UserCard.g.tsx#default:ready",
      ready: false,
    })
    expect(
      store.getMergedFrameState(
        "src/UserCard.g.tsx#default:ready",
        "tablet\nhash\nsrc/UserCard.g.tsx#default\nready",
      )?.tree?.[0]?.rect,
    ).toEqual({
      x: 0,
      y: 12,
      width: 320,
      height: 88,
    })
    expect(store.markSessionRenderStarted("src/UserCard.g.tsx#default:ready")).toBe(false)
    expect(userCardListener).toHaveBeenCalledTimes(2)

    expect(
      store.putMessages([
        {
          target: { cacheKey: "tablet\nhash\nsrc/UserCard.g.tsx#default\nready" },
          message: {
            type: "gtsx:tree",
            protocolVersion: 1,
            sessionId: "src/UserCard.g.tsx#default:ready",
            tree: [
              {
                id: "root",
                coordinate: "src/UserCard.g.tsx#default",
                rect: { x: 0, y: 12, width: 320, height: 88 },
                children: [],
              },
            ],
          },
        },
      ], new Set(["src/UserCard.g.tsx#default:ready"])).changed,
    ).toBe(true)
    expect(userCardListener).toHaveBeenCalledTimes(3)

    const dynamicUpdate = store.putMessages([
      {
        target: { cacheKey: "tablet\nhash\nsrc/UserCard.g.tsx#default\nready" },
        message: {
          type: "gtsx:tree",
          protocolVersion: 1,
          sessionId: "src/UserCard.g.tsx#default:ready",
          tree: [
            {
              id: "root",
              coordinate: "src/UserCard.g.tsx#default",
              rect: { x: 0, y: 12, width: 360, height: 96 },
              children: [],
            },
          ],
        },
      },
    ], new Set(["src/UserCard.g.tsx#default:ready"]))

    expect(dynamicUpdate.changed).toBe(true)
    expect(userCardListener).toHaveBeenCalledTimes(4)
    expect(store.getFrameState("src/UserCard.g.tsx#default:ready")?.tree?.[0]?.rect).toEqual({
      x: 0,
      y: 12,
      width: 360,
      height: 96,
    })
    expect(
      store.getLayoutFrameState(
        "src/UserCard.g.tsx#default:ready",
        "tablet\nhash\nsrc/UserCard.g.tsx#default\nready",
      )?.tree?.[0]?.rect,
    ).toEqual({
      x: 0,
      y: 12,
      width: 320,
      height: 88,
    })
  })

  it("uses a project namespace for the browser preview geometry cache", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
      cache: { namespace: "test-cache-namespace" },
    })

    expect(studioPreviewIndexedDBNamespace(manifest)).toBe("project:test-cache-namespace")
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

  it("reads preview queue debug mode from URL params", () => {
    expect(isStudioPreviewQueueDebugEnabled(new URLSearchParams("debug=queue"))).toBe(true)
    expect(isStudioPreviewQueueDebugEnabled(new URLSearchParams("debug=layout,queue"))).toBe(true)
    expect(isStudioPreviewQueueDebugEnabled(new URLSearchParams("debug=layout&debug=preview-queue"))).toBe(true)
    expect(isStudioPreviewQueueDebugEnabled(new URLSearchParams("debug=pool"))).toBe(false)
    expect(isStudioPreviewQueueDebugEnabled(new URLSearchParams("debug=no-pool"))).toBe(false)
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
          "previewQueueMinimumVisibleRenderTasksDuringCanvasMovement=5&previewQueueMaximumConcurrentRenderTasks=3&previewQueueMaximumConcurrentRenderTasksDuringCanvasMovement=2&previewQueueMaximumRenderTaskCount=9&previewQueueMaximumMountedPreviewSessions=11&previewQueueRenderBufferMargin=640&previewQueueActiveRenderTimeoutMilliseconds=900&previewQueueRenderThrottleMilliseconds=100&previewQueueRenderDebounceMilliseconds=240&previewQueueBufferRenderDelayMilliseconds=800",
        ),
      ),
    ).toEqual({
      activeRenderTimeoutMilliseconds: 900,
      bufferRenderDelayMilliseconds: 800,
      renderDebounceMilliseconds: 240,
      maximumConcurrentRenderTasks: 3,
      maximumConcurrentRenderTasksDuringCanvasMovement: 2,
      minimumVisibleRenderTasksDuringCanvasMovement: 5,
      renderBufferMargin: 640,
      maximumRenderTaskCount: 9,
      maximumMountedPreviewSessions: 11,
      renderThrottleMilliseconds: 100,
    })
    expect(
      studioPreviewRenderQueueOptionsFromParams(
        new URLSearchParams(
          "previewQueueActive=3&previewQueueSafety=9&previewQueueBuffer=640&previewQueueActiveTimeout=900&previewQueueThrottle=100&previewQueueDebounce=240&previewQueueBufferDelay=800",
        ),
      ),
    ).toMatchObject({
      activeRenderTimeoutMilliseconds: 900,
      bufferRenderDelayMilliseconds: 800,
      renderDebounceMilliseconds: 240,
      maximumConcurrentRenderTasks: 3,
      renderBufferMargin: 640,
      maximumRenderTaskCount: 9,
      maximumMountedPreviewSessions: undefined,
      renderThrottleMilliseconds: 100,
    })
    expect(studioPreviewRenderQueueOptionsFromParams(new URLSearchParams("queueActive=4&queueSafety=12&queueBuffer=700"))).toEqual({
      activeRenderTimeoutMilliseconds: undefined,
      bufferRenderDelayMilliseconds: undefined,
      renderDebounceMilliseconds: undefined,
      maximumConcurrentRenderTasks: 4,
      maximumConcurrentRenderTasksDuringCanvasMovement: undefined,
      minimumVisibleRenderTasksDuringCanvasMovement: undefined,
      renderBufferMargin: 700,
      maximumRenderTaskCount: 12,
      maximumMountedPreviewSessions: undefined,
      renderThrottleMilliseconds: undefined,
    })
    expect(studioPreviewRenderQueueOptionsFromParams(new URLSearchParams("throttle=0&debounce=0"))).toMatchObject({
      renderDebounceMilliseconds: 0,
      renderThrottleMilliseconds: 0,
    })
    expect(studioPreviewRenderQueueOptionsFromParams(new URLSearchParams("previewQueueLength=10&queueLength=12"))).toEqual({
      activeRenderTimeoutMilliseconds: undefined,
      bufferRenderDelayMilliseconds: undefined,
      renderDebounceMilliseconds: undefined,
      maximumConcurrentRenderTasks: undefined,
      maximumConcurrentRenderTasksDuringCanvasMovement: undefined,
      minimumVisibleRenderTasksDuringCanvasMovement: undefined,
      renderBufferMargin: undefined,
      maximumRenderTaskCount: 10,
      maximumMountedPreviewSessions: undefined,
      renderThrottleMilliseconds: undefined,
    })
    expect(studioPreviewRenderQueueOptionsFromParams(new URLSearchParams("queueActive=0&queueLength=nope"))).toEqual({
      activeRenderTimeoutMilliseconds: undefined,
      bufferRenderDelayMilliseconds: undefined,
      renderDebounceMilliseconds: undefined,
      maximumConcurrentRenderTasks: undefined,
      maximumConcurrentRenderTasksDuringCanvasMovement: undefined,
      minimumVisibleRenderTasksDuringCanvasMovement: undefined,
      renderBufferMargin: undefined,
      maximumRenderTaskCount: undefined,
      maximumMountedPreviewSessions: undefined,
      renderThrottleMilliseconds: undefined,
    })
    expect(studioPreviewRenderQueueOptionsFromParams(new URLSearchParams("previewQueueBuffer=0"))).toMatchObject({
      renderBufferMargin: 0,
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

  it("keeps duplicate preview layout messages idempotent", () => {
    const tree = [
      {
        id: "root",
        coordinate: "src/UserCard.g.tsx#default",
        rect: { x: 10, y: 20, width: 320, height: 88 },
        children: [],
      },
    ]
    const state = {
      expectedSessionId: "current-session",
      ready: true,
      size: { width: 390, height: 844 },
      tree,
    }

    expect(
      applyStudioPreviewMessage(state, {
        type: "gtsx:ready",
        protocolVersion: 1,
        sessionId: "current-session",
      }),
    ).toBe(state)
    expect(
      applyStudioPreviewMessage(state, {
        type: "gtsx:resize",
        protocolVersion: 1,
        sessionId: "current-session",
        size: { width: 390, height: 844 },
      }),
    ).toBe(state)
    expect(
      applyStudioPreviewMessage(state, {
        type: "gtsx:tree",
        protocolVersion: 1,
        sessionId: "current-session",
        tree: [
          {
            id: "root",
            coordinate: "src/UserCard.g.tsx#default",
            rect: { x: 10, y: 20, width: 320, height: 88 },
            children: [],
          },
        ],
      }),
    ).toBe(state)
  })

  it("flushes only new preview completion messages", () => {
    const readyMessage = {
      type: "gtsx:ready",
      protocolVersion: 1,
      sessionId: "current-session",
    } as const
    const treeMessage = {
      type: "gtsx:tree",
      protocolVersion: 1,
      sessionId: "current-session",
      tree: [] as GBoundaryTreeNode[],
    } as const

    expect(
      createStudioPreviewMessageFlush({
        getFrameState: () => ({ expectedSessionId: "current-session", ready: false }),
        messages: [
          { message: readyMessage },
          { message: readyMessage },
          { message: treeMessage },
        ],
      }),
    ).toEqual({
      completionMessages: [{ message: readyMessage }],
      messagesToApply: [{ message: readyMessage }, { message: treeMessage }],
    })

    expect(
      createStudioPreviewMessageFlush({
        getFrameState: () => ({ expectedSessionId: "current-session", ready: true }),
        messages: [{ message: readyMessage }],
      }),
    ).toEqual({
      completionMessages: [],
      messagesToApply: [],
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

    const ready = {
      "current-session": {
        expectedSessionId: "current-session",
        ready: true,
      },
    }
    expect(
      applyStudioPreviewMessageToFrameStates(
        ready,
        {
          type: "gtsx:ready",
          protocolVersion: 1,
          sessionId: "current-session",
        },
        new Set(["current-session"]),
      ),
    ).toBe(ready)
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

  it("does not post a pooled iframe render for non-rendering borrow updates", () => {
    const input = {
      size: { width: 768, height: 1024 },
      slot: {
        previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
        sessionId: "src/UserCard.g.tsx#default:ready",
        title: "UserCard ready preview",
      },
    }

    expect(studioPreviewIframeBorrowInputNeedsRender(undefined, input)).toBe(true)
    expect(studioPreviewIframeBorrowInputNeedsRender(input, { ...input })).toBe(false)
    expect(
      studioPreviewIframeBorrowInputNeedsRender(input, {
        ...input,
        slot: { ...input.slot, title: "Updated title" },
      }),
    ).toBe(false)
    expect(
      studioPreviewIframeBorrowInputNeedsRender(input, {
        ...input,
        size: { width: 390, height: 844 },
      }),
    ).toBe(true)
    expect(
      studioPreviewIframeBorrowInputNeedsRender(input, {
        ...input,
        slot: { ...input.slot, previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=error&chrome=0" },
      }),
    ).toBe(true)
  })

  it("prevents repeated pooled iframe render posts for the same pending target", () => {
    const input = {
      size: { width: 768, height: 1024 },
      slot: {
        previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
        sessionId: "src/UserCard.g.tsx#default:ready",
        title: "UserCard ready preview",
      },
    }
    const renderKey = studioPreviewIframePendingRenderPostKey(input)

    expect(studioPreviewIframePoolEntryNeedsPendingRenderPost({}, renderKey)).toBe(true)
    expect(studioPreviewIframePoolEntryNeedsPendingRenderPost({ lastPostedRenderKey: renderKey }, renderKey)).toBe(false)
    expect(studioPreviewIframePoolEntryNeedsPendingRenderPost({ lastPostedRenderKey: renderKey }, renderKey, { force: true })).toBe(true)
    expect(studioPreviewIframePoolNextPendingRenderDeliveryAttemptCount({}, renderKey)).toBe(1)
    expect(studioPreviewIframePoolNextPendingRenderDeliveryAttemptCount({ lastPostedRenderKey: renderKey, pendingRenderDeliveryAttemptCount: 1 }, renderKey)).toBe(2)
    expect(
      studioPreviewIframePoolEntryNeedsPendingRenderPost(
        { lastPostedRenderKey: renderKey },
        studioPreviewIframePendingRenderPostKey({
          ...input,
          slot: { ...input.slot, previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=error&chrome=0" },
        }),
      ),
    ).toBe(true)
  })

  it("borrows a ready idle iframe before creating another pooled iframe", () => {
    const poolUrl = "/gtsx?chrome=0&pool=1"
    const exact = {
      lastRenderedSessionId: "src/UserCard.g.tsx#default:ready",
      poolUrl,
      ready: true,
    }
    const unreadyExact = {
      lastRenderedSessionId: "src/UserCard.g.tsx#default:ready",
      poolUrl,
      ready: false,
    }
    const readyStateless = { poolUrl, ready: true }
    const readyStale = {
      lastRenderedSessionId: "src/OtherCard.g.tsx#default:ready",
      poolUrl,
      ready: true,
    }
    const unreadyStale = {
      lastRenderedSessionId: "src/SlowCard.g.tsx#default:ready",
      poolUrl,
      ready: false,
    }

    expect(
      selectStudioPreviewIframePoolEntryForBorrow([readyStale], {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(readyStale)
    expect(
      selectStudioPreviewIframePoolEntryForBorrow([unreadyStale], {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(undefined)
    expect(
      selectStudioPreviewIframePoolEntryForBorrow(new Array(48).fill(null).map(() => unreadyStale), {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(undefined)
    expect(
      selectStudioPreviewIframePoolEntryForBorrow([unreadyExact, readyStateless], {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(readyStateless)
    expect(
      selectStudioPreviewIframePoolEntryForBorrow([readyStale, exact, readyStateless], {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(exact)
    expect(
      selectStudioPreviewIframePoolEntryForBorrow([readyStale, readyStateless], {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(readyStateless)
  })

  it("positions pooled iframes from a stable host without changing their layout viewport", () => {
    expect(
      studioPreviewIframePoolPlacementForAnchor({
        anchorRect: { bottom: 522, height: 422, left: 80, right: 275, top: 100, width: 195 },
        clipRect: { bottom: 400, height: 240, left: 95, right: 260, top: 160, width: 165 },
        layoutSize: { height: 844, width: 390 },
      }),
    ).toEqual({
      clipPath: "inset(120px 30px 244px 30px)",
      height: "844px",
      transform: "translate3d(80px, 100px, 0) scale(0.5, 0.5)",
      visibility: "visible",
      width: "390px",
    })
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
