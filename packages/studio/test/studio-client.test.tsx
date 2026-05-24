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
  componentCardLayoutWidth,
  createStudioCanvasTransformFromUrl,
  createStudioRuntimeValuesRequest,
  createStudioWorkspaceStateFromUrl,
  createStudioWorkspaceState,
  createStudioWorkspaceUrlSearchParams,
  currentStudioPreviewTargets,
  mergeStudioPreviewFrameState,
  replaceStudioCanvasUrlState,
  selectedStudioCaseName,
  selectStudioRuntimeInstance,
  selectStudioComponent,
  studioPreviewWarmupTargets,
} from "../src/index.js"
import ComponentCard from "../src/components/ComponentCard.g.js"
import SelectedComponentCasesSidebar from "../src/components/SelectedComponentCasesSidebar.g.js"

const fixtureRoot = join(import.meta.dirname, "../../gtsx/test/fixtures/check-project")

type CreateStudioManifestOptions = NonNullable<Parameters<typeof createStudioManifest>[1]>

function buildStudioManifest(
  options: { cwd: string; projectRoot?: string; tsconfigPath?: string } & CreateStudioManifestOptions,
) {
  const projectIndex = buildGTSXProjectIndex({
    cwd: options.cwd,
    projectRoot: options.projectRoot,
    tsconfigPath: options.tsconfigPath,
  })
  return createStudioManifest(projectIndex, { preview: options.preview, routes: options.routes, diagnostics: options.diagnostics })
}

describe("GTSX Studio shell", () => {
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

  it("renders sidebar component entries as scaled tablet previews", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(html).toContain('data-gtsx-sidebar-preview-coordinate="src/MultiExport.g.tsx#NamedBadge"')
    expect(html).toContain('data-gtsx-viewport-preset="tablet"')
    expect(sidebarIframeSources(html)).toEqual([])
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

  it("uses only the rendered component bounds as the component selection target", () => {
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
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("top:20px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("width:100px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("height:32px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).not.toContain("<button")
  })

  it("clips component selection overlays to the preview viewport", () => {
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

    expect(selectionOutlineHtml(html)).toContain("width:390px")
    expect(boundsHitTargetHtml(html)).toContain("width:390px")
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).toContain("width:390px")
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
      "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0&sessionId=src%2FUserCard.g.tsx%23default%3Aready",
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
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&case=ready&chrome=0&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready",
      "/gtsx?entry=src%2FMultiExport.g.tsx%23default&case=defaultReady&chrome=0&sessionId=src%2FMultiExport.g.tsx%23default%3AdefaultReady",
    ])
    expect(iframeSources(html)).toEqual([])
    expect(html).not.toContain("Preview will load when visible.")
    expect(previewFrameHtml(html, "src/MultiExport.g.tsx#NamedBadge:ready")).not.toContain("background:#ffffff")
    expect(previewFrameHtml(html, "src/MultiExport.g.tsx#NamedBadge:ready")).not.toContain("border:1px solid #e5e7eb")
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
      "src/MultiExport.g.tsx#NamedBadge:ready",
    ])
    expect(warmupTargets.map((target) => target.previewUrl)).toContain(
      "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0&sessionId=warmup%3Atablet%0Asrc%2FUserCard.g.tsx%23default%0Aready",
    )
    expect(warmupTargets.map((target) => target.sessionId)).not.toContain("src/UserCard.g.tsx#default:loading")
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

  it("uses cached preview geometry for selected component case previews", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src", routes: { preview: "/gtsx" } })
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === "src/UserCard.g.tsx#default")
    if (!component) throw new Error("Missing UserCard fixture")

    const html = renderToStaticMarkup(
      <SelectedComponentCasesSidebar
        component={component}
        previewCache={{
          "tablet\nsrc/UserCard.g.tsx#default\nready": {
            lastUsedAt: 1,
            frameState: {
              expectedSessionId: "warmup:tablet\nsrc/UserCard.g.tsx#default\nready",
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
        selectedCaseName="ready"
        viewportPreset="tablet"
      />,
    )

    expect(casePreviewFrameHtml(html, "ready")).toContain("height:64px")
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
    expect(canvasViewportPresets(html)).toEqual(["tablet", "tablet"])
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

  it("uses component bounds height instead of viewport height for canvas card layout", () => {
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

    expect(previewFrameHtml(html, "src/UserCard.g.tsx#default:loading")).toContain("height:100px")
  })

  it("uses component bounds instead of desktop viewport width for card column layout", () => {
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
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&amp;case=ready&amp;chrome=0&amp;sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready",
    )
    expect(previewSources(html)).toContain(
      "/gtsx?entry=src%2FMultiExport.g.tsx%23default&case=defaultReady&chrome=0&sessionId=src%2FMultiExport.g.tsx%23default%3AdefaultReady",
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
    expect(nextState.selectedCoordinatePath).toEqual(["src/UserCard.g.tsx#default"])
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
      "/gtsx?entry=src%2FBadge.g.tsx%23default&case=warning&chrome=0&sessionId=src%2FBadge.g.tsx%23default%3Awarning",
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
    expect(sources[1]).toBe(
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&case=ready&chrome=0&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready",
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
    expect(restored.selection).toBe("file:src/Badge.g.tsx")
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

function sidebarIframeSources(html: string): string[] {
  return [...html.matchAll(/<iframe[^>]+data-gtsx-sidebar-preview-frame="true"[^>]+src="([^"]+)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  )
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
