import { describe, expect, it } from "vitest"

import {
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT,
  createGPreviewRequestValuesMessage,
  createGPreviewErrorMessage,
  createGPreviewPoolReadyMessage,
  createGPreviewReadyMessage,
  createGPreviewRenderAcceptedMessage,
  createGPreviewRenderMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
  createGPreviewValuesMessage,
  runelightPreviewSsrBootstrapScriptId,
  type GBoundaryTreeNode,
} from "../src/index.js"

const tree = [
  {
    id: "runelight-boundary:0",
    coordinate: "src/Parent.g.tsx#default",
    children: [
      {
        id: "runelight-boundary:1",
        coordinate: "src/Child.g.tsx#default",
        children: [],
      },
    ],
  },
] satisfies GBoundaryTreeNode[]

describe("Runelight preview iframe protocol", () => {
  it("creates versioned preview messages with session IDs", () => {
    expect(createGPreviewReadyMessage("session-1")).toEqual({
      type: "runelight:ready",
      protocolVersion: 1,
      sessionId: "session-1",
    })
    expect(createGPreviewTreeMessage("session-1", tree)).toEqual({
      type: "runelight:tree",
      protocolVersion: 1,
      sessionId: "session-1",
      tree,
    })
    expect(createGPreviewResizeMessage("session-1", { width: 320, height: 240 })).toEqual({
      type: "runelight:resize",
      protocolVersion: 1,
      sessionId: "session-1",
      size: { width: 320, height: 240 },
    })
    expect(createGPreviewErrorMessage("session-1", new Error("render failed"))).toMatchObject({
      type: "runelight:error",
      protocolVersion: 1,
      sessionId: "session-1",
      error: {
        message: "render failed",
      },
    })
  })

  it("creates on-demand runtime values request and response messages", () => {
    expect(createGPreviewRequestValuesMessage("session-1", "runelight-boundary:2")).toEqual({
      type: "runelight:request-values",
      protocolVersion: 1,
      sessionId: "session-1",
      boundaryId: "runelight-boundary:2",
    })
    expect(
      createGPreviewValuesMessage("session-1", {
        boundaryId: "runelight-boundary:2",
        props: { type: "object", constructorName: "Object", entries: [] },
        scope: { type: "undefined" },
        providerValues: [{ providerName: "ThemeRunelightProvider", value: { type: "string", value: "dark" } }],
      }),
    ).toEqual({
      type: "runelight:values",
      protocolVersion: 1,
      sessionId: "session-1",
      values: {
        boundaryId: "runelight-boundary:2",
        props: { type: "object", constructorName: "Object", entries: [] },
        scope: { type: "undefined" },
        providerValues: [{ providerName: "ThemeRunelightProvider", value: { type: "string", value: "dark" } }],
      },
    })
  })

  it("creates pooled iframe render control messages", () => {
    expect(
      createGPreviewRenderMessage({
        frameName: "ready",
        frameOverrides: [["src/Child.g.tsx#default", "open"]],
        chrome: "0",
        entry: "src/Card.g.tsx#default",
        sessionId: "src/Card.g.tsx#default:ready",
        staticMode: true,
      }),
    ).toEqual({
      type: "runelight:render",
      protocolVersion: 1,
      sessionId: "src/Card.g.tsx#default:ready",
      target: {
        frameName: "ready",
        frameOverrides: [["src/Child.g.tsx#default", "open"]],
        chrome: "0",
        entry: "src/Card.g.tsx#default",
        sessionId: "src/Card.g.tsx#default:ready",
        staticMode: true,
      },
    })

    expect(createGPreviewPoolReadyMessage()).toEqual({
      type: "runelight:pool-ready",
      protocolVersion: 1,
    })

    expect(createGPreviewRenderAcceptedMessage("src/Card.g.tsx#default:ready")).toEqual({
      type: "runelight:render-accepted",
      protocolVersion: 1,
      sessionId: "src/Card.g.tsx#default:ready",
    })
  })

  it("exposes the framework-neutral SSR preview bootstrap script", () => {
    expect(runelightPreviewSsrBootstrapScriptId).toBe("runelight-preview-ssr-bootstrap")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:render")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:render-accepted")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:pool-ready")
  })
})
