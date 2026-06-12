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
  decodeRunelightPreviewFrameOverride,
  encodeRunelightPreviewFrameOverride,
  isGPreviewPoolReadyMessage,
  isGPreviewRenderAcceptedMessage,
  isGPreviewRenderMessage,
  isGPreviewRenderTarget,
  isGPreviewSessionMessage,
  normalizeRunelightPreviewFrameOverride,
  readRunelightPreviewFrameOverridesFromSearchParams,
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID,
  type GBoundaryTreeNode,
  type GPreviewRenderTarget,
  type GRuntimeValuesSnapshot,
} from "../src/preview-protocol.js"

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

const values = {
  boundaryId: "runelight-boundary:2",
  props: { type: "object", constructorName: "Object", entries: [] },
  scope: { type: "undefined" },
  providerValues: [{ providerName: "ThemeRunelightProvider", value: { type: "string", value: "dark" } }],
} satisfies GRuntimeValuesSnapshot

const renderTarget = {
  frameName: "ready",
  frameOverrides: [["src/Child.g.tsx#default", "open"]],
  chrome: "0",
  entry: "src/Card.g.tsx#default",
  sessionId: "src/Card.g.tsx#default:ready",
  staticMode: true,
} satisfies GPreviewRenderTarget

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
      createGPreviewValuesMessage("session-1", values),
    ).toEqual({
      type: "runelight:values",
      protocolVersion: 1,
      sessionId: "session-1",
      values,
    })
  })

  it("creates pooled iframe render control messages", () => {
    expect(
      createGPreviewRenderMessage(renderTarget),
    ).toEqual({
      type: "runelight:render",
      protocolVersion: 1,
      sessionId: "src/Card.g.tsx#default:ready",
      target: renderTarget,
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

  it("identifies pooled iframe render control messages", () => {
    expect(isGPreviewRenderTarget(renderTarget)).toBe(true)
    expect(isGPreviewRenderMessage(createGPreviewRenderMessage(renderTarget))).toBe(true)
    expect(isGPreviewPoolReadyMessage(createGPreviewPoolReadyMessage())).toBe(true)
    expect(isGPreviewRenderAcceptedMessage(createGPreviewRenderAcceptedMessage("src/Card.g.tsx#default:ready"))).toBe(true)

    expect(isGPreviewRenderTarget({ ...renderTarget, sessionId: null })).toBe(false)
    expect(isGPreviewRenderTarget({ ...renderTarget, staticMode: "1" })).toBe(false)
    expect(isGPreviewRenderTarget({ ...renderTarget, frameOverrides: [["src/Child.g.tsx#default"]] })).toBe(false)
    expect(
      isGPreviewRenderMessage({
        type: "runelight:render",
        protocolVersion: 1,
        sessionId: "session-1",
        target: { ...renderTarget, sessionId: "session-2" },
      }),
    ).toBe(false)
    expect(isGPreviewPoolReadyMessage({ type: "runelight:pool-ready" })).toBe(false)
    expect(isGPreviewRenderAcceptedMessage({ type: "runelight:render-accepted", protocolVersion: 1 })).toBe(false)
  })

  it("identifies session messages without accepting pooled control messages", () => {
    expect(isGPreviewSessionMessage({ type: "runelight:ready", protocolVersion: 1, sessionId: "session-1" })).toBe(true)
    expect(isGPreviewSessionMessage(createGPreviewTreeMessage("session-1", tree))).toBe(true)
    expect(isGPreviewSessionMessage(createGPreviewResizeMessage("session-1", { width: 320, height: 240 }))).toBe(true)
    expect(isGPreviewSessionMessage(createGPreviewErrorMessage("session-1", new Error("render failed")))).toBe(true)
    expect(isGPreviewSessionMessage(createGPreviewRequestValuesMessage("session-1", "runelight-boundary:2"))).toBe(true)
    expect(isGPreviewSessionMessage(createGPreviewValuesMessage("session-1", values))).toBe(true)
    expect(isGPreviewSessionMessage({ type: "runelight:ready", protocolVersion: 1 })).toBe(false)
    expect(isGPreviewSessionMessage({ type: "runelight:pool-ready", protocolVersion: 1 })).toBe(false)
    expect(
      isGPreviewSessionMessage({
        type: "runelight:render",
        protocolVersion: 1,
        sessionId: "session-1",
        target: {
          chrome: "0",
          entry: "src/Card.g.tsx#default",
          frameName: "ready",
          sessionId: "session-1",
          staticMode: true,
        },
      }),
    ).toBe(false)
  })

  it("rejects malformed session message payloads", () => {
    expect(
      isGPreviewSessionMessage({
        type: "runelight:tree",
        protocolVersion: 1,
        sessionId: "session-1",
        tree: [{ id: "runelight-boundary:0", coordinate: "src/Card.g.tsx#default" }],
      }),
    ).toBe(false)
    expect(
      isGPreviewSessionMessage({
        type: "runelight:resize",
        protocolVersion: 1,
        sessionId: "session-1",
        size: { width: "320", height: 240 },
      }),
    ).toBe(false)
    expect(
      isGPreviewSessionMessage({
        type: "runelight:error",
        protocolVersion: 1,
        sessionId: "session-1",
        error: { message: 404 },
      }),
    ).toBe(false)
    expect(
      isGPreviewSessionMessage({
        type: "runelight:request-values",
        protocolVersion: 1,
        sessionId: "session-1",
        boundaryId: 2,
      }),
    ).toBe(false)
    expect(
      isGPreviewSessionMessage({
        type: "runelight:values",
        protocolVersion: 1,
        sessionId: "session-1",
        values: {
          boundaryId: "runelight-boundary:2",
          props: { type: "object" },
          providerValues: [],
        },
      }),
    ).toBe(false)
  })

  it("escapes frame override parts before joining them with the preview delimiter", () => {
    const override = encodeRunelightPreviewFrameOverride("src/Child.g.tsx#default", "open:error")

    expect(override).toBe("src%2FChild.g.tsx%23default:open%3Aerror")
    expect(decodeRunelightPreviewFrameOverride(override)).toEqual(["src/Child.g.tsx#default", "open:error"])
    expect(normalizeRunelightPreviewFrameOverride("src/Child.g.tsx#default:open:error")).toBe(
      "src%2FChild.g.tsx%23default:open%3Aerror",
    )
  })

  it("keeps reading legacy unescaped frame overrides", () => {
    const params = new URLSearchParams("frameOverride=src%2FChild.g.tsx%23default%3Aopen&frameOverride=userId:user_1")

    expect(readRunelightPreviewFrameOverridesFromSearchParams(params)).toEqual(
      new Map([
        ["src/Child.g.tsx#default", "open"],
        ["userId", "user_1"],
      ]),
    )
  })

  it("exposes the framework-neutral SSR preview bootstrap script", () => {
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID).toBe("runelight-preview-ssr-bootstrap")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:render")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:render-accepted")
    expect(RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT).toContain("runelight:pool-ready")
  })
})
