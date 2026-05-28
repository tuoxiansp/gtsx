import type { GBoundaryTreeNode } from "./runtime.js"
import type { GSerializedRuntimeValue } from "./runtime-values.js"

export const G_PREVIEW_PROTOCOL_VERSION = 1

export const gtsxPreviewSsrBootstrapScriptId = "gtsx-preview-ssr-bootstrap"

export const GTSX_PREVIEW_SSR_BOOTSTRAP_SCRIPT = `(() => {
  if (window.__gtsxPreviewPrehydrationMailboxInstalled) return;
  window.__gtsxPreviewPrehydrationMailboxInstalled = true;
  const render = (target) => {
    window.__gtsxPreviewPendingRenderTarget = target;
    if (target && target.sessionId) {
      window.parent.postMessage({ type: "gtsx:render-accepted", protocolVersion: 1, sessionId: target.sessionId }, "*");
    }
    window.dispatchEvent(new CustomEvent("gtsx:preview-render-target", { detail: target }));
  };
  window.__gtsxPreviewRenderTargetMailbox = { render };
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "gtsx:render" || message.protocolVersion !== 1 || !message.target) return;
    render(message.target);
  });
  window.setTimeout(() => {
    window.parent.postMessage({ type: "gtsx:pool-ready", protocolVersion: 1 }, "*");
  }, 0);
})();`

type GPreviewProtocolBase = {
  protocolVersion: typeof G_PREVIEW_PROTOCOL_VERSION
  sessionId: string
}

export type GPreviewReadyMessage = GPreviewProtocolBase & {
  type: "gtsx:ready"
}

export type GPreviewTreeMessage = GPreviewProtocolBase & {
  type: "gtsx:tree"
  tree: GBoundaryTreeNode[]
}

export type GPreviewResizeMessage = GPreviewProtocolBase & {
  type: "gtsx:resize"
  size: {
    width: number
    height: number
  }
}

export type GPreviewErrorMessage = GPreviewProtocolBase & {
  type: "gtsx:error"
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
  type: "gtsx:request-values"
  boundaryId: string
}

export type GPreviewValuesMessage = GPreviewProtocolBase & {
  type: "gtsx:values"
  values: GRuntimeValuesSnapshot
}

export type GPreviewRenderTarget = {
  caseName: string | null
  caseOverrides?: [string, string][]
  chrome: string | null
  entry: string | null
  sessionId: string | null
  staticMode: boolean
}

export type GPreviewRenderMessage = GPreviewProtocolBase & {
  type: "gtsx:render"
  target: GPreviewRenderTarget
}

export type GPreviewPoolReadyMessage = {
  type: "gtsx:pool-ready"
  protocolVersion: typeof G_PREVIEW_PROTOCOL_VERSION
}

export type GPreviewRenderAcceptedMessage = GPreviewProtocolBase & {
  type: "gtsx:render-accepted"
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
    type: "gtsx:ready",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
  }
}

export function createGPreviewTreeMessage(sessionId: string, tree: GBoundaryTreeNode[]): GPreviewTreeMessage {
  return {
    type: "gtsx:tree",
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
    type: "gtsx:resize",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    size,
  }
}

export function createGPreviewErrorMessage(sessionId: string, error: unknown): GPreviewErrorMessage {
  const normalized = error instanceof Error ? error : new Error(String(error))

  return {
    type: "gtsx:error",
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
    type: "gtsx:request-values",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    boundaryId,
  }
}

export function createGPreviewValuesMessage(sessionId: string, values: GRuntimeValuesSnapshot): GPreviewValuesMessage {
  return {
    type: "gtsx:values",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    values,
  }
}

export function createGPreviewRenderMessage(target: GPreviewRenderTarget): GPreviewRenderMessage {
  return {
    type: "gtsx:render",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId: target.sessionId ?? "",
    target,
  }
}

export function createGPreviewPoolReadyMessage(): GPreviewPoolReadyMessage {
  return {
    type: "gtsx:pool-ready",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
  }
}

export function createGPreviewRenderAcceptedMessage(sessionId: string): GPreviewRenderAcceptedMessage {
  return {
    type: "gtsx:render-accepted",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
  }
}
