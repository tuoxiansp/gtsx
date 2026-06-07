import React from "react"

import {
  GPreviewProvider,
  createGBoundaryCollector,
  createGPreviewErrorMessage,
  createGPreviewPoolReadyMessage,
  createGPreviewReadyMessage,
  createGPreviewRenderAcceptedMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
  createGPreviewValuesMessage,
  readGBoundaryElementRect,
  type GBoundaryCollector,
  type GBoundaryRect,
  type GPreviewProtocolMessage,
  type GPreviewRenderMessage,
  type GPreviewRenderTarget,
  type AnyGProvider,
} from "@runelight/core"

export type RunelightPreviewFrame<Props extends object = Record<string, unknown>> = {
  props: Props
  providers?: readonly (readonly [AnyGProvider, unknown])[]
  scope?: unknown
}

export type RunelightPreviewComponent<Props extends object = Record<string, unknown>> = React.ComponentType<Props> & {
  frames?: Record<string, RunelightPreviewFrame<Props>>
}

export type RunelightPreviewModule = Record<string, unknown>

export type RunelightPreviewComponentLoader = (entry: string) =>
  | RunelightPreviewComponent
  | Promise<RunelightPreviewComponent | undefined>
  | undefined

type LoadedRunelightPreviewEntry = {
  component: RunelightPreviewComponent | null
  entry: string
}

export type RunelightPreviewRouteParams = {
  frameName: string | null
  frameOverrides: Map<string, string>
  chrome: string | null
  entry: string | null
  poolMode: boolean
  renderRequestSequence: number
  sessionId: string | null
  staticMode: boolean
}

export type RunelightPreviewRenderTargetMailboxState = {
  currentTarget: RunelightPreviewRouteParams | null
  currentTargetContentKey: string | null
  renderRequestSequence: number
}

export type RunelightPreviewRenderTargetMailboxUpdate = {
  shouldNotifySubscribers: boolean
  state: RunelightPreviewRenderTargetMailboxState
}

export type RunelightReactPreviewClientProps = {
  frameName?: string | null
  frameOverrides?: Map<string, string>
  chrome?: boolean | string | null
  defaultEntry?: string
  entry?: string | null
  loadComponent: RunelightPreviewComponentLoader
  missingEntryDetail?: string
  pool?: boolean | string | null
  poolMode?: boolean
  sessionId?: string | null
  staticMode?: boolean
}

export type RunelightPreviewFrameSheetProps<Props extends object = Record<string, unknown>> = {
  boundaryCollector?: GBoundaryCollector
  frameOverrides?: Map<string, string>
  component: RunelightPreviewComponent<Props>
  entry: string
  selectedFrames: Array<{ name: string; frame: RunelightPreviewFrame<Props> }>
  showChrome?: boolean
}

const loadedRunelightPreviewEntriesByLoader = new WeakMap<RunelightPreviewComponentLoader, Map<string, LoadedRunelightPreviewEntry>>()
const loadingRunelightPreviewEntriesByLoader = new WeakMap<RunelightPreviewComponentLoader, Map<string, Promise<LoadedRunelightPreviewEntry>>>()

export function RunelightReactPreviewClient({
  frameName = null,
  frameOverrides = new Map(),
  chrome = null,
  defaultEntry,
  entry,
  loadComponent,
  missingEntryDetail = "Pass ?entry=src/components/.../*.g.tsx to render a Runelight preview.",
  pool = null,
  poolMode,
  sessionId = null,
  staticMode = false,
}: RunelightReactPreviewClientProps) {
  const resolvedPoolMode = poolMode ?? (typeof pool === "boolean" ? pool : pool === "1")
  const routeTarget = React.useMemo(
    () => ({
      frameName,
      frameOverrides,
      chrome: typeof chrome === "boolean" ? (chrome ? "1" : "0") : chrome,
      entry: entry ?? defaultEntry ?? null,
      poolMode: resolvedPoolMode,
      renderRequestSequence: 0,
      sessionId,
      staticMode,
    }),
    [frameName, frameOverrides, chrome, defaultEntry, entry, resolvedPoolMode, sessionId, staticMode],
  )
  const renderTarget = useRunelightPreviewRenderTarget(routeTarget)
  const showChrome = showChromeForPreviewTarget(renderTarget.chrome)

  if (!renderTarget.entry) {
    if (renderTarget.poolMode) {
      return <RunelightPreviewDocumentBackground showChrome={false} />
    }

    return (
      <>
        <RunelightPreviewDocumentBackground showChrome={showChrome} />
        <RunelightPreviewMessage detail={missingEntryDetail} sessionId={renderTarget.sessionId} title="Missing entry" />
      </>
    )
  }

  return (
    <>
      <RunelightPreviewDocumentBackground showChrome={showChrome} />
      <RunelightEntryPreview
        frameName={renderTarget.frameName}
        frameOverrides={renderTarget.frameOverrides}
        entry={renderTarget.entry}
        key={previewRenderTargetKey(renderTarget)}
        loadComponent={loadComponent}
        sessionId={renderTarget.sessionId}
        showChrome={showChrome}
        staticMode={renderTarget.staticMode}
      />
    </>
  )
}

function RunelightEntryPreview({
  frameName,
  frameOverrides,
  entry,
  loadComponent,
  sessionId,
  showChrome,
  staticMode,
}: {
  frameName: string | null
  frameOverrides: Map<string, string>
  entry: string
  loadComponent: RunelightPreviewComponentLoader
  sessionId: string | null
  showChrome: boolean
  staticMode: boolean
}) {
  const cachedEntry = readLoadedRunelightPreviewEntry(loadComponent, entry)
  const [loadedEntry, setLoadedEntry] = React.useState<LoadedRunelightPreviewEntry | null>(cachedEntry)
  const effectiveLoadedEntry = cachedEntry ?? loadedEntry

  React.useEffect(() => {
    const cached = readLoadedRunelightPreviewEntry(loadComponent, entry)
    if (cached) {
      setLoadedEntry(cached)
      return
    }

    let ignore = false

    loadRunelightPreviewEntry(loadComponent, entry)
      .then((loaded) => {
        if (!ignore) {
          setLoadedEntry(loaded)
        }
      })

    return () => {
      ignore = true
    }
  }, [entry, loadComponent])

  if (!effectiveLoadedEntry || effectiveLoadedEntry.entry !== entry) {
    return showChrome ? <RunelightPreviewMessage detail={entry} title="Loading" /> : null
  }

  if (!effectiveLoadedEntry.component) {
    return <RunelightPreviewMessage detail={entry} sessionId={sessionId} title="Unknown Runelight entry" />
  }

  return (
    <LoadedRunelightEntryPreview
      frameName={frameName}
      frameOverrides={frameOverrides}
      component={effectiveLoadedEntry.component}
      entry={entry}
      sessionId={sessionId}
      showChrome={showChrome}
      staticMode={staticMode}
    />
  )
}

function readLoadedRunelightPreviewEntry(
  loadComponent: RunelightPreviewComponentLoader,
  entry: string,
): LoadedRunelightPreviewEntry | null {
  return loadedRunelightPreviewEntriesByLoader.get(loadComponent)?.get(entry) ?? null
}

function loadRunelightPreviewEntry(
  loadComponent: RunelightPreviewComponentLoader,
  entry: string,
): Promise<LoadedRunelightPreviewEntry> {
  let loadedEntries = loadedRunelightPreviewEntriesByLoader.get(loadComponent)
  if (!loadedEntries) {
    loadedEntries = new Map()
    loadedRunelightPreviewEntriesByLoader.set(loadComponent, loadedEntries)
  }

  const loadedEntry = loadedEntries.get(entry)
  if (loadedEntry) return Promise.resolve(loadedEntry)

  let loadingEntries = loadingRunelightPreviewEntriesByLoader.get(loadComponent)
  if (!loadingEntries) {
    loadingEntries = new Map()
    loadingRunelightPreviewEntriesByLoader.set(loadComponent, loadingEntries)
  }

  const loadingEntry = loadingEntries.get(entry)
  if (loadingEntry) return loadingEntry

  const nextLoadingEntry = Promise.resolve(loadComponent(entry))
    .then((component) => ({ component: component ?? null, entry }))
    .catch(() => ({ component: null, entry }))
    .then((loaded) => {
      loadedEntries.set(entry, loaded)
      loadingEntries.delete(entry)
      return loaded
    })
  loadingEntries.set(entry, nextLoadingEntry)
  return nextLoadingEntry
}

function LoadedRunelightEntryPreview({
  frameName,
  frameOverrides,
  component,
  entry,
  sessionId,
  showChrome,
  staticMode,
}: {
  frameName: string | null
  frameOverrides: Map<string, string>
  component: RunelightPreviewComponent
  entry: string
  sessionId: string | null
  showChrome: boolean
  staticMode: boolean
}) {
  const collector = React.useMemo(() => createGBoundaryCollector(), [])
  const frames = component.frames ?? {}
  const selectedFrames = frameName ? [[frameName, frames[frameName]] as const] : Object.entries(frames)
  const renderableFrames = selectedFrames.flatMap(([name, frame]) => (frame ? [{ name, frame }] : []))
  const hasRenderableFrames = selectedFrames.length > 0 && renderableFrames.length === selectedFrames.length

  useRunelightPreviewProtocolMessages(sessionId, collector, hasRenderableFrames, { staticMode })

  if (!hasRenderableFrames) {
    return <RunelightPreviewMessage detail={frameName ?? "No frames declared"} sessionId={sessionId} title="Unknown Runelight frame" />
  }

  return (
    <RunelightPreviewFrameSheet
      boundaryCollector={collector}
      frameOverrides={frameOverrides}
      component={component}
      entry={entry}
      selectedFrames={renderableFrames}
      showChrome={showChrome}
    />
  )
}

export function RunelightPreviewFrameSheet<Props extends object = Record<string, unknown>>({
  boundaryCollector,
  frameOverrides = new Map(),
  component: Component,
  entry,
  selectedFrames,
  showChrome = true,
}: RunelightPreviewFrameSheetProps<Props>) {
  return (
    <main style={{ display: "grid", gap: 16, minHeight: showChrome ? "100vh" : undefined, padding: showChrome ? 24 : 0 }}>
      {selectedFrames.map(({ name, frame }) => (
        <section data-runelight-preview-frame={name} key={name}>
          {showChrome ? (
            <header
              style={{
                color: "#64748b",
                font: "12px ui-monospace, SFMono-Regular, Menlo, monospace",
                marginBottom: 8,
              }}
            >
              {entry} / {name}
            </header>
          ) : null}
          <GPreviewProvider
            boundaryCollector={boundaryCollector}
            frameOverrides={frameOverridesForFrame(entry, name, frameOverrides)}
            {...previewRuntimeProps(frame)}
          >
            <Component {...frame.props} />
          </GPreviewProvider>
        </section>
      ))}
    </main>
  )
}

export function RunelightPreviewDocumentBackground({ showChrome }: { showChrome: boolean }) {
  if (showChrome) return null

  return <style>{`html, body { background: transparent !important; }`}</style>
}

export function RunelightPreviewMessage({
  detail,
  sessionId,
  title,
}: {
  detail: string
  sessionId?: string | null
  title: string
}) {
  React.useEffect(() => {
    if (!sessionId) return
    window.parent.postMessage(createGPreviewErrorMessage(sessionId, new Error(`${title}: ${detail}`)), "*")
  }, [detail, sessionId, title])

  return (
    <main
      data-runelight-preview-message
      style={{
        color: "#172033",
        display: "grid",
        gap: 8,
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>{detail}</p>
    </main>
  )
}

export function readRunelightPreviewRouteParams(params: URLSearchParams): RunelightPreviewRouteParams {
  return {
    frameName: params.get("frame"),
    frameOverrides: readRunelightPreviewFrameOverrides(params),
    chrome: params.get("chrome"),
    entry: params.get("entry"),
    poolMode: params.get("pool") === "1",
    renderRequestSequence: 0,
    sessionId: params.get("sessionId"),
    staticMode: params.get("static") === "1",
  }
}

type RunelightPreviewRenderTargetSubscriber = (target: RunelightPreviewRouteParams) => void

type RunelightPreviewRenderTargetMailbox = {
  announcePoolReady: () => void
  getTarget: () => RunelightPreviewRouteParams | null
  render: (target: GPreviewRenderTarget) => void
  subscribe: (subscriber: RunelightPreviewRenderTargetSubscriber) => () => void
}

declare global {
  interface Window {
    __runelightPreviewPendingRenderTarget?: GPreviewRenderTarget
    __runelightPreviewPrehydrationMailboxInstalled?: boolean
    __runelightPreviewRenderTargetMailbox?: Pick<RunelightPreviewRenderTargetMailbox, "render">
  }
}

let runelightPreviewRenderTargetMailbox: RunelightPreviewRenderTargetMailbox | null = null

function useRunelightPreviewRenderTarget(routeTarget: RunelightPreviewRouteParams): RunelightPreviewRouteParams {
  const mailbox = routeTarget.poolMode ? ensureRunelightPreviewRenderTargetMailbox() : null
  const [messageTarget, setMessageTarget] = React.useState<RunelightPreviewRouteParams | null>(() => mailbox?.getTarget() ?? null)

  React.useEffect(() => {
    if (!mailbox) return

    const unsubscribe = mailbox.subscribe(setMessageTarget)
    mailbox.announcePoolReady()
    return unsubscribe
  }, [mailbox])

  if (!routeTarget.poolMode) return routeTarget
  return messageTarget ?? routeTarget
}

function ensureRunelightPreviewRenderTargetMailbox(): RunelightPreviewRenderTargetMailbox | null {
  if (typeof window === "undefined") return null
  if (runelightPreviewRenderTargetMailbox) return runelightPreviewRenderTargetMailbox

  const subscribers = new Set<RunelightPreviewRenderTargetSubscriber>()
  let mailboxState = createRunelightPreviewRenderTargetMailboxState(window.__runelightPreviewPendingRenderTarget ?? null)
  let poolReadyAnnounced = false

  const applyRenderTarget = (target: GPreviewRenderTarget, options: { acknowledge: boolean }) => {
    window.__runelightPreviewPendingRenderTarget = target
    if (options.acknowledge && target.sessionId) {
      window.parent.postMessage(createGPreviewRenderAcceptedMessage(target.sessionId), "*")
    }

    const update = applyRunelightPreviewRenderTargetRequest(mailboxState, target, options)
    mailboxState = update.state
    if (!update.shouldNotifySubscribers || !mailboxState.currentTarget) return

    for (const subscriber of subscribers) subscriber(mailboxState.currentTarget)
  }

  const render = (target: GPreviewRenderTarget) => applyRenderTarget(target, { acknowledge: true })
  const handlePrehydrationRenderTarget = (event: Event) => {
    const target = (event as CustomEvent<GPreviewRenderTarget>).detail
    if (isGPreviewRenderTarget(target)) applyRenderTarget(target, { acknowledge: false })
  }

  window.__runelightPreviewRenderTargetMailbox = { render }
  if (window.__runelightPreviewPrehydrationMailboxInstalled) {
    window.addEventListener("runelight:preview-render-target", handlePrehydrationRenderTarget)
  } else {
    window.addEventListener("message", (event: MessageEvent) => {
      if (!isGPreviewRenderMessage(event.data)) return
      render(event.data.target)
    })
  }

  runelightPreviewRenderTargetMailbox = {
    announcePoolReady() {
      if (poolReadyAnnounced) return
      poolReadyAnnounced = true
      if (window.__runelightPreviewPrehydrationMailboxInstalled) return
      window.setTimeout(() => {
        window.parent.postMessage(createGPreviewPoolReadyMessage(), "*")
      }, 0)
    },
    getTarget() {
      return mailboxState.currentTarget
    },
    render,
    subscribe(subscriber) {
      subscribers.add(subscriber)
      const target = this.getTarget()
      if (target) subscriber(target)
      return () => {
        subscribers.delete(subscriber)
      }
    },
  }
  return runelightPreviewRenderTargetMailbox
}

function previewRouteParamsFromRenderTarget(
  target: GPreviewRenderTarget,
  renderRequestSequence: number,
): RunelightPreviewRouteParams {
  return {
    frameName: target.frameName,
    frameOverrides: new Map(target.frameOverrides ?? []),
    chrome: target.chrome,
    entry: target.entry,
    poolMode: false,
    renderRequestSequence,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  }
}

export function createRunelightPreviewRenderTargetMailboxState(
  target: GPreviewRenderTarget | null,
): RunelightPreviewRenderTargetMailboxState {
  const currentTarget = target ? previewRouteParamsFromRenderTarget(target, 0) : null
  return {
    currentTarget,
    currentTargetContentKey: currentTarget ? previewRenderTargetContentKey(currentTarget) : null,
    renderRequestSequence: 0,
  }
}

export function applyRunelightPreviewRenderTargetRequest(
  state: RunelightPreviewRenderTargetMailboxState,
  target: GPreviewRenderTarget,
  options: { acknowledge: boolean },
): RunelightPreviewRenderTargetMailboxUpdate {
  const renderRequestSequence = options.acknowledge ? state.renderRequestSequence + 1 : state.renderRequestSequence
  const currentTarget = previewRouteParamsFromRenderTarget(target, renderRequestSequence)
  const currentTargetContentKey = previewRenderTargetContentKey(currentTarget)
  const sameContentTarget = state.currentTargetContentKey === currentTargetContentKey

  if (sameContentTarget && !options.acknowledge) {
    return { shouldNotifySubscribers: false, state }
  }

  return {
    shouldNotifySubscribers: true,
    state: {
      currentTarget,
      currentTargetContentKey,
      renderRequestSequence,
    },
  }
}

function isGPreviewRenderMessage(value: unknown): value is GPreviewRenderMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "runelight:render" &&
    (value as { protocolVersion?: unknown }).protocolVersion === 1 &&
    typeof (value as { target?: unknown }).target === "object" &&
    (value as { target?: unknown }).target !== null
  )
}

function isGPreviewRenderTarget(value: unknown): value is GPreviewRenderTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, "entry") &&
    Object.prototype.hasOwnProperty.call(value, "frameName") &&
    Object.prototype.hasOwnProperty.call(value, "sessionId")
  )
}

function showChromeForPreviewTarget(chrome: string | null): boolean {
  return chrome === null ? true : chrome !== "0"
}

function previewRenderTargetKey(target: RunelightPreviewRouteParams): string {
  return JSON.stringify({
    frameName: target.frameName,
    frameOverrides: [...target.frameOverrides],
    chrome: target.chrome,
    entry: target.entry,
    poolMode: target.poolMode,
    renderRequestSequence: target.renderRequestSequence,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  })
}

function previewRenderTargetContentKey(target: RunelightPreviewRouteParams): string {
  return JSON.stringify({
    frameName: target.frameName,
    frameOverrides: [...target.frameOverrides],
    chrome: target.chrome,
    entry: target.entry,
    poolMode: target.poolMode,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  })
}

export function readRunelightPreviewFrameOverrides(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("frameOverride")) {
    const separatorIndex = value.lastIndexOf(":")
    if (separatorIndex > 0) {
      overrides.set(value.slice(0, separatorIndex), value.slice(separatorIndex + 1))
    }
  }
  return overrides
}

export function frameOverridesForFrame(entry: string, frameName: string, childOverrides: Map<string, string>): Map<string, string> {
  return new Map([...childOverrides, [toComponentCoordinate(entry), frameName]])
}

export function parseRunelightPreviewEntry(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}

export function isRunelightPreviewComponent(value: unknown): value is RunelightPreviewComponent {
  return typeof value === "function"
}

function previewRuntimeProps<Props extends object>(
  frame: RunelightPreviewFrame<Props>,
): Pick<React.ComponentProps<typeof GPreviewProvider>, "providerValues" | "scope"> {
  return {
    ...(Object.prototype.hasOwnProperty.call(frame, "scope") ? { scope: frame.scope } : {}),
    ...(frame.providers ? { providerValues: new Map(frame.providers) } : {}),
  }
}

function toComponentCoordinate(entry: string): string {
  return entry.includes("#") ? entry : `${entry}#default`
}

function useRunelightPreviewProtocolMessages(
  sessionId: string | null,
  collector: ReturnType<typeof createGBoundaryCollector>,
  enabled: boolean,
  options: { staticMode?: boolean } = {},
) {
  React.useEffect(() => {
    if (!sessionId || !enabled) return
    let scheduledFrame = 0
    let settleTimer = 0
    let settled = false
    let resizeObserver: ResizeObserver | undefined

    const settleStaticPreview = () => {
      settled = true
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("resize", scheduleLayoutPublish)
      resizeObserver?.disconnect()
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
      if (settleTimer) window.clearTimeout(settleTimer)
      scheduledFrame = 0
      settleTimer = 0
    }

    const publishLayout = () => {
      updateBoundaryRects(collector)
      const tree = collector.getTree()
      window.parent.postMessage(createGPreviewTreeMessage(sessionId, tree), "*")
      window.parent.postMessage(createGPreviewResizeMessage(sessionId, previewContentSize(tree)), "*")

      if (options.staticMode) {
        if (settleTimer) window.clearTimeout(settleTimer)
        settleTimer = window.setTimeout(settleStaticPreview, 400)
      }
    }

    const scheduleLayoutPublish = () => {
      if (settled) return
      if (scheduledFrame) return
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = 0
        publishLayout()
      })
    }

    const handleMessage = (event: MessageEvent) => {
      if (!isRuntimeValuesRequest(event.data, sessionId)) return

      const values = collector.getValues(event.data.boundaryId)
      if (values) {
        window.parent.postMessage(createGPreviewValuesMessage(sessionId, values), "*")
      }
    }

    window.addEventListener("message", handleMessage)
    window.addEventListener("resize", scheduleLayoutPublish)
    resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleLayoutPublish) : undefined
    resizeObserver?.observe(document.documentElement)
    if (document.body) resizeObserver?.observe(document.body)
    window.parent.postMessage(createGPreviewReadyMessage(sessionId), "*")
    publishLayout()
    return () => {
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("resize", scheduleLayoutPublish)
      resizeObserver?.disconnect()
      if (settleTimer) window.clearTimeout(settleTimer)
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
    }
  }, [collector, enabled, options.staticMode, sessionId])
}

function previewContentSize(tree: ReturnType<GBoundaryCollector["getTree"]>): { width: number; height: number } {
  const rects = tree.flatMap(flattenBoundaryRects)
  if (rects.length === 0) {
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }
  }

  const left = Math.min(0, ...rects.map((rect) => rect.x))
  const top = Math.min(0, ...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))

  return {
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
  }
}

function flattenBoundaryRects(node: ReturnType<GBoundaryCollector["getTree"]>[number]): GBoundaryRect[] {
  return [...(node.rect ? [node.rect] : []), ...node.children.flatMap(flattenBoundaryRects)]
}

function isRuntimeValuesRequest(
  message: unknown,
  sessionId: string,
): message is Extract<GPreviewProtocolMessage, { type: "runelight:request-values" }> {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "runelight:request-values" &&
    (message as { protocolVersion?: unknown }).protocolVersion === 1 &&
    (message as { sessionId?: unknown }).sessionId === sessionId &&
    typeof (message as { boundaryId?: unknown }).boundaryId === "string"
  )
}

function updateBoundaryRects(collector: GBoundaryCollector) {
  for (const element of document.querySelectorAll<HTMLElement>("[data-runelight-boundary-id]")) {
    const boundaryId = element.dataset.runelightBoundaryId
    const rect = readGBoundaryElementRect(element)
    if (boundaryId && rect) {
      collector.updateBoundaryRect(boundaryId, rect)
    }
  }
}
