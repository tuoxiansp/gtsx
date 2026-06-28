import React, { type CSSProperties } from "react"

import { readGBoundaryElementRect, type GBoundaryRect } from "@runelight/core/boundary-rect"
import {
  createGPreviewErrorMessage,
  createGPreviewPoolReadyMessage,
  createGPreviewReadyMessage,
  createGPreviewRenderedSnapshotMessage,
  createGPreviewRenderAcceptedMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
  createGPreviewValuesMessage,
  isGPreviewRenderMessage,
  isGPreviewRenderTarget,
  readGRenderedSnapshot,
  readRunelightPreviewFrameOverridesFromSearchParams,
  readRunelightPreviewInputOverridesFromSearchParams,
  type GBoundaryTreeNode,
  type GPreviewRenderTarget,
  type GPreviewSessionMessage,
} from "@runelight/core/preview-protocol"
import {
  computeRunelightPreviewFrameGridLayout,
  runelightPreviewFixedFrameScale,
  runelightPreviewCardTitleGap,
  runelightPreviewCardTitleHeight,
  runelightPreviewCardTitleScreenGap,
  runelightPreviewCardTitleScreenHeight,
  runelightPreviewFrameChromeHeight,
  runelightPreviewFrameGridGap,
  runelightPreviewFrameGridMinScale,
  runelightPreviewFrameLabelGap,
  runelightPreviewFrameLabelMinHeight,
  runelightPreviewFrameLabelScreenGap,
  runelightPreviewFrameGridMaxSide,
  type RunelightPreviewFrameGridItemLayout,
  type RunelightPreviewFrameGridLayout,
} from "@runelight/core/frame-grid-layout"
import { GPreviewProvider, createGBoundaryCollector, type GBoundaryCollector } from "./runtime.js"
import type { AnyGProvider } from "./types.js"

export type RunelightReactPreviewFrame<Props extends object = Record<string, unknown>> = {
  props: Props
  providers?: readonly (readonly [AnyGProvider, unknown])[]
  scope?: unknown
}

export type RunelightReactPreviewComponent<Props extends object = Record<string, unknown>> = React.ComponentType<Props> & {
  frames?: Record<string, RunelightReactPreviewFrame<Props>>
}

export type RunelightReactPreviewModule = Record<string, unknown>

export type RunelightReactPreviewComponentLoader = (entry: string) =>
  | RunelightReactPreviewComponent
  | Promise<RunelightReactPreviewComponent | undefined>
  | undefined

type LoadedRunelightPreviewEntry = {
  component: RunelightReactPreviewComponent | null
  entry: string
}

export type RunelightReactPreviewRouteParams = {
  frameName: string | null
  frameOverrides: Map<string, string>
  inputOverrides: Map<string, string>
  chrome: string | null
  entry: string | null
  poolMode: boolean
  renderRequestSequence: number
  sessionId: string | null
  staticMode: boolean
}

type RunelightPreviewRenderTargetMailboxState = {
  currentTarget: RunelightReactPreviewRouteParams | null
  currentTargetContentKey: string | null
  renderRequestSequence: number
}

type RunelightPreviewRenderTargetMailboxUpdate = {
  shouldNotifySubscribers: boolean
  state: RunelightPreviewRenderTargetMailboxState
}

export type RunelightReactPreviewClientProps = {
  frameName?: string | null
  frameOverrides?: Map<string, string>
  inputOverrides?: Map<string, string>
  chrome?: boolean | string | null
  defaultEntry?: string
  entry?: string | null
  loadComponent: RunelightReactPreviewComponentLoader
  missingEntryDetail?: string
  pool?: boolean | string | null
  poolMode?: boolean
  sessionId?: string | null
  staticMode?: boolean
}

export type RunelightReactPreviewFrameSheetProps<Props extends object = Record<string, unknown>> = {
  frameOverrides?: Map<string, string>
  inputOverrides?: Map<string, string>
  component: RunelightReactPreviewComponent<Props>
  entry: string
  selectedFrames: Array<{ name: string; frame: RunelightReactPreviewFrame<Props> }>
  showChrome?: boolean
}

type RunelightReactPreviewFrameSheetInternalProps<Props extends object = Record<string, unknown>> =
  RunelightReactPreviewFrameSheetProps<Props> & {
    boundaryCollector?: GBoundaryCollector
  }

type RunelightReactPreviewFrameSheetModel<Props extends object = Record<string, unknown>> = {
  collector: GBoundaryCollector
  frame: RunelightReactPreviewFrame<Props>
  name: string
}

type RunelightReactPreviewFrameGeometry = {
  boundaryRect?: GBoundaryRect
  viewportSize: { width: number; height: number }
}

type RunelightReactPreviewContactSheetFrameLayout = RunelightPreviewFrameGridItemLayout & {
  measured: boolean
  offset: { x: number; y: number }
  viewportSize: { width: number; height: number }
}

const loadedRunelightPreviewEntriesByLoader = new WeakMap<RunelightReactPreviewComponentLoader, Map<string, LoadedRunelightPreviewEntry>>()
const loadingRunelightPreviewEntriesByLoader = new WeakMap<RunelightReactPreviewComponentLoader, Map<string, Promise<LoadedRunelightPreviewEntry>>>()

const runelightPreviewStudioFontFamily =
  '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

const runelightPreviewDefaultViewportSize = { height: 1024, width: 768 } as const
const runelightPreviewFrameGridFallbackItem = { height: 160, width: 280 } satisfies RunelightPreviewFrameGridItemLayout

const runelightPreviewStudioColors = {
  canvasBg: "#181818",
  panelBg: "#1e1e1e",
  panelBgElevated: "#282828",
  panelBorder: "#3a3a3a",
  panelBorderSubtle: "#2e2e2e",
  text: "#d4d4d4",
  textMuted: "#a0a0a0",
  textDim: "#8f8f8f",
  textLabel: "#9a9a9a",
  textTitle: "#a8a8a8",
  accent: "#ff8c82",
  accentText: "#e68a7d",
  accentMuted: "rgba(255,140,130,0.28)",
} as const

const visibleChromePreviewSheetStyle: CSSProperties = {
  alignContent: "start",
  backgroundColor: runelightPreviewStudioColors.canvasBg,
  boxSizing: "border-box",
  color: runelightPreviewStudioColors.text,
  display: "grid",
  fontFamily: runelightPreviewStudioFontFamily,
  gap: 28,
  minHeight: "100vh",
  padding: 32,
}

const hiddenChromePreviewSheetStyle: CSSProperties = {
  display: "grid",
  gap: 0,
  padding: 0,
}

function contactSheetCardTitleSlotStyle(width: number): CSSProperties {
  return {
    alignContent: "start",
    alignItems: "start",
    display: "grid",
    height: runelightPreviewCardTitleHeight + runelightPreviewCardTitleGap,
    minWidth: 0,
    overflow: "visible",
    width,
  }
}

const contactSheetCardTitleStyle: CSSProperties = {
  alignItems: "center",
  color: runelightPreviewStudioColors.accentText,
  display: "flex",
  fontFamily: runelightPreviewStudioFontFamily,
  fontSize: 9,
  fontSynthesis: "none",
  fontWeight: 400,
  gap: 7,
  letterSpacing: "0.06em",
  lineHeight: 1,
  minWidth: 0,
  overflow: "hidden",
  position: "relative",
  textRendering: "geometricPrecision",
  textOverflow: "ellipsis",
  top: runelightPreviewCardTitleHeight + runelightPreviewCardTitleGap,
  transform: `translateY(-${runelightPreviewCardTitleScreenHeight + runelightPreviewCardTitleScreenGap}px)`,
  whiteSpace: "nowrap",
}

const contactSheetCardTitleIndicatorStyle: CSSProperties = {
  background: runelightPreviewStudioColors.accentText,
  flexShrink: 0,
  height: 9,
  opacity: 1,
  width: 2,
}

const contactSheetCardTitleTextStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

function contactSheetComponentGroupStyle(width: number): CSSProperties {
  return {
    display: "grid",
    gap: 0,
    minWidth: 0,
    width,
  }
}

function contactSheetFrameGridStyle(layout: RunelightPreviewFrameGridLayout): CSSProperties {
  return {
    alignItems: "start",
    display: "grid",
    gap: layout.gap,
    gridTemplateColumns: `repeat(${layout.columns}, ${layout.cellWidth}px)`,
    width: layout.width,
  }
}

function contactSheetFrameTileStyle(cellWidth: number): CSSProperties {
  return {
    alignItems: "start",
    display: "grid",
    gap: runelightPreviewFrameLabelGap,
    justifyItems: "start",
    minWidth: 0,
    width: cellWidth,
  }
}

function contactSheetFrameShellStyle(
  frameLayout: RunelightReactPreviewContactSheetFrameLayout,
  groupLayout: RunelightPreviewFrameGridLayout,
): CSSProperties {
  if (!frameLayout.measured) {
    return {
      overflow: "visible",
      position: "relative",
      width: runelightPreviewDefaultViewportSize.width,
    }
  }

  return {
    height: Math.ceil(frameLayout.height * groupLayout.previewScale),
    overflow: "visible",
    position: "relative",
    width: Math.ceil(frameLayout.width * groupLayout.previewScale),
  }
}

function contactSheetFrameScaledCanvasStyle(
  frameLayout: RunelightReactPreviewContactSheetFrameLayout,
  groupLayout: RunelightPreviewFrameGridLayout,
): CSSProperties {
  if (!frameLayout.measured) {
    return {
      position: "relative",
      transform: "translateZ(0)",
      transformOrigin: "0 0",
      width: runelightPreviewDefaultViewportSize.width,
    }
  }

  return {
    height: frameLayout.height,
    left: 0,
    position: "absolute",
    top: 0,
    transform: `scale(${formatRunelightPreviewCssNumber(groupLayout.previewScale)})`,
    transformOrigin: "0 0",
    width: frameLayout.width,
  }
}

function contactSheetFrameViewportStyle(frameLayout: RunelightReactPreviewContactSheetFrameLayout): CSSProperties {
  if (!frameLayout.measured) {
    return {
      overflow: "visible",
      position: "relative",
      width: runelightPreviewDefaultViewportSize.width,
    }
  }

  return {
    height: frameLayout.height,
    overflow: "hidden",
    position: "relative",
    width: frameLayout.width,
  }
}

function contactSheetFrameContentStyle(frameLayout: RunelightReactPreviewContactSheetFrameLayout): CSSProperties {
  if (!frameLayout.measured) {
    return {
      position: "relative",
      width: runelightPreviewDefaultViewportSize.width,
    }
  }

  return {
    left: -frameLayout.offset.x,
    position: "absolute",
    top: -frameLayout.offset.y,
    width: frameLayout.viewportSize.width,
  }
}

const contactSheetFrameLabelSlotStyle: CSSProperties = {
  alignContent: "start",
  display: "grid",
  height: runelightPreviewFrameLabelMinHeight,
  justifyItems: "center",
  minWidth: 0,
  overflow: "visible",
  width: "100%",
}

const contactSheetFrameLabelStyle: CSSProperties = {
  color: runelightPreviewStudioColors.textLabel,
  display: "block",
  fontSize: 9,
  fontWeight: 400,
  letterSpacing: "0.05em",
  lineHeight: 1.35,
  maxWidth: "100%",
  overflow: "hidden",
  textAlign: "center",
  textOverflow: "ellipsis",
  textTransform: "lowercase",
  position: "relative",
  top: -runelightPreviewFrameLabelGap,
  transform: `translateY(${runelightPreviewFrameLabelScreenGap}px)`,
  transformOrigin: "top center",
  whiteSpace: "nowrap",
}

const contactSheetMeasuringFrameGridStyle: CSSProperties = {
  alignItems: "start",
  display: "grid",
  gap: 20,
  gridTemplateColumns: "repeat(auto-fit, max-content)",
}

const runelightVisiblePreviewDocumentStyle = `html, body {
  background: ${runelightPreviewStudioColors.canvasBg} !important;
  margin: 0;
}`

const runelightHiddenPreviewDocumentStyle = `html, body {
  background: transparent !important;
  margin: 0;
}`

export function RunelightReactPreviewClient({
  frameName = null,
  frameOverrides = new Map(),
  inputOverrides = new Map(),
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
      inputOverrides,
      chrome: typeof chrome === "boolean" ? (chrome ? "1" : "0") : chrome,
      entry: entry ?? defaultEntry ?? null,
      poolMode: resolvedPoolMode,
      renderRequestSequence: 0,
      sessionId,
      staticMode,
    }),
    [frameName, frameOverrides, inputOverrides, chrome, defaultEntry, entry, resolvedPoolMode, sessionId, staticMode],
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
        inputOverrides={renderTarget.inputOverrides}
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
  inputOverrides,
  entry,
  loadComponent,
  sessionId,
  showChrome,
  staticMode,
}: {
  frameName: string | null
  frameOverrides: Map<string, string>
  inputOverrides: Map<string, string>
  entry: string
  loadComponent: RunelightReactPreviewComponentLoader
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
      inputOverrides={inputOverrides}
      component={effectiveLoadedEntry.component}
      entry={entry}
      sessionId={sessionId}
      showChrome={showChrome}
      staticMode={staticMode}
    />
  )
}

function readLoadedRunelightPreviewEntry(
  loadComponent: RunelightReactPreviewComponentLoader,
  entry: string,
): LoadedRunelightPreviewEntry | null {
  return loadedRunelightPreviewEntriesByLoader.get(loadComponent)?.get(entry) ?? null
}

function loadRunelightPreviewEntry(
  loadComponent: RunelightReactPreviewComponentLoader,
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
  inputOverrides,
  component,
  entry,
  sessionId,
  showChrome,
  staticMode,
}: {
  frameName: string | null
  frameOverrides: Map<string, string>
  inputOverrides: Map<string, string>
  component: RunelightReactPreviewComponent
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
    <RunelightReactPreviewFrameSheetInternal
      boundaryCollector={collector}
      frameOverrides={frameOverrides}
      inputOverrides={inputOverrides}
      component={component}
      entry={entry}
      selectedFrames={renderableFrames}
      showChrome={showChrome}
    />
  )
}

export function RunelightReactPreviewFrameSheet<Props extends object = Record<string, unknown>>(
  props: RunelightReactPreviewFrameSheetProps<Props>,
) {
  return <RunelightReactPreviewFrameSheetInternal {...props} />
}

function RunelightReactPreviewFrameSheetInternal<Props extends object = Record<string, unknown>>({
  boundaryCollector,
  frameOverrides = new Map(),
  inputOverrides = new Map(),
  component: Component,
  entry,
  selectedFrames,
  showChrome = true,
}: RunelightReactPreviewFrameSheetInternalProps<Props>) {
  if (!showChrome) {
    return (
      <main style={hiddenChromePreviewSheetStyle}>
        {selectedFrames.map(({ name, frame }) => (
          <section
            data-runelight-preview-capture-bounds={selectedFrames.length === 1 ? "true" : undefined}
            data-runelight-preview-frame={name}
            key={name}
          >
            <GPreviewProvider
              boundaryCollector={boundaryCollector}
              frameOverrides={frameOverridesForFrame(entry, name, frameOverrides)}
              inputOverrides={inputOverrides}
              {...previewRuntimeProps(frame)}
            >
              <Component {...frame.props} />
            </GPreviewProvider>
          </section>
        ))}
      </main>
    )
  }

  return (
    <RunelightPreviewContactSheetFrameGroup
      frameOverrides={frameOverrides}
      inputOverrides={inputOverrides}
      component={Component}
      entry={entry}
      selectedFrames={selectedFrames}
    />
  )
}

function RunelightPreviewContactSheetFrameGroup<Props extends object = Record<string, unknown>>({
  frameOverrides,
  inputOverrides,
  component: Component,
  entry,
  selectedFrames,
}: {
  frameOverrides: Map<string, string>
  inputOverrides: Map<string, string>
  component: RunelightReactPreviewComponent<Props>
  entry: string
  selectedFrames: Array<{ name: string; frame: RunelightReactPreviewFrame<Props> }>
}) {
  const frameModels = React.useMemo(
    () =>
      selectedFrames.map(({ name, frame }) => ({
        collector: createGBoundaryCollector(),
        frame,
        name,
      })),
    [selectedFrames],
  )
  const frameViewportElements = React.useRef(new Map<string, HTMLElement>())
  const frameContentElements = React.useRef(new Map<string, HTMLElement>())
  const geometryByFrame = useRunelightPreviewContactSheetGeometry({
    coordinate: toComponentCoordinate(entry),
    contentElements: frameContentElements,
    frameModels,
    viewportElements: frameViewportElements,
  })
  const frameLayouts = frameModels.map((model) => runelightPreviewContactSheetFrameLayout(geometryByFrame[model.name]))
  const groupLayout = computeRunelightPreviewFrameGridLayout({
    frameChromeHeight: runelightPreviewFrameChromeHeight,
    gap: runelightPreviewFrameGridGap,
    items: frameLayouts,
    maxSide: runelightPreviewFrameGridMaxSide("desktop", selectedFrames.length),
    minScale: runelightPreviewFrameGridMinScale,
    previewScale: runelightPreviewFixedFrameScale,
  })
  const groupWidth = groupLayout.width
  const entryTitle = previewEntryTitle(entry)

  return (
    <main data-runelight-preview-contact-sheet="true" style={visibleChromePreviewSheetStyle}>
      <div
        data-runelight-preview-capture-bounds="true"
        data-runelight-preview-frame-group="true"
        data-runelight-preview-frame-group-measured={runelightPreviewContactSheetHasMeasuredEveryFrame(frameLayouts) ? "true" : "false"}
        style={contactSheetComponentGroupStyle(groupWidth)}
      >
        <header
          title={`${entry} / ${selectedFrames.length} ${selectedFrames.length === 1 ? "frame" : "frames"}`}
          style={contactSheetCardTitleSlotStyle(groupWidth)}
        >
          <span style={contactSheetCardTitleStyle}>
            <span aria-hidden="true" style={contactSheetCardTitleIndicatorStyle} />
            <span style={contactSheetCardTitleTextStyle}>{entryTitle}</span>
          </span>
        </header>
        <div
          data-runelight-preview-frame-grid-columns={groupLayout.columns}
          data-runelight-preview-frame-grid-scale={formatRunelightPreviewCssNumber(groupLayout.previewScale)}
          style={
            runelightPreviewContactSheetHasMeasuredEveryFrame(frameLayouts)
              ? contactSheetFrameGridStyle(groupLayout)
              : contactSheetMeasuringFrameGridStyle
          }
        >
          {frameModels.map((model, frameIndex) => {
            const frameLayout = frameLayouts[frameIndex] ?? runelightPreviewContactSheetFrameLayout(undefined)
            return (
              <section
                data-runelight-preview-frame={model.name}
                data-runelight-preview-frame-measured={frameLayout.measured ? "true" : "false"}
                key={model.name}
                style={
                  frameLayout.measured
                    ? contactSheetFrameTileStyle(groupLayout.cellWidth)
                    : contactSheetFrameTileStyle(frameLayout.width)
                }
              >
                <div style={contactSheetFrameShellStyle(frameLayout, groupLayout)}>
                  <div style={contactSheetFrameScaledCanvasStyle(frameLayout, groupLayout)}>
                    <div
                      data-runelight-preview-frame-viewport={model.name}
                      ref={(element) => setRunelightPreviewContactSheetElement(frameViewportElements.current, model.name, element)}
                      style={contactSheetFrameViewportStyle(frameLayout)}
                    >
                      <div
                        data-runelight-preview-frame-content={model.name}
                        ref={(element) => setRunelightPreviewContactSheetElement(frameContentElements.current, model.name, element)}
                        style={contactSheetFrameContentStyle(frameLayout)}
                      >
                        <GPreviewProvider
                          boundaryCollector={model.collector}
                          frameOverrides={frameOverridesForFrame(entry, model.name, frameOverrides)}
                          inputOverrides={inputOverrides}
                          {...previewRuntimeProps(model.frame)}
                        >
                          <Component {...model.frame.props} />
                        </GPreviewProvider>
                      </div>
                    </div>
                  </div>
                </div>
                <span style={contactSheetFrameLabelSlotStyle}>
                  <span style={contactSheetFrameLabelStyle}>{model.name}</span>
                </span>
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}

const useRunelightPreviewLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

function useRunelightPreviewContactSheetGeometry<Props extends object>(input: {
  coordinate: string
  contentElements: React.MutableRefObject<Map<string, HTMLElement>>
  frameModels: Array<RunelightReactPreviewFrameSheetModel<Props>>
  viewportElements: React.MutableRefObject<Map<string, HTMLElement>>
}): Record<string, RunelightReactPreviewFrameGeometry | undefined> {
  const geometrySignature = `${input.coordinate}\n${input.frameModels.map((model) => model.name).join("\n")}`
  const [geometryState, setGeometryState] = React.useState<{
    frames: Record<string, RunelightReactPreviewFrameGeometry | undefined>
    signature: string
  }>(() => ({ frames: {}, signature: geometrySignature }))
  const geometryByFrame = geometryState.signature === geometrySignature ? geometryState.frames : {}

  useRunelightPreviewLayoutEffect(() => {
    if (geometryState.signature !== geometrySignature) {
      setGeometryState({ frames: {}, signature: geometrySignature })
      return
    }

    const nextGeometry: Record<string, RunelightReactPreviewFrameGeometry | undefined> = {}
    let hasNextGeometry = false

    for (const model of input.frameModels) {
      if (geometryByFrame[model.name]) continue

      const viewportElement = input.viewportElements.current.get(model.name)
      const contentElement = input.contentElements.current.get(model.name)
      if (!viewportElement || !contentElement) continue

      const geometry = measureRunelightReactPreviewFrameGeometry({
        collector: model.collector,
        contentElement,
        coordinate: input.coordinate,
        viewportElement,
      })
      nextGeometry[model.name] = geometry
      hasNextGeometry = true
    }

    if (!hasNextGeometry) return
    setGeometryState((current) => ({
      frames: current.signature === geometrySignature ? { ...current.frames, ...nextGeometry } : nextGeometry,
      signature: geometrySignature,
    }))
  }, [geometryByFrame, geometrySignature, geometryState.signature, input])

  return geometryByFrame
}

function setRunelightPreviewContactSheetElement(
  elements: Map<string, HTMLElement>,
  frameName: string,
  element: HTMLElement | null,
) {
  if (element) {
    elements.set(frameName, element)
  } else {
    elements.delete(frameName)
  }
}

function measureRunelightReactPreviewFrameGeometry(input: {
  collector: GBoundaryCollector
  contentElement: HTMLElement
  coordinate: string
  viewportElement: HTMLElement
}): RunelightReactPreviewFrameGeometry {
  const localBoundaryRects = updateRunelightPreviewLocalBoundaryRects(input.collector, input.viewportElement)
  const tree = input.collector.getTree()
  const measuredBoundaryRect = runelightPreviewBoundaryRectForCoordinate(tree, input.coordinate)
  const contentRect = input.contentElement.getBoundingClientRect()
  const viewportSize = runelightPreviewMeasuredViewportSize(input.viewportElement, contentRect, localBoundaryRects)
  const boundaryRect = clipRunelightPreviewBoundaryRectToViewport(measuredBoundaryRect, viewportSize)

  return {
    ...(boundaryRect ? { boundaryRect } : {}),
    viewportSize,
  }
}

function updateRunelightPreviewLocalBoundaryRects(
  collector: GBoundaryCollector,
  viewportElement: HTMLElement,
): GBoundaryRect[] {
  const viewportRect = viewportElement.getBoundingClientRect()
  const rects: GBoundaryRect[] = []

  for (const element of viewportElement.querySelectorAll<HTMLElement>("[data-runelight-boundary-id]")) {
    const boundaryId = element.dataset.runelightBoundaryId
    const rect = readGBoundaryElementRect(element)
    if (!boundaryId || !rect) continue

    const localRect = {
      x: rect.x - viewportRect.x,
      y: rect.y - viewportRect.y,
      width: rect.width,
      height: rect.height,
    }
    collector.updateBoundaryRect(boundaryId, localRect)
    rects.push(localRect)
  }

  return rects
}

function runelightPreviewMeasuredViewportSize(
  viewportElement: HTMLElement,
  contentRect: DOMRect,
  boundaryRects: GBoundaryRect[],
): { width: number; height: number } {
  const right = Math.max(
    1,
    viewportElement.scrollWidth,
    contentRect.width,
    ...boundaryRects.map((rect) => rect.x + rect.width),
  )
  const bottom = Math.max(
    1,
    viewportElement.scrollHeight,
    contentRect.height,
    ...boundaryRects.map((rect) => rect.y + rect.height),
  )

  return {
    width: Math.ceil(right),
    height: Math.ceil(bottom),
  }
}

function runelightPreviewContactSheetFrameLayout(
  geometry: RunelightReactPreviewFrameGeometry | undefined,
): RunelightReactPreviewContactSheetFrameLayout {
  if (!geometry) {
    return {
      ...runelightPreviewFrameGridFallbackItem,
      measured: false,
      offset: { x: 0, y: 0 },
      viewportSize: runelightPreviewFrameGridFallbackItem,
    }
  }

  const width = previewFrameLayoutWidth(geometry.viewportSize, geometry.boundaryRect)
  const height = previewFrameLayoutHeight(geometry.viewportSize, geometry.boundaryRect)
  return {
    height,
    measured: true,
    offset: previewFrameViewportOffset(geometry.boundaryRect),
    viewportSize: geometry.viewportSize,
    width,
  }
}

function runelightPreviewContactSheetHasMeasuredEveryFrame(frames: RunelightReactPreviewContactSheetFrameLayout[]): boolean {
  return frames.every((frame) => frame.measured)
}

function previewFrameLayoutHeight(displaySize: { height: number }, rect: GBoundaryRect | undefined): number {
  return rect ? Math.max(1, Math.ceil(rect.height)) : displaySize.height
}

function previewFrameLayoutWidth(displaySize: { width: number }, rect: GBoundaryRect | undefined): number {
  return rect ? Math.max(1, Math.ceil(rect.width)) : displaySize.width
}

function previewFrameViewportOffset(rect: GBoundaryRect | undefined): { x: number; y: number } {
  return {
    x: Math.max(0, Math.floor(rect?.x ?? 0)),
    y: Math.max(0, Math.floor(rect?.y ?? 0)),
  }
}

function clipRunelightPreviewBoundaryRectToViewport(
  rect: GBoundaryRect | undefined,
  viewport: { width: number; height: number },
): GBoundaryRect | undefined {
  if (!rect) return undefined

  const left = clampRunelightPreviewNumber(rect.x, 0, viewport.width)
  const top = clampRunelightPreviewNumber(rect.y, 0, viewport.height)
  const right = clampRunelightPreviewNumber(rect.x + rect.width, 0, viewport.width)
  const bottom = clampRunelightPreviewNumber(rect.y + rect.height, 0, viewport.height)

  if (right <= left || bottom <= top) return undefined

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function runelightPreviewBoundaryRectForCoordinate(
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): GBoundaryRect | undefined {
  const node = runelightPreviewBoundaryNodeForCoordinate(tree, coordinate)
  return node?.rect
}

function runelightPreviewBoundaryNodeForCoordinate(
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): GBoundaryTreeNode | undefined {
  if (!tree) return undefined

  for (const node of tree) {
    if (node.coordinate === coordinate) return node
    const childMatch = runelightPreviewBoundaryNodeForCoordinate(node.children, coordinate)
    if (childMatch) return childMatch
  }

  return undefined
}

function clampRunelightPreviewNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatRunelightPreviewCssNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function RunelightPreviewDocumentBackground({ showChrome }: { showChrome: boolean }) {
  if (showChrome) {
    return <style>{runelightVisiblePreviewDocumentStyle}</style>
  }

  return <style>{runelightHiddenPreviewDocumentStyle}</style>
}

function RunelightPreviewMessage({
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
        backgroundColor: runelightPreviewStudioColors.canvasBg,
        color: runelightPreviewStudioColors.text,
        display: "grid",
        fontFamily: runelightPreviewStudioFontFamily,
        gap: 9,
        minHeight: "100vh",
        padding: 32,
      }}
    >
      <h1 style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.25, margin: 0 }}>{title}</h1>
      <p style={{ color: runelightPreviewStudioColors.textMuted, fontSize: 11, lineHeight: 1.45, margin: 0 }}>{detail}</p>
    </main>
  )
}

export function readRunelightReactPreviewRouteParams(params: URLSearchParams): RunelightReactPreviewRouteParams {
  return {
    frameName: params.get("frame"),
    frameOverrides: readRunelightReactPreviewFrameOverrides(params),
    inputOverrides: readRunelightReactPreviewInputOverrides(params),
    chrome: params.get("chrome"),
    entry: params.get("entry"),
    poolMode: params.get("pool") === "1",
    renderRequestSequence: 0,
    sessionId: params.get("sessionId"),
    staticMode: params.get("static") === "1",
  }
}

type RunelightPreviewRenderTargetSubscriber = (target: RunelightReactPreviewRouteParams) => void

type RunelightPreviewRenderTargetMailbox = {
  announcePoolReady: () => void
  getTarget: () => RunelightReactPreviewRouteParams | null
  render: (target: GPreviewRenderTarget) => void
  subscribe: (subscriber: RunelightPreviewRenderTargetSubscriber) => () => void
}

type RunelightPreviewMailboxWindow = Window &
  typeof globalThis & {
    __runelightPreviewPendingRenderTarget?: GPreviewRenderTarget
    __runelightPreviewPrehydrationMailboxInstalled?: boolean
    __runelightPreviewRenderTargetMailbox?: Pick<RunelightPreviewRenderTargetMailbox, "render">
  }

function readRunelightPreviewMailboxWindow(): RunelightPreviewMailboxWindow | null {
  return typeof window === "undefined" ? null : (window as RunelightPreviewMailboxWindow)
}

let runelightPreviewRenderTargetMailbox: RunelightPreviewRenderTargetMailbox | null = null

function useRunelightPreviewRenderTarget(routeTarget: RunelightReactPreviewRouteParams): RunelightReactPreviewRouteParams {
  const mailbox = routeTarget.poolMode ? ensureRunelightPreviewRenderTargetMailbox() : null
  const [messageTarget, setMessageTarget] = React.useState<RunelightReactPreviewRouteParams | null>(() => mailbox?.getTarget() ?? null)

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
  const mailboxWindow = readRunelightPreviewMailboxWindow()
  if (!mailboxWindow) return null
  if (runelightPreviewRenderTargetMailbox) return runelightPreviewRenderTargetMailbox

  const subscribers = new Set<RunelightPreviewRenderTargetSubscriber>()
  let mailboxState = createRunelightPreviewRenderTargetMailboxState(mailboxWindow.__runelightPreviewPendingRenderTarget ?? null)
  let poolReadyAnnounced = false

  const applyRenderTarget = (target: GPreviewRenderTarget, options: { acknowledge: boolean }) => {
    mailboxWindow.__runelightPreviewPendingRenderTarget = target
    if (options.acknowledge && target.sessionId) {
      mailboxWindow.parent.postMessage(createGPreviewRenderAcceptedMessage(target.sessionId), "*")
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

  mailboxWindow.__runelightPreviewRenderTargetMailbox = { render }
  if (mailboxWindow.__runelightPreviewPrehydrationMailboxInstalled) {
    mailboxWindow.addEventListener("runelight:preview-render-target", handlePrehydrationRenderTarget)
  } else {
    mailboxWindow.addEventListener("message", (event: MessageEvent) => {
      if (!isGPreviewRenderMessage(event.data)) return
      render(event.data.target)
    })
  }

  runelightPreviewRenderTargetMailbox = {
    announcePoolReady() {
      if (poolReadyAnnounced) return
      poolReadyAnnounced = true
      if (mailboxWindow.__runelightPreviewPrehydrationMailboxInstalled) return
      mailboxWindow.setTimeout(() => {
        mailboxWindow.parent.postMessage(createGPreviewPoolReadyMessage(), "*")
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
): RunelightReactPreviewRouteParams {
  return {
    frameName: target.frameName,
    frameOverrides: new Map(target.frameOverrides ?? []),
    inputOverrides: new Map(target.inputOverrides ?? []),
    chrome: target.chrome,
    entry: target.entry,
    poolMode: false,
    renderRequestSequence,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  }
}

function createRunelightPreviewRenderTargetMailboxState(
  target: GPreviewRenderTarget | null,
): RunelightPreviewRenderTargetMailboxState {
  const currentTarget = target ? previewRouteParamsFromRenderTarget(target, 0) : null
  return {
    currentTarget,
    currentTargetContentKey: currentTarget ? previewRenderTargetContentKey(currentTarget) : null,
    renderRequestSequence: 0,
  }
}

function applyRunelightPreviewRenderTargetRequest(
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

function showChromeForPreviewTarget(chrome: string | null): boolean {
  return chrome === null ? true : chrome !== "0"
}

function previewRenderTargetKey(target: RunelightReactPreviewRouteParams): string {
  return JSON.stringify({
    frameName: target.frameName,
    frameOverrides: [...target.frameOverrides],
    inputOverrides: [...target.inputOverrides],
    chrome: target.chrome,
    entry: target.entry,
    poolMode: target.poolMode,
    renderRequestSequence: target.renderRequestSequence,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  })
}

function previewRenderTargetContentKey(target: RunelightReactPreviewRouteParams): string {
  return JSON.stringify({
    frameName: target.frameName,
    frameOverrides: [...target.frameOverrides],
    inputOverrides: [...target.inputOverrides],
    chrome: target.chrome,
    entry: target.entry,
    poolMode: target.poolMode,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  })
}

function readRunelightReactPreviewFrameOverrides(params: URLSearchParams): Map<string, string> {
  return readRunelightPreviewFrameOverridesFromSearchParams(params)
}

function readRunelightReactPreviewInputOverrides(params: URLSearchParams): Map<string, string> {
  return readRunelightPreviewInputOverridesFromSearchParams(params)
}

function frameOverridesForFrame(entry: string, frameName: string, childOverrides: Map<string, string>): Map<string, string> {
  return new Map([...childOverrides, [toComponentCoordinate(entry), frameName]])
}

export function parseRunelightReactPreviewEntry(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}

function previewEntryTitle(entry: string): string {
  const coordinate = parseRunelightReactPreviewEntry(entry)
  const fileName = coordinate.file.split(/[\\/]/).pop() ?? coordinate.file
  const componentName = fileName.replace(/\.g\.(?:tsx|vue)$/, "")
  return coordinate.exportName === "default" ? componentName : `${componentName} / ${coordinate.exportName}`
}

export function isRunelightReactPreviewComponent(value: unknown): value is RunelightReactPreviewComponent {
  return typeof value === "function"
}

function previewRuntimeProps<Props extends object>(
  frame: RunelightReactPreviewFrame<Props>,
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

    const publishRenderedSnapshot = () => {
      window.parent.postMessage(createGPreviewRenderedSnapshotMessage(sessionId, readGRenderedSnapshot(document)), "*")
    }

    const settleStaticPreview = () => {
      settled = true
      publishRenderedSnapshot()
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
      if (!options.staticMode) publishRenderedSnapshot()

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
): message is Extract<GPreviewSessionMessage, { type: "runelight:request-values" }> {
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
