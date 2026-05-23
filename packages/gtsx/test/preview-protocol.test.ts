import { describe, expect, it } from "vitest"

import {
  createGPreviewErrorMessage,
  createGPreviewReadyMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
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
})
