import type { GBoundaryRect } from "./boundary-rect.js"
import type { GSerializedRuntimeValue, GRuntimeValueTruncation } from "./runtime-values.js"

export type { GBoundaryRect } from "./boundary-rect.js"
export type {
  GSerializedRuntimeValue,
  GRuntimeValueTruncation,
} from "./runtime-values.js"

export const G_PREVIEW_PROTOCOL_VERSION = 1

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export const G_RENDERED_SNAPSHOT_VERSION = 3

export const RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID = "runelight-preview-ssr-bootstrap"

export const RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT = `(() => {
  if (window.__runelightPreviewPrehydrationMailboxInstalled) return;
  window.__runelightPreviewPrehydrationMailboxInstalled = true;
  const isStringOrNull = (value) => value === null || typeof value === "string";
  const isFrameSelections = (value) => value === undefined || (Array.isArray(value) && value.every((selection) => Array.isArray(selection) && selection.length === 2 && typeof selection[0] === "string" && typeof selection[1] === "string"));
  const isRenderTarget = (value) => value && typeof value === "object" && isStringOrNull(value.frameName) && isFrameSelections(value.frameOverrides) && isFrameSelections(value.inputOverrides) && isStringOrNull(value.chrome) && isStringOrNull(value.entry) && typeof value.sessionId === "string" && typeof value.staticMode === "boolean";
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

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export type GRenderedSnapshotRect = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export type GRenderedSnapshotPseudo = {
  content: string
  styles?: Record<string, string>
}

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export type GRenderedSnapshotNode = {
  attrs?: Record<string, string>
  after?: GRenderedSnapshotPseudo
  before?: GRenderedSnapshotPseudo
  path: string
  rect?: GRenderedSnapshotRect
  styles?: Record<string, string>
  tag: string
  text?: string
}

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export type GRenderedSnapshot = {
  hash: string
  nodes: GRenderedSnapshotNode[]
  truncated?: boolean
  version: typeof G_RENDERED_SNAPSHOT_VERSION
  viewport: {
    width: number
    height: number
  }
}

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export type GPreviewRenderedSnapshotMessage = GPreviewProtocolBase & {
  type: "runelight:rendered-snapshot"
  snapshot: GRenderedSnapshot
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
  inputOverrides?: [string, string][]
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
  | GPreviewRenderedSnapshotMessage
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
    isPreviewFrameOverrides(value.inputOverrides) &&
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
    case "runelight:rendered-snapshot":
      return isRenderedSnapshot(value.snapshot)
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

function isRenderedSnapshot(value: unknown): value is GRenderedSnapshot {
  return (
    isObjectRecord(value) &&
    typeof value.hash === "string" &&
    value.version === G_RENDERED_SNAPSHOT_VERSION &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isRenderedSnapshotNode) &&
    (value.truncated === undefined || typeof value.truncated === "boolean") &&
    isPreviewSize(value.viewport)
  )
}

function isRenderedSnapshotNode(value: unknown): value is GRenderedSnapshotNode {
  return (
    isObjectRecord(value) &&
    typeof value.path === "string" &&
    typeof value.tag === "string" &&
    (value.text === undefined || typeof value.text === "string") &&
    (value.rect === undefined || isBoundaryRect(value.rect)) &&
    (value.attrs === undefined || isStringRecord(value.attrs)) &&
    (value.styles === undefined || isStringRecord(value.styles)) &&
    (value.before === undefined || isRenderedSnapshotPseudo(value.before)) &&
    (value.after === undefined || isRenderedSnapshotPseudo(value.after))
  )
}

function isRenderedSnapshotPseudo(value: unknown): value is GRenderedSnapshotPseudo {
  return isObjectRecord(value) && typeof value.content === "string" && (value.styles === undefined || isStringRecord(value.styles))
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isObjectRecord(value) && Object.values(value).every((entry) => typeof entry === "string")
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

export function encodeRunelightPreviewInputOverride(coordinate: string, frameName: string): string {
  return encodeRunelightPreviewFrameOverride(coordinate, frameName)
}

export function decodeRunelightPreviewInputOverride(value: string): [string, string] | null {
  return decodeRunelightPreviewFrameOverride(value)
}

export function normalizeRunelightPreviewInputOverride(value: string): string {
  return normalizeRunelightPreviewFrameOverride(value)
}

export function readRunelightPreviewInputOverridesFromSearchParams(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("inputOverride")) {
    const override = decodeRunelightPreviewInputOverride(value)
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

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export function createGPreviewRenderedSnapshotMessage(
  sessionId: string,
  snapshot: GRenderedSnapshot,
): GPreviewRenderedSnapshotMessage {
  return {
    type: "runelight:rendered-snapshot",
    protocolVersion: G_PREVIEW_PROTOCOL_VERSION,
    sessionId,
    snapshot,
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

const renderedSnapshotNodeLimit = 1500

const renderedSnapshotIgnoredTags = new Set(["script", "style", "link", "meta", "noscript", "template", "next-route-announcer"])

const renderedSnapshotAttrs = [
  "alt",
  "aria-label",
  "checked",
  "disabled",
  "d",
  "fill",
  "height",
  "href",
  "placeholder",
  "points",
  "role",
  "selected",
  "src",
  "stroke",
  "title",
  "type",
  "value",
  "viewBox",
  "width",
] as const

const renderedSnapshotStyleProperties = [
  "align-items",
  "background-color",
  "background-image",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "box-shadow",
  "color",
  "display",
  "filter",
  "flex-direction",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "justify-content",
  "letter-spacing",
  "line-height",
  "object-fit",
  "object-position",
  "opacity",
  "overflow-x",
  "overflow-y",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "text-align",
  "text-decoration-line",
  "text-transform",
  "transform",
  "visibility",
  "z-index",
] as const

const renderedSnapshotPseudoStyleProperties = [
  "background-color",
  "background-image",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "color",
  "display",
  "font-size",
  "font-weight",
  "height",
  "opacity",
  "position",
  "transform",
  "visibility",
  "width",
] as const

/**
 * @internal Preview runtime to Studio rendered-diff protocol detail.
 */
export function readGRenderedSnapshot(document: Document): GRenderedSnapshot {
  const root = document.body ?? document.documentElement
  const win = document.defaultView
  const nodes: GRenderedSnapshotNode[] = []
  let truncated = false

  const visit = (element: Element, path: string): boolean => {
    if (nodes.length >= renderedSnapshotNodeLimit) {
      truncated = true
      return false
    }

    const tag = element.tagName.toLowerCase()
    if (renderedSnapshotIgnoredTags.has(tag)) return false

    const style = win?.getComputedStyle(element)
    if (style?.display === "none") return false

    const node = renderedSnapshotNode(element, path, tag, style, win)
    if (node) nodes.push(node)

    let childIndex = 0
    for (const child of element.children) {
      const childTag = child.tagName.toLowerCase()
      if (visit(child, `${path}/${childTag}[${childIndex}]`)) childIndex += 1
      if (truncated) break
    }
    return true
  }

  visit(root, root.tagName.toLowerCase())
  const snapshotBody = {
    nodes,
    truncated: truncated || undefined,
    version: G_RENDERED_SNAPSHOT_VERSION as typeof G_RENDERED_SNAPSHOT_VERSION,
    viewport: {
      width: Math.round(win?.innerWidth ?? document.documentElement.clientWidth),
      height: Math.round(win?.innerHeight ?? document.documentElement.clientHeight),
    },
  }

  return {
    ...snapshotBody,
    hash: hashPreviewString(JSON.stringify(snapshotBody)),
  }
}

function renderedSnapshotNode(
  element: Element,
  path: string,
  tag: string,
  style: CSSStyleDeclaration | undefined,
  win: Window | null | undefined,
): GRenderedSnapshotNode | undefined {
  const attrs = renderedSnapshotElementAttrs(element)
  const text = normalizeRenderedSnapshotText(
    Array.from(element.childNodes)
      .flatMap((child) => (child.nodeType === 3 ? [child.textContent ?? ""] : []))
      .join(" "),
  )
  const rect = renderedSnapshotElementRect(element)
  const styles = style ? renderedSnapshotStyles(style, renderedSnapshotStyleProperties) : undefined
  const before = renderedSnapshotPseudo(element, "::before", win)
  const after = renderedSnapshotPseudo(element, "::after", win)

  if (!rect && !text && !attrs && !styles && !before && !after) return undefined

  return {
    ...(attrs ? { attrs } : {}),
    ...(after ? { after } : {}),
    ...(before ? { before } : {}),
    path,
    ...(rect ? { rect } : {}),
    ...(styles ? { styles } : {}),
    tag,
    ...(text ? { text } : {}),
  }
}

function renderedSnapshotElementAttrs(element: Element): Record<string, string> | undefined {
  const attrs: Record<string, string> = {}
  for (const name of renderedSnapshotAttrs) {
    const value = element.getAttribute(name)
    if (value !== null && value !== "") attrs[name] = value
  }

  const tag = element.tagName.toLowerCase()
  if ((tag === "input" || tag === "textarea" || tag === "select") && "value" in element) {
    const value = String(element.value)
    if (value !== "") attrs.value = value
  }
  if (tag === "input") {
    if ("checked" in element && element.checked) attrs.checked = "true"
    if ("disabled" in element && element.disabled) attrs.disabled = "true"
  }
  if (tag === "img") {
    const src = ("currentSrc" in element ? String(element.currentSrc) : "") || element.getAttribute("src")
    if (src) attrs.src = src
  }
  if (tag === "a") {
    const href = ("href" in element ? String(element.href) : "") || element.getAttribute("href")
    if (href) attrs.href = href
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined
}

function renderedSnapshotElementRect(element: Element): GRenderedSnapshotRect | undefined {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return {
    x: roundRenderedSnapshotNumber(rect.left),
    y: roundRenderedSnapshotNumber(rect.top),
    width: roundRenderedSnapshotNumber(rect.width),
    height: roundRenderedSnapshotNumber(rect.height),
  }
}

function renderedSnapshotStyles(
  style: CSSStyleDeclaration,
  properties: readonly string[],
): Record<string, string> | undefined {
  const styles: Record<string, string> = {}
  for (const property of properties) {
    const value = normalizeRenderedSnapshotStyleValue(style.getPropertyValue(property))
    if (value) styles[property] = value
  }
  return Object.keys(styles).length > 0 ? styles : undefined
}

function renderedSnapshotPseudo(
  element: Element,
  pseudo: "::before" | "::after",
  win: Window | null | undefined,
): GRenderedSnapshotPseudo | undefined {
  const style = win?.getComputedStyle(element, pseudo)
  if (!style) return undefined
  const content = normalizeRenderedSnapshotPseudoContent(style.getPropertyValue("content"))
  if (!content) return undefined
  const styles = renderedSnapshotStyles(style, renderedSnapshotPseudoStyleProperties)
  return {
    content,
    ...(styles ? { styles } : {}),
  }
}

function normalizeRenderedSnapshotText(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized || undefined
}

function normalizeRenderedSnapshotStyleValue(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized || undefined
}

function normalizeRenderedSnapshotPseudoContent(value: string): string | undefined {
  const normalized = normalizeRenderedSnapshotStyleValue(value)
  if (!normalized || normalized === "none" || normalized === "normal" || normalized === "\"\"" || normalized === "''") return undefined
  return normalized
}

function roundRenderedSnapshotNumber(value: number): number {
  return Math.round(value * 1000) / 1000
}

function hashPreviewString(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
