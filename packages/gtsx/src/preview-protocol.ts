import type { GBoundaryTreeNode } from "./runtime.js"

export const G_PREVIEW_PROTOCOL_VERSION = 1

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

export type GPreviewProtocolMessage =
  | GPreviewReadyMessage
  | GPreviewTreeMessage
  | GPreviewResizeMessage
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
