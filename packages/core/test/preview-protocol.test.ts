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
  G_RENDERED_SNAPSHOT_VERSION,
  type GBoundaryTreeNode,
  type GPreviewRenderTarget,
  type GRuntimeValuesSnapshot,
  readGRenderedSnapshot,
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

  it("omits margin styles from rendered snapshots because geometry already captures visual layout", () => {
    const withMargins = readGRenderedSnapshot(renderedSnapshotDocument({
      marginLeft: "160px",
      marginRight: "160px",
    }))
    const withoutMargins = readGRenderedSnapshot(renderedSnapshotDocument({
      marginLeft: "0px",
      marginRight: "0px",
    }))

    expect(withMargins.version).toBe(G_RENDERED_SNAPSHOT_VERSION)
    expect(withMargins.nodes[0]?.styles).toEqual({
      color: "rgb(23, 32, 51)",
      display: "block",
    })
    expect(withMargins.nodes[0]?.styles).not.toHaveProperty("margin-left")
    expect(withMargins.nodes[0]?.styles).not.toHaveProperty("margin-right")
    expect(withMargins.hash).toBe(withoutMargins.hash)
  })

  it("omits framework route announcers from rendered snapshots without shifting visible paths", () => {
    const withAnnouncer = readGRenderedSnapshot(renderedSnapshotDocumentWithIgnoredChild("before"))
    const withoutAnnouncer = readGRenderedSnapshot(renderedSnapshotDocumentWithIgnoredChild("none"))

    expect(withAnnouncer.version).toBe(G_RENDERED_SNAPSHOT_VERSION)
    expect(withAnnouncer.nodes.map((node) => node.path)).toEqual(["body", "body/main[0]"])
    expect(withAnnouncer.nodes.some((node) => node.tag === "next-route-announcer")).toBe(false)
    expect(withAnnouncer.hash).toBe(withoutAnnouncer.hash)
  })
})

function renderedSnapshotDocument(styles: { marginLeft: string; marginRight: string }): Document {
  const element = {
    childNodes: [],
    children: [],
    getAttribute() {
      return null
    },
    getBoundingClientRect() {
      return { height: 1024, left: 160, top: 0, width: 448 }
    },
    tagName: "MAIN",
  }

  return {
    body: element,
    defaultView: {
      getComputedStyle(_element: unknown, pseudo?: string) {
        return {
          getPropertyValue(property: string) {
            if (pseudo && property === "content") return "none"
            if (property === "color") return "rgb(23, 32, 51)"
            if (property === "display") return "block"
            if (property === "margin-left") return styles.marginLeft
            if (property === "margin-right") return styles.marginRight
            return ""
          },
        }
      },
      innerHeight: 1024,
      innerWidth: 768,
    },
    documentElement: { clientHeight: 1024, clientWidth: 768 },
  } as unknown as Document
}

function renderedSnapshotDocumentWithIgnoredChild(position: "before" | "none"): Document {
  const main = renderedSnapshotElement("MAIN", [], { height: 200, width: 300, x: 12, y: 34 })
  const children = position === "before"
    ? [renderedSnapshotElement("NEXT-ROUTE-ANNOUNCER"), main]
    : [main]
  const body = renderedSnapshotElement("BODY", children, { height: 1024, width: 768, x: 0, y: 0 })

  return {
    body,
    defaultView: {
      getComputedStyle(_element: unknown, pseudo?: string) {
        return {
          getPropertyValue(property: string) {
            if (pseudo && property === "content") return "none"
            if (property === "color") return "rgb(23, 32, 51)"
            if (property === "display") return "block"
            return ""
          },
        }
      },
      innerHeight: 1024,
      innerWidth: 768,
    },
    documentElement: { clientHeight: 1024, clientWidth: 768 },
  } as unknown as Document
}

function renderedSnapshotElement(
  tagName: string,
  children: unknown[] = [],
  rect: { height: number; width: number; x: number; y: number } = { height: 0, width: 0, x: 0, y: 0 },
) {
  return {
    childNodes: [],
    children,
    getAttribute() {
      return null
    },
    getBoundingClientRect() {
      return {
        height: rect.height,
        left: rect.x,
        top: rect.y,
        width: rect.width,
      }
    },
    tagName,
  }
}
