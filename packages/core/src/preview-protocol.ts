import type { GBoundaryRect } from "./boundary-rect.js"
import type { GSerializedRuntimeValue, GRuntimeValueTruncation } from "./runtime-values.js"

export type { GBoundaryRect } from "./boundary-rect.js"
export type {
  GSerializedRuntimeValue,
  GRuntimeValueTruncation,
} from "./runtime-values.js"

export const G_PREVIEW_PROTOCOL_VERSION = 1

export const RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID = "runelight-preview-ssr-bootstrap"

export const RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT = `(() => {
  if (window.__runelightPreviewPrehydrationMailboxInstalled) return;
  window.__runelightPreviewPrehydrationMailboxInstalled = true;
  const isStringOrNull = (value) => value === null || typeof value === "string";
  const isFrameOverrides = (value) => value === undefined || (Array.isArray(value) && value.every((override) => Array.isArray(override) && override.length === 2 && typeof override[0] === "string" && typeof override[1] === "string"));
  const isRenderTarget = (value) => value && typeof value === "object" && isStringOrNull(value.frameName) && isFrameOverrides(value.frameOverrides) && isStringOrNull(value.chrome) && isStringOrNull(value.entry) && typeof value.sessionId === "string" && typeof value.staticMode === "boolean";
  const isRenderMessage = (value) => value && typeof value === "object" && value.type === "runelight:render" && value.protocolVersion === 1 && typeof value.sessionId === "string" && isRenderTarget(value.target) && value.target.sessionId === value.sessionId;
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
    if (!isRenderMessage(message)) return;
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

export type GBoundaryTreeNode = {
  id: string
  coordinate: string
  rect?: GBoundaryRect
  children: GBoundaryTreeNode[]
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
  sessionId: string
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

export type GPreviewSessionMessage =
  | GPreviewReadyMessage
  | GPreviewTreeMessage
  | GPreviewResizeMessage
  | GPreviewRequestValuesMessage
  | GPreviewValuesMessage
  | GPreviewErrorMessage

export type GPreviewProtocolMessage =
  | GPreviewSessionMessage
  | GPreviewRenderMessage
  | GPreviewPoolReadyMessage
  | GPreviewRenderAcceptedMessage

export function isGPreviewRenderTarget(value: unknown): value is GPreviewRenderTarget {
  return (
    isObjectRecord(value) &&
    isStringOrNull(value.frameName) &&
    isPreviewFrameOverrides(value.frameOverrides) &&
    isStringOrNull(value.chrome) &&
    isStringOrNull(value.entry) &&
    typeof value.sessionId === "string" &&
    typeof value.staticMode === "boolean"
  )
}

export function isGPreviewRenderMessage(value: unknown): value is GPreviewRenderMessage {
  if (!isObjectRecord(value) || value.type !== "runelight:render" || !hasPreviewSessionBase(value)) return false

  return isGPreviewRenderTarget(value.target) && value.target.sessionId === value.sessionId
}

export function isGPreviewPoolReadyMessage(value: unknown): value is GPreviewPoolReadyMessage {
  return isObjectRecord(value) && value.type === "runelight:pool-ready" && hasPreviewProtocolVersion(value)
}

export function isGPreviewRenderAcceptedMessage(value: unknown): value is GPreviewRenderAcceptedMessage {
  return isObjectRecord(value) && value.type === "runelight:render-accepted" && hasPreviewSessionBase(value)
}

export function isGPreviewSessionMessage(value: unknown): value is GPreviewSessionMessage {
  if (!isObjectRecord(value) || !hasPreviewSessionBase(value)) return false

  switch (value.type) {
    case "runelight:ready":
      return true
    case "runelight:tree":
      return isBoundaryTree(value.tree)
    case "runelight:resize":
      return isPreviewSize(value.size)
    case "runelight:error":
      return isPreviewError(value.error)
    case "runelight:request-values":
      return typeof value.boundaryId === "string"
    case "runelight:values":
      return isRuntimeValuesSnapshot(value.values)
    default:
      return false
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function hasPreviewProtocolVersion(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { protocolVersion: typeof G_PREVIEW_PROTOCOL_VERSION } {
  return value.protocolVersion === G_PREVIEW_PROTOCOL_VERSION
}

function hasPreviewSessionBase(value: Record<string, unknown>): value is Record<string, unknown> & GPreviewProtocolBase {
  return hasPreviewProtocolVersion(value) && typeof value.sessionId === "string"
}

function isFinitePreviewNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isPreviewFrameOverrides(value: unknown): value is [string, string][] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (override) =>
          Array.isArray(override) &&
          override.length === 2 &&
          typeof override[0] === "string" &&
          typeof override[1] === "string",
      ))
  )
}

function isPreviewSize(value: unknown): value is GPreviewResizeMessage["size"] {
  return isObjectRecord(value) && isFinitePreviewNumber(value.width) && isFinitePreviewNumber(value.height)
}

function isPreviewError(value: unknown): value is GPreviewErrorMessage["error"] {
  return isObjectRecord(value) && typeof value.message === "string" && isOptionalString(value.stack)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string"
}

function isBoundaryTree(value: unknown): value is GBoundaryTreeNode[] {
  return Array.isArray(value) && value.every(isBoundaryTreeNode)
}

function isBoundaryTreeNode(value: unknown): value is GBoundaryTreeNode {
  return (
    isObjectRecord(value) &&
    typeof value.id === "string" &&
    typeof value.coordinate === "string" &&
    (value.rect === undefined || isBoundaryRect(value.rect)) &&
    Array.isArray(value.children) &&
    value.children.every(isBoundaryTreeNode)
  )
}

function isBoundaryRect(value: unknown): value is GBoundaryRect {
  return (
    isObjectRecord(value) &&
    isFinitePreviewNumber(value.x) &&
    isFinitePreviewNumber(value.y) &&
    isFinitePreviewNumber(value.width) &&
    isFinitePreviewNumber(value.height)
  )
}

function isRuntimeValuesSnapshot(value: unknown): value is GRuntimeValuesSnapshot {
  return (
    isObjectRecord(value) &&
    typeof value.boundaryId === "string" &&
    isSerializedRuntimeValue(value.props) &&
    (value.scope === undefined || isSerializedRuntimeValue(value.scope)) &&
    Array.isArray(value.providerValues) &&
    value.providerValues.every(isRuntimeValueProviderSnapshot)
  )
}

function isRuntimeValueProviderSnapshot(
  value: unknown,
): value is GRuntimeValuesSnapshot["providerValues"][number] {
  return isObjectRecord(value) && typeof value.providerName === "string" && isSerializedRuntimeValue(value.value)
}

function isSerializedRuntimeValue(
  value: unknown,
  stack: WeakSet<object> = new WeakSet<object>(),
): value is GSerializedRuntimeValue {
  if (!isObjectRecord(value) || stack.has(value)) return false

  stack.add(value)
  const valid = isSerializedRuntimeValueRecord(value, stack)
  stack.delete(value)
  return valid
}

function isSerializedRuntimeValueRecord(
  value: Record<string, unknown>,
  stack: WeakSet<object>,
): value is GSerializedRuntimeValue {
  switch (value.type) {
    case "null":
      return value.value === null
    case "undefined":
      return true
    case "string":
    case "bigint":
    case "date":
      return typeof value.value === "string"
    case "number":
      return typeof value.value === "number"
    case "boolean":
      return typeof value.value === "boolean"
    case "symbol":
      return typeof value.displayName === "string" && isOptionalString(value.description)
    case "function":
      return typeof value.displayName === "string" && isOptionalString(value.name)
    case "error":
      return typeof value.name === "string" && typeof value.message === "string"
    case "framework-element":
      return (
        typeof value.framework === "string" &&
        typeof value.elementType === "string" &&
        isSerializedRuntimeValue(value.props, stack)
      )
    case "array":
    case "set":
      return (
        Array.isArray(value.values) &&
        value.values.every((item) => isSerializedRuntimeValue(item, stack)) &&
        isOptionalRuntimeValueTruncation(value.truncated)
      )
    case "map":
      return (
        Array.isArray(value.entries) &&
        value.entries.every((entry) => isSerializedRuntimeMapEntry(entry, stack)) &&
        isOptionalRuntimeValueTruncation(value.truncated)
      )
    case "object":
      return (
        typeof value.constructorName === "string" &&
        Array.isArray(value.entries) &&
        value.entries.every((entry) => isSerializedRuntimeObjectEntry(entry, stack)) &&
        isOptionalRuntimeValueTruncation(value.truncated)
      )
    case "circular":
      return typeof value.path === "string"
    case "truncated":
      return value.reason === "max-depth"
    default:
      return false
  }
}

function isSerializedRuntimeMapEntry(
  value: unknown,
  stack: WeakSet<object>,
): value is [GSerializedRuntimeValue, GSerializedRuntimeValue] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isSerializedRuntimeValue(value[0], stack) &&
    isSerializedRuntimeValue(value[1], stack)
  )
}

function isSerializedRuntimeObjectEntry(
  value: unknown,
  stack: WeakSet<object>,
): value is { key: string; value: GSerializedRuntimeValue } {
  return isObjectRecord(value) && typeof value.key === "string" && isSerializedRuntimeValue(value.value, stack)
}

function isOptionalRuntimeValueTruncation(value: unknown): value is GRuntimeValueTruncation | undefined {
  return (
    value === undefined ||
    (isObjectRecord(value) &&
      value.reason === "max-entries" &&
      Number.isInteger(value.remaining) &&
      typeof value.remaining === "number" &&
      value.remaining >= 0)
  )
}

export function encodeRunelightPreviewFrameOverride(coordinate: string, frameName: string): string {
  return `${encodeURIComponent(coordinate)}:${encodeURIComponent(frameName)}`
}

export function decodeRunelightPreviewFrameOverride(value: string): [string, string] | null {
  const separatorIndex = value.indexOf(":")
  if (separatorIndex <= 0) return null

  return [
    decodeRunelightPreviewFrameOverridePart(value.slice(0, separatorIndex)),
    decodeRunelightPreviewFrameOverridePart(value.slice(separatorIndex + 1)),
  ]
}

export function normalizeRunelightPreviewFrameOverride(value: string): string {
  const override = decodeRunelightPreviewFrameOverride(value)
  return override ? encodeRunelightPreviewFrameOverride(override[0], override[1]) : value
}

export function readRunelightPreviewFrameOverridesFromSearchParams(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("frameOverride")) {
    const override = decodeRunelightPreviewFrameOverride(value)
    if (override) overrides.set(override[0], override[1])
  }
  return overrides
}

function decodeRunelightPreviewFrameOverridePart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

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
    sessionId: target.sessionId,
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
