import React from "react"

import {
  GPreviewProvider,
  createGBoundaryCollector,
  createGPreviewErrorMessage,
  createGPreviewReadyMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
  createGPreviewValuesMessage,
  readGBoundaryElementRect,
  type GBoundaryCollector,
  type GBoundaryRect,
  type GPreviewProtocolMessage,
} from "gtsx"

type PreviewCase<Props> = {
  props: Props
  scope?: unknown
}

type PreviewComponent<Props = Record<string, unknown>> = React.ComponentType<Props> & {
  cases?: Record<string, PreviewCase<Props>>
}

type GTSXModule = Record<string, unknown> & {
  default: PreviewComponent
}

const modules = import.meta.glob<GTSXModule>("./components/**/*.g.tsx")

export function GTSXPreviewApp() {
  const params = new URLSearchParams(window.location.search)
  const entry = params.get("entry")
  const caseName = params.get("case")
  const sessionId = params.get("sessionId")
  const caseOverrides = readCaseOverrides(params)
  const showChrome = params.get("chrome") !== "0"

  if (!entry) {
    return (
      <PreviewMessage
        detail="Pass ?entry=src/components/.../*.g.tsx to render a Studio package case."
        sessionId={sessionId}
        title="Missing entry"
      />
    )
  }

  return <GTSXEntryPreview entry={entry} caseName={caseName} caseOverrides={caseOverrides} sessionId={sessionId} showChrome={showChrome} />
}

function GTSXEntryPreview(props: {
  entry: string
  caseName: string | null
  caseOverrides: Map<string, string>
  sessionId: string | null
  showChrome: boolean
}) {
  const entryCoordinate = parseEntryCoordinate(props.entry)
  const loader = modules[toModuleKey(entryCoordinate.file)]

  if (!loader) {
    return <PreviewMessage title="Unknown entry" detail={props.entry} sessionId={props.sessionId} />
  }

  const LazyPreview = React.lazy(async () => {
    const moduleValue = await loader()
    const component = moduleValue[entryCoordinate.exportName]
    if (!isPreviewComponent(component)) {
      return {
        default: () => <PreviewMessage title="Unknown component export" detail={props.entry} sessionId={props.sessionId} />,
      }
    }

    return {
      default: () => (
        <LoadedEntryPreview
          component={component}
          entry={props.entry}
          caseName={props.caseName}
          caseOverrides={props.caseOverrides}
          sessionId={props.sessionId}
          showChrome={props.showChrome}
        />
      ),
    }
  })

  return (
    <React.Suspense fallback={props.showChrome ? <PreviewMessage title="Loading" detail={props.entry} /> : null}>
      <LazyPreview />
    </React.Suspense>
  )
}

function LoadedEntryPreview(props: {
  component: PreviewComponent
  entry: string
  caseName: string | null
  caseOverrides: Map<string, string>
  sessionId: string | null
  showChrome: boolean
}) {
  const collector = React.useMemo(() => createGBoundaryCollector(), [])
  const cases = props.component.cases ?? {}
  const selectedCases = props.caseName ? [[props.caseName, cases[props.caseName]] as const] : Object.entries(cases)
  const hasRenderableCases = selectedCases.length > 0 && selectedCases.every(([, testCase]) => testCase)

  usePreviewProtocolMessages(props.sessionId, collector, hasRenderableCases)

  if (!hasRenderableCases) {
    return <PreviewMessage title="Unknown case" detail={props.caseName ?? "No cases declared"} sessionId={props.sessionId} />
  }

  const Component = props.component
  return (
    <main style={{ display: "grid", gap: 16, padding: props.showChrome ? 24 : 0 }}>
      {selectedCases.map(([name, testCase]) => (
        <section key={name}>
          {props.showChrome ? (
            <header style={{ color: "#64748b", font: "12px ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: 8 }}>
              {props.entry} / {name}
            </header>
          ) : null}
          <GPreviewProvider
            boundaryCollector={collector}
            caseOverrides={caseOverridesForFrame(props.entry, name, props.caseOverrides)}
            scope={testCase.scope}
          >
            <Component {...testCase.props} />
          </GPreviewProvider>
        </section>
      ))}
    </main>
  )
}

function PreviewMessage(props: { title: string; detail: string; sessionId?: string | null }) {
  React.useEffect(() => {
    if (!props.sessionId) return
    window.parent.postMessage(createGPreviewErrorMessage(props.sessionId, new Error(`${props.title}: ${props.detail}`)), "*")
  }, [props.detail, props.sessionId, props.title])

  return (
    <main style={{ color: "#172033", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", padding: 24 }}>
      <h1>{props.title}</h1>
      <p>{props.detail}</p>
    </main>
  )
}

function usePreviewProtocolMessages(
  sessionId: string | null,
  collector: ReturnType<typeof createGBoundaryCollector>,
  enabled: boolean,
) {
  React.useEffect(() => {
    if (!sessionId || !enabled) return
    let scheduledFrame = 0

    const publishLayout = () => {
      updateBoundaryRects(collector)
      const tree = collector.getTree()
      window.parent.postMessage(createGPreviewTreeMessage(sessionId, tree), "*")
      window.parent.postMessage(createGPreviewResizeMessage(sessionId, previewContentSize(tree)), "*")
    }

    const scheduleLayoutPublish = () => {
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
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleLayoutPublish) : undefined
    resizeObserver?.observe(document.documentElement)
    if (document.body) resizeObserver?.observe(document.body)
    window.parent.postMessage(createGPreviewReadyMessage(sessionId), "*")
    publishLayout()
    return () => {
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("resize", scheduleLayoutPublish)
      resizeObserver?.disconnect()
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
    }
  }, [collector, enabled, sessionId])
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

function toModuleKey(entryFile: string): keyof typeof modules {
  return `./${entryFile.replace(/^src\//, "")}` as keyof typeof modules
}

function readCaseOverrides(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("gcase")) {
    const separatorIndex = value.lastIndexOf(":")
    if (separatorIndex > 0) {
      overrides.set(value.slice(0, separatorIndex), value.slice(separatorIndex + 1))
    }
  }
  return overrides
}

function caseOverridesForFrame(entry: string, caseName: string, childOverrides: Map<string, string>): Map<string, string> {
  return new Map([...childOverrides, [toComponentCoordinate(entry), caseName]])
}

function toComponentCoordinate(entry: string): string {
  return entry.includes("#") ? entry : `${entry}#default`
}

function parseEntryCoordinate(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}

function isPreviewComponent(value: unknown): value is PreviewComponent {
  return typeof value === "function"
}
