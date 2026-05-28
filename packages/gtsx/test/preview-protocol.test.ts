import { describe, expect, it } from "vitest"

import {
  createGPreviewRequestValuesMessage,
  createGPreviewErrorMessage,
  createGPreviewPoolReadyMessage,
  createGPreviewReadyMessage,
  createGPreviewRenderAcceptedMessage,
  createGPreviewRenderMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
  createGPreviewValuesMessage,
  type GBoundaryTreeNode,
} from "../src/index.js"

const tree = [
  {
    id: "gtsx-boundary:0",
    coordinate: "src/Parent.g.tsx#default",
    children: [
      {
        id: "gtsx-boundary:1",
        coordinate: "src/Child.g.tsx#default",
        children: [],
      },
    ],
  },
] satisfies GBoundaryTreeNode[]

describe("GTSX preview iframe protocol", () => {
  it("creates versioned preview messages with session IDs", () => {
    expect(createGPreviewReadyMessage("session-1")).toEqual({
      type: "gtsx:ready",
      protocolVersion: 1,
      sessionId: "session-1",
    })
    expect(createGPreviewTreeMessage("session-1", tree)).toEqual({
      type: "gtsx:tree",
      protocolVersion: 1,
      sessionId: "session-1",
      tree,
    })
    expect(createGPreviewResizeMessage("session-1", { width: 320, height: 240 })).toEqual({
      type: "gtsx:resize",
      protocolVersion: 1,
      sessionId: "session-1",
      size: { width: 320, height: 240 },
    })
    expect(createGPreviewErrorMessage("session-1", new Error("render failed"))).toMatchObject({
      type: "gtsx:error",
      protocolVersion: 1,
      sessionId: "session-1",
      error: {
        message: "render failed",
      },
    })
  })

  it("creates on-demand runtime values request and response messages", () => {
    expect(createGPreviewRequestValuesMessage("session-1", "gtsx-boundary:2")).toEqual({
      type: "gtsx:request-values",
      protocolVersion: 1,
      sessionId: "session-1",
      boundaryId: "gtsx-boundary:2",
    })
    expect(
      createGPreviewValuesMessage("session-1", {
        boundaryId: "gtsx-boundary:2",
        props: { type: "object", constructorName: "Object", entries: [] },
        scope: { type: "undefined" },
        providerValues: [{ providerName: "ThemeGTSXProvider", value: { type: "string", value: "dark" } }],
      }),
    ).toEqual({
      type: "gtsx:values",
      protocolVersion: 1,
      sessionId: "session-1",
      values: {
        boundaryId: "gtsx-boundary:2",
        props: { type: "object", constructorName: "Object", entries: [] },
        scope: { type: "undefined" },
        providerValues: [{ providerName: "ThemeGTSXProvider", value: { type: "string", value: "dark" } }],
      },
    })
  })

  it("creates pooled iframe render control messages", () => {
    expect(
      createGPreviewRenderMessage({
        caseName: "ready",
        caseOverrides: [["src/Child.g.tsx#default", "open"]],
        chrome: "0",
        entry: "src/Card.g.tsx#default",
        sessionId: "src/Card.g.tsx#default:ready",
        staticMode: true,
      }),
    ).toEqual({
      type: "gtsx:render",
      protocolVersion: 1,
      sessionId: "src/Card.g.tsx#default:ready",
      target: {
        caseName: "ready",
        caseOverrides: [["src/Child.g.tsx#default", "open"]],
        chrome: "0",
        entry: "src/Card.g.tsx#default",
        sessionId: "src/Card.g.tsx#default:ready",
        staticMode: true,
      },
    })

    expect(createGPreviewPoolReadyMessage()).toEqual({
      type: "gtsx:pool-ready",
      protocolVersion: 1,
    })

    expect(createGPreviewRenderAcceptedMessage("src/Card.g.tsx#default:ready")).toEqual({
      type: "gtsx:render-accepted",
      protocolVersion: 1,
      sessionId: "src/Card.g.tsx#default:ready",
    })
  })
})
