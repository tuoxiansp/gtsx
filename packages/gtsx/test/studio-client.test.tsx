import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  StudioShell,
  StudioWorkspaceView,
  applyStudioPreviewMessage,
  applyStudioPreviewMessageToFrameStates,
  applyStudioCanvasWheel,
  changeStudioComponentCase,
  changeStudioViewportPreset,
  createStudioRuntimeValuesRequest,
  createStudioWorkspaceStateFromUrl,
  createStudioWorkspaceState,
  createStudioWorkspaceUrlSearchParams,
  selectedStudioCaseName,
  selectStudioRuntimeInstance,
  selectStudioComponent,
} from "../src/studio-client.js"
import { buildStudioManifest } from "../src/studio-manifest.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")

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

  it("uses the whole UI card surface as the component selection target", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="component:src/UserCard.g.tsx#default" />)

    expect(cardSelectTargets(html)).toEqual(["src/UserCard.g.tsx#default"])
    expect(cardHtml(html, "src/UserCard.g.tsx#default")).not.toContain("<button")
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

  it("sizes preview iframes from runtime resize messages", () => {
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
    expect(html).toContain("height:420px")
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
    expect(caseControlNames(html)).toEqual(["neutral", "warning"])
  })

  it("passes selected child cases as gcase overrides to ancestor preview URLs", () => {
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
    expect(sources[0]).toContain("gcase=src%2FMultiExport.g.tsx%23NamedBadge%3Aready")
    expect(sources[1]).toBe(
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&case=ready&chrome=0&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready",
    )
    expect(createStudioRuntimeValuesRequest(manifest, childState, "child")?.sessionId).toBe(
      "src/UserCard.g.tsx#default:loading|src/MultiExport.g.tsx#NamedBadge:ready",
    )
  })

  it("renders ordered case controls in the Inspector", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={state} />)

    expect(html).toContain("Inspector")
    expect(html).toContain("Cases")
    expect(caseControlNames(html)).toEqual(["loading", "ready"])
  })

  it("renders runtime instances for a merged component card from the current parent context", () => {
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

    expect(html).toContain("Instances")
    expect(runtimeInstanceIds(html)).toEqual(["child-1", "child-2"])
    expect(html).toContain("Parent: src/UserCard.g.tsx#default")
    expect(html).toContain("100x32")
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

  it("renders values for the selected runtime instance", () => {
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

    expect(html).toContain("Values")
    expect(html).toContain("Props")
    expect(html).toContain("label")
    expect(html).toContain("Agent inbox")
    expect(html).toContain("Scope")
    expect(html).toContain("expanded")
    expect(html).toContain("true")
    expect(html).toContain("ThemeGTSXProvider")
  })

  it("round-trips restorable workspace state through URL params without runtime values", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const workspace = selectStudioRuntimeInstance(
      {
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
  return [...html.matchAll(/<article[^>]+data-gtsx-card-coordinate="([^"]+)"[^>]+data-gtsx-card-select-target="card"/g)].map(
    (match) => match[1] ?? "",
  )
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
  return [...html.matchAll(/<iframe[^>]+src="([^"]+)"/g)].map((match) => (match[1] ?? "").replaceAll("&amp;", "&"))
}

function previewSources(html: string): string[] {
  return [...html.matchAll(/data-gtsx-preview-src="([^"]+)"/g)].map((match) => (match[1] ?? "").replaceAll("&amp;", "&"))
}

function previewFrameHtml(html: string, sessionId: string): string {
  return html.match(new RegExp(`<div[^>]+data-gtsx-preview-session-id="${escapeRegExp(sessionId)}"[\\s\\S]*?</div>`))?.[0] ?? ""
}

function columnCount(html: string): number {
  return [...html.matchAll(/data-gtsx-column-index="/g)].length
}

function caseControlNames(html: string): string[] {
  return [...html.matchAll(/data-gtsx-case-control="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function runtimeInstanceIds(html: string): string[] {
  return [...html.matchAll(/data-gtsx-runtime-instance-id="([^"]+)"/g)].map((match) => match[1] ?? "")
}
