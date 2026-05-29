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
} from "@gtsx/core"

export type GTSXPreviewCase<Props extends object = Record<string, unknown>> = {
  props: Props
  scope?: unknown
}

export type GTSXPreviewComponent<Props extends object = Record<string, unknown>> = React.ComponentType<Props> & {
  cases?: Record<string, GTSXPreviewCase<Props>>
}

export type GTSXPreviewModule = Record<string, unknown>

export type GTSXPreviewComponentLoader = (entry: string) =>
  | GTSXPreviewComponent
  | Promise<GTSXPreviewComponent | undefined>
  | undefined

type LoadedGTSXPreviewEntry = {
  component: GTSXPreviewComponent | null
  entry: string
}

export type GTSXPreviewRouteParams = {
  caseName: string | null
  caseOverrides: Map<string, string>
  chrome: string | null
  entry: string | null
  poolMode: boolean
  sessionId: string | null
  staticMode: boolean
}

export type GTSXReactPreviewClientProps = {
  caseName?: string | null
  caseOverrides?: Map<string, string>
  chrome?: boolean | string | null
  defaultEntry?: string
  entry?: string | null
  loadComponent: GTSXPreviewComponentLoader
  missingEntryDetail?: string
  pool?: boolean | string | null
  sessionId?: string | null
  staticMode?: boolean
}

export type GTSXPreviewCaseSheetProps<Props extends object = Record<string, unknown>> = {
  boundaryCollector?: GBoundaryCollector
  caseOverrides?: Map<string, string>
  component: GTSXPreviewComponent<Props>
  entry: string
  selectedCases: Array<{ name: string; testCase: GTSXPreviewCase<Props> }>
  showChrome?: boolean
}

const loadedGTSXPreviewEntriesByLoader = new WeakMap<GTSXPreviewComponentLoader, Map<string, LoadedGTSXPreviewEntry>>()
const loadingGTSXPreviewEntriesByLoader = new WeakMap<GTSXPreviewComponentLoader, Map<string, Promise<LoadedGTSXPreviewEntry>>>()

export function GTSXReactPreviewClient({
  caseName = null,
  caseOverrides = new Map(),
  chrome = null,
  defaultEntry,
  entry,
  loadComponent,
  missingEntryDetail = "Pass ?entry=src/components/.../*.g.tsx to render a GTSX preview.",
  pool = null,
  sessionId = null,
  staticMode = false,
}: GTSXReactPreviewClientProps) {
  const routeTarget = React.useMemo(
    () => ({
      caseName,
      caseOverrides,
      chrome: typeof chrome === "boolean" ? (chrome ? "1" : "0") : chrome,
      entry: entry ?? defaultEntry ?? null,
      poolMode: typeof pool === "boolean" ? pool : pool === "1",
      sessionId,
      staticMode,
    }),
    [caseName, caseOverrides, chrome, defaultEntry, entry, pool, sessionId, staticMode],
  )
  const renderTarget = useGTSXPreviewRenderTarget(routeTarget)
  const showChrome = showChromeForPreviewTarget(renderTarget.chrome)

  if (!renderTarget.entry) {
    if (renderTarget.poolMode) {
      return <GTSXPreviewDocumentBackground showChrome={false} />
    }

    return (
      <>
        <GTSXPreviewDocumentBackground showChrome={showChrome} />
        <GTSXPreviewMessage detail={missingEntryDetail} sessionId={renderTarget.sessionId} title="Missing entry" />
      </>
    )
  }

  return (
    <>
      <GTSXPreviewDocumentBackground showChrome={showChrome} />
      <GTSXEntryPreview
        caseName={renderTarget.caseName}
        caseOverrides={renderTarget.caseOverrides}
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

function GTSXEntryPreview({
  caseName,
  caseOverrides,
  entry,
  loadComponent,
  sessionId,
  showChrome,
  staticMode,
}: {
  caseName: string | null
  caseOverrides: Map<string, string>
  entry: string
  loadComponent: GTSXPreviewComponentLoader
  sessionId: string | null
  showChrome: boolean
  staticMode: boolean
}) {
  const cachedEntry = readLoadedGTSXPreviewEntry(loadComponent, entry)
  const [loadedEntry, setLoadedEntry] = React.useState<LoadedGTSXPreviewEntry | null>(cachedEntry)
  const effectiveLoadedEntry = cachedEntry ?? loadedEntry

  React.useEffect(() => {
    const cached = readLoadedGTSXPreviewEntry(loadComponent, entry)
    if (cached) {
      setLoadedEntry(cached)
      return
    }

    let ignore = false

    loadGTSXPreviewEntry(loadComponent, entry)
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
    return showChrome ? <GTSXPreviewMessage detail={entry} title="Loading" /> : null
  }

  if (!effectiveLoadedEntry.component) {
    return <GTSXPreviewMessage detail={entry} sessionId={sessionId} title="Unknown GTSX entry" />
  }

  return (
    <LoadedGTSXEntryPreview
      caseName={caseName}
      caseOverrides={caseOverrides}
      component={effectiveLoadedEntry.component}
      entry={entry}
      sessionId={sessionId}
      showChrome={showChrome}
      staticMode={staticMode}
    />
  )
}

function readLoadedGTSXPreviewEntry(
  loadComponent: GTSXPreviewComponentLoader,
  entry: string,
): LoadedGTSXPreviewEntry | null {
  return loadedGTSXPreviewEntriesByLoader.get(loadComponent)?.get(entry) ?? null
}

function loadGTSXPreviewEntry(
  loadComponent: GTSXPreviewComponentLoader,
  entry: string,
): Promise<LoadedGTSXPreviewEntry> {
  let loadedEntries = loadedGTSXPreviewEntriesByLoader.get(loadComponent)
  if (!loadedEntries) {
    loadedEntries = new Map()
    loadedGTSXPreviewEntriesByLoader.set(loadComponent, loadedEntries)
  }

  const loadedEntry = loadedEntries.get(entry)
  if (loadedEntry) return Promise.resolve(loadedEntry)

  let loadingEntries = loadingGTSXPreviewEntriesByLoader.get(loadComponent)
  if (!loadingEntries) {
    loadingEntries = new Map()
    loadingGTSXPreviewEntriesByLoader.set(loadComponent, loadingEntries)
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

function LoadedGTSXEntryPreview({
  caseName,
  caseOverrides,
  component,
  entry,
  sessionId,
  showChrome,
  staticMode,
}: {
  caseName: string | null
  caseOverrides: Map<string, string>
  component: GTSXPreviewComponent
  entry: string
  sessionId: string | null
  showChrome: boolean
  staticMode: boolean
}) {
  const collector = React.useMemo(() => createGBoundaryCollector(), [])
  const cases = component.cases ?? {}
  const selectedCases = caseName ? [[caseName, cases[caseName]] as const] : Object.entries(cases)
  const renderableCases = selectedCases.flatMap(([name, testCase]) => (testCase ? [{ name, testCase }] : []))
  const hasRenderableCases = selectedCases.length > 0 && renderableCases.length === selectedCases.length

  useGTSXPreviewProtocolMessages(sessionId, collector, hasRenderableCases, { staticMode })

  if (!hasRenderableCases) {
    return <GTSXPreviewMessage detail={caseName ?? "No cases declared"} sessionId={sessionId} title="Unknown GTSX case" />
  }

  return (
    <GTSXPreviewCaseSheet
      boundaryCollector={collector}
      caseOverrides={caseOverrides}
      component={component}
      entry={entry}
      selectedCases={renderableCases}
      showChrome={showChrome}
    />
  )
}

export function GTSXPreviewCaseSheet<Props extends object = Record<string, unknown>>({
  boundaryCollector,
  caseOverrides = new Map(),
  component: Component,
  entry,
  selectedCases,
  showChrome = true,
}: GTSXPreviewCaseSheetProps<Props>) {
  return (
    <main style={{ display: "grid", gap: 16, minHeight: showChrome ? "100vh" : undefined, padding: showChrome ? 24 : 0 }}>
      {selectedCases.map(({ name, testCase }) => (
        <section data-gtsx-preview-case={name} key={name}>
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
            caseOverrides={caseOverridesForFrame(entry, name, caseOverrides)}
            {...previewScopeProps(testCase)}
          >
            <Component {...testCase.props} />
          </GPreviewProvider>
        </section>
      ))}
    </main>
  )
}

export function GTSXPreviewDocumentBackground({ showChrome }: { showChrome: boolean }) {
  if (showChrome) return null

  return <style>{`html, body { background: transparent !important; }`}</style>
}

export function GTSXPreviewMessage({
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
      data-gtsx-preview-message
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

export function readGTSXPreviewRouteParams(params: URLSearchParams): GTSXPreviewRouteParams {
  return {
    caseName: params.get("case"),
    caseOverrides: readGTSXPreviewCaseOverrides(params),
    chrome: params.get("chrome"),
    entry: params.get("entry"),
    poolMode: params.get("pool") === "1",
    sessionId: params.get("sessionId"),
    staticMode: params.get("static") === "1",
  }
}

type GTSXPreviewRenderTargetSubscriber = (target: GTSXPreviewRouteParams) => void

type GTSXPreviewRenderTargetMailbox = {
  announcePoolReady: () => void
  getTarget: () => GTSXPreviewRouteParams | null
  render: (target: GPreviewRenderTarget) => void
  subscribe: (subscriber: GTSXPreviewRenderTargetSubscriber) => () => void
}

declare global {
  interface Window {
    __gtsxPreviewPendingRenderTarget?: GPreviewRenderTarget
    __gtsxPreviewPrehydrationMailboxInstalled?: boolean
    __gtsxPreviewRenderTargetMailbox?: Pick<GTSXPreviewRenderTargetMailbox, "render">
  }
}

let gtsxPreviewRenderTargetMailbox: GTSXPreviewRenderTargetMailbox | null = null

function useGTSXPreviewRenderTarget(routeTarget: GTSXPreviewRouteParams): GTSXPreviewRouteParams {
  const mailbox = routeTarget.poolMode ? ensureGTSXPreviewRenderTargetMailbox() : null
  const [messageTarget, setMessageTarget] = React.useState<GTSXPreviewRouteParams | null>(() => mailbox?.getTarget() ?? null)

  React.useEffect(() => {
    if (!mailbox) return

    const unsubscribe = mailbox.subscribe(setMessageTarget)
    mailbox.announcePoolReady()
    return unsubscribe
  }, [mailbox])

  if (!routeTarget.poolMode) return routeTarget
  return messageTarget ?? routeTarget
}

function ensureGTSXPreviewRenderTargetMailbox(): GTSXPreviewRenderTargetMailbox | null {
  if (typeof window === "undefined") return null
  if (gtsxPreviewRenderTargetMailbox) return gtsxPreviewRenderTargetMailbox

  const subscribers = new Set<GTSXPreviewRenderTargetSubscriber>()
  let currentTarget = window.__gtsxPreviewPendingRenderTarget
    ? previewRouteParamsFromRenderTarget(window.__gtsxPreviewPendingRenderTarget)
    : null
  let currentTargetKey = currentTarget ? previewRenderTargetKey(currentTarget) : null
  let poolReadyAnnounced = false

  const applyRenderTarget = (target: GPreviewRenderTarget, options: { acknowledge: boolean }) => {
    window.__gtsxPreviewPendingRenderTarget = target
    if (options.acknowledge && target.sessionId) {
      window.parent.postMessage(createGPreviewRenderAcceptedMessage(target.sessionId), "*")
    }
    const nextTarget = previewRouteParamsFromRenderTarget(target)
    const nextTargetKey = previewRenderTargetKey(nextTarget)
    if (currentTargetKey === nextTargetKey) return

    currentTarget = nextTarget
    currentTargetKey = nextTargetKey
    for (const subscriber of subscribers) subscriber(currentTarget)
  }

  const render = (target: GPreviewRenderTarget) => applyRenderTarget(target, { acknowledge: true })
  const handlePrehydrationRenderTarget = (event: Event) => {
    const target = (event as CustomEvent<GPreviewRenderTarget>).detail
    if (isGPreviewRenderTarget(target)) applyRenderTarget(target, { acknowledge: false })
  }

  window.__gtsxPreviewRenderTargetMailbox = { render }
  if (window.__gtsxPreviewPrehydrationMailboxInstalled) {
    window.addEventListener("gtsx:preview-render-target", handlePrehydrationRenderTarget)
  } else {
    window.addEventListener("message", (event: MessageEvent) => {
      if (!isGPreviewRenderMessage(event.data)) return
      render(event.data.target)
    })
  }

  gtsxPreviewRenderTargetMailbox = {
    announcePoolReady() {
      if (poolReadyAnnounced) return
      poolReadyAnnounced = true
      if (window.__gtsxPreviewPrehydrationMailboxInstalled) return
      window.setTimeout(() => {
        window.parent.postMessage(createGPreviewPoolReadyMessage(), "*")
      }, 0)
    },
    getTarget() {
      return currentTarget
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
  return gtsxPreviewRenderTargetMailbox
}

function previewRouteParamsFromRenderTarget(target: GPreviewRenderTarget): GTSXPreviewRouteParams {
  return {
    caseName: target.caseName,
    caseOverrides: new Map(target.caseOverrides ?? []),
    chrome: target.chrome,
    entry: target.entry,
    poolMode: false,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  }
}

function isGPreviewRenderMessage(value: unknown): value is GPreviewRenderMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "gtsx:render" &&
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
    Object.prototype.hasOwnProperty.call(value, "caseName") &&
    Object.prototype.hasOwnProperty.call(value, "sessionId")
  )
}

function showChromeForPreviewTarget(chrome: string | null): boolean {
  return chrome === null ? true : chrome !== "0"
}

function previewRenderTargetKey(target: GTSXPreviewRouteParams): string {
  return JSON.stringify({
    caseName: target.caseName,
    caseOverrides: [...target.caseOverrides],
    chrome: target.chrome,
    entry: target.entry,
    poolMode: target.poolMode,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  })
}

export function readGTSXPreviewCaseOverrides(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("gcase")) {
    const separatorIndex = value.lastIndexOf(":")
    if (separatorIndex > 0) {
      overrides.set(value.slice(0, separatorIndex), value.slice(separatorIndex + 1))
    }
  }
  return overrides
}

export function caseOverridesForFrame(entry: string, caseName: string, childOverrides: Map<string, string>): Map<string, string> {
  return new Map([...childOverrides, [toComponentCoordinate(entry), caseName]])
}

export function parseGTSXPreviewEntry(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}

export function isGTSXPreviewComponent(value: unknown): value is GTSXPreviewComponent {
  return typeof value === "function"
}

function previewScopeProps<Props extends object>(testCase: GTSXPreviewCase<Props>): { scope: unknown } | Record<string, never> {
  return Object.prototype.hasOwnProperty.call(testCase, "scope") ? { scope: testCase.scope } : {}
}

function toComponentCoordinate(entry: string): string {
  return entry.includes("#") ? entry : `${entry}#default`
}

function useGTSXPreviewProtocolMessages(
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
): message is Extract<GPreviewProtocolMessage, { type: "gtsx:request-values" }> {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "gtsx:request-values" &&
    (message as { protocolVersion?: unknown }).protocolVersion === 1 &&
    (message as { sessionId?: unknown }).sessionId === sessionId &&
    typeof (message as { boundaryId?: unknown }).boundaryId === "string"
  )
}

function updateBoundaryRects(collector: GBoundaryCollector) {
  for (const element of document.querySelectorAll<HTMLElement>("[data-gtsx-boundary-id]")) {
    const boundaryId = element.dataset.gtsxBoundaryId
    const rect = readGBoundaryElementRect(element)
    if (boundaryId && rect) {
      collector.updateBoundaryRect(boundaryId, rect)
    }
  }
}
