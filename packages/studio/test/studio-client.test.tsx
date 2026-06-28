import { join } from "node:path"
import type { GBoundaryTreeNode, GRenderedSnapshot } from "@runelight/core/preview-protocol"
import { G_RENDERED_SNAPSHOT_VERSION, isGPreviewSessionMessage } from "@runelight/core/preview-protocol"
import { renderToStaticMarkup } from "react-dom/server"
import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { runelightReactContract } from "@runelight/react/contract"
import { describe, expect, it, vi } from "vitest"

import {
  StudioShell,
  StudioWorkspaceView,
  type StudioManifest,
  type StudioManifestComponent,
  type StudioPreviewFrameState,
  createStudioManifest,
  discoverStudioDesignManifest,
  applyStudioCardSelectionAction,
  applyStudioPreviewMessage,
  applyStudioPreviewMessageToFrameStates,
  applyStudioCanvasWheel,
  changeStudioComponentFrame,
  changeStudioComponentProviderVariant,
  changeStudioCanvasViewportPreset,
  changeStudioRootProviderVariant,
  changeStudioViewportPreset,
  computeStudioFrameGridLayout,
  componentCardLayoutWidth,
  computeStudioColumnLayout,
  createStudioCanvasTransformFromUrl,
  createStudioPreviewPoolUrl,
  createStudioPreviewUrl,
  createStudioPreviewGeometryCacheStore,
  createStudioPreviewMessageFlush,
  createStudioPreviewRenderCompletionSource,
  createStudioPreviewRenderPlan,
  createStudioPreviewRenderSessionStore,
  createStudioRuntimeValuesRequest,
  createStudioWorkspaceStateFromUrl,
  createStudioWorkspaceState,
  createStudioWorkspaceUrlSearchParams,
  currentStudioChangesPreviewTargets,
  currentStudioDesignPreviewTargets,
  currentStudioPreviewTargets,
  defaultStudioCanvasTransform,
  defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement,
  defaultStudioPreviewRenderQueueMinimumVisibleRenderTasksDuringCanvasMovement,
  isStudioPreviewPoolDisabled,
  isStudioPreviewPoolDebugEnabled,
  isStudioPreviewQueueDebugEnabled,
  mergeStudioPreviewFrameState,
  measuredStudioColumnLayoutPackedByComponentOrder,
  previewSessionId,
  queuedStudioPreviewSessionIds,
  replaceStudioCanvasUrlState,
  revealStudioCanvasRect,
  rootStudioManifestComponents,
  selectedStudioFrameName,
  selectStudioRuntimeInstance,
  selectStudioComponent,
  studioComponentRuntimeInputState,
  studioDesignManifestComponents,
  studioFilteredFramesForProviderVariantContext,
  studioManifestProviderVariantAxes,
  studioCanvasMinScale,
  studioPreviewFrameOverridesForProviderVariantContext,
  studioPreviewCacheKey,
  studioCanvasFixedFramePreviewScale,
  studioPreviewGeometryCacheKeys,
  studioProviderVariantAxes,
  studioProviderVariantFrameStatus,
  studioProviderVariantContextForPath,
  studioProviderVariantSelectionContextForPath,
  sameStudioProviderVariantContext,
  studioWorkspaceWithProviderVariantFilters,
  studioCanvasCardIndex,
  studioPreviewRenderPlanHasIncompleteVisibleRenderTasks,
  studioPreviewVisibilityItems,
  studioPreviewRenderQueueOptionsFromParams,
  studioPreviewRenderTargetFromUrl,
  visibleStudioCanvasCardEntriesByColumnIndex,
  visibleQueuedStudioPreviewSessionIds,
} from "../src/client-api.js"
import ComponentCard from "../src/components/ComponentCard.g.js"
import LazyPreviewFrame from "../src/components/LazyPreviewFrame.g.js"
import PreviewFrameSheet from "../src/components/PreviewFrameSheet.g.js"
import PreviewMessage from "../src/components/PreviewMessage.g.js"
import StudioChangesWorkspace from "../src/components/StudioChangesWorkspace.g.js"
import StudioDesignWorkspace from "../src/components/StudioDesignWorkspace.g.js"
import {
  layoutNeutralDrilldownColumnEnterIdentity,
  preserveStudioCanvasViewportAnchor,
} from "../src/components/StudioWorkspaceView.g.js"
import {
  shouldHydrateStudioPreviewCacheBeforeLayout,
  studioPreviewGeometryCacheKeySignature,
  studioShellPreviewGeometryCacheKeySignature,
} from "../src/components/StudioShell.js"
import { domRectToLocalStudioCanvasScreenRect } from "../src/studio-canvas-geometry.js"
import BufferedPreviewIframe from "../src/components/BufferedPreviewIframe.g.js"
import {
  selectStudioPreviewIframePoolEntryForBorrow,
  studioPreviewIframePoolEntryCanUseDirectRenderEndpoint,
  studioPreviewIframeBorrowInputNeedsRender,
  studioPreviewIframeBorrowKey,
  studioPreviewIframePendingRenderPostKey,
  studioPreviewIframePoolPlacementForAnchor,
  studioPreviewIframePoolEntryNeedsPendingRenderPost,
  studioPreviewIframePoolNextPendingRenderDeliveryAttemptCount,
} from "../src/preview-iframe-pool.js"
import { studioPreviewIndexedDBNamespace } from "../src/preview-cache-indexeddb.js"
import { createStudioRequestCoalescer } from "../src/studio-request-coalescer.js"
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
import {
  studioPreviewRenderExpansionCenterViewportPoint,
  studioPreviewRenderSchedulerShouldScheduleActiveTimeout,
  syncRenderPreviewSessionMountedAt,
} from "../src/use-studio-preview-render-scheduler.js"
import {
  isRectNearViewport,
  shouldRenderStudioPreview,
  studioPreviewRenderBufferMargin,
  visibleStudioPreviewSessionIds,
} from "../src/preview-lazy-loading.js"
import { studioCanvasScreenStableChromeHostStyle } from "../src/studio-canvas-screen-stable-chrome.js"
import type { StudioPreviewGeometryCacheStore } from "../src/preview-geometry-cache-store.js"

const fixtureRoot = join(import.meta.dirname, "../../core/test/fixtures/check-project")
const examplesRoot = join(import.meta.dirname, "../../../examples/react-vite")
const studioRoot = join(import.meta.dirname, "..")
const tsProjectScopeRoot = join(import.meta.dirname, "../../core/test/fixtures/ts-project-scope")

type CreateStudioManifestOptions = NonNullable<Parameters<typeof createStudioManifest>[1]>

function createDeferredPromise() {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function waitForMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createStaticPreviewGeometryStore(
  frameStatesBySessionId: Record<string, ReturnType<typeof readyPreviewFrameState>>,
): StudioPreviewGeometryCacheStore {
  return {
    cacheKeys: [],
    getFrameState(sessionId) {
      return frameStatesBySessionId[sessionId]
    },
    getLayoutFrameState(sessionId) {
      return frameStatesBySessionId[sessionId]
    },
    getMergedFrameState(sessionId) {
      return frameStatesBySessionId[sessionId]
    },
    getSnapshot() {
      return {}
    },
    getVersionForKeys(keys) {
      return keys.map((key) => `${key}:ready`).join("|")
    },
    async hydrate() {
      return {}
    },
    markSessionRenderStarted() {
      return false
    },
    putMessages() {
      return { changed: false, entriesToWrite: {}, snapshot: {} }
    },
    reset() {},
    subscribe() {
      return () => {}
    },
    async writeEntries() {},
    namespace: "test",
  }
}

function readyPreviewFrameState(
  sessionId: string,
  coordinate: string,
  rect: GBoundaryTreeNode["rect"] = { x: 0, y: 0, width: 320, height: 180 },
) {
  return {
    expectedSessionId: sessionId,
    ready: true,
    size: { width: 320, height: 180 },
    tree: [
      {
        id: `${sessionId}:root`,
        coordinate,
        rect,
        children: [],
      },
    ] satisfies GBoundaryTreeNode[],
  }
}

function renderedSnapshot(hash: string, nodes: GRenderedSnapshot["nodes"] = []): GRenderedSnapshot {
  return {
    hash,
    nodes,
    version: G_RENDERED_SNAPSHOT_VERSION,
    viewport: { width: 768, height: 1024 },
  }
}

function readyRenderedPreviewFrameState(
  component: StudioManifestComponent,
  frameName: string,
  hash: string,
) {
  const sessionId = previewSessionId(component, frameName, "tablet")
  return {
    ...readyPreviewFrameState(sessionId, component.coordinate),
    renderedSnapshot: renderedSnapshot(hash),
  }
}

function buildStudioManifest(
  options: { cwd: string; sourceRoot: string; tsconfigPath?: string } & CreateStudioManifestOptions,
) {
  const projectIndex = buildRunelightProjectIndex({
    contracts: [runelightReactContract],
    cwd: options.cwd,
    sourceRoot: options.sourceRoot,
    tsconfigPath: options.tsconfigPath,
  })
  return createStudioManifest(projectIndex, {
    cache: options.cache,
    design: options.design,
    additionalDiagnostics: options.additionalDiagnostics,
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

describe("Runelight Studio shell", () => {
  it("replays the latest Studio reload after an in-flight reload completes", async () => {
    const first = createDeferredPromise()
    const second = createDeferredPromise()
    const runs: string[] = []
    const queue = createStudioRequestCoalescer<{ id: string }>(async (request) => {
      runs.push(request.id)
      await (runs.length === 1 ? first.promise : second.promise)
    })

    expect(queue.request({ id: "initial" })).toBe("started")
    expect(queue.request({ id: "stale-sse" })).toBe("queued")
    expect(queue.request({ id: "latest-sse" })).toBe("queued")
    expect(runs).toEqual([])

    await waitForMicrotasks()
    expect(runs).toEqual(["initial"])

    first.resolve()
    await waitForMicrotasks()
    expect(runs).toEqual(["initial", "latest-sse"])

    second.resolve()
    await queue.whenIdle()
    expect(queue.hasPendingRequest()).toBe(false)
  })

  it("lets in-flight Studio reloads avoid applying stale results when a newer reload is pending", async () => {
    const first = createDeferredPromise()
    const second = createDeferredPromise()
    const applied: string[] = []
    const queue = createStudioRequestCoalescer<{ id: string }>(async (request, context) => {
      await (request.id === "initial" ? first.promise : second.promise)
      if (!context.hasPendingRequest()) applied.push(request.id)
    })

    queue.request({ id: "initial" })
    queue.request({ id: "latest-sse" })
    first.resolve()
    await waitForMicrotasks()
    expect(applied).toEqual([])

    second.resolve()
    await queue.whenIdle()
    expect(applied).toEqual(["latest-sse"])
  })

  it("renders preview route messages from a Runelight visual component", () => {
    const html = renderToStaticMarkup(<PreviewMessage title="Missing entry" detail="Pass an entry query parameter." />)

    expect(html).toContain('data-runelight-preview-message="true"')
    expect(html).toContain("Missing entry")
    expect(html).toContain("Pass an entry query parameter.")
  })

  it("renders preview frame sheets from real frame data", () => {
    function ExamplePreviewComponent(props: { label: string }) {
      return <div data-example-preview>{props.label}</div>
    }

    const html = renderToStaticMarkup(
      <PreviewFrameSheet
        component={ExamplePreviewComponent}
        entry="src/Example.g.tsx#default"
        selectedFrames={[
          {
            name: "ready",
            frame: {
              description: "Ready preview card",
              props: { label: "Ready preview" },
            },
          },
        ]}
      />,
    )

    expect(html).toContain('data-runelight-preview-frame="ready"')
    expect(html).toContain("Example")
    expect(html).toContain("src/Example.g.tsx#default / 1 frame")
    expect(html).toContain('data-runelight-preview-frame-grid-scale="0.45"')
    expect(html).toContain("Ready preview")
  })

  it("renders every exported component from the selected file group in the first column", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(cardCoordinates(html)).toEqual(["src/MultiExport.g.tsx#NamedBadge", "src/MultiExport.g.tsx#default"])
    expect(html).toContain("NamedBadge")
    expect(html).toContain("DefaultBadge")
  })

  it("renders only the selected component in the first column", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const html = renderToStaticMarkup(
      <StudioShell manifest={manifest} selection="component:src/MultiExport.g.tsx#NamedBadge" />,
    )

    expect(cardCoordinates(html)).toEqual(["src/MultiExport.g.tsx#NamedBadge"])
  })

  it("renders root components in the first column by default", () => {
    const manifest = buildStudioManifest({ cwd: examplesRoot, sourceRoot: "src/frames" })
    const expectedRootCoordinates = [
      "src/frames/language/PrimitiveProps.g.tsx#default",
      "src/frames/stateful/DashboardShell.g.tsx#default",
      "src/frames/stateful/MultiExportPanel.g.tsx#NamedPanel",
      "src/frames/stateful/MultiExportPanel.g.tsx#default",
      "src/frames/stateful/UserCard.g.tsx#default",
      "src/frames/ui/NotificationCenter.g.tsx#default",
    ]

    expect(rootStudioManifestComponents(manifest).map((component) => component.coordinate)).toEqual(expectedRootCoordinates)
    expect(cardCoordinates(renderToStaticMarkup(<StudioShell manifest={manifest} />))).toEqual(expectedRootCoordinates)
  })

  it("keeps design convention files out of the components workspace", () => {
    const projectIndex = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: tsProjectScopeRoot, sourceRoot: "src" })
    const manifest = createStudioManifest(projectIndex, {
      design: discoverStudioDesignManifest(projectIndex, "src/app/runelight"),
    })
    const expectedRootCoordinates = ["src/Included.g.tsx#default"]

    expect(manifest.files.map((file) => file.path)).toContain("src/app/runelight/design/Sketch.g.tsx")
    expect(rootStudioManifestComponents(manifest).map((component) => component.coordinate)).toEqual(expectedRootCoordinates)
    expect(cardCoordinates(renderToStaticMarkup(<StudioShell manifest={manifest} />))).toEqual(expectedRootCoordinates)
    expect(
      createStudioWorkspaceState(manifest, "component:src/app/runelight/design/Sketch.g.tsx#default").columns[0]?.components.map(
        (component) => component.coordinate,
      ),
    ).toEqual(expectedRootCoordinates)
    expect(
      createStudioWorkspaceState(manifest, "file:src/app/runelight/design/Sketch.g.tsx").columns[0]?.components.map(
        (component) => component.coordinate,
      ),
    ).toEqual(expectedRootCoordinates)
  })

  it("virtualizes canvas card shells instead of rendering every root component", () => {
    const manifest = buildLargeStudioManifest(80)
    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={createStudioWorkspaceState(manifest)} />)
    const coordinates = cardCoordinates(html)

    expect(coordinates.length).toBeGreaterThan(0)
    expect(coordinates.length).toBeLessThan(10)
    expect(coordinates).toContain("src/Card000.g.tsx#default")
    expect(coordinates).not.toContain("src/Card079.g.tsx#default")
  })

  it("uses the preview queue render buffer for canvas card shell virtualization", () => {
    const manifest = buildLargeStudioManifest(80)
    const defaultCoordinates = cardCoordinates(renderToStaticMarkup(<StudioShell manifest={manifest} />))
    const visibleOnlyCoordinates = cardCoordinates(
      renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="previewQueueBuffer=0" />),
    )
    const bufferedCoordinate = defaultCoordinates.at(-1)
    if (!bufferedCoordinate) throw new Error("Expected at least one default buffered card")

    expect(visibleOnlyCoordinates.length).toBeGreaterThan(0)
    expect(visibleOnlyCoordinates.length).toBeLessThan(defaultCoordinates.length)
    expect(visibleOnlyCoordinates).toContain("src/Card000.g.tsx#default")
    expect(visibleOnlyCoordinates).not.toContain(bufferedCoordinate)
  })

  it("derives visible canvas card shells from a column index instead of the whole component list", () => {
    const manifest = buildLargeStudioManifest(80)
    const workspace = createStudioWorkspaceState(manifest)
    const columnMeasurementsByIndex = largeColumnMeasurements(workspace, { cardHeight: 80, cardGap: 20, cardWidth: 280 })
    const visibleCardsByColumnIndex = visibleStudioCanvasCardEntriesByColumnIndex({
      canvas: { x: 0, y: 0, scale: 1 },
      cardIndex: studioCanvasCardIndex({ columnMeasurementsByIndex, workspace }),
      columnLayoutByIndex: { 0: { x: 0, y: 0 } },
      renderBufferMargin: 0,
      viewportSize: { height: 720, width: 1280 },
    })

    expect(visibleCardsByColumnIndex[0]?.map((entry) => entry.component.coordinate)).toEqual(
      Array.from({ length: 8 }, (_, index) => `src/Card${index.toString().padStart(3, "0")}.g.tsx#default`),
    )
  })

  it("keeps card shells stable across tiny edge pans when the canvas is zoomed far out", () => {
    const manifest = buildLargeStudioManifest(1)
    const workspace = createStudioWorkspaceState(manifest)
    const component = workspace.columns[0]?.components[0]
    if (!component) throw new Error("Expected a component")
    const columnMeasurementsByIndex = {
      0: {
        cardRectsByCoordinate: {
          [component.coordinate]: {
            bottom: 1100,
            left: 0,
            right: 280,
            top: 1000,
          },
        },
        height: 1100,
        previewFrameRectsBySessionId: {},
      },
    }
    const cardIndex = studioCanvasCardIndex({ columnMeasurementsByIndex, workspace })

    const coordinatesForPan = (canvasY: number) =>
      visibleStudioCanvasCardEntriesByColumnIndex({
        canvas: { x: 0, y: canvasY, scale: 0.05 },
        cardIndex,
        columnLayoutByIndex: { 0: { x: 0, y: 0 } },
        renderBufferMargin: 0,
        viewportSize: { height: 100, width: 100 },
      })[0]?.map((entry) => entry.component.coordinate) ?? []

    expect(coordinatesForPan(-54.95)).toEqual([component.coordinate])
    expect(coordinatesForPan(-55.05)).toEqual([component.coordinate])
  })

  it("builds preview visibility items only for the canvas render buffer", () => {
    const manifest = buildLargeStudioManifest(80)
    const workspace = createStudioWorkspaceState(manifest)
    const columnMeasurementsByIndex = largeColumnMeasurements(workspace, { cardHeight: 80, cardGap: 20, cardWidth: 280 })
    const layoutFrameStateSessionIds: string[] = []
    const items = studioPreviewVisibilityItems(
      workspace,
      "tablet",
      { 0: { x: 0, y: 0 } },
      columnMeasurementsByIndex,
      {
        canvas: { x: 0, y: 0, scale: 1 },
        cardIndex: studioCanvasCardIndex({ columnMeasurementsByIndex, workspace }),
        framePreviewScale: 1,
        previewGeometryStore: recordingPreviewGeometryStore(layoutFrameStateSessionIds),
        renderBufferMargin: 0,
        viewport: { bottom: 720, left: 0, right: 1280, top: 0 },
      },
    )

    expect(items).toHaveLength(8)
    expect(items.map((item) => item.sessionIds[0])).toEqual(
      Array.from({ length: 8 }, (_, index) => `src/Card${index.toString().padStart(3, "0")}.g.tsx#default:default`),
    )
    expect(layoutFrameStateSessionIds).toEqual(
      Array.from({ length: 8 }, (_, index) => `src/Card${index.toString().padStart(3, "0")}.g.tsx#default:default`),
    )
  })

  it("can server-render Studio as a lightweight manifest loading shell", () => {
    const html = renderToStaticMarkup(<StudioShell manifestUrl="/runelight/studio/manifest" />)

    expect(html).toContain('data-runelight-studio-shell-loading="true"')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain("Loading Studio")
    expect(html).toContain("Reading /runelight/studio/manifest")
    expect(html).not.toContain("data-runelight-card-coordinate")
  })

  it("keeps cache-namespaced Studio card layout in server HTML before browser cache hydration", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
      cache: { namespace: "fixture-project" },
    })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="component:src/UserCard.g.tsx#default" />)

    expect(html).toContain('data-runelight-canvas-viewport="true"')
    expect(cardCoordinates(html)).toEqual(["src/UserCard.g.tsx#default"])
  })

  it("hydrates preview geometry cache without blocking the initial Studio layout", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
      cache: { namespace: "fixture-project" },
    })

    expect(shouldHydrateStudioPreviewCacheBeforeLayout(manifest)).toBe(false)
  })

  it("uses the changes workspace as the default Studio tab when workspace changes are present", () => {
    const manifest = buildLargeStudioManifest(1)
    const file = manifest.files[0]
    const component = file.components[0]
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD" },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          impacts: [
            {
              frameNames: component.frames.map((frame) => frame.name),
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }

    const html = renderToStaticMarkup(<StudioShell changes={changes} manifest={manifest} />)

    expect(html).toContain('data-runelight-studio-changes-workspace="true"')
    expect(html).toContain('data-runelight-studio-changes-canvas="true"')
    expect(html).not.toContain('data-runelight-studio-changes-list="true"')
    expect(html).toContain('data-runelight-studio-change-section="modified"')
    expect(html).toContain('data-runelight-studio-change-section-tag="modified"')
    expect(sectionTagHtml(html, "modified")).toContain("background:rgba(255,200,80,0.1)")
    expect(sectionTagHtml(html, "modified")).toContain("color:#f0d080")
    expect(html).toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).toContain('data-runelight-studio-change-pane="current"')
    expect(html).toContain('data-runelight-card-coordinate="src/Card000.g.tsx#default"')
    expect(html).not.toContain('data-runelight-studio-change-pane="before"')
    expect(canvasSurfaceHtml(html)).not.toContain("grid-template-columns:repeat(2,max-content)")
  })

  it("uses the changes workspace as the default while deferred changes are loading", () => {
    const manifest = buildLargeStudioManifest(4)
    const html = renderToStaticMarkup(<StudioShell changesLoading manifest={manifest} />)

    expect(html).toContain('data-runelight-studio-changes-workspace="true"')
    expect(html).toContain('data-runelight-studio-changes-loading="true"')
    expect(html).toContain("Loading workspace changes")
    expect(html).not.toContain('data-runelight-card-coordinate="src/Card000.g.tsx#default"')
  })

  it("opens a lightweight changes workspace for an explicit changes route while deferred changes are loading", () => {
    const manifest = buildLargeStudioManifest(4)
    const html = renderToStaticMarkup(<StudioShell changesLoading manifest={manifest} urlHash="#/changes" />)

    expect(html).toContain('data-runelight-studio-changes-workspace="true"')
    expect(html).toContain('data-runelight-studio-changes-loading="true"')
    expect(html).toContain("Loading workspace changes")
    expect(html).not.toContain('data-runelight-card-coordinate="src/Card000.g.tsx#default"')
  })

  it("renders deleted changes from the baseline manifest in the before pane", () => {
    const manifest = buildLargeStudioManifest(0)
    const baselineComponent = {
      coordinate: ".runelight/baselines/HEAD/src/Deleted.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Deleted.g.tsx",
      sourceHash: "deleted-source",
      exportName: "default",
      componentName: "DeletedCard",
      mode: "pure",
      frames: [{ kind: "pure", name: "live" }],
      providers: {},
      diagnostics: [],
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Deleted.g.tsx",
      sourceHash: "deleted-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: "src/Deleted.g.tsx",
          kind: "deleted" as const,
          surface: "frames" as const,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["live"],
              frames: [{ kind: "deleted" as const, name: "live" }],
              rootComponentName: "DeletedCard",
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: "DeletedCard", coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["live"],
              frames: [{ kind: "deleted" as const, name: "live" }],
              rootComponentName: "DeletedCard",
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: "DeletedCard", coordinate: baselineComponent.coordinate }],
            },
          ],
        },
      ],
    }

    const html = renderToStaticMarkup(<StudioShell changes={changes} manifest={manifest} />)

    expect(html).toContain('data-runelight-studio-change-pane="before"')
    expect(html).toContain('data-runelight-studio-change-section="deleted"')
    expect(html).toContain('data-runelight-studio-change-section-tag="deleted"')
    expect(html).toContain('data-runelight-studio-change-preview-components="before"')
    expect(html).toContain('data-runelight-card-coordinate=".runelight/baselines/HEAD/src/Deleted.g.tsx#default"')
    expect(html).toContain('data-runelight-frame-change-state="deleted"')
    expect(html).toContain('data-runelight-frame-change-deleted-overlay="live"')
    expect(deletedFrameOverlayHtml(html, "live")).toContain("height:")
    expect(deletedFrameOverlayHtml(html, "live")).toContain("width:")
    expect(deletedFrameOverlayHtml(html, "live")).not.toContain("inset:0")
    expect(html).toContain('data-runelight-frame-change-badge="deleted"')
    expect(html).toContain(">DEL</span>")
    expect(html).not.toContain('data-runelight-studio-change-pane="current"')
    expect(html).not.toContain('data-runelight-studio-change-preview-empty="current"')
    expect(html).toContain('data-runelight-studio-change-deleted-card="true"')
  })

  it("renders added changes without a redundant before pane", () => {
    const manifest = buildLargeStudioManifest(1)
    const file = manifest.files[0]
    const component = file.components[0]
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD" },
      items: [
        {
          filePath: file.path,
          kind: "added" as const,
          surface: "frames" as const,
          currentFile: file,
          impacts: [
            {
              frameNames: component.frames.map((frame) => frame.name),
              frames: component.frames.map((frame) => ({ kind: "added" as const, name: frame.name })),
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }

    const html = renderToStaticMarkup(<StudioShell changes={changes} manifest={manifest} />)

    expect(html).toContain('data-runelight-studio-change-pane="current"')
    expect(html).toContain('data-runelight-studio-change-section="added"')
    expect(html).toContain('data-runelight-studio-change-section-tag="added"')
    expect(html).toContain('data-runelight-studio-change-preview-components="current"')
    expect(html).toContain('data-runelight-card-coordinate="src/Card000.g.tsx#default"')
    expect(html).toContain('data-runelight-frame-change-badge="added"')
    expect(html).toContain(">NEW</span>")
    expect(frameTileHtml(html, "default")).toContain("cursor:grab")
    expect(frameTileHtml(html, "default")).not.toContain('role="button"')
    expect(changeSectionItemsHtml(html, "added")).toContain("gap:42px 42px")
    expect(html).not.toContain('data-runelight-card-title-selected="true"')
    expect(changeSectionHtml(html, "added")).not.toContain("data-runelight-canvas-wheel-exempt")
    expect(changeGroupHtml(html, `frames:${component.coordinate}`)).not.toContain("data-runelight-canvas-wheel-exempt")
    expect(changePaneHtml(html, "current")).not.toContain("data-runelight-canvas-wheel-exempt")
    expect(html).not.toContain('data-runelight-studio-change-pane="before"')
    expect(html).not.toContain('data-runelight-studio-change-preview-empty="before"')
  })

  it("renders only frame-level visual diffs inside a modified component", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const baseComponent = baseFile.components[0]
    const component = {
      ...baseComponent,
      frames: [
        { kind: "scope" as const, name: "default" },
        { kind: "scope" as const, name: "quiet" },
      ],
    } satisfies StudioManifestComponent
    const file = { ...baseFile, components: [component] }
    const manifest = { ...baseManifest, files: [file] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["default", "quiet"],
              frames: [
                { kind: "changed" as const, name: "default" },
                { kind: "unchanged" as const, name: "quiet" },
              ],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["default", "quiet"],
              frames: [
                { kind: "changed" as const, name: "default" },
                { kind: "unchanged" as const, name: "quiet" },
              ],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }

    const frameStates = {
      [previewSessionId(baselineComponent, "default", "tablet")]: readyRenderedPreviewFrameState(
        baselineComponent,
        "default",
        "before-render",
      ),
      [previewSessionId(component, "default", "tablet")]: readyRenderedPreviewFrameState(
        component,
        "default",
        "current-render",
      ),
    }

    const html = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={frameStates} manifest={manifest} />,
    )

    expect(html).toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).not.toContain('data-runelight-studio-change-frame-summary')
    expect(html).toContain('data-runelight-frame-change-badge="changed"')
    expect(html).toContain('data-runelight-frame-tile="default"')
    expect(html).not.toContain('data-runelight-frame-tile="quiet"')
    expect(html).not.toContain(">quiet<")
  })

  it("renders child component changes on the changed component canvas card", () => {
    const root = {
      coordinate: "src/Root.g.tsx#default",
      filePath: "src/Root.g.tsx",
      sourceHash: "root-source",
      exportName: "default",
      componentName: "Root",
      mode: "pure",
      frames: [{ kind: "pure" as const, name: "default" }],
      providers: {},
      dependencies: ["src/Child.g.tsx#default"],
      diagnostics: [],
    } satisfies StudioManifestComponent
    const child = {
      coordinate: "src/Child.g.tsx#default",
      filePath: "src/Child.g.tsx",
      sourceHash: "child-source",
      exportName: "default",
      componentName: "Child",
      mode: "pure",
      frames: [{ kind: "pure" as const, name: "default" }],
      providers: {},
      diagnostics: [],
    } satisfies StudioManifestComponent
    const rootFile = {
      path: "src/Root.g.tsx",
      sourceHash: "root-source",
      components: [root],
      diagnostics: [],
    }
    const childFile = {
      path: "src/Child.g.tsx",
      sourceHash: "child-source",
      components: [child],
      diagnostics: [],
    }
    const manifest = {
      ...buildLargeStudioManifest(0),
      files: [rootFile, childFile],
    }
    const baselineRootPath = "src/app/runelight/.runelight/baselines/HEAD"
    const baselineRoot = {
      ...root,
      coordinate: `${baselineRootPath}/src/Root.g.tsx#default`,
      filePath: `${baselineRootPath}/src/Root.g.tsx`,
      sourceHash: "baseline-root-source",
      dependencies: [`${baselineRootPath}/src/Child.g.tsx#default`],
    } satisfies StudioManifestComponent
    const baselineChild = {
      ...child,
      coordinate: `${baselineRootPath}/src/Child.g.tsx#default`,
      filePath: `${baselineRootPath}/src/Child.g.tsx`,
      sourceHash: "baseline-child-source",
    } satisfies StudioManifestComponent
    const baselineRootFile = {
      path: `${baselineRootPath}/src/Root.g.tsx`,
      sourceHash: "baseline-root-source",
      components: [baselineRoot],
      diagnostics: [],
    }
    const baselineChildFile = {
      path: `${baselineRootPath}/src/Child.g.tsx`,
      sourceHash: "baseline-child-source",
      components: [baselineChild],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineRootFile, baselineChildFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: baselineRootPath, ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: childFile.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: childFile,
          baselineFile: baselineChildFile,
          baselineImpacts: [
            {
              frameNames: ["default"],
              frames: [{ kind: "changed" as const, name: "default" }],
              rootComponentName: baselineChild.componentName,
              rootCoordinate: baselineChild.coordinate,
              surface: "frames" as const,
              path: [
                { componentName: baselineRoot.componentName, coordinate: baselineRoot.coordinate },
                { componentName: baselineChild.componentName, coordinate: baselineChild.coordinate },
              ],
            },
          ],
          impacts: [
            {
              frameNames: ["default"],
              frames: [{ kind: "changed" as const, name: "default" }],
              rootComponentName: child.componentName,
              rootCoordinate: child.coordinate,
              surface: "frames" as const,
              path: [
                { componentName: root.componentName, coordinate: root.coordinate },
                { componentName: child.componentName, coordinate: child.coordinate },
              ],
            },
          ],
        },
      ],
    }
    const frameStates = {
      [previewSessionId(baselineChild, "default", "tablet")]: readyRenderedPreviewFrameState(
        baselineChild,
        "default",
        "before-child-render",
      ),
      [previewSessionId(child, "default", "tablet")]: readyRenderedPreviewFrameState(
        child,
        "default",
        "current-child-render",
      ),
    }

    const html = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={frameStates} manifest={manifest} />,
    )

    expect(html).toContain('data-runelight-studio-change-group="frames:src/Child.g.tsx#default"')
    expect(html).toContain('data-runelight-studio-change-item="src/Child.g.tsx"')
    expect(html).toContain('data-runelight-studio-change-kind="modified"')
    expect(html).toContain('data-runelight-studio-change-pane="before"')
    expect(html).toContain('data-runelight-studio-change-pane="current"')
    expect(cardCoordinates(html)).toEqual([
      `${baselineRootPath}/src/Child.g.tsx#default`,
      "src/Child.g.tsx#default",
    ])
  })

  it("waits for rendered snapshots before showing modified changed frames", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const component = baseFile.components[0]
    const file = { ...baseFile, components: [component] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: { ...baseManifest, files: [baselineFile] } },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["default"],
              frames: [{ kind: "changed" as const, name: "default" }],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["default"],
              frames: [{ kind: "changed" as const, name: "default" }],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }

    const html = renderToStaticMarkup(<StudioChangesWorkspace changes={changes} manifest={{ ...baseManifest, files: [file] }} />)

    expect(html).toContain('data-runelight-studio-changes-resolving="true"')
    expect(html).toContain("Resolving rendered changes")
    expect(html).toContain('data-runelight-studio-change-preview-prewarm="true"')
    expect(html).not.toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).not.toContain('data-runelight-studio-change-preview-comparison="true"')
  })

  it("keeps changed frames hidden while ready previews have no rendered snapshot", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const component = baseFile.components[0]
    const file = { ...baseFile, components: [component] }
    const manifest = { ...baseManifest, files: [file] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["default"],
              frames: [{ kind: "changed" as const, name: "default" }],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["default"],
              frames: [{ kind: "changed" as const, name: "default" }],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }
    const baselineSessionId = previewSessionId(baselineComponent, "default", "tablet")
    const currentSessionId = previewSessionId(component, "default", "tablet")
    const frameStates = {
      [baselineSessionId]: readyPreviewFrameState(baselineSessionId, baselineComponent.coordinate),
      [currentSessionId]: readyPreviewFrameState(currentSessionId, component.coordinate),
    }

    const html = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={frameStates} manifest={manifest} />,
    )

    expect(html).toContain('data-runelight-studio-changes-resolving="true"')
    expect(html).toContain("Resolving rendered changes")
    expect(html).toContain('data-runelight-studio-change-preview-prewarm="true"')
    expect(html).not.toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).not.toContain('data-runelight-frame-change-state="unknown"')
    expect(html).not.toContain('data-runelight-frame-change-badge="unknown"')
  })

  it("shows ready added frames while modified changed frames are still resolving", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const baseComponent = baseFile.components[0]
    const component = {
      ...baseComponent,
      frames: [
        { kind: "scope" as const, name: "existing" },
        { kind: "scope" as const, name: "newFrame" },
      ],
    } satisfies StudioManifestComponent
    const file = { ...baseFile, components: [component] }
    const manifest = { ...baseManifest, files: [file] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      frames: [{ kind: "scope" as const, name: "existing" }],
      sourceHash: "baseline-card-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["existing", "newFrame"],
              frames: [
                { kind: "changed" as const, name: "existing" },
                { kind: "added" as const, name: "newFrame" },
              ],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["existing", "newFrame"],
              frames: [
                { kind: "changed" as const, name: "existing" },
                { kind: "added" as const, name: "newFrame" },
              ],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }

    const html = renderToStaticMarkup(<StudioChangesWorkspace changes={changes} manifest={manifest} />)

    expect(html).toContain('data-runelight-studio-changes-resolving-notice="true"')
    expect(html).toContain('data-runelight-studio-change-preview-prewarm="true"')
    expect(html).toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).toContain('data-runelight-studio-change-pane="current"')
    expect(html).not.toContain('data-runelight-studio-change-pane="before"')
    expect(html).not.toContain('data-runelight-studio-change-preview-empty="before"')
    expect(html).toContain('data-runelight-frame-tile="newFrame"')
    expect(html).toContain('data-runelight-frame-change-state="added"')
  })

  it("keeps changed frames hidden until all changed frames in the impact pair have rendered snapshots", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const baseComponent = baseFile.components[0]
    const component = {
      ...baseComponent,
      frames: [
        { kind: "scope" as const, name: "default" },
        { kind: "scope" as const, name: "invitePanel" },
      ],
    } satisfies StudioManifestComponent
    const file = { ...baseFile, components: [component] }
    const manifest = { ...baseManifest, files: [file] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["default", "invitePanel"],
              frames: [
                { kind: "changed" as const, name: "default" },
                { kind: "changed" as const, name: "invitePanel" },
              ],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["default", "invitePanel"],
              frames: [
                { kind: "changed" as const, name: "default" },
                { kind: "changed" as const, name: "invitePanel" },
              ],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }
    const partialFrameStates = {
      [previewSessionId(baselineComponent, "default", "tablet")]: readyRenderedPreviewFrameState(
        baselineComponent,
        "default",
        "before-default",
      ),
      [previewSessionId(component, "default", "tablet")]: readyRenderedPreviewFrameState(
        component,
        "default",
        "after-default",
      ),
    }

    const partialHtml = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={partialFrameStates} manifest={manifest} />,
    )

    expect(partialHtml).toContain('data-runelight-studio-changes-resolving="true"')
    expect(partialHtml).toContain('data-runelight-studio-change-preview-prewarm="true"')
    expect(partialHtml).not.toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')

    const completeFrameStates = {
      ...partialFrameStates,
      [previewSessionId(baselineComponent, "invitePanel", "tablet")]: readyRenderedPreviewFrameState(
        baselineComponent,
        "invitePanel",
        "same-invite",
      ),
      [previewSessionId(component, "invitePanel", "tablet")]: readyRenderedPreviewFrameState(
        component,
        "invitePanel",
        "same-invite",
      ),
    }

    const completeHtml = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={completeFrameStates} manifest={manifest} />,
    )

    expect(completeHtml).toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(completeHtml).toContain('data-runelight-frame-tile="default"')
    expect(completeHtml).not.toContain('data-runelight-frame-tile="invitePanel"')
  })

  it("hides changed frames whose rendered snapshots match", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const baseComponent = baseFile.components[0]
    const component = {
      ...baseComponent,
      frames: [
        { kind: "scope" as const, name: "default" },
        { kind: "scope" as const, name: "loud" },
        { kind: "scope" as const, name: "quiet" },
      ],
    } satisfies StudioManifestComponent
    const file = { ...baseFile, components: [component] }
    const manifest = { ...baseManifest, files: [file] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["default", "loud", "quiet"],
              frames: [
                { kind: "changed" as const, name: "default" },
                { kind: "changed" as const, name: "loud" },
                { kind: "unchanged" as const, name: "quiet" },
              ],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["default", "loud", "quiet"],
              frames: [
                { kind: "changed" as const, name: "default" },
                { kind: "changed" as const, name: "loud" },
                { kind: "unchanged" as const, name: "quiet" },
              ],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }
    const frameStates = {
      [previewSessionId(baselineComponent, "default", "tablet")]: readyRenderedPreviewFrameState(
        baselineComponent,
        "default",
        "same-render",
      ),
      [previewSessionId(component, "default", "tablet")]: readyRenderedPreviewFrameState(
        component,
        "default",
        "same-render",
      ),
      [previewSessionId(baselineComponent, "loud", "tablet")]: readyRenderedPreviewFrameState(
        baselineComponent,
        "loud",
        "before-render",
      ),
      [previewSessionId(component, "loud", "tablet")]: readyRenderedPreviewFrameState(
        component,
        "loud",
        "current-render",
      ),
    }

    const html = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={frameStates} manifest={manifest} />,
    )

    expect(html).toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).toContain('data-runelight-frame-tile="loud"')
    expect(html).not.toContain('data-runelight-frame-tile="default"')
    expect(html).not.toContain('data-runelight-frame-tile="quiet"')
    expect(html).not.toContain(">default<")
    expect(html).not.toContain(">quiet<")
  })

  it("matches modified rendered snapshots by visual root instead of impact order", () => {
    const baseManifest = buildLargeStudioManifest(2)
    const firstComponent = baseManifest.files[0].components[0]
    const secondComponent = baseManifest.files[1].components[0]
    const firstFile = { ...baseManifest.files[0], components: [firstComponent] }
    const secondFile = { ...baseManifest.files[1], components: [secondComponent] }
    const manifest = { ...baseManifest, files: [firstFile, secondFile] }
    const baselineFirstComponent = {
      ...firstComponent,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-000-source",
    } satisfies StudioManifestComponent
    const baselineSecondComponent = {
      ...secondComponent,
      coordinate: ".runelight/baselines/HEAD/src/Card001.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card001.g.tsx",
      sourceHash: "baseline-card-001-source",
    } satisfies StudioManifestComponent
    const baselineFirstFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-000-source",
      components: [baselineFirstComponent],
      diagnostics: [],
    }
    const baselineSecondFile = {
      path: ".runelight/baselines/HEAD/src/Card001.g.tsx",
      sourceHash: "baseline-card-001-source",
      components: [baselineSecondComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFirstFile, baselineSecondFile],
    }
    const currentImpact = (component: StudioManifestComponent) => ({
      frameNames: ["default"],
      frames: [{ kind: "changed" as const, name: "default" }],
      rootComponentName: component.componentName,
      rootCoordinate: component.coordinate,
      surface: "frames" as const,
      path: [{ componentName: component.componentName, coordinate: component.coordinate }],
    })
    const baselineImpact = (component: StudioManifestComponent) => ({
      frameNames: ["default"],
      frames: [{ kind: "changed" as const, name: "default" }],
      rootComponentName: component.componentName,
      rootCoordinate: component.coordinate,
      surface: "frames" as const,
      path: [{ componentName: component.componentName, coordinate: component.coordinate }],
    })
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: firstFile.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: firstFile,
          baselineFile: baselineFirstFile,
          baselineImpacts: [
            baselineImpact(baselineSecondComponent),
            baselineImpact(baselineFirstComponent),
          ],
          impacts: [
            currentImpact(firstComponent),
            currentImpact(secondComponent),
          ],
        },
      ],
    }
    const frameStates = {
      [previewSessionId(baselineFirstComponent, "default", "tablet")]: readyRenderedPreviewFrameState(
        baselineFirstComponent,
        "default",
        "first-same-render",
      ),
      [previewSessionId(firstComponent, "default", "tablet")]: readyRenderedPreviewFrameState(
        firstComponent,
        "default",
        "first-same-render",
      ),
      [previewSessionId(baselineSecondComponent, "default", "tablet")]: readyRenderedPreviewFrameState(
        baselineSecondComponent,
        "default",
        "second-before-render",
      ),
      [previewSessionId(secondComponent, "default", "tablet")]: readyRenderedPreviewFrameState(
        secondComponent,
        "default",
        "second-current-render",
      ),
    }

    const html = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={frameStates} manifest={manifest} />,
    )

    expect(html).not.toContain('data-runelight-card-coordinate="src/Card000.g.tsx#default"')
    expect(html).not.toContain('data-runelight-card-coordinate=".runelight/baselines/HEAD/src/Card000.g.tsx#default"')
    expect(html).toContain('data-runelight-card-coordinate="src/Card001.g.tsx#default"')
    expect(html).toContain('data-runelight-card-coordinate=".runelight/baselines/HEAD/src/Card001.g.tsx#default"')
  })

  it("does not show baseline context for a modified root when rendered filtering leaves only added frames", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const baseComponent = baseFile.components[0]
    const component = {
      ...baseComponent,
      frames: [
        { kind: "scope" as const, name: "existing" },
        { kind: "scope" as const, name: "newFrame" },
      ],
    } satisfies StudioManifestComponent
    const file = { ...baseFile, components: [component] }
    const manifest = { ...baseManifest, files: [file] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      frames: [{ kind: "scope" as const, name: "existing" }],
      sourceHash: "baseline-card-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: ["existing", "newFrame"],
              frames: [
                { kind: "changed" as const, name: "existing" },
                { kind: "added" as const, name: "newFrame" },
              ],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: ["existing", "newFrame"],
              frames: [
                { kind: "changed" as const, name: "existing" },
                { kind: "added" as const, name: "newFrame" },
              ],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }
    const frameStates = {
      [previewSessionId(baselineComponent, "existing", "tablet")]: readyRenderedPreviewFrameState(
        baselineComponent,
        "existing",
        "same-render",
      ),
      [previewSessionId(component, "existing", "tablet")]: readyRenderedPreviewFrameState(
        component,
        "existing",
        "same-render",
      ),
    }

    const html = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={frameStates} manifest={manifest} />,
    )

    expect(html).toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).toContain('data-runelight-studio-change-pane="current"')
    expect(html).not.toContain('data-runelight-studio-change-pane="before"')
    expect(html).not.toContain('data-runelight-studio-change-preview-empty="before"')
    expect(html).not.toContain('data-runelight-card-coordinate=".runelight/baselines/HEAD/src/Card000.g.tsx#default"')
    expect(html).not.toContain('data-runelight-frame-tile="existing"')
    expect(html).toContain('data-runelight-frame-tile="newFrame"')
    expect(html).toContain('data-runelight-frame-change-state="added"')
  })

  it("keeps only added frames when matching changed snapshots resolve inside a modified root", () => {
    const baseManifest = buildLargeStudioManifest(1)
    const baseFile = baseManifest.files[0]
    const baseComponent = baseFile.components[0]
    const component = {
      ...baseComponent,
      componentName: "ActivityPageClient",
      frames: [
        { kind: "scope" as const, name: "invitePanel" },
        { kind: "scope" as const, name: "midAutumnNormal" },
        { kind: "scope" as const, name: "midAutumnInvitePanel" },
      ],
    } satisfies StudioManifestComponent
    const file = { ...baseFile, components: [component] }
    const manifest = { ...baseManifest, files: [file] }
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      frames: [{ kind: "scope" as const, name: "invitePanel" }],
      sourceHash: "baseline-activity-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-activity-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const baselineManifest = {
      ...manifest,
      files: [baselineFile],
    }
    const frames = [
      { kind: "changed" as const, name: "invitePanel" },
      { kind: "added" as const, name: "midAutumnNormal" },
      { kind: "added" as const, name: "midAutumnInvitePanel" },
    ]
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: frames.map((frame) => frame.name),
              frames,
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: frames.map((frame) => frame.name),
              frames,
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }
    const frameStates = {
      [previewSessionId(baselineComponent, "invitePanel", "tablet")]: {
        ...readyPreviewFrameState(previewSessionId(baselineComponent, "invitePanel", "tablet"), baselineComponent.coordinate),
        renderedSnapshot: renderedSnapshot("same-visual-layout", [
          {
            path: "body/div[4]/main[1]",
            rect: { x: 160, y: 0, width: 448, height: 1024 },
            styles: {
              color: "rgb(23, 32, 51)",
            },
            tag: "main",
          },
        ]),
      },
      [previewSessionId(component, "invitePanel", "tablet")]: {
        ...readyPreviewFrameState(previewSessionId(component, "invitePanel", "tablet"), component.coordinate),
        renderedSnapshot: renderedSnapshot("same-visual-layout", [
          {
            path: "body/div[4]/main[1]",
            rect: { x: 160, y: 0, width: 448, height: 1024 },
            styles: {
              color: "rgb(23, 32, 51)",
            },
            tag: "main",
          },
        ]),
      },
    }

    const html = renderToStaticMarkup(
      <StudioChangesWorkspace changes={changes} frameStates={frameStates} manifest={manifest} />,
    )

    expect(html).toContain('data-runelight-studio-change-item="src/Card000.g.tsx"')
    expect(html).toContain('data-runelight-studio-change-pane="current"')
    expect(html).not.toContain('data-runelight-studio-change-pane="before"')
    expect(html).not.toContain('data-runelight-studio-change-preview-empty="before"')
    expect(html).not.toContain('data-runelight-frame-tile="invitePanel"')
    expect(html).toContain('data-runelight-frame-tile="midAutumnNormal"')
    expect(html).toContain('data-runelight-frame-tile="midAutumnInvitePanel"')
    expect(html).toContain('data-runelight-frame-change-state="added"')
  })

  it("keeps frames as the default Studio tab when no workspace changes are present", () => {
    const manifest = buildLargeStudioManifest(1)
    const html = renderToStaticMarkup(<StudioShell changes={{ version: 1, base: { kind: "none" }, items: [] }} manifest={manifest} />)

    expect(html).toContain('data-runelight-canvas-viewport="true"')
    expect(html).not.toContain('data-runelight-studio-changes-workspace="true"')
  })

  it("names the Studio package's outer visual root as Studio", () => {
    const manifest = buildStudioManifest({ cwd: studioRoot, sourceRoot: "src" })
    const roots = rootStudioManifestComponents(manifest)

    expect(roots.map((component) => component.componentName)).toContain("Studio")
    expect(roots.map((component) => component.componentName)).not.toContain("ViewportPresetTabs")
  })

  it("renders the canvas without the component index sidebar", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(html).not.toContain("Runelight component index")
    expect(html).not.toContain("data-runelight-sidebar-preview-coordinate")
    expect(html).toContain('data-runelight-viewport-preset="tablet"')
  })

  it("renders design frames as auto-packed component cards with the shared preview pool", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
      design: {
        frames: [
          {
            id: "src/UserCard.g.tsx#default:loading",
            entry: "src/UserCard.g.tsx#default",
            filePath: "src/UserCard.g.tsx",
            title: "UserCard",
            exportName: "default",
            frameName: "loading",
          },
          {
            id: "src/UserCard.g.tsx#default:ready",
            entry: "src/UserCard.g.tsx#default",
            filePath: "src/UserCard.g.tsx",
            title: "UserCard",
            exportName: "default",
            frameName: "ready",
          },
        ],
      },
    })

    const html = renderToStaticMarkup(
      <StudioShell
        manifest={manifest}
        urlHash="#/drafts"
        urlSearch="rootProviderVariant=ThemeProvider:dark&debug=pool"
      />,
    )

    expect(html).toContain('data-runelight-studio-design-workspace="true"')
    expect(html).toContain("transform:translate(40px, 40px) scale(0.6)")
    expect(html).toContain('data-runelight-studio-design-layout-width="1600"')
    expect(html).toContain('data-runelight-card-coordinate="src/UserCard.g.tsx#default"')
    expect(html).toContain('data-runelight-frame-tile="loading"')
    expect(html).toContain('data-runelight-frame-tile="ready"')
    expect(html).toContain('data-runelight-preview-iframe-pool="true"')
    expect(html).toContain('data-runelight-preview-iframe-pool-stats="true"')
    expect(html).not.toContain("design frames")
    expect(html).not.toContain("data-runelight-root-env-controls")
    expect(html).not.toContain('data-runelight-frame-provider-variant-state="mismatch"')
    expect(html).not.toContain("data-runelight-studio-design-frame-preview")
  })

  it("ignores legacy view query params when choosing the initial Studio route", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
      design: {
        frames: [
          {
            id: "src/UserCard.g.tsx#default:ready",
            entry: "src/UserCard.g.tsx#default",
            filePath: "src/UserCard.g.tsx",
            title: "UserCard",
            exportName: "default",
            frameName: "ready",
          },
        ],
      },
    })

    const html = renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="view=drafts" />)

    expect(html).not.toContain('data-runelight-studio-design-workspace="true"')
    expect(html).toContain('data-runelight-canvas-viewport="true"')
  })

  it("packs design cards to measured iframe width without the default component card minimum", () => {
    const firstComponent = {
      coordinate: "src/app/runelight/design/FirstPhoneDraft.g.tsx#default",
      filePath: "src/app/runelight/design/FirstPhoneDraft.g.tsx",
      sourceHash: "first-phone-draft-source",
      exportName: "default",
      componentName: "FirstPhoneDraft",
      mode: "pure",
      frames: [{ kind: "pure" as const, name: "live" }],
      providers: {},
      diagnostics: [],
    } satisfies StudioManifestComponent
    const secondComponent = {
      coordinate: "src/app/runelight/design/SecondPhoneDraft.g.tsx#default",
      filePath: "src/app/runelight/design/SecondPhoneDraft.g.tsx",
      sourceHash: "second-phone-draft-source",
      exportName: "default",
      componentName: "SecondPhoneDraft",
      mode: "pure",
      frames: [{ kind: "pure" as const, name: "live" }],
      providers: {},
      diagnostics: [],
    } satisfies StudioManifestComponent
    const manifest = {
      version: 1,
      routes: {
        changes: "/runelight/studio/changes",
        events: "/runelight/studio/events",
        manifest: "/runelight/studio/manifest",
        preview: "/runelight",
        studio: "/runelight/studio",
      },
      design: {
        frames: [
          {
            id: `${firstComponent.coordinate}:live`,
            entry: firstComponent.coordinate,
            filePath: firstComponent.filePath,
            title: firstComponent.componentName,
            exportName: firstComponent.exportName,
            frameName: "live",
          },
          {
            id: `${secondComponent.coordinate}:live`,
            entry: secondComponent.coordinate,
            filePath: secondComponent.filePath,
            title: secondComponent.componentName,
            exportName: secondComponent.exportName,
            frameName: "live",
          },
        ],
      },
      diagnostics: [],
      files: [
        { path: firstComponent.filePath, sourceHash: "first-phone-draft-source", components: [firstComponent], diagnostics: [] },
        { path: secondComponent.filePath, sourceHash: "second-phone-draft-source", components: [secondComponent], diagnostics: [] },
      ],
    } satisfies StudioManifest
    const firstSessionId = previewSessionId(firstComponent, "live", "tablet")
    const secondSessionId = previewSessionId(secondComponent, "live", "tablet")
    const phoneDraftRect = { x: 0, y: 0, width: 390, height: 1024 }
    const frameStates = {
      [firstSessionId]: readyPreviewFrameState(firstSessionId, firstComponent.coordinate, phoneDraftRect),
      [secondSessionId]: readyPreviewFrameState(secondSessionId, secondComponent.coordinate, phoneDraftRect),
    }

    const html = renderToStaticMarkup(<StudioDesignWorkspace frameStates={frameStates} manifest={manifest} />)

    expect(designCardHtml(html, firstComponent.coordinate)).toContain("left:96px")
    expect(designCardHtml(html, firstComponent.coordinate)).toContain("width:176px")
    expect(designCardHtml(html, secondComponent.coordinate)).toContain("left:286px")
    expect(designCardHtml(html, secondComponent.coordinate)).toContain("width:176px")
    expect(cardHtml(html, firstComponent.coordinate)).toContain("width:176px")
    expect(frameGridHtml(html, firstComponent.coordinate)).toContain("width:176px")
  })

  it("derives design preview targets from design component cards", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
      design: {
        frames: [
          {
            id: "src/UserCard.g.tsx#default:loading",
            entry: "src/UserCard.g.tsx#default",
            filePath: "src/UserCard.g.tsx",
            title: "UserCard",
            exportName: "default",
            frameName: "loading",
          },
        ],
      },
    })

    expect(studioDesignManifestComponents(manifest).map((component) => component.coordinate)).toEqual([
      "src/UserCard.g.tsx#default",
    ])
    expect(currentStudioDesignPreviewTargets(manifest, "tablet").map((target) => target.sessionId)).toEqual([
      "src/UserCard.g.tsx#default:loading",
      "src/UserCard.g.tsx#default:ready",
    ])
  })

  it("derives changes preview targets from changed components", () => {
    const manifest = buildLargeStudioManifest(2)
    const root = manifest.files[0].components[0]
    const changed = manifest.files[1]
    const baselineRoot = {
      ...root,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-root-source",
    }
    const baselineChanged = {
      ...changed.components[0],
      coordinate: ".runelight/baselines/HEAD/src/Card001.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card001.g.tsx",
      sourceHash: "baseline-changed-source",
    }
    const baselineManifest = {
      ...manifest,
      files: [
        {
          path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
          sourceHash: "baseline-root-source",
          components: [baselineRoot],
          diagnostics: [],
        },
        {
          path: ".runelight/baselines/HEAD/src/Card001.g.tsx",
          sourceHash: "baseline-changed-source",
          components: [baselineChanged],
          diagnostics: [],
        },
      ],
    }
    const changes = {
      version: 1 as const,
      base: { kind: "git" as const, baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD", manifest: baselineManifest },
      items: [
        {
          filePath: changed.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: changed,
          baselineFile: baselineManifest.files[1],
          baselineImpacts: [
            {
              frameNames: baselineChanged.frames.map((frame) => frame.name),
              rootComponentName: baselineChanged.componentName,
              rootCoordinate: baselineChanged.coordinate,
              surface: "frames" as const,
              path: [
                { componentName: baselineRoot.componentName, coordinate: baselineRoot.coordinate },
                { componentName: baselineChanged.componentName, coordinate: baselineChanged.coordinate },
              ],
            },
          ],
          impacts: [
            {
              frameNames: changed.components[0].frames.map((frame) => frame.name),
              rootComponentName: changed.components[0].componentName,
              rootCoordinate: changed.components[0].coordinate,
              surface: "frames" as const,
              path: [
                { componentName: root.componentName, coordinate: root.coordinate },
                { componentName: changed.components[0].componentName, coordinate: changed.components[0].coordinate },
              ],
            },
          ],
        },
      ],
    }

    expect(currentStudioChangesPreviewTargets(manifest, changes, "tablet").map((target) => target.sessionId)).toEqual([
      ".runelight/baselines/HEAD/src/Card001.g.tsx#default:default",
      "src/Card001.g.tsx#default:default",
    ])
  })

  it("renders the canvas without top chrome or redundant card metadata", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(html).not.toContain("Drag to pan")
    expect(html).not.toContain("data-runelight-canvas-control")
    expect(html).not.toContain(">Root<")
    expect(html).not.toContain(">Level 2<")
    expect(html).not.toContain(">2 components<")
    expect(html).toContain('data-runelight-frame-tile="ready"')
    expect(html).toContain("height:100%")
    expect(html).toContain(">NamedBadge<")
    expect(html).toContain(">DefaultBadge<")
  })

  it("computes a clamped screen-stable chrome scale for the transformed canvas surface", () => {
    expect(studioCanvasScreenStableChromeHostStyle({ scale: 0.5 })).toMatchObject({
      "--runelight-studio-screen-stable-chrome-scale": "1.333",
      "--runelight-studio-screen-stable-chrome-border-width": "1.6px",
      "--runelight-studio-screen-stable-chrome-content-size": "75%",
    })
  })

  it("keeps screen-stable chrome variables out of the React canvas surface render", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const workspace = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")
    const html = renderToStaticMarkup(
      <StudioWorkspaceView
        canvas={{ x: 40, y: 40, scale: 0.5 }}
        manifest={manifest}
        workspace={workspace}
      />,
    )

    const surface = canvasSurfaceHtml(html)
    expect(surface).not.toContain("--runelight-studio-screen-stable-chrome-scale")
    expect(surface).not.toContain("--runelight-studio-screen-stable-chrome-border-width")
    expect(surface).not.toContain("--runelight-studio-screen-stable-chrome-content-size")
  })

  it("renders card title and frame labels as screen-stable canvas chrome", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <ComponentCard
        component={component}
        manifest={manifest}
        selected
        selectedFrameName="loading"
        viewportPreset="tablet"
      />,
    )

    expect(html).toContain('data-runelight-canvas-screen-stable-chrome="card-title"')
    expect(html).toContain('data-runelight-canvas-screen-stable-chrome="frame-label"')
    expect(html).toContain("height:23px")
    expect(html).toContain("height:18px")
    expect(html).toContain("transform:scale(var(--runelight-studio-screen-stable-chrome-scale, 1)) translateY(-17px)")
    expect(html).toContain("transform:scale(var(--runelight-studio-screen-stable-chrome-scale, 1)) translateY(5px)")
    expect(html).toContain("width:var(--runelight-studio-screen-stable-chrome-content-size, 100%)")
  })

  it("contains trackpad browser gestures inside the canvas viewport", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="component:src/UserCard.g.tsx#default" />)

    expect(html).toContain('data-runelight-canvas-viewport="true"')
    expect(html).toContain("rgba(255,255,255,0.12)")
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

  it("clamps canvas zoom out to the studio minimum scale", () => {
    const next = applyStudioCanvasWheel(
      { x: 40, y: 40, scale: 0.4 },
      {
        clientX: 200,
        clientY: 160,
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 1000,
        metaKey: false,
        viewportLeft: 0,
        viewportTop: 0,
      },
    )

    expect(next.scale).toBe(studioCanvasMinScale)
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

  it("preserves a viewport anchor by moving the canvas by the screen-space delta", () => {
    expect(
      preserveStudioCanvasViewportAnchor(
        { x: 40, y: -20, scale: 0.75 },
        {
          currentViewportPoint: { x: 460, y: 260 },
          targetViewportPoint: { x: 520, y: 210 },
        },
      ),
    ).toEqual({ x: 100, y: -70, scale: 0.75 })
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

  it("packs component frame previews into a square-leaning grid", () => {
    expect(
      computeStudioFrameGridLayout({
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

    const singleTabletFrame = computeStudioFrameGridLayout({ items: [{ width: 768, height: 1024 }], maxSide: 760 })

    expect(singleTabletFrame.columns).toBe(1)
    expect(singleTabletFrame.height).toBeLessThanOrEqual(760)
    expect(singleTabletFrame.previewScale).toBeLessThan(1)

    const fixedScaleWrapped = computeStudioFrameGridLayout({
      items: [
        { width: 768, height: 1024 },
        { width: 768, height: 1024 },
        { width: 768, height: 1024 },
        { width: 768, height: 1024 },
      ],
      maxSide: 720,
      maxWidth: 720,
      previewScale: 0.45,
    })

    expect(fixedScaleWrapped.columns).toBe(2)
    expect(fixedScaleWrapped.width).toBeLessThanOrEqual(720)
  })

  it("uses the fixed preview scale for every component card in the canvas", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const scales = frameGridPreviewScales(html)

    expect(scales).toHaveLength(2)
    expect(new Set(scales).size).toBe(1)
    expect(Number(scales[0])).toBe(studioCanvasFixedFramePreviewScale)
  })

  it("uses known component bounds as the layout fallback for pending sibling frames", () => {
    const component = {
      coordinate: "src/Checkout.g.tsx#default",
      filePath: "src/Checkout.g.tsx",
      sourceHash: "checkout-source",
      exportName: "default",
      componentName: "Checkout",
      mode: "scope",
      frames: [
        { kind: "scope" as const, name: "ready" },
        { kind: "scope" as const, name: "pending" },
      ],
      providers: {},
      diagnostics: [],
    } satisfies StudioManifestComponent
    const manifest = {
      version: 1 as const,
      routes: {
        preview: "/runelight",
        studio: "/runelight/studio",
        manifest: "/runelight/studio/manifest",
      },
      files: [{ path: component.filePath, sourceHash: component.sourceHash, components: [component], diagnostics: [] }],
      diagnostics: [],
    } satisfies StudioManifest
    const html = renderToStaticMarkup(
      <ComponentCard
        component={component}
        framePreviewScale={studioCanvasFixedFramePreviewScale}
        frameStatesByName={{
          ready: readyPreviewFrameState(
            previewSessionId(component, "ready", "tablet"),
            component.coordinate,
            { x: 160, y: 0, width: 448, height: 240 },
          ),
        }}
        manifest={manifest}
        selected={false}
        selectedFrameName="ready"
        viewportPreset="tablet"
      />,
    )

    expect(framePreviewFrameHtml(html, "ready")).toContain("width:202px")
    expect(framePreviewFrameHtml(html, "pending")).toContain("width:202px")
    expect(framePreviewFrameHtml(html, "pending")).not.toContain("width:346px")
  })

  it("does not use the viewport size as the first visible layout for frames without measured bounds", () => {
    const component = {
      coordinate: "src/Profile.g.tsx#default",
      filePath: "src/Profile.g.tsx",
      sourceHash: "profile-source",
      exportName: "default",
      componentName: "Profile",
      mode: "scope",
      frames: [{ kind: "scope" as const, name: "loading" }],
      providers: {},
      diagnostics: [],
    } satisfies StudioManifestComponent
    const manifest = {
      version: 1 as const,
      routes: {
        preview: "/runelight",
        studio: "/runelight/studio",
        manifest: "/runelight/studio/manifest",
      },
      files: [{ path: component.filePath, sourceHash: component.sourceHash, components: [component], diagnostics: [] }],
      diagnostics: [],
    } satisfies StudioManifest

    const html = renderToStaticMarkup(
      <ComponentCard
        component={component}
        framePreviewScale={studioCanvasFixedFramePreviewScale}
        manifest={manifest}
        selected={false}
        selectedFrameName="loading"
        viewportPreset="tablet"
      />,
    )

    expect(framePreviewFrameHtml(html, "loading")).toContain("width:126px")
    expect(framePreviewFrameHtml(html, "loading")).not.toContain("width:346px")
    expect(previewFrameHtml(html, previewSessionId(component, "loading", "tablet"))).toContain(
      'data-runelight-preview-layout-pending="true"',
    )
  })

  it("packs measured canvas cards by component order instead of preserving stale absolute positions", () => {
    const measurement = measuredStudioColumnLayoutPackedByComponentOrder({
      componentCoordinates: ["src/Large.g.tsx#Large", "src/Short.g.tsx#Short", "src/Next.g.tsx#Next"],
      fallbackMeasurement: {
        cardRectsByCoordinate: {
          "src/Large.g.tsx#Large": { bottom: 380, left: 0, right: 280, top: 0 },
          "src/Short.g.tsx#Short": { bottom: 770, left: 0, right: 280, top: 390 },
          "src/Next.g.tsx#Next": { bottom: 1160, left: 0, right: 280, top: 780 },
        },
        height: 1160,
        previewFrameRectsBySessionId: {
          "src/Large.g.tsx#Large:default@desktop": { bottom: 360, left: 0, right: 240, top: 30 },
          "src/Short.g.tsx#Short:default@desktop": { bottom: 740, left: 0, right: 240, top: 420 },
          "src/Next.g.tsx#Next:default@desktop": { bottom: 850, left: 0, right: 240, top: 810 },
        },
      },
      measuredCardsByCoordinate: {
        "src/Large.g.tsx#Large": {
          height: 380,
          previewFrameRectsBySessionId: {
            "src/Large.g.tsx#Large:default@desktop": { bottom: 360, left: 0, right: 240, top: 30 },
          },
          width: 280,
        },
        "src/Short.g.tsx#Short": {
          height: 120,
          previewFrameRectsBySessionId: {
            "src/Short.g.tsx#Short:default@desktop": { bottom: 100, left: 0, right: 240, top: 30 },
          },
          width: 280,
        },
      },
      previewFrameSessionIdsByCoordinate: {
        "src/Large.g.tsx#Large": ["src/Large.g.tsx#Large:default@desktop"],
        "src/Short.g.tsx#Short": ["src/Short.g.tsx#Short:default@desktop"],
        "src/Next.g.tsx#Next": ["src/Next.g.tsx#Next:default@desktop"],
      },
    })

    expect(measurement.cardRectsByCoordinate["src/Short.g.tsx#Short"]).toMatchObject({ bottom: 505, top: 385 })
    expect(measurement.cardRectsByCoordinate["src/Next.g.tsx#Next"]).toMatchObject({ bottom: 890, top: 510 })
    expect(measurement.height).toBe(890)
    expect(measurement.previewFrameRectsBySessionId?.["src/Short.g.tsx#Short:default@desktop"]).toMatchObject({
      bottom: 485,
      top: 415,
    })
    expect(measurement.previewFrameRectsBySessionId?.["src/Next.g.tsx#Next:default@desktop"]).toMatchObject({
      bottom: 580,
      top: 540,
    })
  })

  it("stabilizes sub-pixel measured card noise before packing canvas cards", () => {
    const packMeasurement = (height: number) =>
      measuredStudioColumnLayoutPackedByComponentOrder({
        componentCoordinates: ["src/Measured.g.tsx#Measured", "src/Next.g.tsx#Next"],
        fallbackMeasurement: {
          cardRectsByCoordinate: {
            "src/Measured.g.tsx#Measured": { bottom: 100, left: 0, right: 280, top: 0 },
            "src/Next.g.tsx#Next": { bottom: 155, left: 0, right: 280, top: 105 },
          },
          height: 155,
          previewFrameRectsBySessionId: {},
        },
        measuredCardsByCoordinate: {
          "src/Measured.g.tsx#Measured": {
            height,
            width: 280.004,
          },
        },
        previewFrameSessionIdsByCoordinate: {},
      })

    expect(packMeasurement(100.001)).toEqual(packMeasurement(100.004))
    expect(packMeasurement(100.004).cardRectsByCoordinate["src/Next.g.tsx#Next"]).toMatchObject({
      bottom: 155,
      top: 105,
    })
  })

  it("stabilizes sub-pixel local preview frame rect noise before measuring canvas cards", () => {
    const originRect = { bottom: 900, left: 88.743, right: 720, top: -8808.545 } as DOMRect
    const localRect = (top: number) =>
      domRectToLocalStudioCanvasScreenRect(
        { bottom: top + 90.001, left: 120.003, right: 320.003, top } as DOMRect,
        originRect,
        0.444,
      )

    expect(localRect(682.421)).toEqual(localRect(682.4212))
  })

  it("uses measured preview frame rects for viewport visibility near the screen edge", () => {
    const sessionId = "src/Measured.g.tsx#Measured:bottom@desktop"
    const measurement = measuredStudioColumnLayoutPackedByComponentOrder({
      componentCoordinates: ["src/Measured.g.tsx#Measured"],
      fallbackMeasurement: {
        cardRectsByCoordinate: {
          "src/Measured.g.tsx#Measured": { bottom: 500, left: 0, right: 280, top: 0 },
        },
        height: 500,
        previewFrameRectsBySessionId: {
          [sessionId]: { bottom: 1200, left: 0, right: 240, top: 1000 },
        },
      },
      measuredCardsByCoordinate: {
        "src/Measured.g.tsx#Measured": {
          height: 500,
          previewFrameRectsBySessionId: {
            [sessionId]: { bottom: 887.01, left: 0, right: 240, top: 682.42 },
          },
          width: 280,
        },
      },
      previewFrameSessionIdsByCoordinate: {
        "src/Measured.g.tsx#Measured": [sessionId],
      },
    })
    const items = studioPreviewVisibilityItems(
      {
        columns: [
          {
            components: [
              {
                frames: [{ name: "bottom" }],
                coordinate: "src/Measured.g.tsx#Measured",
              } as any,
            ],
          },
        ],
        selectedCoordinatePath: [],
        selectedViewportPresetByCoordinate: {},
      } as any,
      "desktop",
      { 0: { x: 0, y: 0 } },
      { 0: measurement },
      {
        canvas: { x: 0, y: 0, scale: 1 },
        viewport: { bottom: 900, left: 0, right: 1440, top: 0 },
      },
    )

    expect(items).toEqual([{ rect: { bottom: 887.01, left: 0, right: 240, top: 682.42 }, sessionIds: [sessionId] }])
  })

  it("uses normalized rendered component bounds as the component selection target", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).not.toContain('data-runelight-card-select-target="card"')
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("left:0")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("top:0")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("width:100px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("height:32px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).not.toContain("<button")
  })

  it("clips component hit targets to the preview viewport", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
        selectedFrameName="loading"
        viewportPreset="phone"
      />,
    )

    expect(selectionOutlineHtml(html)).toBe("")
    expect(boundsHitTargetHtml(html)).toContain("width:390px")
    expect(boundsHitTargetHtml(html)).toContain("pointer-events:none")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("width:390px")
    expect(previewFrameTagHtml(html, "src/UserCard.g.tsx#default:loading@phone")).not.toContain("content-visibility:auto")
    expect(previewFrameTagHtml(html, "src/UserCard.g.tsx#default:loading@phone")).not.toContain("contain:layout paint style")
  })

  it("highlights the selected component frame collection as one target", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <ComponentCard
        frameStatesByName={{
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
        selectedFrameName="loading"
        viewportPreset="tablet"
      />,
    )

    const selectedGrid = frameGridHtml(html, "src/UserCard.g.tsx#default")
    expect(selectedGrid).toContain('data-runelight-frame-grid-selected="true"')
    expect(selectedGrid).not.toContain("outline:")
    expect(html).toContain('data-runelight-card-title-selected="true"')
    expect(html).toContain("color:#e68a7d")
    expect(selectedGrid).not.toContain("box-shadow")
    expect(selectedGrid).not.toContain("border-radius")
    expect(selectionOutlineCount(html)).toBe(0)
    expect(html).not.toContain("data-runelight-frame-tile-selected")
  })

  it("does not render component-local provider variant controls on cards", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <ComponentCard
        component={component}
        manifest={manifest}
        providerVariantContext={{ ThemeProvider: "light" }}
        selected
        selectedFrameName="loading"
        viewportPreset="tablet"
      />,
    )

    expect(html).not.toContain("data-runelight-env-controls")
    expect(html).not.toContain("data-runelight-env-axis")
    expect(html).not.toContain("data-runelight-env-variant")
    expect(html).not.toContain("data-runelight-frame-tile-selected")
  })

  it("dims provider variant mismatches while keeping every frame visible", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <ComponentCard
        component={component}
        manifest={manifest}
        providerVariantComponent={component}
        providerVariantContext={{ ThemeProvider: "dark" }}
        selected
        selectedFrameName="ready"
        viewportPreset="tablet"
      />,
    )

    expect(frameTileHtml(html, "ready")).toContain('data-runelight-frame-tile="ready"')
    expect(frameTileHtml(html, "ready")).toContain('data-runelight-frame-provider-variant-state="match"')
    expect(frameTileHtml(html, "loading")).toContain('data-runelight-frame-tile="loading"')
    expect(frameTileHtml(html, "loading")).toContain('data-runelight-frame-provider-variant-state="mismatch"')
    expect(html).toContain('data-runelight-frame-provider-variant-border="loading"')
    expect(html).toContain("filter:grayscale(0.9)")
    expect(html).toContain("opacity:0.42")
    expect(html).toContain("border:var(--runelight-studio-screen-stable-chrome-border-width, 1.2px) dashed rgba(136,136,136,0.72)")
    expect(html).toContain("inset:-2px")
    expect(html).not.toContain("data-runelight-env-variant")
  })

  it("dims buffered previews without owning the cropped stripe overlay", () => {
    const html = renderToStaticMarkup(
      <BufferedPreviewIframe
        dimmed
        size={{ height: 1024, width: 768 }}
        slot={{
          previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=loading&chrome=0",
          sessionId: "src/UserCard.g.tsx#default:loading",
          title: "UserCard loading preview",
        }}
      />,
    )

    expect(html).toContain("filter:grayscale(0.9)")
    expect(html).toContain("opacity:0.42")
    expect(html).not.toContain("data-runelight-buffered-preview-dim-overlay")
    expect(html).not.toContain("repeating-linear-gradient")
  })

  it("renders dimmed preview stripes from the clipped frame geometry", () => {
    const sessionId = "src/Icon.g.tsx#default:ready"
    const html = renderToStaticMarkup(
      <LazyPreviewFrame
        data-runelight-preview-session-id="src/Icon.g.tsx#default:ready@phone"
        boundaryRect={{ x: 0, y: 0, width: 96, height: 96 }}
        coordinate="src/Icon.g.tsx#default"
        dimmed
        previewUrl="/runelight?entry=src%2FIcon.g.tsx%23default&frame=ready&chrome=0"
        selectedBoundaryRect={{ x: 0, y: 0, width: 96, height: 96 }}
        shouldLoad
        size={{ width: 390, height: 844 }}
        sessionId={sessionId}
        title="Icon preview"
        viewportPreset="phone"
      />,
    )

    expect(previewClipHtml(html)).toContain("border-radius:6px")
    expect(previewDimOverlayHtml(html, sessionId)).toContain("repeating-linear-gradient")
    expect(previewDimOverlayHtml(html, sessionId)).toContain("border-radius:6px")
    expect(previewDimOverlayHtml(html, sessionId)).toContain("height:96px")
    expect(previewDimOverlayHtml(html, sessionId)).toContain("width:96px")
    expect(previewDimOverlayHtml(html, sessionId)).not.toContain("844px")
  })

  it("keeps preview rendering containment below selection overlays", () => {
    const html = renderToStaticMarkup(
      <LazyPreviewFrame
        data-runelight-preview-session-id="src/Icon.g.tsx#default:ready@phone"
        boundaryRect={{ x: 0, y: 0, width: 96, height: 96 }}
        coordinate="src/Icon.g.tsx#default"
        previewUrl="/runelight?entry=src%2FIcon.g.tsx%23default&frame=ready&chrome=0"
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
    expect(selectionOutlineHtml(html)).toContain('data-runelight-selection-outline="true"')
  })

  it("keeps the preview frame layout and component bounds target aligned", () => {
    const html = renderToStaticMarkup(
      <LazyPreviewFrame
        data-runelight-preview-session-id="src/DataTable.g.tsx#default:ready@desktop"
        boundaryRect={{ x: 0, y: 0, width: 1280, height: 218 }}
        coordinate="src/DataTable.g.tsx#default"
        previewUrl="/runelight?entry=src%2FDataTable.g.tsx%23default&frame=ready&chrome=0"
        selectedBoundaryRect={{ x: 0, y: 0, width: 1280, height: 218 }}
        shouldLoad
        size={{ width: 1280, height: 900 }}
        sessionId="src/DataTable.g.tsx#default:ready@desktop"
        title="DataTable preview"
        viewportPreset="desktop"
      />,
    )

    expect(previewFrameTagHtml(html, "src/DataTable.g.tsx#default:ready@desktop")).toContain("height:218px")
    expect(previewClipHtml(html)).toContain("height:218px")
    expect(boundsHitTargetHtml(html)).toContain("height:218px")
    expect(boundsHitTargetHtml(html)).toContain("top:0")
    expect(selectionOutlineHtml(html)).toContain("height:218px")
    expect(selectionOutlineHtml(html)).toContain("top:0")
  })

  it("uses an empty measured boundary instead of a full viewport fallback for ready empty components", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <ComponentCard
        frameStatesByName={{
          loading: {
            expectedSessionId: "src/UserCard.g.tsx#default:loading@desktop",
            ready: true,
            tree: [{ id: "empty-loading", coordinate: "src/UserCard.g.tsx#default", children: [] }],
          },
          ready: {
            expectedSessionId: "src/UserCard.g.tsx#default:ready@desktop",
            ready: true,
            tree: [{ id: "empty-ready", coordinate: "src/UserCard.g.tsx#default", children: [] }],
          },
        }}
        component={component}
        manifest={manifest}
        selected={false}
        selectedFrameName="loading"
        viewportPreset="desktop"
      />,
    )

    expect(previewFrameTagHtml(html, "src/UserCard.g.tsx#default:loading@desktop")).toContain("height:1px")
    expect(previewFrameTagHtml(html, "src/UserCard.g.tsx#default:ready@desktop")).toContain("height:1px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).not.toContain("height:900px")
  })

  it("shows the per-frame render lifecycle in preview queue debug mode", () => {
    const html = renderToStaticMarkup(
      <LazyPreviewFrame
        data-runelight-preview-session-id="src/Icon.g.tsx#default:ready@phone"
        boundaryRect={{ x: 0, y: 0, width: 96, height: 96 }}
        coordinate="src/Icon.g.tsx#default"
        debugPreviewQueue
        frameState={{
          expectedSessionId: "src/Icon.g.tsx#default:ready",
          ready: false,
        }}
        previewUrl="/runelight?entry=src%2FIcon.g.tsx%23default&frame=ready&chrome=0"
        shouldLoad
        size={{ width: 390, height: 844 }}
        sessionId="src/Icon.g.tsx#default:ready"
        title="Icon preview"
        viewportPreset="phone"
      />,
    )

    expect(html).toContain('data-runelight-preview-render-lifecycle="rendering"')
    expect(html).toContain('data-runelight-preview-render-queued="true"')
    expect(html).toContain('data-runelight-preview-render-visible="false"')
    expect(html).toContain('data-runelight-preview-render-iframe-origin="pending"')
  })

  it("does not enter card selected state from sidebar or drilldown state alone", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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

    expect(
      applyStudioCardSelectionAction("src/UserCard.g.tsx#default", {
        type: "activate-card",
        coordinate: "src/UserCard.g.tsx#default",
        source: "pointer",
      }),
    ).toBeUndefined()

    expect(applyStudioCardSelectionAction("src/MultiExport.g.tsx#NamedBadge", { type: "clear" })).toBeUndefined()
  })

  it("restores the initial Studio workspace from URL search params", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const html = renderToStaticMarkup(
      <StudioShell
        manifest={manifest}
        urlSearch="selection=component%3Asrc%2FUserCard.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&frame=src%2FUserCard.g.tsx%23default%3Aready"
      />,
    )

    expect(cardCoordinates(html)).toEqual(["src/UserCard.g.tsx#default"])
    expect(previewSources(html)).toEqual([
      "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=loading&chrome=0&sessionId=src%2FUserCard.g.tsx%23default%3Aloading&static=1",
      "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0&sessionId=src%2FUserCard.g.tsx%23default%3Aready&static=1",
    ])
  })

  it("renders lazy preview placeholders from component coordinates and first statically enumerable frames", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
    })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(previewSources(html)).toEqual([
      "/runelight?entry=src%2FMultiExport.g.tsx%23NamedBadge&frame=ready&chrome=0&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready&static=1",
      "/runelight?entry=src%2FMultiExport.g.tsx%23default&frame=defaultReady&chrome=0&sessionId=src%2FMultiExport.g.tsx%23default%3AdefaultReady&static=1",
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

  it("keeps stalled visible previews mounted without spending render budget", () => {
    expect(
      [...queuedStudioPreviewSessionIds({
        activeSessionIds: new Set(),
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(),
        currentSessionIds: new Set(["stalled-visible"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["stalled-visible"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["stalled-visible"])

    expect(
      [...queuedStudioPreviewSessionIds({
        activeSessionIds: new Set(),
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(),
        currentSessionIds: new Set(["stalled-visible"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["stalled-visible", "visible-new"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["stalled-visible", "visible-new"])

    expect(
      [...queuedStudioPreviewSessionIds({
        activeSessionIds: new Set(),
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(),
        currentSessionIds: new Set(["stalled-visible-a", "stalled-visible-b"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["stalled-visible-a", "stalled-visible-b"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumMountedPreviewSessions: 1,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["stalled-visible-a", "stalled-visible-b"])

    expect(
      [...queuedStudioPreviewSessionIds({
        activeSessionIds: new Set(),
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(),
        currentSessionIds: new Set(["stalled-buffered"]),
        items: [
          {
            rect: { bottom: 300, left: 0, right: 100, top: 200 },
            sessionIds: ["stalled-buffered"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        renderBufferMargin: 500,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual([])

    expect(
      [...queuedStudioPreviewSessionIds({
        activeSessionIds: new Set(),
        canvas: { x: 0, y: 0, scale: 1 },
        completedSessionIds: new Set(["ready-visible"]),
        currentSessionIds: new Set(["ready-visible"]),
        items: [
          {
            rect: { bottom: 100, left: 0, right: 100, top: 0 },
            sessionIds: ["ready-visible"],
          },
        ],
        maximumConcurrentRenderTasks: 1,
        maximumRenderTaskCount: 4,
        viewport: { bottom: 100, left: 0, right: 100, top: 0 },
      })],
    ).toEqual(["ready-visible"])
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
      observation.observePreviewTiming({ sessionId: "visible-b", type: "runelight:ready" }).scrollResponse,
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
    observation.observePreviewTiming({ sessionId: "a", type: "runelight:ready" })
    now += 50

    expect(observation.observePreviewTiming({ sessionId: "b", type: "runelight:error" }).fullRender).toMatchObject({
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
    observation.observePreviewTiming({ sessionId: "a", type: "runelight:ready" })
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

  it("keeps active render timeout scheduling alive for unchanged visible incomplete work", () => {
    expect(
      studioPreviewRenderSchedulerShouldScheduleActiveTimeout(false, { hasIncompleteVisibleRenderTasks: true }),
    ).toBe(true)
    expect(
      studioPreviewRenderSchedulerShouldScheduleActiveTimeout(false, { hasIncompleteVisibleRenderTasks: false }),
    ).toBe(false)
    expect(
      studioPreviewRenderSchedulerShouldScheduleActiveTimeout(true, { hasIncompleteVisibleRenderTasks: false }),
    ).toBe(true)
  })

  it("records mount time for retained sessions when the scheduler resumes from a store snapshot", () => {
    const mountedAt = new Map<string, number>()

    syncRenderPreviewSessionMountedAt(mountedAt, new Set(["retained-visible"]), new Set(["retained-visible"]), 12_345)

    expect(mountedAt.get("retained-visible")).toBe(12_345)
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
    expect(requestPolicies).toEqual([{ renderBudget: "canvas-movement", renderScope: "visible" }])

    scheduler.advanceTime(120)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "visible" },
    ])

    scheduler.advanceTime(240)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "buffer" },
    ])

    clock.dispose()
  })

  it("can defer lifecycle-originated canvas movement render requests to a microtask", async () => {
    const scheduler = createFakeStudioPreviewRenderRequestClockScheduler()
    const firstCanvas = { x: 0, y: 0, scale: 1 }
    const latestCanvas = { x: 24, y: 16, scale: 1 }
    const requests: Array<{ canvas: typeof firstCanvas; renderBudget: string; renderScope: string }> = []
    const clock = createStudioPreviewRenderRequestClock({
      getCanvas: () => latestCanvas,
      getRenderQueueOptions: () => ({
        activeRenderTimeoutMilliseconds: 5_000,
        renderThrottleMilliseconds: 100,
      }),
      runRenderRequest: (nextCanvas, requestPolicy) => {
        requests.push({ canvas: nextCanvas, ...requestPolicy })
        return true
      },
      scheduler,
    })

    clock.requestCanvasMovementRender(firstCanvas, { timing: "microtask" })
    clock.requestCanvasMovementRender(latestCanvas, { timing: "microtask" })

    expect(requests).toEqual([])

    await Promise.resolve()

    expect(requests).toEqual([
      { canvas: latestCanvas, renderBudget: "canvas-movement", renderScope: "visible" },
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
    expect(requestPolicies).toEqual([{ renderBudget: "canvas-movement", renderScope: "visible" }])

    scheduler.advanceTime(400)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "visible" },
    ])

    scheduler.advanceTime(240)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "visible" },
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
      { renderBudget: "canvas-movement", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "visible" },
      { renderBudget: "normal", renderScope: "visible" },
    ])

    scheduler.advanceTime(300)
    scheduler.flushAnimationFrames()
    expect(requestPolicies).toEqual([
      { renderBudget: "canvas-movement", renderScope: "visible" },
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

  it("keeps moving-canvas runs focused on visible previews with a smaller render task limit", () => {
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
        { includeBuffer: false, useCanvasMovementRenderTaskLimit: true },
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

  it("uses measured frame preview rects as canvas visibility items", () => {
    const component = {
      frames: [{ name: "ready" }, { name: "loading" }],
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

  it("keeps canvas visibility fallback at frame preview granularity before frame rects are measured", () => {
    const component = {
      frames: [{ name: "first" }, { name: "center" }, { name: "last" }],
      coordinate: "src/Card.g.tsx#default",
    }
    const sessionIds = component.frames.map((frame) => previewSessionId(component as any, frame.name, "tablet"))

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

  it("uses fallback frame preview visibility for center-first render planning before frame rects are measured", () => {
    const component = {
      frames: [{ name: "first" }, { name: "center" }, { name: "last" }],
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
      frames: [{ name: "ready" }, { name: "loading" }],
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
          type: "runelight:ready",
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
    const sessionIds = Array.from({ length: 24 }, (_, index) => `frame-${index}`)

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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = rootStudioManifestComponents(manifest).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard component")

    expect(createStudioPreviewPoolUrl(manifest)).toBe("/runelight?chrome=0&pool=1")
    const previewUrl = createStudioPreviewUrl(manifest, component, "ready", "session-1", {
      static: true,
      frameOverrides: [{ coordinate: "src/Child.g.tsx#default", frameName: "open:error" }],
      inputOverrides: [{ coordinate: "src/Toast.g.tsx#Toast", frameName: "top" }],
    })
    expect(previewUrl).toBe(
      "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0&sessionId=session-1&static=1&frameOverride=src%252FChild.g.tsx%2523default%3Aopen%253Aerror&inputOverride=src%252FToast.g.tsx%2523Toast%3Atop",
    )
    expect(studioPreviewRenderTargetFromUrl(previewUrl, "fallback-session")).toMatchObject({
      frameOverrides: [["src/Child.g.tsx#default", "open:error"]],
      inputOverrides: [["src/Toast.g.tsx#Toast", "top"]],
    })
    expect(
      studioPreviewRenderTargetFromUrl(
        "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0&sessionId=session-1&static=1&frameOverride=src%252FChild.g.tsx%2523default%3Aopen&inputOverride=src%252FToast.g.tsx%2523Toast%3Atop",
        "fallback-session",
      ),
    ).toEqual({
      frameName: "ready",
      frameOverrides: [["src/Child.g.tsx#default", "open"]],
      inputOverrides: [["src/Toast.g.tsx#Toast", "top"]],
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

  it("uses cached preview geometry for component frame previews", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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

    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:ready")).toContain("height:88px")
    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:loading")).toContain("height:88px")
    expect(framePreviewFrameHtml(html, "ready")).not.toContain("height:1024px")
    expect(framePreviewFrameHtml(html, "loading")).not.toContain("height:1024px")
    expect(html).not.toContain("data-runelight-frame-sidebar")
  })

  it("invalidates preview cache keys when the component source hash changes", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    expect(studioPreviewCacheKey({ ...component, sourceHash: "hash-a" }, "ready", "tablet")).not.toBe(
      studioPreviewCacheKey({ ...component, sourceHash: "hash-b" }, "ready", "tablet"),
    )
  })

  it("derives geometry cache keys for every manifest frame and canvas viewport", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const expectedKeys = manifest.files.flatMap((file) =>
      file.components.flatMap((component) =>
        component.frames.flatMap((frame) =>
          (["phone", "tablet", "desktop"] as const).map((viewportPreset) =>
            studioPreviewCacheKey(component, frame.name, viewportPreset),
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
          type: "runelight:tree",
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
            type: "runelight:tree",
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
          type: "runelight:tree",
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
      sourceRoot: "src",
      cache: { namespace: "test-cache-namespace" },
    })

    expect(studioPreviewIndexedDBNamespace(manifest)).toBe("project:test-cache-namespace")
  })

  it("derives a stable fallback namespace from the Studio manifest shape", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const namespace = studioPreviewIndexedDBNamespace(manifest)
    const renamedManifest = {
      ...manifest,
      files: manifest.files.map((file, index) => (index === 0 ? { ...file, path: `renamed/${file.path}` } : file)),
    }

    expect(namespace).toMatch(/^manifest:/)
    expect(studioPreviewIndexedDBNamespace(renamedManifest)).not.toBe(namespace)
  })

  it("uses tablet viewport height by default while layout bounds are pending", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
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

    expect(html).toContain('data-runelight-preview-session-id="src/UserCard.g.tsx#default:loading"')
    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:loading")).toContain("width:280px")
    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:loading")).toContain("height:1024px")
  })

  it("uses fixed viewport preset height instead of content-height sizing", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    expect(html).toContain('data-runelight-viewport-preset="phone"')
    expect(html).toContain("width:280px")
    expect(html).toContain("height:844px")
    expect(html).not.toContain("height:420px")
  })

  it("applies the floating viewport preset to every canvas component", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })

    expect(renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="debug=pool" />)).toContain(
      'data-runelight-preview-iframe-pool="true"',
    )
    expect(renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="debug=pool" />)).toContain(
      'data-runelight-preview-iframe-pool-stats="true"',
    )
    expect(renderToStaticMarkup(<StudioShell manifest={manifest} urlSearch="debug=no-pool" />)).not.toContain(
      'data-runelight-preview-iframe-pool="true"',
    )
  })

  it("stores viewport as a single canvas-level preset across drilldown columns", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    ).toBe(520)

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
    ).toBe(360)

    expect(componentCardLayoutWidth({ width: 1280 }, undefined, "src/UserCard.g.tsx#default")).toBe(1308)
  })

  it("renders a card-level error for invalid preview targets", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const dynamicFramesFile = manifest.files.find((file) => file.path === "src/DynamicFrames.g.tsx")
    if (!dynamicFramesFile) throw new Error("Missing DynamicFrames fixture")

    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/DynamicFrames.g.tsx" />)

    expect(cardCoordinates(html)).toEqual(["src/DynamicFrames.g.tsx#default"])
    expect(iframeSources(html)).toEqual([])
    expect(html).toContain("Preview unavailable")
    expect(html).toContain("non-static-frame-key")
  })

  it("isolates iframe render failures to one card with reproduction details", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
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
      "/runelight?entry=src%2FMultiExport.g.tsx%23NamedBadge&amp;frame=ready&amp;chrome=0&amp;sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready&amp;static=1",
    )
    expect(previewSources(html)).toContain(
      "/runelight?entry=src%2FMultiExport.g.tsx%23default&frame=defaultReady&chrome=0&sessionId=src%2FMultiExport.g.tsx%23default%3AdefaultReady&static=1",
    )
  })

  it("ignores stale iframe session messages", () => {
    const state = applyStudioPreviewMessage(
      {
        expectedSessionId: "current-session",
        ready: false,
      },
      {
        type: "runelight:tree",
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
        type: "runelight:ready",
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
          message: "Unknown Runelight entry: src/Transient.g.tsx#default",
        },
      },
      {
        type: "runelight:ready",
        protocolVersion: 1,
        sessionId: "current-session",
      },
    )

    expect(state).toEqual({
      expectedSessionId: "current-session",
      ready: true,
    })
  })

  it("stores rendered snapshot messages on preview frame state", () => {
    const snapshot = renderedSnapshot("rendered-frame")
    const state = applyStudioPreviewMessage(
      {
        expectedSessionId: "current-session",
        ready: true,
      },
      {
        type: "runelight:rendered-snapshot",
        protocolVersion: 1,
        sessionId: "current-session",
        snapshot,
      },
    )

    expect(state.renderedSnapshot).toBe(snapshot)
    expect(applyStudioPreviewMessage(state, {
      type: "runelight:rendered-snapshot",
      protocolVersion: 1,
      sessionId: "current-session",
      snapshot: renderedSnapshot("rendered-frame"),
    })).toBe(state)
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
        type: "runelight:ready",
        protocolVersion: 1,
        sessionId: "current-session",
      }),
    ).toBe(state)
    expect(
      applyStudioPreviewMessage(state, {
        type: "runelight:resize",
        protocolVersion: 1,
        sessionId: "current-session",
        size: { width: 390, height: 844 },
      }),
    ).toBe(state)
    expect(
      applyStudioPreviewMessage(state, {
        type: "runelight:tree",
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
      type: "runelight:ready",
      protocolVersion: 1,
      sessionId: "current-session",
    } as const
    const treeMessage = {
      type: "runelight:tree",
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
          type: "runelight:ready",
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
          type: "runelight:ready",
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
          type: "runelight:ready",
          protocolVersion: 1,
          sessionId: "current-session",
        },
        new Set(["current-session"]),
      ),
    ).toBe(ready)
  })

  it("keeps pooled iframe handshake messages out of session frame state", () => {
    expect(isGPreviewSessionMessage({ type: "runelight:pool-ready", protocolVersion: 1 })).toBe(false)
    expect(isGPreviewSessionMessage({ type: "runelight:ready", protocolVersion: 1, sessionId: "session-1" })).toBe(true)
    expect(
      isGPreviewSessionMessage({
        type: "runelight:rendered-snapshot",
        protocolVersion: 1,
        sessionId: "session-1",
        snapshot: renderedSnapshot("session-render"),
      }),
    ).toBe(true)
    expect(isGPreviewSessionMessage({ type: "runelight:ready", protocolVersion: 1 })).toBe(false)
    expect(
      isGPreviewSessionMessage({
        type: "runelight:render",
        protocolVersion: 1,
        sessionId: "session-1",
        target: {
          chrome: "0",
          entry: "src/UserCard.g.tsx#default",
          frameName: "ready",
          sessionId: "session-1",
          staticMode: true,
        },
      }),
    ).toBe(false)
  })

  it("keeps pooled iframe borrow identity stable across render target and size updates", () => {
    const input = {
      size: { width: 768, height: 1024 },
      slot: {
        previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0",
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
        slot: { ...input.slot, previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=error&chrome=0" },
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
        previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0",
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
        dimmed: true,
      }),
    ).toBe(false)
    expect(
      studioPreviewIframeBorrowInputNeedsRender(input, {
        ...input,
        placementKey: "layout-width:layout-height:offset-x:offset-y",
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
        slot: { ...input.slot, previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=error&chrome=0" },
      }),
    ).toBe(true)
  })

  it("prevents repeated pooled iframe render posts for the same pending target", () => {
    const input = {
      size: { width: 768, height: 1024 },
      slot: {
        previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0",
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
          slot: { ...input.slot, previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=error&chrome=0" },
        }),
      ),
    ).toBe(true)
    expect(
      studioPreviewIframePendingRenderPostKey({
        ...input,
        placementKey: "layout-width:layout-height:offset-x:offset-y",
      }),
    ).toBe(renderKey)
  })

  it("recognizes a same-origin pooled preview mailbox as a direct render endpoint", () => {
    const frame = {
      contentWindow: {
        __runelightPreviewRenderTargetMailbox: {
          render() {},
        },
      },
    } as unknown as HTMLIFrameElement
    const pendingFrame = {
      contentWindow: {},
    } as unknown as HTMLIFrameElement

    expect(studioPreviewIframePoolEntryCanUseDirectRenderEndpoint({ frame })).toBe(true)
    expect(studioPreviewIframePoolEntryCanUseDirectRenderEndpoint({ frame: pendingFrame })).toBe(false)
  })

  it("borrows an idle iframe before creating another pooled iframe", () => {
    const poolUrl = "/runelight?chrome=0&pool=1"
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
    const unreadyStateless = { poolUrl, ready: false }

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
    ).toBe(unreadyStale)
    expect(
      selectStudioPreviewIframePoolEntryForBorrow(new Array(48).fill(null).map(() => unreadyStale), {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(unreadyStale)
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
    expect(
      selectStudioPreviewIframePoolEntryForBorrow([unreadyStale, unreadyExact, unreadyStateless], {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(unreadyExact)
    expect(
      selectStudioPreviewIframePoolEntryForBorrow([unreadyStale, unreadyStateless], {
        maximumRetainedFrames: 48,
        poolUrl,
        sessionId: "src/UserCard.g.tsx#default:ready",
      }),
    ).toBe(unreadyStateless)
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
        type: "runelight:values",
        protocolVersion: 1,
        sessionId: "current-session",
        values: {
          boundaryId: "runelight-boundary:1",
          props: { type: "object", constructorName: "Object", entries: [] },
          scope: { type: "undefined" },
          providerValues: [],
        },
      },
    )

    expect(state.valuesByBoundaryId).toEqual({
      "runelight-boundary:1": {
        boundaryId: "runelight-boundary:1",
        props: { type: "object", constructorName: "Object", entries: [] },
        scope: { type: "undefined" },
        providerValues: [],
      },
    })
  })

  it("creates a child column from the selected component boundary tree", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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

  it("toggles a selected root drilldown component closed", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const coordinate = "src/UserCard.g.tsx#default"
    const tree = [
      {
        id: "root",
        coordinate,
        children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
      },
    ]
    const state = selectStudioComponent(createStudioWorkspaceState(manifest, `component:${coordinate}`), manifest, coordinate, tree)

    const nextState = selectStudioComponent(state, manifest, coordinate, tree)

    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      [coordinate],
    ])
    expect(nextState.selectedCoordinatePath).toEqual([])
  })

  it("toggles a selected nested drilldown component back to its parent path", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const parentCoordinate = "src/UserCard.g.tsx#default"
    const childCoordinate = "src/MultiExport.g.tsx#default"
    const leafCoordinate = "src/MultiExport.g.tsx#NamedBadge"
    const parentState = selectStudioComponent(createStudioWorkspaceState(manifest, `component:${parentCoordinate}`), manifest, parentCoordinate, [
      {
        id: "parent",
        coordinate: parentCoordinate,
        children: [{ id: "child", coordinate: childCoordinate, children: [] }],
      },
    ])
    const childState = selectStudioComponent(parentState, manifest, childCoordinate, [
      {
        id: "child",
        coordinate: childCoordinate,
        children: [{ id: "leaf", coordinate: leafCoordinate, children: [] }],
      },
    ], { columnIndex: 1 })

    const framedState = changeStudioComponentFrame(childState, parentCoordinate, "ready", { keepDrilldown: true })
    const nextState = selectStudioComponent(framedState, manifest, childCoordinate, [], { columnIndex: 1 })

    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      [parentCoordinate],
      [childCoordinate],
    ])
    expect(nextState.selectedFrameByCoordinate).toEqual({
      [parentCoordinate]: "ready",
    })
    expect(nextState.selectedCoordinatePath).toEqual([parentCoordinate])
  })

  it("creates a child column from static dependencies even when they are absent from the current render tree", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const coordinate = "src/ImportedHookDependency.g.tsx#default"
    const state = createStudioWorkspaceState(manifest, `component:${coordinate}`)

    const nextState = selectStudioComponent(state, manifest, coordinate, [
      {
        id: "root",
        coordinate,
        children: [],
      },
    ])

    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      [coordinate],
      ["src/HookDependencyChild.g.tsx#HookDependencyChild"],
    ])
    expect(nextState.columns[1]?.parentCoordinate).toBe(coordinate)
  })

  it("creates drilldown from all frame trees without storing a highlighted frame", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const coordinate = "src/UserCard.g.tsx#default"
    const state = changeStudioComponentFrame(createStudioWorkspaceState(manifest, `component:${coordinate}`), coordinate, "ready")

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
    expect(nextState.selectedFrameByCoordinate).toEqual({})
    expect(params.toString()).toContain("path=src%2FUserCard.g.tsx%23default")
    expect(params.toString()).not.toContain("frame=")
  })

  it("does not create an empty drilldown column for components without Runelight children", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    expect(html).toContain('data-runelight-column-parent-coordinate="src/UserCard.g.tsx#default"')
    expect(html).toContain("runelight-studio-layout-neutral-drilldown-column-enter")
    expect(html).toContain("runelight-studio-layout-neutral-drilldown-column-exit")
    expect(html).toContain("runelight-studio-layout-neutral-drilldown-chrome-enter")
    expect(html).toContain("data-runelight-drilldown-column-exit")
    expect(columnHtml(html, 1)).toContain('data-runelight-drilldown-column-enter="true"')
    expect(columnHtml(html, 1)).toContain("animation:runelight-studio-layout-neutral-drilldown-column-enter")
    expect(columnHtml(html, 1)).not.toContain("transform:")
    expect(html).not.toContain("runelight-studio-drilldown-column-enter")
    expect(html).not.toContain("translateX(-10px)")
  })

  it("changes drilldown enter identity with the selected column path", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")
    const baseWorkspace = createStudioWorkspaceState(manifest)
    const firstColumn = { components: [component], parentCoordinate: "src/ParentA.g.tsx#default" }
    const secondColumn = { components: [component], parentCoordinate: "src/ParentB.g.tsx#default" }

    expect(
      layoutNeutralDrilldownColumnEnterIdentity(
        {
          ...baseWorkspace,
          columns: [{ components: [component] }, firstColumn],
          selectedCoordinatePath: ["src/ParentA.g.tsx#default"],
        },
        1,
        firstColumn,
      ),
    ).not.toBe(
      layoutNeutralDrilldownColumnEnterIdentity(
        {
          ...baseWorkspace,
          columns: [{ components: [component] }, secondColumn],
          selectedCoordinatePath: ["src/ParentB.g.tsx#default"],
        },
        1,
        secondColumn,
      ),
    )
  })

  it("uses the first statically enumerable frame by default", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files
      .flatMap((file) => file.components)
      .find((candidate) => candidate.coordinate === "src/MultiExport.g.tsx#default")
    if (!component) throw new Error("Missing component")

    expect(selectedStudioFrameName(createStudioWorkspaceState(manifest), component)).toBe("defaultReady")
  })

  it("derives Studio environment variant axes from annotated provider frames", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files
      .flatMap((file) => file.components)
      .find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing component")
    const loadingFrame = component.frames.find((frame) => frame.name === "loading")
    const readyFrame = component.frames.find((frame) => frame.name === "ready")
    if (!loadingFrame || !readyFrame) throw new Error("Missing UserCard frames")

    expect(studioProviderVariantAxes(component, { ThemeProvider: "light" })).toEqual([
      {
        providerName: "ThemeProvider",
        selectedVariant: "light",
        variants: [
          { frameName: "loading", name: "light", selected: true },
          { frameName: "ready", name: "dark", selected: false },
        ],
      },
    ])
    expect(studioFilteredFramesForProviderVariantContext(component, { ThemeProvider: "dark" }).map((frame) => frame.name)).toEqual([
      "loading",
      "ready",
    ])
    expect(studioProviderVariantFrameStatus(component, loadingFrame, { ThemeProvider: "dark" })).toMatchObject({
      state: "mismatch",
    })
    expect(studioProviderVariantFrameStatus(component, readyFrame, { ThemeProvider: "dark" })).toEqual({
      state: "match",
    })
    expect(
      studioManifestProviderVariantAxes(manifest, { ThemeProvider: "dark" }).find(
        (axis) => axis.providerName === "ThemeProvider",
      ),
    ).toEqual({
      providerName: "ThemeProvider",
      selectedVariant: "dark",
      variants: [
        { name: "light", selected: false },
        { name: "dark", selected: true },
      ],
    })
  })

  it("compares provider variant contexts by value for card memoization", () => {
    expect(sameStudioProviderVariantContext({ ThemeProvider: "dark" }, { ThemeProvider: "dark" })).toBe(true)
    expect(sameStudioProviderVariantContext(undefined, {})).toBe(true)
    expect(sameStudioProviderVariantContext({ ThemeProvider: "dark" }, { ThemeProvider: "light" })).toBe(false)
    expect(sameStudioProviderVariantContext({ ThemeProvider: "dark" }, { ThemeProvider: "dark", UserProvider: "login" })).toBe(
      false,
    )
  })

  it("classifies component frames against every active provider variant", () => {
    const component = {
      coordinate: "src/Home.g.tsx#default",
      filePath: "src/Home.g.tsx",
      sourceHash: "home-source",
      exportName: "default",
      componentName: "Home",
      mode: "scope",
      frames: [
        {
          kind: "scope",
          name: "loginReviewer",
          providerVariants: { ReviewCapabilityProvider: "reviewer", UserSignProvider: "login" },
        },
        {
          kind: "scope",
          name: "loginRegular",
          providerVariants: { ReviewCapabilityProvider: "regular", UserSignProvider: "login" },
        },
        {
          kind: "scope",
          name: "anonymousRegular",
          providerVariants: { ReviewCapabilityProvider: "regular", UserSignProvider: "anonymous" },
        },
      ],
      providers: {
        ReviewCapabilityProvider: {
          name: "ReviewCapabilityProvider",
          frames: [],
          variants: ["reviewer", "regular"],
        },
        UserSignProvider: {
          name: "UserSignProvider",
          frames: [],
          variants: ["login", "anonymous"],
        },
      },
      diagnostics: [],
    } satisfies StudioManifestComponent

    expect(studioFilteredFramesForProviderVariantContext(component, { ReviewCapabilityProvider: "regular" }).map((frame) => frame.name)).toEqual([
      "loginReviewer",
      "loginRegular",
      "anonymousRegular",
    ])
    expect(
      component.frames.map((frame) => [
        frame.name,
        studioProviderVariantFrameStatus(component, frame, { ReviewCapabilityProvider: "regular" }).state,
      ]),
    ).toEqual([
      ["loginReviewer", "mismatch"],
      ["loginRegular", "match"],
      ["anonymousRegular", "match"],
    ])
    expect(
      component.frames.map((frame) => [
        frame.name,
        studioProviderVariantFrameStatus(component, frame, {
          ReviewCapabilityProvider: "regular",
          UserSignProvider: "anonymous",
        }).state,
      ]),
    ).toEqual([
      ["loginReviewer", "mismatch"],
      ["loginRegular", "mismatch"],
      ["anonymousRegular", "match"],
    ])
    expect(studioFilteredFramesForProviderVariantContext(component, { ThemeProvider: "dark" }).map((frame) => frame.name)).toEqual([
      "loginReviewer",
      "loginRegular",
      "anonymousRegular",
    ])
    const firstFrame = component.frames[0]
    if (!firstFrame) throw new Error("Missing first frame")
    expect(studioProviderVariantFrameStatus(component, firstFrame, { ThemeProvider: "dark" })).toEqual({
      state: "neutral",
    })
  })

  it("treats unmarked provider variant frames as neutral Studio states", () => {
    const component = {
      coordinate: "src/UserPanel.g.tsx#default",
      filePath: "src/UserPanel.g.tsx",
      sourceHash: "user-panel-source",
      exportName: "default",
      componentName: "UserPanel",
      mode: "pure",
      frames: [
        {
          kind: "pure",
          name: "loading",
        },
        {
          kind: "pure",
          name: "login",
          providerVariants: { UserSignProvider: "login" },
        },
        {
          kind: "pure",
          name: "anonymous",
          providerVariants: { UserSignProvider: "anonymous" },
        },
        {
          kind: "pure",
          name: "universal",
          providerVariants: { UserSignProvider: ["login", "anonymous"] },
        },
      ],
      providers: {
        UserSignProvider: {
          name: "UserSignProvider",
          frames: [],
          variants: ["login", "anonymous"],
        },
      },
      diagnostics: [],
    } satisfies StudioManifestComponent

    expect(
      component.frames.map((frame) => [
        frame.name,
        studioProviderVariantFrameStatus(component, frame, { UserSignProvider: "anonymous" }).state,
      ]),
    ).toEqual([
      ["loading", "neutral"],
      ["login", "mismatch"],
      ["anonymous", "match"],
      ["universal", "match"],
    ])
    expect(studioPreviewFrameOverridesForProviderVariantContext({
      diagnostics: [],
      files: [{ components: [component], diagnostics: [], path: "src/UserPanel.g.tsx", sourceHash: "user-panel-source" }],
      routes: {
        events: "/runelight/studio/events",
        manifest: "/runelight/studio/manifest",
        preview: "/runelight",
        studio: "/runelight/studio",
      },
      version: 1,
    }, {
      UserSignProvider: "anonymous",
    })).toEqual([{ frameName: "anonymous", coordinate: "src/UserPanel.g.tsx#default" }])
  })

  it("keeps all frames visible while root and component variants change match state", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const coordinate = "src/UserCard.g.tsx#default"
    const rooted = changeStudioRootProviderVariant(createStudioWorkspaceState(manifest, `component:${coordinate}`), "ThemeProvider", "light")
    const overridden = changeStudioComponentProviderVariant(rooted, [coordinate], "ThemeProvider", "dark")

    const rootFiltered = studioWorkspaceWithProviderVariantFilters(rooted)
    const overriddenFiltered = studioWorkspaceWithProviderVariantFilters(overridden)

    const rootComponent = rootFiltered.columns[0]?.components[0]
    const overriddenComponent = overriddenFiltered.columns[0]?.components[0]
    if (!rootComponent || !overriddenComponent) throw new Error("Missing UserCard component")

    expect(rootComponent.frames.map((frame) => frame.name)).toEqual(["loading", "ready"])
    expect(overriddenComponent.frames.map((frame) => frame.name)).toEqual(["loading", "ready"])
    expect(rootComponent.frames.map((frame) => studioProviderVariantFrameStatus(rootComponent, frame, { ThemeProvider: "light" }).state)).toEqual([
      "match",
      "mismatch",
    ])
    expect(
      overriddenComponent.frames.map((frame) =>
        studioProviderVariantFrameStatus(overriddenComponent, frame, { ThemeProvider: "dark" }).state,
      ),
    ).toEqual(["mismatch", "match"])
    expect(studioProviderVariantContextForPath(overridden, [coordinate])).toEqual({ ThemeProvider: "dark" })
    expect(studioProviderVariantSelectionContextForPath(rooted, [coordinate])).toEqual({})
    expect(studioProviderVariantSelectionContextForPath(overridden, [coordinate])).toEqual({ ThemeProvider: "dark" })

    const params = createStudioWorkspaceUrlSearchParams(undefined, overridden)
    expect(params.getAll("rootProviderVariant")).toEqual(["ThemeProvider:light"])
    expect(params.getAll("providerVariant")).toEqual([`${coordinate}:ThemeProvider:dark`])

    const restored = createStudioWorkspaceStateFromUrl(manifest, params).workspace
    expect(studioProviderVariantContextForPath(restored, [coordinate])).toEqual({ ThemeProvider: "dark" })

    const inherited = changeStudioComponentProviderVariant(overridden, [coordinate], "ThemeProvider", "dark")
    expect(inherited.selectedProviderVariantsByPath).toEqual({})
    expect(createStudioWorkspaceUrlSearchParams(undefined, inherited).getAll("providerVariant")).toEqual([])
    expect(studioProviderVariantContextForPath(inherited, [coordinate])).toEqual({ ThemeProvider: "light" })
    expect(studioProviderVariantSelectionContextForPath(inherited, [coordinate])).toEqual({})
    expect(studioProviderVariantAxes(rootComponent, studioProviderVariantSelectionContextForPath(inherited, [coordinate]))[0]?.selectedVariant).toBeUndefined()
  })

  it("escapes provider variant URL values without changing the path or provider keys", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const coordinate = "src/UserCard.g.tsx#default"
    const workspace = {
      ...createStudioWorkspaceState(manifest, `component:${coordinate}`),
      rootProviderVariants: { ThemeProvider: "theme:light" },
      selectedProviderVariantsByPath: {
        [coordinate]: { ThemeProvider: "theme:dark" },
      },
    }

    const params = createStudioWorkspaceUrlSearchParams(undefined, workspace)

    expect(params.getAll("rootProviderVariant")).toEqual(["ThemeProvider:theme%3Alight"])
    expect(params.getAll("providerVariant")).toEqual([`${coordinate}:ThemeProvider:theme%3Adark`])
    const restored = createStudioWorkspaceStateFromUrl(manifest, params).workspace
    expect(studioProviderVariantContextForPath(restored, [coordinate])).toEqual({ ThemeProvider: "theme:dark" })
  })

  it("projects provider variant selection into preview frame overrides", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const workspace = changeStudioRootProviderVariant(
      createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default"),
      "ThemeProvider",
      "dark",
    )
    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={studioWorkspaceWithProviderVariantFilters(workspace)} />)

    expect(studioPreviewFrameOverridesForProviderVariantContext(manifest, { ThemeProvider: "dark" })).toEqual([
      { coordinate: "src/UserCard.g.tsx#default", frameName: "ready" },
    ])
    expect(previewSources(html)).toEqual([
      "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=loading&chrome=0&sessionId=src%2FUserCard.g.tsx%23default%3Aloading&static=1&frameOverride=src%252FUserCard.g.tsx%2523default%3Aready",
      "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0&sessionId=src%2FUserCard.g.tsx%23default%3Aready&static=1&frameOverride=src%252FUserCard.g.tsx%2523default%3Aready",
    ])
  })

  it("keeps components with no matching frame for a selected provider variant renderable", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const component = manifest.files
      .flatMap((file) => file.components)
      .find((candidate) => candidate.coordinate === "src/MissingProviderVariant.g.tsx#default")
    if (!component) throw new Error("Missing component")
    const loginFrame = component.frames.find((frame) => frame.name === "login")
    if (!loginFrame) throw new Error("Missing login frame")

    expect(
      studioFilteredFramesForProviderVariantContext(component, { LoginProvider: "anonymous" }).map(
        (frame) => frame.name,
      ),
    ).toEqual(["login"])
    expect(studioProviderVariantFrameStatus(component, loginFrame, { LoginProvider: "anonymous" })).toMatchObject({
      state: "mismatch",
    })
  })

  it("stores selected frames per component coordinate and clears deeper columns", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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

    const nextState = changeStudioComponentFrame(state, "src/Badge.g.tsx#default", "warning")

    expect(nextState.selectedFrameByCoordinate).toEqual({
      "src/Badge.g.tsx#default": "warning",
    })
    expect(nextState.columns).toHaveLength(1)
    expect(nextState.selectedCoordinatePath).toEqual(["src/Badge.g.tsx#default"])
  })

  it("keeps drilldown columns when changing the highlighted component frame", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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

    const nextState = changeStudioComponentFrame(childState, "src/Badge.g.tsx#default", "warning", { keepDrilldown: true })

    expect(nextState.selectedFrameByCoordinate).toEqual({
      "src/Badge.g.tsx#default": "warning",
    })
    expect(nextState.columns.map((column) => column.components.map((component) => component.coordinate))).toEqual([
      ["src/Badge.g.tsx#default"],
      ["src/MultiExport.g.tsx#default"],
    ])
    expect(nextState.selectedCoordinatePath).toEqual(["src/Badge.g.tsx#default", "src/MultiExport.g.tsx#default"])
  })

  it("renders the selected frame in the component iframe URL", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const state = changeStudioComponentFrame(
      createStudioWorkspaceState(manifest, "component:src/Badge.g.tsx#default"),
      "src/Badge.g.tsx#default",
      "warning",
    )

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={state} />)

    expect(previewSources(html)).toEqual([
      "/runelight?entry=src%2FBadge.g.tsx%23default&frame=neutral&chrome=0&sessionId=src%2FBadge.g.tsx%23default%3Aneutral&static=1",
      "/runelight?entry=src%2FBadge.g.tsx%23default&frame=warning&chrome=0&sessionId=src%2FBadge.g.tsx%23default%3Awarning&static=1",
    ])
  })

  it("keeps ancestor preview URLs stable when selected child frames change", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const childState = changeStudioComponentFrame(
      selectStudioComponent(parentState, manifest, "src/MultiExport.g.tsx#NamedBadge", []),
      "src/MultiExport.g.tsx#NamedBadge",
      "ready",
    )

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={childState} />)
    const sources = previewSources(html)

    expect(sources[0]).toContain("entry=src%2FUserCard.g.tsx%23default")
    expect(sources[0]).toContain("frame=loading")
    expect(sources[0]).not.toContain("frameOverride=")
    expect(sources[0]).toContain("sessionId=src%2FUserCard.g.tsx%23default%3Aloading")
    expect(sources[1]).toContain("entry=src%2FUserCard.g.tsx%23default")
    expect(sources[1]).toContain("frame=ready")
    expect(sources[1]).not.toContain("frameOverride=")
    expect(sources[2]).toBe(
      "/runelight?entry=src%2FMultiExport.g.tsx%23NamedBadge&frame=ready&chrome=0&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready&static=1",
    )
    expect(createStudioRuntimeValuesRequest(manifest, childState, "child")?.sessionId).toBe(
      "src/UserCard.g.tsx#default:loading",
    )
  })

  it("keeps geometry cache identity stable when component drilldown only changes visible targets", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const parentState = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")
    const childState = selectStudioComponent(parentState, manifest, "src/UserCard.g.tsx#default", [
      {
        id: "root",
        coordinate: "src/UserCard.g.tsx#default",
        children: [{ id: "child", coordinate: "src/MultiExport.g.tsx#NamedBadge", children: [] }],
      },
    ])
    const manifestCacheKeys = studioPreviewGeometryCacheKeys(manifest)
    const parentTargets = currentStudioPreviewTargets(manifest, parentState)
    const childTargets = currentStudioPreviewTargets(manifest, childState)

    expect(childTargets.map((target) => target.sessionId)).not.toEqual(parentTargets.map((target) => target.sessionId))
    expect(
      studioPreviewGeometryCacheKeySignature([
        ...manifestCacheKeys,
        ...parentTargets.map((target) => target.cacheKey),
      ]),
    ).toBe(
      studioPreviewGeometryCacheKeySignature([
        ...manifestCacheKeys,
        ...childTargets.map((target) => target.cacheKey),
      ]),
    )
  })

  it("does not key the shell geometry store to transient changes preview targets", () => {
    const manifest = buildLargeStudioManifest(1)
    const file = manifest.files[0]
    const component = file.components[0]
    const frameName = component.frames[0]?.name ?? "default"
    const baselineComponent = {
      ...component,
      coordinate: ".runelight/baselines/HEAD/src/Card000.g.tsx#default",
      filePath: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-000-source",
    } satisfies StudioManifestComponent
    const baselineFile = {
      path: ".runelight/baselines/HEAD/src/Card000.g.tsx",
      sourceHash: "baseline-card-000-source",
      components: [baselineComponent],
      diagnostics: [],
    }
    const changes = {
      version: 1 as const,
      base: {
        kind: "git" as const,
        baselineRoot: ".runelight/baselines/HEAD",
        ref: "HEAD",
        manifest: {
          ...manifest,
          files: [baselineFile],
        },
      },
      items: [
        {
          filePath: file.path,
          kind: "modified" as const,
          surface: "frames" as const,
          currentFile: file,
          baselineFile,
          baselineImpacts: [
            {
              frameNames: [frameName],
              frames: [{ kind: "changed" as const, name: frameName }],
              rootComponentName: baselineComponent.componentName,
              rootCoordinate: baselineComponent.coordinate,
              surface: "frames" as const,
              path: [{ componentName: baselineComponent.componentName, coordinate: baselineComponent.coordinate }],
            },
          ],
          impacts: [
            {
              frameNames: [frameName],
              frames: [{ kind: "changed" as const, name: frameName }],
              rootComponentName: component.componentName,
              rootCoordinate: component.coordinate,
              surface: "frames" as const,
              path: [{ componentName: component.componentName, coordinate: component.coordinate }],
            },
          ],
        },
      ],
    }
    const manifestCacheKeys = studioPreviewGeometryCacheKeys(manifest)
    const changesTargets = currentStudioChangesPreviewTargets(manifest, changes, "tablet")

    expect(changesTargets.some((target) => !manifestCacheKeys.includes(target.cacheKey))).toBe(true)
    expect(studioShellPreviewGeometryCacheKeySignature(manifest)).toBe(studioPreviewGeometryCacheKeySignature(manifestCacheKeys))
    expect(studioShellPreviewGeometryCacheKeySignature(manifest)).not.toBe(
      studioPreviewGeometryCacheKeySignature([
        ...manifestCacheKeys,
        ...changesTargets.map((target) => target.cacheKey),
      ]),
    )
  })

  it("renders floating viewport controls without the Inspector panel", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={state} />)

    expect(html).not.toContain(">Inspector<")
    expect(html).toContain('data-runelight-floating-viewport-controls="true"')
    expect(viewportControlNames(html)).toEqual(["phone", "tablet", "desktop"])
    expect(html).toContain('data-runelight-viewport-tab-highlight="true"')
  })

  it("does not render runtime instance Inspector UI", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
        type: "runelight:request-values",
        protocolVersion: 1,
        sessionId: "src/UserCard.g.tsx#default:loading",
        boundaryId: "child-1",
      },
    })
  })

  it("labels selected child cards as parent-rendered runtime instances", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const parentCoordinate = "src/UserCard.g.tsx#default"
    const childCoordinate = "src/MultiExport.g.tsx#NamedBadge"
    const parentTree = [
      {
        id: "parent",
        coordinate: parentCoordinate,
        children: [{ id: "child-1", coordinate: childCoordinate, children: [] }],
      },
    ]
    const parentState = selectStudioComponent(
      createStudioWorkspaceState(manifest, `component:${parentCoordinate}`),
      manifest,
      parentCoordinate,
      parentTree,
    )
    const childState = selectStudioRuntimeInstance(
      selectStudioComponent(parentState, manifest, childCoordinate, []),
      childCoordinate,
      "child-1",
    )
    const frameStates = {
      [`${parentCoordinate}:loading`]: {
        expectedSessionId: `${parentCoordinate}:loading`,
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
            providerValues: [],
          },
        },
      },
    } satisfies Record<string, StudioPreviewFrameState>

    expect(studioComponentRuntimeInputState(manifest, childState, [parentCoordinate, childCoordinate], frameStates)).toEqual({
      boundaryId: "child-1",
      sourceCoordinate: parentCoordinate,
      sourceFrameName: "loading",
      sourceSessionId: `${parentCoordinate}:loading`,
      valuesState: "resolved",
    })

    const html = renderToStaticMarkup(
      <StudioWorkspaceView frameStates={frameStates} manifest={manifest} workspace={childState} />,
    )
    const childCard = cardHtml(html, childCoordinate)

    expect(childCard).toContain('data-runelight-card-runtime-input-state="resolved"')
    expect(childCard).toContain('data-runelight-card-runtime-input-boundary-id="child-1"')
    expect(childCard).toContain('data-runelight-card-runtime-input-source-frame="loading"')
    expect(childCard).toContain(">parent frame<")
    expect(childCard).not.toContain("Agent inbox")
  })

  it("does not render runtime values in the removed Inspector panel", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
                providerValues: [{ providerName: "ThemeRunelightProvider", value: { type: "string", value: "dark" } }],
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
    expect(html).not.toContain("ThemeRunelightProvider")
  })

  it("round-trips restorable workspace state through URL params without runtime values", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
        rootProviderVariants: {},
        selectedFrameByCoordinate: {
          "src/UserCard.g.tsx#default": "ready",
          "src/MultiExport.g.tsx#NamedBadge": "ready",
        },
        selectedCoordinatePath: ["src/UserCard.g.tsx#default", "src/MultiExport.g.tsx#NamedBadge"],
        selectedProviderVariantsByPath: {},
        selectedRuntimeInstanceByCoordinate: {
          "src/MultiExport.g.tsx#NamedBadge": "runelight-boundary:1",
        },
        selectedViewportPresetByCoordinate: {},
      },
      "src/MultiExport.g.tsx#NamedBadge",
      "runelight-boundary:1",
    )

    const params = createStudioWorkspaceUrlSearchParams("component:src/UserCard.g.tsx#default", workspace)
    const serialized = params.toString()

    expect(serialized).toContain("selection=component%3Asrc%2FUserCard.g.tsx%23default")
    expect(serialized).toContain("canvasViewport=phone")
    expect(serialized).toContain("path=src%2FUserCard.g.tsx%23default")
    expect(serialized).toContain("frame=src%2FUserCard.g.tsx%23default%3Aready")
    expect(serialized).toContain("instance=src%2FMultiExport.g.tsx%23NamedBadge%3Arunelight-boundary%3A1")
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
    expect(restored.workspace.selectedFrameByCoordinate).toEqual({
      "src/UserCard.g.tsx#default": "ready",
      "src/MultiExport.g.tsx#NamedBadge": "ready",
    })
    expect(restored.workspace.selectedRuntimeInstanceByCoordinate).toEqual({
      "src/MultiExport.g.tsx#NamedBadge": "runelight-boundary:1",
    })
  })

  it("round-trips canvas drag and zoom state through URL params", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
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
    expect(createStudioCanvasTransformFromUrl(new URLSearchParams("canvasScale=0.01")).scale).toBe(studioCanvasMinScale)
    expect(createStudioWorkspaceStateFromUrl(manifest, params).canvas).toEqual({
      x: 123.457,
      y: -8.765,
      scale: 1.235,
    })
  })

  it("keeps components and design canvas URL state separate", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const workspace = createStudioWorkspaceState(manifest, "file:src/MultiExport.g.tsx")
    const params = createStudioWorkspaceUrlSearchParams(
      "file:src/MultiExport.g.tsx",
      workspace,
      {
        x: 321.1234,
        y: -45.6789,
        scale: 0.8754,
      },
      { canvasScope: "design" },
    )
    const serialized = params.toString()

    expect(serialized).toContain("designCanvasX=321.123")
    expect(serialized).toContain("designCanvasY=-45.679")
    expect(serialized).toContain("designCanvasScale=0.875")
    expect(serialized).not.toContain("canvasX=")
    expect(createStudioCanvasTransformFromUrl(params)).toEqual(defaultStudioCanvasTransform())
    expect(createStudioCanvasTransformFromUrl(params, "design")).toEqual({
      x: 321.123,
      y: -45.679,
      scale: 0.875,
    })
    expect(createStudioWorkspaceStateFromUrl(manifest, params).canvas).toEqual(defaultStudioCanvasTransform())
    expect(createStudioWorkspaceStateFromUrl(manifest, params, { canvasScope: "design" }).canvas).toEqual({
      x: 321.123,
      y: -45.679,
      scale: 0.875,
    })
  })

  it("renders the initial canvas transform restored from URL params", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const html = renderToStaticMarkup(
      <StudioShell
        manifest={manifest}
        urlSearch="selection=file%3Asrc%2FMultiExport.g.tsx&canvasX=120&canvasY=-30&canvasScale=1.25"
      />,
    )

    expect(html).toContain("transform:translate(120px, -30px) scale(1.25)")
  })

  it("uses a separate default zoom for changes and design canvases", () => {
    const params = new URLSearchParams()

    expect(createStudioCanvasTransformFromUrl(params)).toEqual({ x: 40, y: 40, scale: 1 })
    expect(createStudioCanvasTransformFromUrl(params, "changes")).toEqual({ x: 40, y: 40, scale: 0.6 })
    expect(createStudioCanvasTransformFromUrl(params, "design")).toEqual({ x: 40, y: 40, scale: 0.6 })
  })

  it("renders the initial changes canvas transform restored from changes URL params", () => {
    const manifest = buildLargeStudioManifest(1)
    const file = manifest.files[0]
    const changes = {
      version: 1 as const,
      base: { kind: "none" as const },
      items: [
        {
          filePath: file.path,
          kind: "added" as const,
          surface: "frames" as const,
          currentFile: file,
          impacts: [],
        },
      ],
    }
    const html = renderToStaticMarkup(
      <StudioShell
        changes={changes}
        manifest={manifest}
        urlHash="#/changes"
        urlSearch="canvasX=120&canvasY=-30&canvasScale=1.25&changesCanvasX=340&changesCanvasY=-80&changesCanvasScale=0.75"
      />,
    )

    expect(html).toContain("transform:translate(340px, -80px) scale(0.75)")
    expect(html).not.toContain("transform:translate(120px, -30px) scale(1.25)")
  })

  it("renders the initial design canvas transform restored from design URL params", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      sourceRoot: "src",
      design: {
        frames: [
          {
            id: "src/UserCard.g.tsx#default:ready",
            entry: "src/UserCard.g.tsx#default",
            filePath: "src/UserCard.g.tsx",
            title: "UserCard",
            exportName: "default",
            frameName: "ready",
          },
        ],
      },
    })
    const html = renderToStaticMarkup(
      <StudioShell
        manifest={manifest}
        urlHash="#/drafts"
        urlSearch="canvasX=120&canvasY=-30&canvasScale=1.25&designCanvasX=340&designCanvasY=-80&designCanvasScale=0.75"
      />,
    )

    expect(html).toContain("transform:translate(340px, -80px) scale(0.75)")
    expect(html).not.toContain("transform:translate(120px, -30px) scale(1.25)")
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
          pathname: "/runelight/studio",
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
      { runelightStudio: true },
      "",
      "/runelight/studio?selection=file%3Asrc%2FMultiExport.g.tsx&canvasX=120&canvasY=-30&canvasScale=1.25",
    )
  })

  it("replaces only the active canvas URL params and preserves the view route", () => {
    const pushState = vi.fn()
    const replaceState = vi.fn()
    const originalWindow = Reflect.get(globalThis, "window") as Window | undefined
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        history: { pushState, replaceState },
        location: {
          hash: "#/drafts",
          pathname: "/runelight/studio",
          search: "?selection=file%3Asrc%2FMultiExport.g.tsx&canvasX=10&canvasY=20&canvasScale=1.1&designCanvasX=30&designCanvasY=40&designCanvasScale=0.9",
        },
      },
    })

    try {
      replaceStudioCanvasUrlState({ x: 120, y: -30, scale: 1.25 }, { canvasScope: "design" })
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window")
      } else {
        Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
      }
    }

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledWith(
      { runelightStudio: true },
      "",
      "/runelight/studio?selection=file%3Asrc%2FMultiExport.g.tsx&canvasX=10&canvasY=20&canvasScale=1.1&designCanvasX=120&designCanvasY=-30&designCanvasScale=1.25#/drafts",
    )
  })

  it("restores previous and next workspace states from browser history URL entries", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const previousParams = new URLSearchParams(
      "selection=component%3Asrc%2FUserCard.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&frame=src%2FUserCard.g.tsx%23default%3Aloading",
    )
    const nextParams = new URLSearchParams(
      "selection=component%3Asrc%2FUserCard.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&path=src%2FMultiExport.g.tsx%23NamedBadge&frame=src%2FUserCard.g.tsx%23default%3Aready&instance=src%2FMultiExport.g.tsx%23NamedBadge%3Arunelight-boundary%3A1",
    )

    expect(createStudioWorkspaceStateFromUrl(manifest, previousParams).workspace).toMatchObject({
      selectedCoordinatePath: ["src/UserCard.g.tsx#default"],
      selectedFrameByCoordinate: {
        "src/UserCard.g.tsx#default": "loading",
      },
      selectedRuntimeInstanceByCoordinate: {},
    })
    expect(createStudioWorkspaceStateFromUrl(manifest, nextParams).workspace).toMatchObject({
      selectedCoordinatePath: ["src/UserCard.g.tsx#default", "src/MultiExport.g.tsx#NamedBadge"],
      selectedFrameByCoordinate: {
        "src/UserCard.g.tsx#default": "ready",
      },
      selectedRuntimeInstanceByCoordinate: {
        "src/MultiExport.g.tsx#NamedBadge": "runelight-boundary:1",
      },
    })
  })

  it("degrades invalid URL state to the nearest valid selection with a visible warning", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, sourceRoot: "src" })
    const restored = createStudioWorkspaceStateFromUrl(
      manifest,
      new URLSearchParams(
        "selection=component%3Asrc%2FMissing.g.tsx%23default&path=src%2FUserCard.g.tsx%23default&path=src%2FMissingChild.g.tsx%23default&frame=src%2FUserCard.g.tsx%23default%3Amissing&instance=src%2FMissingChild.g.tsx%23default%3Arunelight-boundary%3A9",
      ),
    )

    expect(restored.warning).toBe("Invalid Studio URL state was ignored.")
    expect(restored.selection).toBe("roots")
    expect(restored.workspace.selectedCoordinatePath).toEqual(["src/UserCard.g.tsx#default"])
    expect(restored.workspace.selectedFrameByCoordinate).toEqual({})
    expect(restored.workspace.selectedRuntimeInstanceByCoordinate).toEqual({})

    const html = renderToStaticMarkup(
      <StudioWorkspaceView manifest={manifest} urlWarning={restored.warning} workspace={restored.workspace} />,
    )

    expect(html).toContain("Invalid Studio URL state was ignored.")
  })
})

function cardCoordinates(html: string): string[] {
  return [...html.matchAll(/data-runelight-card-coordinate="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function buildLargeStudioManifest(count: number) {
  return {
    version: 1,
    routes: {
      events: "/runelight/studio/events",
      preview: "/runelight",
      studio: "/runelight/studio",
      manifest: "/runelight/studio/manifest",
    },
    files: Array.from({ length: count }, (_, index) => {
      const paddedIndex = index.toString().padStart(3, "0")
      const path = `src/Card${paddedIndex}.g.tsx`
      const coordinate = `${path}#default`
      return {
        path,
        sourceHash: `source-${paddedIndex}`,
        components: [
          {
            coordinate,
            filePath: path,
            sourceHash: `source-${paddedIndex}`,
            exportName: "default",
            componentName: `Card${paddedIndex}`,
            mode: "scope",
            frames: [{ kind: "scope", name: "default" }],
            providers: {},
            diagnostics: [],
          },
        ],
        diagnostics: [],
      }
    }),
    diagnostics: [],
  } satisfies ReturnType<typeof createStudioManifest>
}

function largeColumnMeasurements(
  workspace: ReturnType<typeof createStudioWorkspaceState>,
  options: { cardGap: number; cardHeight: number; cardWidth: number },
) {
  const cardRectsByCoordinate: Record<string, { bottom: number; left: number; right: number; top: number }> = {}

  workspace.columns[0]?.components.forEach((component, index) => {
    const top = index * (options.cardHeight + options.cardGap)
    cardRectsByCoordinate[component.coordinate] = {
      bottom: top + options.cardHeight,
      left: 0,
      right: options.cardWidth,
      top,
    }
  })

  return {
    0: {
      cardRectsByCoordinate,
      height: workspace.columns[0]?.components.length
        ? workspace.columns[0].components.length * (options.cardHeight + options.cardGap) - options.cardGap
        : 0,
      previewFrameRectsBySessionId: {},
    },
  }
}

function recordingPreviewGeometryStore(layoutFrameStateSessionIds: string[]) {
  return {
    cacheKeys: [],
    getFrameState: () => undefined,
    getLayoutFrameState(sessionId: string) {
      layoutFrameStateSessionIds.push(sessionId)
      return undefined
    },
    getMergedFrameState: () => undefined,
    getSnapshot: () => ({}),
    getVersionForKeys: () => "",
    hydrate: async () => ({}),
    markSessionRenderStarted: () => false,
    namespace: "test",
    putMessages: () => ({ changed: false, entriesToWrite: {}, snapshot: {} }),
    reset: () => {},
    subscribe: () => () => {},
    writeEntries: async () => {},
  }
}

function screenPointForCanvasPoint(transform: { x: number; y: number; scale: number }, point: { x: number; y: number }) {
  return {
    x: transform.x + point.x * transform.scale,
    y: transform.y + point.y * transform.scale,
  }
}

function cardSelectTargets(html: string): string[] {
  return [...html.matchAll(/data-runelight-card-select-coordinate="([^"]+)"[^>]+data-runelight-card-select-target="component-bounds"/g)].map(
    (match) => match[1] ?? "",
  )
}

function boundsHitTargetHtml(html: string): string {
  return html.match(/<div[^>]+data-runelight-card-select-coordinate="[^"]+"[^>]+data-runelight-card-select-target="component-bounds"[^>]*>/)?.[0] ?? ""
}

function selectedCardCoordinates(html: string): string[] {
  return [...html.matchAll(/<article[^>]+data-runelight-card-coordinate="([^"]+)"[^>]+data-runelight-card-selected="true"/g)].map(
    (match) => match[1] ?? "",
  )
}

function selectionOutlineHtml(html: string): string {
  return html.match(/<div[^>]+data-runelight-selection-outline="true"[^>]*>/)?.[0] ?? ""
}

function selectionOutlineCount(html: string): number {
  return [...html.matchAll(/data-runelight-selection-outline="true"/g)].length
}

function canvasSurfaceHtml(html: string): string {
  return html.match(/<div[^>]+data-runelight-canvas-surface="true"[^>]*>/)?.[0] ?? ""
}

function designCardHtml(html: string, coordinate: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-studio-design-card="${escapeRegExp(coordinate)}"[^>]*>`))?.[0] ?? ""
}

function sectionTagHtml(html: string, kind: string): string {
  return html.match(new RegExp(`<span[^>]+data-runelight-studio-change-section-tag="${escapeRegExp(kind)}"[^>]*>`))?.[0] ?? ""
}

function changeSectionHtml(html: string, kind: string): string {
  return html.match(new RegExp(`<section[^>]+data-runelight-studio-change-section="${escapeRegExp(kind)}"[^>]*>`))?.[0] ?? ""
}

function changeSectionItemsHtml(html: string, kind: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-studio-change-section-items="${escapeRegExp(kind)}"[^>]*>`))?.[0] ?? ""
}

function changeGroupHtml(html: string, key: string): string {
  return html.match(new RegExp(`<section[^>]+data-runelight-studio-change-group="${escapeRegExp(key)}"[^>]*>`))?.[0] ?? ""
}

function changePaneHtml(html: string, side: string): string {
  return html.match(new RegExp(`<section[^>]+data-runelight-studio-change-pane="${escapeRegExp(side)}"[^>]*>`))?.[0] ?? ""
}

function frameGridHtml(html: string, coordinate: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-frame-grid="${escapeRegExp(coordinate)}"[^>]*>`))?.[0] ?? ""
}

function frameGridPreviewScales(html: string): string[] {
  return [...html.matchAll(/data-runelight-frame-grid-preview-scale="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function previewClipHtml(html: string): string {
  return html.match(/<div[^>]+data-runelight-preview-clip="true"[^>]*>/)?.[0] ?? ""
}

function previewDimOverlayHtml(html: string, sessionId: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-preview-dim-overlay="${escapeRegExp(sessionId)}"[^>]*>`))?.[0] ?? ""
}

function deletedFrameOverlayHtml(html: string, frameName: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-frame-change-deleted-overlay="${escapeRegExp(frameName)}"[^>]*>`))?.[0] ?? ""
}

function previewFrameTagHtml(html: string, sessionId: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-preview-session-id="${escapeRegExp(sessionId)}"[^>]*>`))?.[0] ?? ""
}

function cardHtml(html: string, coordinate: string): string {
  return (
    html.match(new RegExp(`<article[^>]+data-runelight-card-coordinate="${escapeRegExp(coordinate)}"[\\s\\S]*?</article>`))?.[0] ?? ""
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function iframeSources(html: string): string[] {
  return [...html.matchAll(/<iframe[^>]+>/g)]
    .filter((match) => !(match[0] ?? "").includes("data-runelight-sidebar-preview-frame"))
    .flatMap((match) => {
      const source = match[0]?.match(/src="([^"]+)"/)?.[1]
      return source ? [source.replaceAll("&amp;", "&")] : []
    })
}

function previewSources(html: string): string[] {
  return [...html.matchAll(/data-runelight-preview-src="([^"]+)"/g)].map((match) => (match[1] ?? "").replaceAll("&amp;", "&"))
}

function previewFrameHtml(html: string, sessionId: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-preview-session-id="${escapeRegExp(sessionId)}"[\\s\\S]*?</div>`))?.[0] ?? ""
}

function framePreviewFrameHtml(html: string, frameName: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-frame-preview-frame="${escapeRegExp(frameName)}"[^>]*>`))?.[0] ?? ""
}

function frameTileHtml(html: string, frameName: string): string {
  return html.match(new RegExp(`<div[^>]+data-runelight-frame-tile="${escapeRegExp(frameName)}"[^>]*>`))?.[0] ?? ""
}

function canvasViewportPresets(html: string): string[] {
  return [...html.matchAll(/<div[^>]+data-runelight-preview-session-id="[^"]+"[^>]+data-runelight-preview-src="[^"]+"[^>]+data-runelight-viewport-preset="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  )
}

function columnCount(html: string): number {
  return [...html.matchAll(/data-runelight-column-index="/g)].length
}

function columnHtml(html: string, index: number): string {
  return html.match(new RegExp(`<section[^>]+data-runelight-column-index="${index}"[^>]*>`))?.[0] ?? ""
}

function frameControlNames(html: string): string[] {
  return [...html.matchAll(/data-runelight-frame-control="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function viewportControlNames(html: string): string[] {
  return [...html.matchAll(/data-runelight-viewport-control="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function runtimeInstanceIds(html: string): string[] {
  return [...html.matchAll(/data-runelight-runtime-instance-id="([^"]+)"/g)].map((match) => match[1] ?? "")
}
