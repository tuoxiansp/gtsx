import React from "react"

import {
  GPreviewProvider,
  createGBoundaryCollector,
  createGPreviewErrorMessage,
  createGPreviewReadyMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
  createGPreviewValuesMessage,
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

const modules = import.meta.glob<GTSXModule>("./cases/**/*.g.tsx")

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
        detail="Pass ?entry=src/cases/.../*.g.tsx to render a GTSX example."
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

  React.useEffect(() => {
    document.documentElement.dataset.gtsxPreviewChrome = props.showChrome ? "1" : "0"
    return () => {
      delete document.documentElement.dataset.gtsxPreviewChrome
    }
  }, [props.showChrome])

  usePreviewProtocolMessages(props.sessionId, collector, hasRenderableCases)

  if (!hasRenderableCases) {
    return <PreviewMessage title="Unknown case" detail={props.caseName ?? "No cases declared"} sessionId={props.sessionId} />
  }

  const Component = props.component
  return (
    <main className="gtsx-contact-sheet" data-gtsx-preview-chrome={props.showChrome ? "1" : "0"}>
      {selectedCases.map(([name, testCase]) => (
        <section className="gtsx-case-frame" key={name}>
          {props.showChrome ? (
            <header className="gtsx-case-label">
              <span>{props.entry}</span>
              <strong>{name}</strong>
            </header>
          ) : null}
          <div className="gtsx-case-body">
            <GPreviewProvider
              boundaryCollector={collector}
              caseOverrides={caseOverridesForFrame(props.entry, name, props.caseOverrides)}
              scope={testCase.scope}
            >
              <Component {...testCase.props} />
            </GPreviewProvider>
          </div>
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
    <main className="gtsx-preview-message">
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

    const handleMessage = (event: MessageEvent) => {
      if (!isRuntimeValuesRequest(event.data, sessionId)) return

      const values = collector.getValues(event.data.boundaryId)
      if (values) {
        window.parent.postMessage(createGPreviewValuesMessage(sessionId, values), "*")
      }
    }

    window.addEventListener("message", handleMessage)
    updateBoundaryRects(collector)
    const tree = collector.getTree()
    window.parent.postMessage(createGPreviewReadyMessage(sessionId), "*")
    window.parent.postMessage(createGPreviewTreeMessage(sessionId, tree), "*")
    window.parent.postMessage(createGPreviewResizeMessage(sessionId, previewContentSize(tree)), "*")
    return () => window.removeEventListener("message", handleMessage)
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
  const right = Math.max(document.documentElement.scrollWidth, ...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(document.documentElement.scrollHeight, ...rects.map((rect) => rect.y + rect.height))

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
    const rect = readBoundaryRect(element)
    if (boundaryId && rect) {
      collector.updateBoundaryRect(boundaryId, rect)
    }
  }
}

function readBoundaryRect(element: HTMLElement): GBoundaryRect | undefined {
  const ownRect = element.getBoundingClientRect()
  if (ownRect.width > 0 || ownRect.height > 0) return toBoundaryRect(ownRect)

  const childRects = [...element.querySelectorAll<HTMLElement>("*")]
    .map((child) => child.getBoundingClientRect())
    .filter((rect) => rect.width > 0 || rect.height > 0)
  if (childRects.length === 0) return undefined

  const left = Math.min(...childRects.map((rect) => rect.left))
  const top = Math.min(...childRects.map((rect) => rect.top))
  const right = Math.max(...childRects.map((rect) => rect.right))
  const bottom = Math.max(...childRects.map((rect) => rect.bottom))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function toBoundaryRect(rect: DOMRect): GBoundaryRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
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
