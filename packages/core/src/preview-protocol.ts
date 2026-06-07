import type { GBoundaryTreeNode } from "./runtime.js"
import type { GSerializedRuntimeValue } from "./runtime-values.js"

export const G_PREVIEW_PROTOCOL_VERSION = 1

export const runelightPreviewSsrBootstrapScriptId = "runelight-preview-ssr-bootstrap"

export const RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT = `(() => {
  if (window.__runelightPreviewPrehydrationMailboxInstalled) return;
  window.__runelightPreviewPrehydrationMailboxInstalled = true;
  const render = (target) => {
    window.__runelightPreviewPendingRenderTarget = target;
    if (target && target.sessionId) {
      window.parent.postMessage({ type: "runelight:render-accepted", protocolVersion: 1, sessionId: target.sessionId }, "*");
    }
    window.dispatchEvent(new CustomEvent("runelight:preview-render-target", { detail: target }));
  };
  window.__runelightPreviewRenderTargetMailbox = { render };
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "runelight:render" || message.protocolVersion !== 1 || !message.target) return;
    render(message.target);
  });
  window.setTimeout(() => {
    window.parent.postMessage({ type: "runelight:pool-ready", protocolVersion: 1 }, "*");
  }, 0);
})();`

type GPreviewProtocolBase = {
  protocolVersion: typeof G_PREVIEW_PROTOCOL_VERSION
  sessionId: string
}

export type GPreviewReadyMessage = GPreviewProtocolBase & {
  type: "runelight:ready"
}

export type GPreviewTreeMessage = GPreviewProtocolBase & {
  type: "runelight:tree"
  tree: GBoundaryTreeNode[]
}

export type GPreviewResizeMessage = GPreviewProtocolBase & {
  type: "runelight:resize"
  size: {
    width: number
    height: number
  }
}

export type GPreviewErrorMessage = GPreviewProtocolBase & {
  type: "runelight:error"
  error: {
    message: string
    stack?: string
  }
}

export type GRuntimeValuesSnapshot = {
  boundaryId: string
  props: GSerializedRuntimeValue
  scope?: GSerializedRuntimeValue
  providerValues: {
    providerName: string
    value: GSerializedRuntimeValue
  }[]
}

export type GPreviewRequestValuesMessage = GPreviewProtocolBase & {
  type: "runelight:request-values"
  boundaryId: string
}

export type GPreviewValuesMessage = GPreviewProtocolBase & {
  type: "runelight:values"
  values: GRuntimeValuesSnapshot
}

export type GPreviewRenderTarget = {
  frameName: string | null
  frameOverrides?: [string, string][]
  chrome: string | null
  entry: string | null
  sessionId: string | null
  staticMode: boolean
}

export type GPreviewRenderMessage = GPreviewProtocolBase & {
  type: "runelight:render"
  target: GPreviewRenderTarget
}

export type GPreviewPoolReadyMessage = {
  type: "runelight:pool-ready"
  protocolVersion: typeof G_PREVIEW_PROTOCOL_VERSION
}

export type GPreviewRenderAcceptedMessage = GPreviewProtocolBase & {
  type: "runelight:render-accepted"
}

export type GPreviewProtocolMessage =
  | GPreviewReadyMessage
  | GPreviewTreeMessage
  | GPreviewResizeMessage
  | GPreviewRequestValuesMessage
  | GPreviewValuesMessage
  | GPreviewRenderMessage
  | GPreviewErrorMessage

export function createGPreviewReadyMessage(sessionId: string): GPreviewReadyMessage {
  return {
    type: "runelight:ready",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
  }
}

export function createGPreviewTreeMessage(sessionId: string, tree: GBoundaryTreeNode[]): GPreviewTreeMessage {
  return {
    type: "runelight:tree",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    tree,
  }
}

export function createGPreviewResizeMessage(
  sessionId: string,
  size: GPreviewResizeMessage["size"],
): GPreviewResizeMessage {
  return {
    type: "runelight:resize",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    size,
  }
}

export function createGPreviewErrorMessage(sessionId: string, error: unknown): GPreviewErrorMessage {
  const normalized = error instanceof Error ? error : new Error(String(error))

  return {
    type: "runelight:error",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    error: {
      message: normalized.message,
      ...(normalized.stack ? { stack: normalized.stack } : {}),
    },
  }
}

export function createGPreviewRequestValuesMessage(sessionId: string, boundaryId: string): GPreviewRequestValuesMessage {
  return {
    type: "runelight:request-values",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    boundaryId,
  }
}

export function createGPreviewValuesMessage(sessionId: string, values: GRuntimeValuesSnapshot): GPreviewValuesMessage {
  return {
    type: "runelight:values",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    values,
  }
}

export function createGPreviewRenderMessage(target: GPreviewRenderTarget): GPreviewRenderMessage {
  return {
    type: "runelight:render",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId: target.sessionId ?? "",
    target,
  }
}

export function createGPreviewPoolReadyMessage(): GPreviewPoolReadyMessage {
  return {
    type: "runelight:pool-ready",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
  }
}

export function createGPreviewRenderAcceptedMessage(sessionId: string): GPreviewRenderAcceptedMessage {
  return {
    type: "runelight:render-accepted",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
  }
}
