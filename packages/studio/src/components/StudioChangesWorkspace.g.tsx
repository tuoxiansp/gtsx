"use client"

import React from "react"
import type { GFrames } from "@runelight/react/runtime"
import { G_RENDERED_SNAPSHOT_VERSION } from "@runelight/core/preview-protocol"

import {
  currentStudioChangesPreviewTargets,
  findManifestComponent,
  mergeStudioPreviewFrameState,
  previewSessionId,
  studioPreviewCacheKey,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
} from "../client"
import type { StudioManifest, StudioManifestComponent, StudioManifestFile } from "../manifest"
import type { StudioPreviewGeometryCacheStore } from "../preview-geometry-cache-store"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { studioComponentFrameGridGap } from "../frame-grid-layout"
import {
  createStudioPreviewRenderSessionStore,
  StudioPreviewRenderSessionStoreProvider,
} from "../preview-render-session-store"
import { studioCanvasFixedFramePreviewScale, studioCanvasTransformStyle } from "../studio-canvas-geometry"
import { studioCanvasBackgroundStyle, studioColors, studioFontFamily, studioRadii, studioShellStyle } from "../studio-theme"
import type { StudioWorkspaceChangeImpact, StudioWorkspaceChangeItem, StudioWorkspaceChanges } from "../workspace-changes"
import { useStudioCanvasController } from "../use-studio-canvas-controller"
import StudioComponentCardSlot from "./StudioComponentCardSlot"
import ViewportPresetTabs from "./ViewportPresetTabs.g"

export type StudioChangesWorkspaceProps = {
  changes?: StudioWorkspaceChanges
  changesLoading?: boolean
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  frameStates?: Record<string, StudioPreviewFrameState>
  manifest: StudioManifest
  onChangeViewportPreset?: (preset: StudioViewportPreset) => void
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewCacheReady?: boolean
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset?: StudioViewportPreset
}

const emptyProviderVariantContext = {}

type StudioChangePreviewEntry = {
  component: StudioManifestComponent
  impact?: StudioWorkspaceChangeImpact
  manifest: StudioManifest
  side: "before" | "current"
}

type StudioChangeCanvasGroup = {
  baselineImpact?: StudioWorkspaceChangeImpact
  baselineManifest?: StudioManifest
  beforeComponents: StudioManifestComponent[]
  currentComponents: StudioManifestComponent[]
  currentImpact?: StudioWorkspaceChangeImpact
  currentManifest: StudioManifest
  filePath: string
  key: string
  kind: StudioWorkspaceChangeItem["kind"]
  surface: StudioWorkspaceChangeItem["surface"]
  title: string
}

type StudioChangeCanvasSectionKind = "deleted" | "added" | "modified"

type StudioChangeCanvasSectionModel = {
  groups: StudioChangeCanvasGroup[]
  kind: StudioChangeCanvasSectionKind
}

const changesCanvasWheelExemptSelector = "[data-runelight-canvas-wheel-exempt]"
const studioChangesCanvasRowMaxWidth = 1520
const studioChangesCanvasComponentFrameMaxSide = 720
const studioChangesCanvasComponentColumnGap = Math.round(studioComponentFrameGridGap * 3)
const studioChangesCanvasComponentCardMinWidth = 0

function StudioChangesWorkspaceView(props: StudioChangesWorkspaceProps) {
  const changes = props.changes
  const [localViewportPreset, setLocalViewportPreset] = React.useState<StudioViewportPreset>("tablet")
  const viewportPreset = props.viewportPreset ?? localViewportPreset
  const baselineManifest = changes?.base.kind === "git" ? changes.base.manifest : undefined
  const baselinePathPrefix = studioWorkspaceChangesBaselinePathPrefix(changes)
  const canvasController = useStudioCanvasController({
    onCanvasMove() {},
    onCanvasPanEnd() {},
    shouldHandleWheelTarget: shouldHandleChangesCanvasWheelTarget,
  })
  const previewGeometryCacheKeys = React.useMemo(
    () => currentStudioChangesPreviewTargets(props.manifest, changes, viewportPreset).map((target) => target.cacheKey),
    [changes, props.manifest, viewportPreset],
  )
  const previewGeometryCacheVersion = useStudioPreviewGeometryCacheVersion(
    props.previewGeometryStore,
    previewGeometryCacheKeys,
  )
  const itemResolution = React.useMemo(
    () =>
      studioChangeItemsWithVisibleFrameDiffs(changes?.items ?? [], {
          baselineManifest,
          fallbackFrameStates: props.frameStates,
          fallbackPreviewCache: props.previewCache,
          manifest: props.manifest,
          previewGeometryStore: props.previewGeometryStore,
          viewportPreset,
      }),
    [
      baselineManifest,
      changes,
      props.frameStates,
      props.manifest,
      props.previewCache,
      previewGeometryCacheVersion,
      props.previewGeometryStore,
      viewportPreset,
    ],
  )
  const resolvingRenderedDiffs = itemResolution.pending
  const items = itemResolution.items
  const groups = React.useMemo(
    () => studioChangeCanvasGroups(items, { baselineManifest, baselinePathPrefix, manifest: props.manifest }),
    [baselineManifest, baselinePathPrefix, items, props.manifest],
  )
  const sections = React.useMemo(() => studioChangeCanvasSections(groups), [groups])
  const visiblePreviewEntries = React.useMemo(
    () => studioChangePreviewEntriesForCanvasGroups(groups),
    [groups],
  )
  const resolvingPreviewEntries = React.useMemo(
    () =>
      resolvingRenderedDiffs
        ? studioChangePreviewEntriesForItems(changes?.items ?? [], {
            baselineManifest,
            manifest: props.manifest,
          })
        : [],
    [baselineManifest, changes, props.manifest, resolvingRenderedDiffs],
  )
  const renderPreviewEntries = React.useMemo(
    () =>
      resolvingRenderedDiffs
        ? studioUniquePreviewEntries([...visiblePreviewEntries, ...resolvingPreviewEntries])
        : visiblePreviewEntries,
    [resolvingPreviewEntries, resolvingRenderedDiffs, visiblePreviewEntries],
  )
  const previewRenderSessionStore = React.useMemo(() => createStudioPreviewRenderSessionStore(), [])

  React.useEffect(() => {
    const sessionIds = new Set(
      renderPreviewEntries.flatMap((entry) =>
        entry.component.frames.map((frame) => previewSessionId(entry.component, frame.name, viewportPreset)),
      ),
    )
    previewRenderSessionStore.setSessionIds(sessionIds, sessionIds)
  }, [renderPreviewEntries, previewRenderSessionStore, viewportPreset])

  const handleViewportPresetChange = React.useCallback(
    (preset: StudioViewportPreset) => {
      setLocalViewportPreset(preset)
      props.onChangeViewportPreset?.(preset)
    },
    [props.onChangeViewportPreset],
  )

  return (
    <StudioPreviewRenderSessionStoreProvider store={previewRenderSessionStore}>
      <main
        data-runelight-studio-changes-workspace="true"
        style={{
          ...studioShellStyle(),
          height: "100vh",
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <section
          aria-label="Runelight Studio changes canvas viewport"
          data-runelight-canvas-viewport="true"
          data-runelight-studio-changes-canvas="true"
          onPointerCancel={canvasController.onCanvasPointerCancel}
          onPointerDown={canvasController.onCanvasPointerDown}
          onPointerMove={canvasController.onCanvasPointerMove}
          onPointerUp={canvasController.onCanvasPointerUp}
          ref={canvasController.setCanvasViewportElement}
          role="application"
          tabIndex={0}
          style={{
            ...studioCanvasBackgroundStyle(),
            cursor: "grab",
            height: "100%",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            overscrollBehavior: "none",
            position: "relative",
            touchAction: "none",
          }}
        >
          <ViewportPresetTabs floating onChange={handleViewportPresetChange} selectedPreset={viewportPreset} />
          <StudioChangesCanvasStatus
            changesLoading={props.changesLoading}
            groupCount={groups.length}
            resolvingRenderedDiffs={resolvingRenderedDiffs}
          />
          {sections.length > 0 ? (
            <div
              data-runelight-canvas-surface="true"
              ref={canvasController.setCanvasSurfaceElement}
              style={{
                alignItems: "start",
                display: "grid",
                gap: 58,
                left: 0,
                padding: "96px 80px 80px",
                position: "absolute",
                top: 0,
                transform: studioCanvasTransformStyle(canvasController.canvas),
                transformOrigin: "0px 0px",
                width: studioChangesCanvasRowMaxWidth,
              }}
            >
              {sections.map((section) => (
                <StudioChangeCanvasSection
                  debugPreviewPool={props.debugPreviewPool}
                  debugPreviewQueue={props.debugPreviewQueue}
                  fallbackFrameStates={props.frameStates}
                  fallbackPreviewCache={props.previewCache}
                  key={section.kind}
                  onPreviewFrameMount={props.onPreviewFrameMount}
                  previewGeometryStore={props.previewGeometryStore}
                  section={section}
                  viewportPreset={viewportPreset}
                />
              ))}
            </div>
          ) : (
            <StudioChangesEmptyCanvas changesLoading={props.changesLoading} resolvingRenderedDiffs={resolvingRenderedDiffs} />
          )}
        </section>
        {resolvingRenderedDiffs ? (
          <StudioChangePreviewPrewarm
            debugPreviewPool={props.debugPreviewPool}
            debugPreviewQueue={props.debugPreviewQueue}
            entries={resolvingPreviewEntries}
            fallbackFrameStates={props.frameStates}
            fallbackPreviewCache={props.previewCache}
            onPreviewFrameMount={props.onPreviewFrameMount}
            previewGeometryStore={props.previewGeometryStore}
            viewportPreset={viewportPreset}
            visibleEntries={visiblePreviewEntries}
          />
        ) : null}
      </main>
    </StudioPreviewRenderSessionStoreProvider>
  )
}

function shouldHandleChangesCanvasWheelTarget(target: EventTarget | null): boolean {
  return !(typeof Element !== "undefined" && target instanceof Element && target.closest(changesCanvasWheelExemptSelector))
}

function StudioChangesCanvasStatus(props: {
  changesLoading?: boolean
  groupCount: number
  resolvingRenderedDiffs: boolean
}) {
  return (
    <div
      data-runelight-canvas-wheel-exempt="true"
      data-runelight-studio-changes-resolving-notice={props.resolvingRenderedDiffs ? "true" : undefined}
      style={{
        alignItems: "center",
        background: studioColors.panelBg,
        border: `1px solid ${props.resolvingRenderedDiffs ? studioColors.accentBorder : studioColors.panelBorderSubtle}`,
        borderRadius: studioRadii.md,
        boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
        color: studioColors.textMuted,
        display: "flex",
        fontFamily: studioFontFamily,
        fontSize: 10,
        fontWeight: 650,
        gap: 10,
        left: 16,
        lineHeight: 1.35,
        padding: "8px 10px",
        position: "absolute",
        top: 56,
        textTransform: "uppercase",
        zIndex: 6,
      }}
    >
      <span>changes {props.groupCount}</span>
      {props.changesLoading ? <span>Loading workspace changes</span> : null}
      {props.resolvingRenderedDiffs ? <span>Resolving rendered changes</span> : null}
    </div>
  )
}

function StudioChangesEmptyCanvas(props: { changesLoading?: boolean; resolvingRenderedDiffs: boolean }) {
  return (
    <div
      data-runelight-canvas-wheel-exempt="true"
      data-runelight-studio-changes-empty="true"
      data-runelight-studio-changes-loading={props.changesLoading ? "true" : undefined}
      data-runelight-studio-changes-resolving={props.resolvingRenderedDiffs ? "true" : undefined}
      style={{
        background: studioColors.panelBg,
        border: `1px solid ${studioColors.panelBorderSubtle}`,
        borderRadius: studioRadii.md,
        color: studioColors.textMuted,
        display: "grid",
        fontFamily: studioFontFamily,
        fontSize: 11,
        left: "50%",
        lineHeight: 1.45,
        minWidth: 220,
        padding: "14px 16px",
        position: "absolute",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      {props.changesLoading
        ? "Loading workspace changes"
        : props.resolvingRenderedDiffs
          ? "Resolving rendered changes"
          : "No workspace changes"}
    </div>
  )
}

function StudioChangeCanvasSection(props: {
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  fallbackFrameStates?: Record<string, StudioPreviewFrameState>
  fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  section: StudioChangeCanvasSectionModel
  viewportPreset: StudioViewportPreset
}) {
  return (
    <section
      data-runelight-studio-change-section={props.section.kind}
      style={{
        display: "grid",
        gap: 18,
        justifyItems: "start",
        minWidth: 0,
        width: studioChangesCanvasRowMaxWidth,
      }}
    >
      <header
        style={{
          alignItems: "center",
          display: "flex",
          minWidth: 0,
        }}
      >
        <StudioChangeSectionTag kind={props.section.kind} />
      </header>
      <div
        data-runelight-studio-change-section-items={props.section.kind}
        style={{
          alignItems: "start",
          display: "flex",
          flexWrap: "wrap",
          gap: `42px ${studioChangesCanvasComponentColumnGap}px`,
          maxWidth: studioChangesCanvasRowMaxWidth,
          minWidth: 0,
          width: studioChangesCanvasRowMaxWidth,
        }}
      >
        {props.section.groups.map((group) => (
          <StudioChangeCanvasGroupCard
            debugPreviewPool={props.debugPreviewPool}
            debugPreviewQueue={props.debugPreviewQueue}
            fallbackFrameStates={props.fallbackFrameStates}
            fallbackPreviewCache={props.fallbackPreviewCache}
            group={group}
            key={group.key}
            onPreviewFrameMount={props.onPreviewFrameMount}
            previewGeometryStore={props.previewGeometryStore}
            viewportPreset={props.viewportPreset}
          />
        ))}
      </div>
    </section>
  )
}

function StudioChangeSectionTag(props: { kind: StudioChangeCanvasSectionKind }) {
  return (
    <span
      data-runelight-studio-change-section-tag={props.kind}
      style={{
        background: studioChangeSectionTagBg(props.kind),
        border: `1px solid ${studioChangeSectionTagBorder(props.kind)}`,
        borderRadius: studioRadii.sm,
        color: studioChangeSectionTagText(props.kind),
        fontFamily: studioFontFamily,
        fontSize: 9,
        fontWeight: 850,
        lineHeight: 1,
        padding: "5px 6px",
        textTransform: "uppercase",
      }}
    >
      {studioChangeSectionTagLabel(props.kind)}
    </span>
  )
}

function StudioChangeCanvasGroupCard(props: {
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  fallbackFrameStates?: Record<string, StudioPreviewFrameState>
  fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
  group: StudioChangeCanvasGroup
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset: StudioViewportPreset
}) {
  const showBeforePane = props.group.beforeComponents.length > 0
  const showCurrentPane = props.group.currentComponents.length > 0
  const twoPane = showBeforePane && showCurrentPane

  return (
    <section
      data-runelight-studio-change-group={props.group.key}
      data-runelight-studio-change-item={props.group.filePath}
      data-runelight-studio-change-kind={props.group.kind}
      data-runelight-studio-change-surface={props.group.surface}
      data-runelight-studio-change-deleted-card={props.group.kind === "deleted" ? "true" : undefined}
      style={{
        display: "grid",
        gap: 10,
        justifyItems: "start",
        minWidth: 0,
        position: "relative",
        width: "max-content",
      }}
    >
      <div
        data-runelight-studio-change-preview-comparison="true"
        style={{
          alignItems: "start",
          display: "grid",
          gap: 20,
          gridTemplateColumns: studioChangePreviewGridColumns(twoPane),
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        {showBeforePane ? (
          <ChangePreviewPane
            components={props.group.beforeComponents}
            debugPreviewPool={props.debugPreviewPool}
            debugPreviewQueue={props.debugPreviewQueue}
            emptyLabel="No baseline preview"
            fallbackFrameStates={props.fallbackFrameStates}
            fallbackPreviewCache={props.fallbackPreviewCache}
            impact={props.group.baselineImpact}
            manifest={props.group.baselineManifest}
            onPreviewFrameMount={props.onPreviewFrameMount}
            previewGeometryStore={props.previewGeometryStore}
            frameGridMaxSide={studioChangesCanvasComponentFrameMaxSide}
            side="before"
            showTitle={twoPane}
            title={props.group.kind === "deleted" ? "Deleted from HEAD" : "Before"}
            viewportPreset={props.viewportPreset}
          />
        ) : null}
        {showCurrentPane ? (
          <ChangePreviewPane
            components={props.group.currentComponents}
            debugPreviewPool={props.debugPreviewPool}
            debugPreviewQueue={props.debugPreviewQueue}
            emptyLabel="No current preview"
            fallbackFrameStates={props.fallbackFrameStates}
            fallbackPreviewCache={props.fallbackPreviewCache}
            impact={props.group.currentImpact}
            manifest={props.group.currentManifest}
            onPreviewFrameMount={props.onPreviewFrameMount}
            previewGeometryStore={props.previewGeometryStore}
            frameGridMaxSide={studioChangesCanvasComponentFrameMaxSide}
            side="current"
            showTitle={twoPane}
            title={props.group.kind === "added" ? "Added in workspace" : "Current"}
            viewportPreset={props.viewportPreset}
          />
        ) : null}
      </div>
    </section>
  )
}

function useStudioPreviewGeometryCacheVersion(
  store: StudioPreviewGeometryCacheStore | undefined,
  cacheKeys: readonly string[],
): string {
  const cacheKeySignature = cacheKeys.join("\0")
  const subscribe = React.useCallback(
    (listener: () => void) => (store ? store.subscribe(cacheKeys, listener) : () => {}),
    [cacheKeySignature, store],
  )
  const getSnapshot = React.useCallback(
    () => (store ? store.getVersionForKeys(cacheKeys) : cacheKeySignature),
    [cacheKeySignature, store],
  )

  return React.useSyncExternalStore(subscribe, getSnapshot, () => cacheKeySignature)
}

function studioChangeItemHasPreviewSurface(item: StudioWorkspaceChangeItem): boolean {
  return (
    item.impacts.length > 0 ||
    (item.baselineImpacts?.length ?? 0) > 0 ||
    (item.currentFile?.components.length ?? 0) > 0 ||
    (item.baselineFile?.components.length ?? 0) > 0
  )
}

function studioChangePreviewGridColumns(twoPane: boolean): string {
  if (twoPane) return "repeat(2, max-content)"
  return "max-content"
}

function ChangePreviewPane(props: {
  components: StudioManifestComponent[]
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  emptyLabel: string
  fallbackFrameStates?: Record<string, StudioPreviewFrameState>
  fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
  frameGridMaxSide?: number
  impact?: StudioWorkspaceChangeImpact
  manifest?: StudioManifest
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  side: "before" | "current"
  showTitle?: boolean
  title: string
  viewportPreset: StudioViewportPreset
}) {
  const manifest = props.manifest

  return (
    <section
      data-runelight-studio-change-pane={props.side}
      style={{
        display: "grid",
        gap: 6,
        justifyItems: "start",
        minWidth: 0,
      }}
    >
      {props.showTitle ? (
        <header
          style={{
            alignItems: "center",
            color: studioColors.textDim,
            display: "inline-flex",
            fontFamily: studioFontFamily,
            fontSize: 9,
            fontWeight: 700,
            gap: 6,
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          <span>{props.title}</span>
        </header>
      ) : null}
      {props.components.length > 0 && manifest ? (
        <div
          data-runelight-studio-change-preview-components={props.side}
          style={{
            alignItems: "start",
            display: "grid",
            gap: 14,
            gridTemplateColumns: "max-content",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          {props.components.map((component) => (
            <StudioComponentCardSlot
              columnIndex={0}
              component={component}
              debugPreviewPool={props.debugPreviewPool}
              debugPreviewQueue={props.debugPreviewQueue}
              fallbackFrameStates={props.fallbackFrameStates}
              fallbackPreviewCache={props.fallbackPreviewCache}
              frameChangeStates={studioChangeFrameStatesForImpact(props.impact)}
              frameGridMaxSide={props.frameGridMaxSide}
              framePreviewScale={studioCanvasFixedFramePreviewScale}
              key={`${props.side}:${component.coordinate}`}
              manifest={manifest}
              cardMinWidth={studioChangesCanvasComponentCardMinWidth}
              onPreviewFrameMount={props.onPreviewFrameMount}
              previewGeometryStore={props.previewGeometryStore}
              providerVariantComponent={component}
              providerVariantContext={emptyProviderVariantContext}
              selected={false}
              selectedFrameName={studioChangeSelectedFrameName(component, props.impact)}
              viewportPreset={props.viewportPreset}
            />
          ))}
        </div>
      ) : (
        <div
          data-runelight-studio-change-preview-empty={props.side}
          style={{
            alignItems: "center",
            background: studioColors.panelBg,
            border: `1px solid ${studioColors.panelBorderSubtle}`,
            borderRadius: studioRadii.md,
            color: studioColors.textDim,
            display: "flex",
            fontFamily: studioFontFamily,
            fontSize: 11,
            minHeight: 120,
            padding: 14,
          }}
        >
          {props.emptyLabel}
        </div>
      )}
    </section>
  )
}

function StudioChangePreviewPrewarm(props: {
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  entries: StudioChangePreviewEntry[]
  fallbackFrameStates?: Record<string, StudioPreviewFrameState>
  fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset: StudioViewportPreset
  visibleEntries?: StudioChangePreviewEntry[]
}) {
  const visibleKeys = new Set((props.visibleEntries ?? []).map(studioChangePreviewEntryKey))
  const entries = props.entries.filter((entry) => !visibleKeys.has(studioChangePreviewEntryKey(entry)))
  if (entries.length === 0) return null

  return (
    <div
      aria-hidden="true"
      data-runelight-studio-change-preview-prewarm="true"
      style={{
        left: -100000,
        opacity: 0,
        pointerEvents: "none",
        position: "absolute",
        top: 0,
      }}
    >
      {entries.map((entry) => (
        <StudioComponentCardSlot
          columnIndex={0}
          component={entry.component}
          debugPreviewPool={props.debugPreviewPool}
          debugPreviewQueue={props.debugPreviewQueue}
          fallbackFrameStates={props.fallbackFrameStates}
          fallbackPreviewCache={props.fallbackPreviewCache}
          frameChangeStates={studioChangeFrameStatesForImpact(entry.impact)}
          frameGridMaxSide={studioChangesCanvasComponentFrameMaxSide}
          framePreviewScale={studioCanvasFixedFramePreviewScale}
          key={studioChangePreviewEntryKey(entry)}
          manifest={entry.manifest}
          onPreviewFrameMount={props.onPreviewFrameMount}
          previewGeometryStore={props.previewGeometryStore}
          providerVariantComponent={entry.component}
          providerVariantContext={emptyProviderVariantContext}
          selected={false}
          selectedFrameName={studioChangeSelectedFrameName(entry.component, entry.impact)}
          viewportPreset={props.viewportPreset}
        />
      ))}
    </div>
  )
}

function studioChangeCanvasSections(groups: readonly StudioChangeCanvasGroup[]): StudioChangeCanvasSectionModel[] {
  const order: StudioChangeCanvasSectionKind[] = ["deleted", "added", "modified"]
  return order.flatMap((kind) => {
    const sectionGroups = groups.filter((group) => studioChangeCanvasSectionKind(group.kind) === kind)
    return sectionGroups.length > 0 ? [{ groups: sectionGroups, kind }] : []
  })
}

function studioChangeCanvasSectionKind(kind: StudioWorkspaceChangeItem["kind"]): StudioChangeCanvasSectionKind {
  if (kind === "deleted") return "deleted"
  if (kind === "added") return "added"
  return "modified"
}

function studioChangeCanvasGroups(
  items: readonly StudioWorkspaceChangeItem[],
  options: {
    baselineManifest?: StudioManifest
    baselinePathPrefix?: string
    manifest: StudioManifest
  },
): StudioChangeCanvasGroup[] {
  const groups = new Map<string, StudioChangeCanvasGroup>()

  for (const item of items) {
    const impactCount = Math.max(item.impacts.length, item.baselineImpacts?.length ?? 0)
    if (impactCount === 0) {
      appendStudioChangeCanvasGroup(groups, {
        baselineImpact: undefined,
        baselineManifest: options.baselineManifest,
        beforeComponents: studioChangePreviewComponents(options.baselineManifest, item.baselineFile, undefined, "before"),
        currentComponents: studioChangePreviewComponents(options.manifest, item.currentFile, undefined, "current"),
        currentImpact: undefined,
        currentManifest: options.manifest,
        filePath: item.filePath,
        key: `${item.surface}:${item.filePath}`,
        kind: item.kind,
        surface: item.surface,
        title: studioFileName(item.filePath),
      })
      continue
    }

    for (let index = 0; index < impactCount; index += 1) {
      const currentImpactFromItem = item.currentFile ? item.impacts[index] : undefined
      const baselineImpactFromItem = item.baselineFile
        ? item.baselineImpacts?.[index] ?? (!item.currentFile ? item.impacts[index] : undefined)
        : undefined
      const baselineImpact = baselineImpactFromItem ??
        (currentImpactFromItem && options.baselineManifest
          ? studioCounterpartImpact(currentImpactFromItem, options.baselineManifest, "before", options.baselinePathPrefix)
          : undefined)
      const currentImpact = currentImpactFromItem ??
        (baselineImpactFromItem ? studioCounterpartImpact(baselineImpactFromItem, options.manifest, "current", options.baselinePathPrefix) : undefined)
      if (!baselineImpact && !currentImpact) continue

      const groupKey = `${item.surface}:${studioChangeVisualRootCoordinate(
        currentImpact?.rootCoordinate ?? baselineImpact?.rootCoordinate ?? item.filePath,
        options.baselinePathPrefix,
      )}`
      const kind = studioChangeCanvasGroupKind(item, baselineImpact, currentImpact)
      appendStudioChangeCanvasGroup(groups, {
        baselineImpact,
        baselineManifest: options.baselineManifest,
        beforeComponents: studioChangePreviewComponents(options.baselineManifest, item.baselineFile, baselineImpact, "before"),
        currentComponents: studioChangePreviewComponents(options.manifest, item.currentFile, currentImpact, "current"),
        currentImpact,
        currentManifest: options.manifest,
        filePath: item.filePath,
        key: groupKey,
        kind,
        surface: item.surface,
        title: currentImpact?.rootComponentName ?? baselineImpact?.rootComponentName ?? studioFileName(item.filePath),
      })
    }
  }

  return [...groups.values()]
}

function appendStudioChangeCanvasGroup(
  groups: Map<string, StudioChangeCanvasGroup>,
  next: StudioChangeCanvasGroup,
) {
  const existing = groups.get(next.key)
  if (!existing) {
    groups.set(next.key, next)
    return
  }

  groups.set(next.key, {
    ...existing,
    baselineImpact: studioMergeChangeImpacts(existing.baselineImpact, next.baselineImpact),
    beforeComponents: studioMergeChangeComponents(existing.beforeComponents, next.beforeComponents),
    currentComponents: studioMergeChangeComponents(existing.currentComponents, next.currentComponents),
    currentImpact: studioMergeChangeImpacts(existing.currentImpact, next.currentImpact),
    filePath: existing.filePath === next.filePath ? existing.filePath : `${existing.filePath} + ${next.filePath}`,
    kind: studioMergeChangeKinds(existing.kind, next.kind),
    title: existing.title || next.title,
  })
}

function studioChangeCanvasGroupKind(
  item: StudioWorkspaceChangeItem,
  baselineImpact: StudioWorkspaceChangeImpact | undefined,
  currentImpact: StudioWorkspaceChangeImpact | undefined,
): StudioWorkspaceChangeItem["kind"] {
  if (item.kind === "added" && currentImpact && !baselineImpact && studioFileOwnsRoot(item.currentFile, currentImpact)) {
    return "added"
  }
  if (item.kind === "deleted" && baselineImpact && !currentImpact && studioFileOwnsRoot(item.baselineFile, baselineImpact)) {
    return "deleted"
  }
  return "modified"
}

function studioFileOwnsRoot(
  file: StudioManifestFile | undefined,
  impact: StudioWorkspaceChangeImpact,
): boolean {
  return file?.components.some((component) => component.coordinate === impact.rootCoordinate) ?? false
}

function studioCounterpartImpact(
  impact: StudioWorkspaceChangeImpact,
  manifest: StudioManifest,
  side: "before" | "current",
  baselinePathPrefix: string | undefined,
): StudioWorkspaceChangeImpact | undefined {
  const rootCoordinate = side === "before"
    ? studioBaselineCoordinateForCurrentCoordinate(impact.rootCoordinate, baselinePathPrefix)
    : studioCurrentCoordinateForBaselineCoordinate(impact.rootCoordinate, baselinePathPrefix)
  const rootComponent = findManifestComponent(manifest, rootCoordinate)
  if (!rootComponent) return undefined
  const rootFrameNames = new Set(rootComponent.frames.map((frame) => frame.name))
  const frameNames = impact.frameNames.filter((frameName) => rootFrameNames.has(frameName))
  if (frameNames.length === 0) return undefined

  return {
    ...impact,
    frameNames,
    frames: impact.frames?.filter((frame) => rootFrameNames.has(frame.name)),
    path: impact.path.map((segment) => {
      const coordinate = side === "before"
        ? studioBaselineCoordinateForCurrentCoordinate(segment.coordinate, baselinePathPrefix)
        : studioCurrentCoordinateForBaselineCoordinate(segment.coordinate, baselinePathPrefix)
      const component = findManifestComponent(manifest, coordinate)
      return {
        componentName: component?.componentName ?? segment.componentName,
        coordinate,
      }
    }),
    rootComponentName: rootComponent.componentName,
    rootCoordinate,
  }
}

function studioMergeChangeImpacts(
  existing: StudioWorkspaceChangeImpact | undefined,
  next: StudioWorkspaceChangeImpact | undefined,
): StudioWorkspaceChangeImpact | undefined {
  if (!existing) return next
  if (!next) return existing

  const frameKinds = new Map<string, NonNullable<StudioWorkspaceChangeImpact["frames"]>[number]["kind"]>()
  for (const frame of studioChangeFramesForMerge(existing)) {
    frameKinds.set(frame.name, frame.kind)
  }
  for (const frame of studioChangeFramesForMerge(next)) {
    frameKinds.set(frame.name, studioMergeChangeFrameKind(frameKinds.get(frame.name), frame.kind))
  }

  const frameNames = [...frameKinds.keys()]
  return {
    ...existing,
    frameNames,
    frames: frameNames.map((name) => ({ kind: frameKinds.get(name) ?? "unknown", name })),
    path: existing.path.length <= next.path.length ? existing.path : next.path,
  }
}

function studioChangeFramesForMerge(
  impact: StudioWorkspaceChangeImpact,
): NonNullable<StudioWorkspaceChangeImpact["frames"]> {
  return impact.frames ?? impact.frameNames.map((name) => ({ kind: "unknown" as const, name }))
}

function studioMergeChangeFrameKind(
  previous: NonNullable<StudioWorkspaceChangeImpact["frames"]>[number]["kind"] | undefined,
  next: NonNullable<StudioWorkspaceChangeImpact["frames"]>[number]["kind"],
): NonNullable<StudioWorkspaceChangeImpact["frames"]>[number]["kind"] {
  if (!previous || previous === next) return next
  if (previous === "unchanged") return next
  if (next === "unchanged") return previous
  if (previous === "changed" || next === "changed") return "changed"
  if (previous === "unknown" || next === "unknown") return previous === "unknown" ? next : previous
  return "changed"
}

function studioMergeChangeComponents(
  existing: StudioManifestComponent[],
  next: StudioManifestComponent[],
): StudioManifestComponent[] {
  const components = new Map(existing.map((component) => [component.coordinate, component] as const))
  for (const component of next) {
    const previous = components.get(component.coordinate)
    components.set(component.coordinate, previous ? studioMergeManifestComponentFrames(previous, component) : component)
  }
  return [...components.values()]
}

function studioMergeManifestComponentFrames(
  existing: StudioManifestComponent,
  next: StudioManifestComponent,
): StudioManifestComponent {
  const frames = new Map(existing.frames.map((frame) => [frame.name, frame] as const))
  for (const frame of next.frames) {
    if (!frames.has(frame.name)) frames.set(frame.name, frame)
  }
  return { ...existing, frames: [...frames.values()] }
}

function studioMergeChangeKinds(
  existing: StudioWorkspaceChangeItem["kind"],
  next: StudioWorkspaceChangeItem["kind"],
): StudioWorkspaceChangeItem["kind"] {
  return existing === next ? existing : "modified"
}

function studioWorkspaceChangesBaselinePathPrefix(changes: StudioWorkspaceChanges | undefined): string | undefined {
  return changes?.base.kind === "git" ? `${changes.base.baselineRoot}/` : undefined
}

function studioChangeVisualRootCoordinate(coordinate: string, baselinePathPrefix: string | undefined): string {
  return studioCurrentCoordinateForBaselineCoordinate(coordinate, baselinePathPrefix)
}

function studioCurrentCoordinateForBaselineCoordinate(coordinate: string, baselinePathPrefix: string | undefined): string {
  return baselinePathPrefix && coordinate.startsWith(baselinePathPrefix)
    ? coordinate.slice(baselinePathPrefix.length)
    : coordinate
}

function studioBaselineCoordinateForCurrentCoordinate(coordinate: string, baselinePathPrefix: string | undefined): string {
  if (!baselinePathPrefix) return coordinate
  return coordinate.startsWith(baselinePathPrefix)
    ? coordinate
    : `${baselinePathPrefix}${coordinate}`
}

function studioChangePreviewComponents(
  manifest: StudioManifest | undefined,
  file: StudioManifestFile | undefined,
  impact: StudioWorkspaceChangeImpact | undefined,
  side: "before" | "current",
): StudioManifestComponent[] {
  if (!manifest) return []
  if (impact) {
    const root = findManifestComponent(manifest, impact.rootCoordinate)
    if (!root) return []
    const frameNames = studioChangePaneFrameNamesForImpact(impact, side)
    if (frameNames.length === 0) return []
    return [studioManifestComponentWithFrames(root, frameNames)]
  }
  return file?.components ?? []
}

function studioChangePreviewEntriesForCanvasGroups(
  groups: readonly StudioChangeCanvasGroup[],
): StudioChangePreviewEntry[] {
  return studioUniquePreviewEntries(groups.flatMap((group) => [
    ...(group.baselineManifest
      ? group.beforeComponents.map((component) => ({
          component,
          impact: group.baselineImpact,
          manifest: group.baselineManifest as StudioManifest,
          side: "before" as const,
        }))
      : []),
    ...group.currentComponents.map((component) => ({
      component,
      impact: group.currentImpact,
      manifest: group.currentManifest,
      side: "current" as const,
    })),
  ]))
}

function studioChangePreviewEntriesForItems(
  items: readonly StudioWorkspaceChangeItem[],
  options: {
    baselineManifest?: StudioManifest
    manifest: StudioManifest
  },
): StudioChangePreviewEntry[] {
  const entries = new Map<string, StudioChangePreviewEntry>()
  const appendEntries = (
    side: "before" | "current",
    manifest: StudioManifest | undefined,
    file: StudioManifestFile | undefined,
    impacts: readonly StudioWorkspaceChangeImpact[] | undefined,
  ) => {
    if (!manifest || !file) return
    const nextImpacts = impacts && impacts.length > 0 ? impacts : [undefined]
    for (const impact of nextImpacts) {
      for (const component of studioChangePreviewComponents(manifest, file, impact, side)) {
        const key = studioChangePreviewEntryKey({ component, impact, manifest, side })
        if (!entries.has(key)) {
          entries.set(key, { component, impact, manifest, side })
        }
      }
    }
  }

  for (const item of items) {
    appendEntries("before", options.baselineManifest, item.baselineFile, item.baselineImpacts)
    appendEntries("current", options.manifest, item.currentFile, item.impacts)
  }

  return [...entries.values()]
}

function studioUniquePreviewEntries(entries: readonly StudioChangePreviewEntry[]): StudioChangePreviewEntry[] {
  const result = new Map<string, StudioChangePreviewEntry>()
  for (const entry of entries) {
    const key = studioChangePreviewEntryKey(entry)
    if (!result.has(key)) result.set(key, entry)
  }
  return [...result.values()]
}

function studioChangePreviewEntryKey(entry: StudioChangePreviewEntry): string {
  return `${entry.side}:${entry.component.coordinate}:${entry.component.frames.map((frame) => frame.name).join(",")}`
}

function studioChangeSelectedFrameName(
  component: StudioManifestComponent,
  impact: StudioWorkspaceChangeImpact | undefined,
): string {
  return impact?.frameNames.find((frameName) => component.frames.some((frame) => frame.name === frameName)) ??
    component.frames[0]?.name ??
    "missing-frames"
}

function studioChangeFrameStatesForImpact(
  impact: StudioWorkspaceChangeImpact | undefined,
): Record<string, NonNullable<StudioWorkspaceChangeImpact["frames"]>[number]["kind"]> | undefined {
  if (!impact?.frames) return undefined

  return Object.fromEntries(impact.frames.map((frame) => [frame.name, frame.kind]))
}

type StudioChangeRenderedFrameDiffStatus = "changed" | "same" | "pending" | "unknown"
type StudioChangeRenderedSnapshotStatus =
  | { kind: "hash"; hash: string }
  | { kind: "pending" }
  | { kind: "unavailable" }

function studioChangeItemsWithVisibleFrameDiffs(
  items: readonly StudioWorkspaceChangeItem[],
  options: {
    baselineManifest?: StudioManifest
    fallbackFrameStates?: Record<string, StudioPreviewFrameState>
    fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
    manifest: StudioManifest
    previewGeometryStore?: StudioPreviewGeometryCacheStore
    viewportPreset: StudioViewportPreset
  },
): { items: StudioWorkspaceChangeItem[]; pending: boolean } {
  let pending = false
  const visibleItems = items.flatMap((item) => {
    const resolution = studioChangeItemWithVisibleFrameDiffs(item, options)
    pending ||= resolution.pending
    return resolution.item && studioChangeItemHasPreviewSurface(resolution.item) ? [resolution.item] : []
  })
  return { items: visibleItems, pending }
}

function studioChangeItemWithVisibleFrameDiffs(
  item: StudioWorkspaceChangeItem,
  options: {
    baselineManifest?: StudioManifest
    fallbackFrameStates?: Record<string, StudioPreviewFrameState>
    fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
    manifest: StudioManifest
    previewGeometryStore?: StudioPreviewGeometryCacheStore
    viewportPreset: StudioViewportPreset
  },
): { item?: StudioWorkspaceChangeItem; pending: boolean } {
  if (item.kind !== "modified") {
    return { item: studioChangeItemWithNonUnchangedFrames(item), pending: false }
  }

  let pending = false
  const impacts = item.impacts.flatMap((impact, index) => {
    const resolution = studioChangeVisibleFramesForImpactPair({
      baselineImpact: item.baselineImpacts?.[index],
      currentImpact: impact,
      options,
    })
    pending ||= resolution.pending
    const frames = resolution.frames
    return frames.length > 0 ? [{ ...impact, frameNames: frames.map((frame) => frame.name), frames }] : []
  })
  const baselineImpacts = item.baselineImpacts?.flatMap((baselineImpact, index) => {
    const resolution = studioChangeVisibleFramesForImpactPair({
      baselineImpact,
      currentImpact: item.impacts[index],
      options,
    })
    pending ||= resolution.pending
    const frames = resolution.frames
    return frames.length > 0 ? [{ ...baselineImpact, frameNames: frames.map((frame) => frame.name), frames }] : []
  })
  if (impacts.length === 0 && (baselineImpacts?.length ?? 0) === 0) return { pending }

  return {
    item: {
      ...item,
      impacts,
      ...(baselineImpacts ? { baselineImpacts } : {}),
    },
    pending,
  }
}

function studioChangeItemWithNonUnchangedFrames(item: StudioWorkspaceChangeItem): StudioWorkspaceChangeItem {
  return {
    ...item,
    impacts: item.impacts.flatMap((impact) => {
      const frames = studioChangeNonUnchangedFrames(impact)
      return frames.length > 0 ? [{ ...impact, frameNames: frames.map((frame) => frame.name), frames }] : []
    }),
    ...(item.baselineImpacts ? {
      baselineImpacts: item.baselineImpacts.flatMap((impact) => {
        const frames = studioChangeNonUnchangedFrames(impact)
        return frames.length > 0 ? [{ ...impact, frameNames: frames.map((frame) => frame.name), frames }] : []
      }),
    } : {}),
  }
}

function studioChangeVisibleFramesForImpactPair(input: {
  baselineImpact?: StudioWorkspaceChangeImpact
  currentImpact?: StudioWorkspaceChangeImpact
  options: {
    baselineManifest?: StudioManifest
    fallbackFrameStates?: Record<string, StudioPreviewFrameState>
    fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
    manifest: StudioManifest
    previewGeometryStore?: StudioPreviewGeometryCacheStore
    viewportPreset: StudioViewportPreset
  }
}): { frames: NonNullable<StudioWorkspaceChangeImpact["frames"]>; pending: boolean } {
  let pending = false
  const frames = studioChangeNonUnchangedFrames(input.currentImpact ?? input.baselineImpact).flatMap((frame) => {
    if (frame.kind !== "changed") return [frame]
    const status = studioChangeRenderedFrameDiffStatus({
      baselineImpact: input.baselineImpact,
      currentImpact: input.currentImpact,
      frameName: frame.name,
      options: input.options,
    })
    if (status === "pending") pending = true
    if (status === "unknown") return [{ ...frame, kind: "unknown" as const }]
    return status === "changed" ? [frame] : []
  })
  return { frames, pending }
}

function studioChangeRenderedFrameDiffStatus(input: {
  baselineImpact?: StudioWorkspaceChangeImpact
  currentImpact?: StudioWorkspaceChangeImpact
  frameName: string
  options: {
    baselineManifest?: StudioManifest
    fallbackFrameStates?: Record<string, StudioPreviewFrameState>
    fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
    manifest: StudioManifest
    previewGeometryStore?: StudioPreviewGeometryCacheStore
    viewportPreset: StudioViewportPreset
  }
}): StudioChangeRenderedFrameDiffStatus {
  const baselineComponent = input.baselineImpact && input.options.baselineManifest
    ? findManifestComponent(input.options.baselineManifest, input.baselineImpact.rootCoordinate)
    : undefined
  const currentComponent = input.currentImpact
    ? findManifestComponent(input.options.manifest, input.currentImpact.rootCoordinate)
    : undefined
  if (!baselineComponent || !currentComponent) return "changed"

  const baselineSnapshot = studioChangeRenderedSnapshotStatus(baselineComponent, input.frameName, input.options)
  const currentSnapshot = studioChangeRenderedSnapshotStatus(currentComponent, input.frameName, input.options)
  if (baselineSnapshot.kind === "unavailable" || currentSnapshot.kind === "unavailable") return "unknown"
  if (baselineSnapshot.kind === "pending" || currentSnapshot.kind === "pending") return "pending"

  return baselineSnapshot.hash !== currentSnapshot.hash ? "changed" : "same"
}

function studioChangeRenderedSnapshotStatus(
  component: StudioManifestComponent,
  frameName: string,
  options: {
    fallbackFrameStates?: Record<string, StudioPreviewFrameState>
    fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
    previewGeometryStore?: StudioPreviewGeometryCacheStore
    viewportPreset: StudioViewportPreset
  },
): StudioChangeRenderedSnapshotStatus {
  const sessionId = previewSessionId(component, frameName, options.viewportPreset)
  const cacheKey = studioPreviewCacheKey(component, frameName, options.viewportPreset)
  const storeState = options.previewGeometryStore?.getMergedFrameState(sessionId, cacheKey)
  const fallbackState = mergeStudioPreviewFrameState(
    sessionId,
    options.fallbackFrameStates?.[sessionId],
    options.fallbackPreviewCache?.[cacheKey]?.frameState,
  )
  const state = storeState ?? fallbackState
  const snapshot = state?.renderedSnapshot
  if (snapshot && snapshot.version === G_RENDERED_SNAPSHOT_VERSION) return { kind: "hash", hash: snapshot.hash }
  if (state?.error || state?.ready) return { kind: "unavailable" }
  return { kind: "pending" }
}

function studioChangeNonUnchangedFrames(
  impact: StudioWorkspaceChangeImpact | undefined,
): NonNullable<StudioWorkspaceChangeImpact["frames"]> {
  if (!impact) return []
  const frames = impact.frames ?? impact.frameNames.map((name) => ({ kind: "unknown" as const, name }))
  return frames.filter((frame) => frame.kind !== "unchanged")
}

function studioChangePaneFrameNamesForImpact(
  impact: StudioWorkspaceChangeImpact,
  side: "before" | "current",
): string[] {
  const frames = studioChangeNonUnchangedFrames(impact)
  return frames.flatMap((frame) => {
    if (side === "before" && frame.kind === "added") return []
    if (side === "current" && frame.kind === "deleted") return []
    return [frame.name]
  })
}

function studioManifestComponentWithFrames(
  component: StudioManifestComponent,
  frameNames: readonly string[],
): StudioManifestComponent {
  const frameNameSet = new Set(frameNames)
  const frames = component.frames.filter((frame) => frameNameSet.has(frame.name))
  if (frames.length === component.frames.length) return component
  return { ...component, frames }
}

function studioFileName(path: string): string {
  return path.split("/").at(-1) ?? path
}

function studioChangeSectionTagLabel(kind: StudioChangeCanvasSectionKind): string {
  if (kind === "deleted") return "DEL"
  if (kind === "added") return "NEW"
  return "MOD"
}

function studioChangeSectionTagBg(kind: StudioChangeCanvasSectionKind): string {
  if (kind === "deleted") return studioColors.errorBg
  if (kind === "added") return "rgba(79,166,106,0.16)"
  return studioColors.warningBg
}

function studioChangeSectionTagBorder(kind: StudioChangeCanvasSectionKind): string {
  if (kind === "deleted") return studioColors.errorBorder
  if (kind === "added") return "#4fa66a"
  return studioColors.warningBorder
}

function studioChangeSectionTagText(kind: StudioChangeCanvasSectionKind): string {
  if (kind === "deleted") return studioColors.errorText
  if (kind === "added") return "#9bd8ad"
  return studioColors.warningText
}

const StudioChangesWorkspace = React.memo(StudioChangesWorkspaceView) as typeof StudioChangesWorkspaceView & {
  frames?: GFrames<StudioChangesWorkspaceProps>
}

export default StudioChangesWorkspace

StudioChangesWorkspace.frames = {
  modifiedSmallComponent: {
    props: {
      changes: {
        version: 1,
        base: { kind: "git", baselineRoot: ".runelight/baselines/HEAD", ref: "HEAD" },
        items: [
          {
            filePath: "src/PriceRow.g.tsx",
            kind: "modified",
            surface: "frames",
            impacts: [
              {
                frameNames: ["ready"],
                rootComponentName: "CheckoutPage",
                rootCoordinate: "src/CheckoutPage.g.tsx#default",
                surface: "frames",
                path: [
                  { coordinate: "src/CheckoutPage.g.tsx#default", componentName: "CheckoutPage" },
                  { coordinate: "src/PriceRow.g.tsx#default", componentName: "PriceRow" },
                ],
              },
            ],
            currentFile: {
              path: "src/PriceRow.g.tsx",
              sourceHash: "price-row-source",
              components: [
                {
                  coordinate: "src/PriceRow.g.tsx#default",
                  filePath: "src/PriceRow.g.tsx",
                  sourceHash: "price-row-source",
                  exportName: "default",
                  componentName: "PriceRow",
                  mode: "pure",
                  frames: [{ kind: "pure", name: "ready" }],
                  providers: {},
                  diagnostics: [],
                },
              ],
              diagnostics: [],
            },
          },
        ],
      },
      manifest: {
        version: 1,
        routes: {
          changes: "/runelight/studio/changes",
          events: "/runelight/studio/events",
          preview: "/runelight",
          studio: "/runelight/studio",
          manifest: "/runelight/studio/manifest",
        },
        files: [
          {
            path: "src/CheckoutPage.g.tsx",
            sourceHash: "checkout-source",
            components: [
              {
                coordinate: "src/CheckoutPage.g.tsx#default",
                filePath: "src/CheckoutPage.g.tsx",
                sourceHash: "checkout-source",
                exportName: "default",
                componentName: "CheckoutPage",
                mode: "pure",
                frames: [{ kind: "pure", name: "ready" }],
                providers: {},
                dependencies: ["src/PriceRow.g.tsx#default"],
                diagnostics: [],
              },
            ],
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
    },
  },
} satisfies GFrames<StudioChangesWorkspaceProps>
