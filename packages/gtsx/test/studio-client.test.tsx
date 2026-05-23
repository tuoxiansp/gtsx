import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  StudioShell,
  StudioWorkspaceView,
  applyStudioPreviewMessage,
  applyStudioPreviewMessageToFrameStates,
  changeStudioComponentCase,
  createStudioWorkspaceState,
  selectedStudioCaseName,
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

  it("renders preview iframes from component coordinates and first statically enumerable cases", () => {
    const manifest = buildStudioManifest({
      cwd: fixtureRoot,
      projectRoot: "src",
      routes: { preview: "/gtsx" },
    })
    const html = renderToStaticMarkup(<StudioShell manifest={manifest} selection="file:src/MultiExport.g.tsx" />)

    expect(iframeSources(html)).toEqual([
      "/gtsx?entry=src%2FMultiExport.g.tsx%23NamedBadge&case=ready&sessionId=src%2FMultiExport.g.tsx%23NamedBadge%3Aready",
      "/gtsx?entry=src%2FMultiExport.g.tsx%23default&case=defaultReady&sessionId=src%2FMultiExport.g.tsx%23default%3AdefaultReady",
    ])
    expect(html).toContain("Current case: ready")
    expect(html).toContain("Current case: defaultReady")
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

    expect(iframeSources(html)).toEqual([
      "/gtsx?entry=src%2FBadge.g.tsx%23default&case=warning&sessionId=src%2FBadge.g.tsx%23default%3Awarning",
    ])
    expect(html).toContain("Current case: warning")
  })

  it("renders ordered case controls in the Inspector", () => {
    const manifest = buildStudioManifest({ cwd: fixtureRoot, projectRoot: "src" })
    const state = createStudioWorkspaceState(manifest, "component:src/UserCard.g.tsx#default")

    const html = renderToStaticMarkup(<StudioWorkspaceView manifest={manifest} workspace={state} />)

    expect(html).toContain("Inspector")
    expect(html).toContain("Cases")
    expect(caseControlNames(html)).toEqual(["loading", "ready"])
  })
})

function cardCoordinates(html: string): string[] {
  return [...html.matchAll(/data-gtsx-card-coordinate="([^"]+)"/g)].map((match) => match[1] ?? "")
}

function iframeSources(html: string): string[] {
  return [...html.matchAll(/<iframe[^>]+src="([^"]+)"/g)].map((match) => (match[1] ?? "").replaceAll("&amp;", "&"))
}

function columnCount(html: string): number {
  return [...html.matchAll(/data-gtsx-column-index="/g)].length
}

function caseControlNames(html: string): string[] {
  return [...html.matchAll(/data-gtsx-case-control="([^"]+)"/g)].map((match) => match[1] ?? "")
}
