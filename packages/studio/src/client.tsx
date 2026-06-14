import {
  G_PREVIEW_PROTOCOL_VERSION,
  createGPreviewRequestValuesMessage,
  decodeRunelightPreviewFrameOverride,
  encodeRunelightPreviewFrameOverride,
  type GBoundaryTreeNode,
  type GPreviewRenderTarget,
  type GPreviewRequestValuesMessage,
  type GPreviewSessionMessage,
  type GRenderedSnapshot,
  type GRuntimeValuesSnapshot,
} from "@runelight/core/preview-protocol"
import type { GBoundaryRect } from "@runelight/core/boundary-rect"
import {
  computeRunelightPreviewFrameGridLayout,
  type RunelightPreviewFrameGridItemLayout,
  type RunelightPreviewFrameGridLayout,
} from "@runelight/core/frame-grid-layout"
import { studioComponentCardWidth } from "./frame-grid-layout"
import type { StudioManifest, StudioManifestComponent } from "./manifest"
import type { StudioWorkspaceChanges } from "./workspace-changes"
import { findStudioBoundaryNode, studioBoundaryRectForCoordinate } from "./boundary-tree"
import { previewFrameLayoutWidth } from "./preview-frame-layout"

export type StudioPreviewFrameState = {
  expectedSessionId: string
  ready: boolean
  tree?: GBoundaryTreeNode[]
  size?: {
    width: number
    height: number
  }
  renderedSnapshot?: GRenderedSnapshot
  error?: {
    message: string
    stack?: string
  }
  valuesByBoundaryId?: Record<string, GRuntimeValuesSnapshot>
}

export type StudioWorkspaceColumn = {
  components: StudioManifestComponent[]
  parentCoordinate?: string
}

export type StudioWorkspaceState = {
  canvasViewportPreset?: StudioViewportPreset
  columns: StudioWorkspaceColumn[]
  rootProviderVariants: StudioProviderVariantContext
  selectedFrameByCoordinate: Record<string, string>
  selectedCoordinatePath: string[]
  selectedProviderVariantsByPath: Record<string, StudioProviderVariantContext>
  selectedRuntimeInstanceByCoordinate: Record<string, string>
  selectedViewportPresetByCoordinate: Record<string, StudioViewportPreset>
}

export type StudioCanvasTransform = {
  x: number
  y: number
  scale: number
}

export type StudioCanvasUrlScope = "components" | "design"

export type StudioCanvasScreenRect = {
  bottom: number
  left: number
  right: number
  top: number
}

export type StudioColumnLayout = {
  x: number
  y: number
}

export type StudioColumnLayoutMeasurement = {
  cardRectsByCoordinate: Record<string, StudioCanvasScreenRect>
  height: number
  previewFrameRectsBySessionId?: Record<string, StudioCanvasScreenRect>
}

export type StudioFrameGridItemLayout = RunelightPreviewFrameGridItemLayout

export type StudioFrameGridLayout = RunelightPreviewFrameGridLayout

export type StudioCanvasWheelInput = {
  clientX: number
  clientY: number
  ctrlKey: boolean
  deltaMode: number
  deltaX: number
  deltaY: number
  focalViewportX?: number
  focalViewportY?: number
  metaKey: boolean
  viewportLeft: number
  viewportTop: number
}

export type StudioCardSelectionSource = "keyboard" | "pointer"

export type StudioCardSelectionAction =
  | {
      type: "activate-card"
      coordinate: string
      source: StudioCardSelectionSource
    }
  | {
      type: "clear"
    }

export type StudioViewportPreset = "phone" | "tablet" | "desktop"

export type StudioComponentSelectionOptions = {
  columnIndex?: number
}

export type StudioRuntimeInstance = {
  boundaryId: string
  coordinate: string
  parentPath: string[]
  rect?: GBoundaryRect
}

export type StudioRuntimeValuesRequest = {
  sessionId: string
  message: GPreviewRequestValuesMessage
}

export type StudioProviderVariantOption = {
  frameName?: string
  name: string
  selected: boolean
}

export type StudioProviderVariantAxis = {
  providerName: string
  selectedVariant?: string
  variants: StudioProviderVariantOption[]
}

export type StudioProviderVariantContext = Record<string, string>

export type StudioPreviewCacheEntry = {
  frameState: StudioPreviewFrameState
  lastUsedAt: number
}

export type StudioPreviewTarget = {
  cacheKey: string
  previewUrl: string
  sessionId: string
  size: { width: number; height: number }
  title: string
}

export type StudioPreviewFrameOverride = {
  frameName: string
  coordinate: string
}

export type StudioProviderVariantFrameState = "match" | "mismatch" | "neutral"

export type StudioProviderVariantFrameStatus = {
  state: StudioProviderVariantFrameState
  title?: string
}

export type StudioWorkspaceUrlState = {
  canvas: StudioCanvasTransform
  selection: string
  workspace: StudioWorkspaceState
  warning?: string
}

const studioRootSelectionId = "roots"

export function applyStudioPreviewMessage(
  state: StudioPreviewFrameState,
  message: GPreviewSessionMessage,
): StudioPreviewFrameState {
  if (message.protocolVersion !== G_PREVIEW_PROTOCOL_VERSION || message.sessionId !== state.expectedSessionId) {
    return state
  }

  if (message.type === "runelight:ready") {
    if (state.ready && !state.error) return state
    const next = { ...state, ready: true }
    delete next.error
    return next
  }

  if (message.type === "runelight:tree") {
    if (sameBoundaryTree(state.tree, message.tree)) return state
    return { ...state, tree: message.tree }
  }

  if (message.type === "runelight:resize") {
    if (state.size?.width === message.size.width && state.size.height === message.size.height) return state
    return { ...state, size: message.size }
  }

  if (message.type === "runelight:rendered-snapshot") {
    if (state.renderedSnapshot?.hash === message.snapshot.hash) return state
    return { ...state, renderedSnapshot: message.snapshot }
  }

  if (message.type === "runelight:error") {
    if (state.error?.message === message.error.message && state.error.stack === message.error.stack) return state
    return { ...state, error: message.error }
  }

  if (message.type === "runelight:values") {
    return {
      ...state,
      valuesByBoundaryId: {
        ...state.valuesByBoundaryId,
        [message.values.boundaryId]: message.values,
      },
    }
  }

  return state
}

export function applyStudioPreviewMessageToFrameStates(
  frameStates: Record<string, StudioPreviewFrameState>,
  message: GPreviewSessionMessage,
  activeSessionIds: Set<string>,
): Record<string, StudioPreviewFrameState> {
  if (!activeSessionIds.has(message.sessionId)) return frameStates

  const currentFrameState = frameStates[message.sessionId] ?? {
    expectedSessionId: message.sessionId,
    ready: false,
  }
  const nextFrameState = applyStudioPreviewMessage(currentFrameState, message)
  if (nextFrameState === currentFrameState) return frameStates

  return {
    ...frameStates,
    [message.sessionId]: nextFrameState,
  }
}

function sameBoundaryTree(left: GBoundaryTreeNode[] | undefined, right: GBoundaryTreeNode[] | undefined): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((node, index) => sameBoundaryTreeNode(node, right[index]))
}

function sameBoundaryTreeNode(left: GBoundaryTreeNode, right: GBoundaryTreeNode | undefined): boolean {
  if (!right) return false
  return (
    left.id === right.id &&
    left.coordinate === right.coordinate &&
    sameBoundaryRect(left.rect, right.rect) &&
    sameBoundaryTree(left.children, right.children)
  )
}

function sameBoundaryRect(left: GBoundaryRect | undefined, right: GBoundaryRect | undefined): boolean {
  return (
    left === right ||
    (left?.x === right?.x && left?.y === right?.y && left?.width === right?.width && left?.height === right?.height)
  )
}

export function createStudioWorkspaceState(manifest: StudioManifest, selection?: string): StudioWorkspaceState {
  const selected = resolveStudioSelection(manifest, selection)
  return {
    canvasViewportPreset: "tablet",
    columns: [{ components: selected.components }],
    rootProviderVariants: {},
    selectedFrameByCoordinate: {},
    selectedCoordinatePath: [],
    selectedProviderVariantsByPath: {},
    selectedRuntimeInstanceByCoordinate: {},
    selectedViewportPresetByCoordinate: {},
  }
}

export function defaultStudioCanvasTransform(): StudioCanvasTransform {
  return { x: 40, y: 40, scale: 1 }
}

export function selectStudioComponent(
  state: StudioWorkspaceState,
  manifest: StudioManifest,
  coordinate: string,
  tree: GBoundaryTreeNode[] | GBoundaryTreeNode[][],
  options: StudioComponentSelectionOptions = {},
): StudioWorkspaceState {
  const selectedColumnIndex = studioSelectedColumnIndexForCoordinate(state, coordinate, options.columnIndex)
  if (selectedColumnIndex < 0) return state

  const nextColumns = state.columns.slice(0, selectedColumnIndex + 1)
  const selectedPath = [...state.selectedCoordinatePath.slice(0, selectedColumnIndex), coordinate]
  const childComponents = directChildComponentsForCoordinate(manifest, normalizeStudioBoundaryTrees(tree), coordinate)
  if (childComponents.length > 0) {
    nextColumns.push({ components: childComponents, parentCoordinate: coordinate })
  }

  return {
    canvasViewportPreset: canvasViewportPresetForWorkspace(state),
    columns: nextColumns,
    rootProviderVariants: state.rootProviderVariants,
    selectedFrameByCoordinate: omitStudioSelectedFrames(state.selectedFrameByCoordinate, selectedPath),
    selectedCoordinatePath: selectedPath,
    selectedProviderVariantsByPath: omitStudioSelectedProviderVariantsByPath(
      state.selectedProviderVariantsByPath,
      nextColumns.flatMap((column, columnIndex) =>
        column.components.map((component) => studioProviderVariantPathKey(pathForWorkspaceColumn(nextColumns, selectedPath, columnIndex, component.coordinate))),
      ),
    ),
    selectedRuntimeInstanceByCoordinate: state.selectedRuntimeInstanceByCoordinate,
    selectedViewportPresetByCoordinate: state.selectedViewportPresetByCoordinate,
  }
}

function studioSelectedColumnIndexForCoordinate(
  state: StudioWorkspaceState,
  coordinate: string,
  preferredColumnIndex: number | undefined,
): number {
  if (
    preferredColumnIndex !== undefined &&
    state.columns[preferredColumnIndex]?.components.some((component) => component.coordinate === coordinate)
  ) {
    return preferredColumnIndex
  }

  return state.columns.findIndex((column) => column.components.some((component) => component.coordinate === coordinate))
}

export function selectedStudioFrameName(
  state: Pick<StudioWorkspaceState, "selectedFrameByCoordinate">,
  component: StudioManifestComponent,
): string {
  const selectedFrameName = state.selectedFrameByCoordinate[component.coordinate]
  if (selectedFrameName && component.frames.some((frame) => frame.name === selectedFrameName)) return selectedFrameName
  return component.frames[0]?.name ?? "No frames"
}

export function studioProviderVariantAxes(
  component: StudioManifestComponent,
  context: StudioProviderVariantContext = {},
): StudioProviderVariantAxis[] {
  const providerNames = new Set<string>()

  for (const [providerName, provider] of Object.entries(component.providers)) {
    if (provider.variants && provider.variants.length > 0) providerNames.add(providerName)
  }
  for (const frame of component.frames) {
    for (const providerName of Object.keys(frame.providerVariants ?? {})) providerNames.add(providerName)
  }

  return [...providerNames].flatMap((providerName) => {
    const frameVariants = uniqueStrings(
      component.frames.flatMap((frame) => {
        const variant = frame.providerVariants?.[providerName]
        return providerVariantSelectionValues(variant)
      }),
    )
    const declaredVariants = component.providers[providerName]?.variants ?? []
    const variants = declaredVariants.length > 0 ? declaredVariants.filter((variant) => frameVariants.includes(variant)) : frameVariants
    if (variants.length < 2) return []

    const selectedVariant = context[providerName]
    const hasSelectedVariant = selectedVariant !== undefined
    return [
      {
        providerName,
        ...(hasSelectedVariant ? { selectedVariant } : {}),
        variants: variants.map((variant) => ({
          frameName: component.frames.find((frame) => providerVariantSelectionValues(frame.providerVariants?.[providerName]).includes(variant))?.name,
          name: variant,
          selected: hasSelectedVariant && selectedVariant === variant,
        })),
      },
    ]
  })
}

export function studioManifestProviderVariantAxes(
  manifest: StudioManifest,
  selectedVariants: StudioProviderVariantContext = {},
): StudioProviderVariantAxis[] {
  const variantsByProvider = new Map<string, string[]>()

  for (const component of studioComponentWorkspaceManifestComponents(manifest)) {
    for (const [providerName, provider] of Object.entries(component.providers)) {
      if (!provider.variants || provider.variants.length < 2) continue
      variantsByProvider.set(providerName, uniqueStrings([...(variantsByProvider.get(providerName) ?? []), ...provider.variants]))
    }
  }

  return [...variantsByProvider.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerName, variants]) => ({
      providerName,
      ...(selectedVariants[providerName] ? { selectedVariant: selectedVariants[providerName] } : {}),
      variants: variants.map((variant) => ({
        name: variant,
        selected: selectedVariants[providerName] === variant,
      })),
    }))
}

export function studioProviderVariantContextForPath(
  workspace: Pick<StudioWorkspaceState, "rootProviderVariants" | "selectedProviderVariantsByPath">,
  path: string[],
): StudioProviderVariantContext {
  const context: StudioProviderVariantContext = { ...workspace.rootProviderVariants }
  for (let index = 1; index <= path.length; index += 1) {
    Object.assign(context, workspace.selectedProviderVariantsByPath[studioProviderVariantPathKey(path.slice(0, index))])
  }
  return context
}

export function studioProviderVariantSelectionContextForPath(
  workspace: Pick<StudioWorkspaceState, "selectedProviderVariantsByPath">,
  path: string[],
): StudioProviderVariantContext {
  return { ...(workspace.selectedProviderVariantsByPath[studioProviderVariantPathKey(path)] ?? {}) }
}

export function sameStudioProviderVariantContext(
  left: StudioProviderVariantContext | undefined,
  right: StudioProviderVariantContext | undefined,
): boolean {
  if (left === right) return true

  const leftEntries = Object.entries(left ?? {})
  const rightContext = right ?? {}
  if (leftEntries.length !== Object.keys(rightContext).length) return false
  return leftEntries.every(([providerName, variant]) => rightContext[providerName] === variant)
}

export function studioFilteredFramesForProviderVariantContext(
  component: StudioManifestComponent,
  context: StudioProviderVariantContext,
): StudioManifestComponent["frames"] {
  void context
  return component.frames
}

export function studioProviderVariantFrameStatus(
  component: StudioManifestComponent,
  frame: StudioManifestComponent["frames"][number],
  context: StudioProviderVariantContext = {},
): StudioProviderVariantFrameStatus {
  const mismatches: string[] = []
  let matched = false

  for (const [providerName, selectedVariant] of Object.entries(context)) {
    const frameVariants = uniqueStrings(
      component.frames.flatMap((candidate) => {
        const variant = candidate.providerVariants?.[providerName]
        return providerVariantSelectionValues(variant)
      }),
    )
    const declaredVariants = component.providers[providerName]?.variants ?? []
    if (frameVariants.length === 0 && !declaredVariants.includes(selectedVariant)) continue

    const frameVariant = frame.providerVariants?.[providerName]
    if (frameVariant === undefined) continue

    if (providerVariantSelectionValues(frameVariant).includes(selectedVariant)) {
      matched = true
      continue
    }

    mismatches.push(`${providerName}: ${formatProviderVariantSelection(frameVariant)} does not match ${selectedVariant}`)
  }

  if (mismatches.length > 0) return { state: "mismatch", title: mismatches.join("; ") }
  return { state: matched ? "match" : "neutral" }
}

function studioProviderVariantFrameForContext(
  component: StudioManifestComponent,
  context: StudioProviderVariantContext,
): StudioManifestComponent["frames"][number] | undefined {
  const activeProviderNames = Object.keys(context)
  if (activeProviderNames.length === 0) return undefined

  return component.frames.find((frame) => {
    let matched = false
    for (const providerName of activeProviderNames) {
      const selectedVariant = context[providerName]
      if (!selectedVariant) continue

      const frameVariants = uniqueStrings(
        component.frames.flatMap((candidate) => {
          const variant = candidate.providerVariants?.[providerName]
          return providerVariantSelectionValues(variant)
        }),
      )
      const declaredVariants = component.providers[providerName]?.variants ?? []
      if (frameVariants.length === 0 && !declaredVariants.includes(selectedVariant)) continue

      if (!providerVariantSelectionValues(frame.providerVariants?.[providerName]).includes(selectedVariant)) return false
      matched = true
    }

    return matched
  })
}

export function studioComponentWithProviderVariantContext(
  component: StudioManifestComponent,
  context: StudioProviderVariantContext,
): StudioManifestComponent {
  void context
  return component
}

export function studioWorkspaceWithProviderVariantFilters(workspace: StudioWorkspaceState): StudioWorkspaceState {
  return workspace
}

export function studioPreviewFrameOverridesForProviderVariantContext(
  manifest: StudioManifest,
  context: StudioProviderVariantContext = {},
): StudioPreviewFrameOverride[] {
  if (Object.keys(context).length === 0) return []

  return manifest.files
    .flatMap((file) => file.components)
    .flatMap((component) => {
      const frame = studioProviderVariantFrameForContext(component, context)
      return frame ? [{ frameName: frame.name, coordinate: component.coordinate }] : []
    })
    .sort((left, right) => left.coordinate.localeCompare(right.coordinate) || left.frameName.localeCompare(right.frameName))
}

export function changeStudioRootProviderVariant(
  state: StudioWorkspaceState,
  providerName: string,
  variant: string | undefined,
): StudioWorkspaceState {
  return {
    ...state,
    rootProviderVariants: setStudioProviderVariantContextValue(state.rootProviderVariants, providerName, variant),
  }
}

export function changeStudioComponentProviderVariant(
  state: StudioWorkspaceState,
  path: string[],
  providerName: string,
  variant: string | undefined,
): StudioWorkspaceState {
  const pathKey = studioProviderVariantPathKey(path)
  const current = state.selectedProviderVariantsByPath[pathKey] ?? {}
  const nextVariant = variant !== undefined && current[providerName] === variant ? undefined : variant
  const next = setStudioProviderVariantContextValue(current, providerName, nextVariant)
  const selectedProviderVariantsByPath = { ...state.selectedProviderVariantsByPath }
  if (Object.keys(next).length === 0) {
    delete selectedProviderVariantsByPath[pathKey]
  } else {
    selectedProviderVariantsByPath[pathKey] = next
  }

  return {
    ...state,
    selectedCoordinatePath: pathIsPrefix(path, state.selectedCoordinatePath) ? state.selectedCoordinatePath : path,
    selectedProviderVariantsByPath,
  }
}

export function changeStudioComponentFrame(
  state: StudioWorkspaceState,
  coordinate: string,
  frameName: string,
  options: { keepDrilldown?: boolean } = {},
): StudioWorkspaceState {
  const selectedColumnIndex = state.columns.findIndex((column) =>
    column.components.some((component) => component.coordinate === coordinate),
  )
  const columns = options.keepDrilldown || selectedColumnIndex < 0 ? state.columns : state.columns.slice(0, selectedColumnIndex + 1)

  return {
    canvasViewportPreset: canvasViewportPresetForWorkspace(state),
    columns,
    rootProviderVariants: state.rootProviderVariants,
    selectedFrameByCoordinate: {
      ...state.selectedFrameByCoordinate,
      [coordinate]: frameName,
    },
    selectedCoordinatePath:
      options.keepDrilldown || selectedColumnIndex < 0
        ? state.selectedCoordinatePath
        : [...state.selectedCoordinatePath.slice(0, selectedColumnIndex), coordinate],
    selectedProviderVariantsByPath: state.selectedProviderVariantsByPath,
    selectedRuntimeInstanceByCoordinate: {},
    selectedViewportPresetByCoordinate: state.selectedViewportPresetByCoordinate,
  }
}

export function selectStudioRuntimeInstance(
  state: StudioWorkspaceState,
  coordinate: string,
  boundaryId: string,
): StudioWorkspaceState {
  return {
    ...state,
    rootProviderVariants: state.rootProviderVariants,
    selectedRuntimeInstanceByCoordinate: {
      ...state.selectedRuntimeInstanceByCoordinate,
      [coordinate]: boundaryId,
    },
  }
}

export function changeStudioViewportPreset(
  state: StudioWorkspaceState,
  coordinate: string,
  preset: StudioViewportPreset,
): StudioWorkspaceState {
  return {
    ...state,
    canvasViewportPreset: preset,
    selectedViewportPresetByCoordinate: {
      ...state.selectedViewportPresetByCoordinate,
      [coordinate]: preset,
    },
  }
}

export function changeStudioCanvasViewportPreset(
  state: StudioWorkspaceState,
  preset: StudioViewportPreset,
): StudioWorkspaceState {
  return {
    ...state,
    canvasViewportPreset: preset,
    selectedViewportPresetByCoordinate: {},
  }
}

export function createStudioWorkspaceUrlSearchParams(
  selection: string | undefined,
  workspace: StudioWorkspaceState,
  canvas?: StudioCanvasTransform,
  options: { canvasScope?: StudioCanvasUrlScope } = {},
): URLSearchParams {
  const params = new URLSearchParams()
  if (selection && selection !== studioRootSelectionId) params.set("selection", selection)
  const canvasViewportPreset = canvasViewportPresetForWorkspace(workspace)
  if (canvasViewportPreset !== "tablet") params.set("canvasViewport", canvasViewportPreset)
  setStudioCanvasTransformUrlParams(params, canvas, options.canvasScope)

  for (const coordinate of workspace.selectedCoordinatePath) {
    params.append("path", coordinate)
  }

  appendStudioProviderVariantContextUrlParams(params, "rootProviderVariant", workspace.rootProviderVariants)
  appendStudioProviderVariantPathUrlParams(params, workspace.selectedProviderVariantsByPath)

  for (const coordinate of workspace.selectedCoordinatePath) {
    const frameName = workspace.selectedFrameByCoordinate[coordinate]
    if (frameName) params.append("frame", `${coordinate}:${frameName}`)

    const boundaryId = workspace.selectedRuntimeInstanceByCoordinate[coordinate]
    if (boundaryId) params.append("instance", `${coordinate}:${boundaryId}`)

    const viewport = workspace.selectedViewportPresetByCoordinate[coordinate]
    if (viewport !== undefined) params.append("viewport", `${coordinate}:${viewport}`)
  }

  return params
}

function appendStudioProviderVariantContextUrlParams(
  params: URLSearchParams,
  key: string,
  context: StudioProviderVariantContext,
) {
  for (const [providerName, variant] of Object.entries(context).sort(([left], [right]) => left.localeCompare(right))) {
    params.append(key, `${providerName}:${formatStudioProviderVariantUrlValue(variant)}`)
  }
}

function appendStudioProviderVariantPathUrlParams(
  params: URLSearchParams,
  selectedProviderVariantsByPath: Record<string, StudioProviderVariantContext>,
) {
  for (const [pathKey, context] of Object.entries(selectedProviderVariantsByPath).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    for (const [providerName, variant] of Object.entries(context).sort(([left], [right]) => left.localeCompare(right))) {
      params.append("providerVariant", `${pathKey}:${providerName}:${formatStudioProviderVariantUrlValue(variant)}`)
    }
  }
}

export function createStudioWorkspaceStateFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
  options: { canvasScope?: StudioCanvasUrlScope } = {},
): StudioWorkspaceUrlState {
  const selection = params.get("selection") ?? undefined
  const canvas = createStudioCanvasTransformFromUrl(params, options.canvasScope)
  const resolvedSelection = resolveStudioSelection(manifest, selection)
  const rawPath = params.getAll("path")
  const selectedCoordinatePath = rawPath.filter((coordinate) => Boolean(findManifestComponent(manifest, coordinate)))
  const pathCoordinates = new Set(selectedCoordinatePath)
  const selectedFrameByCoordinate = selectedFramesFromUrl(manifest, params, pathCoordinates)
  const selectedRuntimeInstanceByCoordinate = selectedRuntimeInstancesFromUrl(manifest, params, pathCoordinates)
  const selectedViewportPresetByCoordinate = selectedViewportPresetsFromUrl(manifest, params, pathCoordinates)
  const canvasViewportPreset = canvasViewportPresetFromUrl(params, selectedViewportPresetByCoordinate, selectedCoordinatePath)
  const hasInvalidUrlState =
    Boolean(selection && selection !== resolvedSelection.id) ||
    rawPath.length !== selectedCoordinatePath.length ||
    hasInvalidSelectedFrame(manifest, params, pathCoordinates) ||
    hasInvalidSelectedRuntimeInstance(manifest, params, pathCoordinates) ||
    hasInvalidCanvasViewportPreset(params)
  const warning = hasInvalidUrlState ? "Invalid Studio URL state was ignored." : undefined

  if (selectedCoordinatePath.length === 0) {
    return {
      canvas,
      selection: resolvedSelection.id,
      workspace: {
        canvasViewportPreset,
        columns: [{ components: resolvedSelection.components }],
        rootProviderVariants: rootProviderVariantsFromUrl(params),
        selectedFrameByCoordinate,
        selectedCoordinatePath: [],
        selectedProviderVariantsByPath: selectedProviderVariantsFromUrl(params, selectedCoordinatePath),
        selectedRuntimeInstanceByCoordinate,
        selectedViewportPresetByCoordinate,
      },
      ...(warning ? { warning } : {}),
    }
  }

  return {
    canvas,
    selection: resolvedSelection.id,
    workspace: {
      canvasViewportPreset,
      columns: [
        { components: resolvedSelection.components },
        ...selectedCoordinatePath.slice(1).map((coordinate) => {
          const component = findManifestComponent(manifest, coordinate)
          const columnIndex = selectedCoordinatePath.indexOf(coordinate)
          return {
            components: component ? [component] : [],
            parentCoordinate: columnIndex > 0 ? selectedCoordinatePath[columnIndex - 1] : undefined,
          }
        }),
      ],
      rootProviderVariants: rootProviderVariantsFromUrl(params),
      selectedFrameByCoordinate,
      selectedCoordinatePath,
      selectedProviderVariantsByPath: selectedProviderVariantsFromUrl(params, selectedCoordinatePath),
      selectedRuntimeInstanceByCoordinate,
      selectedViewportPresetByCoordinate,
    },
    ...(warning ? { warning } : {}),
  }
}

export function createStudioRuntimeValuesRequest(
  manifest: StudioManifest,
  workspace: StudioWorkspaceState,
  boundaryId: string,
): StudioRuntimeValuesRequest | undefined {
  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (!selectedCoordinate) return undefined

  const sourceCoordinate = workspace.selectedCoordinatePath.at(-2) ?? selectedCoordinate
  const sourceComponent = findManifestComponent(manifest, sourceCoordinate)
  if (!sourceComponent) return undefined

  const sourceFrameName = selectedStudioFrameName(workspace, sourceComponent)
  const sessionId = previewSessionId(sourceComponent, sourceFrameName, canvasViewportPresetForWorkspace(workspace))
  return {
    sessionId,
    message: createGPreviewRequestValuesMessage(sessionId, boundaryId),
  }
}

function selectedFramesFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): Record<string, string> {
  const selectedFrames: Record<string, string> = {}
  for (const value of params.getAll("frame")) {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (!parsed) continue

    const component = findManifestComponent(manifest, parsed.coordinate)
    if (pathCoordinates.has(parsed.coordinate) && component?.frames.some((frame) => frame.name === parsed.value)) {
      selectedFrames[parsed.coordinate] = parsed.value
    }
  }
  return selectedFrames
}

function selectedRuntimeInstancesFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): Record<string, string> {
  const selectedInstances: Record<string, string> = {}
  for (const value of params.getAll("instance")) {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (parsed && pathCoordinates.has(parsed.coordinate) && findManifestComponent(manifest, parsed.coordinate)) {
      selectedInstances[parsed.coordinate] = parsed.value
    }
  }
  return selectedInstances
}

function selectedViewportPresetsFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): Record<string, StudioViewportPreset> {
  const selectedPresets: Record<string, StudioViewportPreset> = {}
  for (const value of params.getAll("viewport")) {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (parsed && pathCoordinates.has(parsed.coordinate) && isStudioViewportPreset(parsed.value)) {
      selectedPresets[parsed.coordinate] = parsed.value
    }
  }
  return selectedPresets
}

function rootProviderVariantsFromUrl(params: URLSearchParams): StudioProviderVariantContext {
  const rootProviderVariants: StudioProviderVariantContext = {}
  for (const value of params.getAll("rootProviderVariant")) {
    const parsed = parseStudioProviderVariantValue(value)
    if (parsed) rootProviderVariants[parsed.providerName] = parsed.variant
  }
  return rootProviderVariants
}

function selectedProviderVariantsFromUrl(
  params: URLSearchParams,
  selectedCoordinatePath: string[],
): Record<string, StudioProviderVariantContext> {
  const selectedPathKeys = new Set(selectedCoordinatePath.map((_, index) => studioProviderVariantPathKey(selectedCoordinatePath.slice(0, index + 1))))
  const selectedProviderVariantsByPath: Record<string, StudioProviderVariantContext> = {}

  for (const value of params.getAll("providerVariant")) {
    const parsed = parseStudioProviderVariantPathValue(value)
    if (!parsed || (selectedPathKeys.size > 0 && !selectedPathKeys.has(parsed.pathKey))) continue
    selectedProviderVariantsByPath[parsed.pathKey] = {
      ...(selectedProviderVariantsByPath[parsed.pathKey] ?? {}),
      [parsed.providerName]: parsed.variant,
    }
  }

  return selectedProviderVariantsByPath
}

function canvasViewportPresetFromUrl(
  params: URLSearchParams,
  selectedViewportPresetByCoordinate: Record<string, StudioViewportPreset>,
  selectedCoordinatePath: string[],
): StudioViewportPreset {
  const value = params.get("canvasViewport")
  if (value && isStudioViewportPreset(value)) return value

  const legacyCoordinate = [...selectedCoordinatePath].reverse().find((coordinate) => selectedViewportPresetByCoordinate[coordinate])
  return legacyCoordinate ? selectedViewportPresetByCoordinate[legacyCoordinate]! : "tablet"
}

function isStudioViewportPreset(value: string): value is StudioViewportPreset {
  return value === "phone" || value === "tablet" || value === "desktop"
}

function hasInvalidCanvasViewportPreset(params: URLSearchParams): boolean {
  const value = params.get("canvasViewport")
  return Boolean(value && !isStudioViewportPreset(value))
}

function hasInvalidSelectedFrame(manifest: StudioManifest, params: URLSearchParams, pathCoordinates: Set<string>): boolean {
  return params.getAll("frame").some((value) => {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (!parsed || !pathCoordinates.has(parsed.coordinate)) return true

    const component = findManifestComponent(manifest, parsed.coordinate)
    return !component?.frames.some((frame) => frame.name === parsed.value)
  })
}

function hasInvalidSelectedRuntimeInstance(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): boolean {
  return params.getAll("instance").some((value) => {
    const parsed = parseCoordinateValuePair(manifest, value)
    return !parsed || !pathCoordinates.has(parsed.coordinate)
  })
}

function parseCoordinateValuePair(manifest: StudioManifest, value: string): { coordinate: string; value: string } | undefined {
  const coordinate = manifest.files
    .flatMap((file) => file.components)
    .map((component) => component.coordinate)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => value.startsWith(`${candidate}:`))
  if (!coordinate) return undefined

  return {
    coordinate,
    value: value.slice(coordinate.length + 1),
  }
}

function parseStudioProviderVariantValue(value: string): { providerName: string; variant: string } | undefined {
  const separatorIndex = value.lastIndexOf(":")
  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) return undefined
  return {
    providerName: value.slice(0, separatorIndex),
    variant: parseStudioProviderVariantUrlValue(value.slice(separatorIndex + 1)),
  }
}

function parseStudioProviderVariantPathValue(value: string): { pathKey: string; providerName: string; variant: string } | undefined {
  const variantSeparatorIndex = value.lastIndexOf(":")
  if (variantSeparatorIndex <= 0 || variantSeparatorIndex >= value.length - 1) return undefined
  const providerSeparatorIndex = value.lastIndexOf(":", variantSeparatorIndex - 1)
  if (providerSeparatorIndex <= 0 || providerSeparatorIndex >= variantSeparatorIndex - 1) return undefined
  return {
    pathKey: value.slice(0, providerSeparatorIndex),
    providerName: value.slice(providerSeparatorIndex + 1, variantSeparatorIndex),
    variant: parseStudioProviderVariantUrlValue(value.slice(variantSeparatorIndex + 1)),
  }
}

function directChildComponentsForCoordinate(
  manifest: StudioManifest,
  trees: GBoundaryTreeNode[][],
  coordinate: string,
): StudioManifestComponent[] {
  const componentsByCoordinate = new Map(
    studioComponentWorkspaceManifestComponents(manifest).map((component) => [component.coordinate, component] as const),
  )
  const seen = new Set<string>()
  const components: StudioManifestComponent[] = []
  const appendComponent = (childCoordinate: string) => {
    if (seen.has(childCoordinate)) return

    const component = componentsByCoordinate.get(childCoordinate)
    if (!component) return

    seen.add(childCoordinate)
    components.push(component)
  }

  const selectedComponent = componentsByCoordinate.get(coordinate)
  for (const dependencyCoordinate of selectedComponent?.dependencies ?? []) {
    appendComponent(dependencyCoordinate)
  }

  for (const tree of trees) {
    const node = findStudioBoundaryNode(tree, coordinate)
    if (!node) continue

    for (const child of node.children) {
      appendComponent(child.coordinate)
    }
  }

  return components
}

function normalizeStudioBoundaryTrees(tree: GBoundaryTreeNode[] | GBoundaryTreeNode[][]): GBoundaryTreeNode[][] {
  if (tree.length === 0) return []
  return Array.isArray(tree[0]) ? (tree as GBoundaryTreeNode[][]) : [tree as GBoundaryTreeNode[]]
}

function omitStudioSelectedFrames(
  selectedFrameByCoordinate: Record<string, string>,
  coordinates: string[],
): Record<string, string> {
  const omitted = new Set(coordinates)
  const next = Object.fromEntries(Object.entries(selectedFrameByCoordinate).filter(([coordinate]) => !omitted.has(coordinate)))
  return next
}

function omitStudioSelectedProviderVariantsByPath(
  selectedProviderVariantsByPath: Record<string, StudioProviderVariantContext>,
  keptPathKeys: string[],
): Record<string, StudioProviderVariantContext> {
  const kept = new Set(keptPathKeys)
  return Object.fromEntries(Object.entries(selectedProviderVariantsByPath).filter(([pathKey]) => kept.has(pathKey)))
}

function studioProviderVariantPathKey(path: string[]): string {
  return path.join("\n")
}

function pathIsPrefix(prefix: string[], path: string[]): boolean {
  return prefix.length <= path.length && prefix.every((coordinate, index) => path[index] === coordinate)
}

function pathForWorkspaceColumn(
  columns: StudioWorkspaceColumn[],
  selectedCoordinatePath: string[],
  columnIndex: number,
  coordinate: string,
): string[] {
  if (columns[columnIndex]?.components.some((component) => component.coordinate === coordinate)) {
    return [...selectedCoordinatePath.slice(0, columnIndex), coordinate]
  }
  return [coordinate]
}

function setStudioProviderVariantContextValue(
  current: StudioProviderVariantContext,
  providerName: string,
  variant: string | undefined,
): StudioProviderVariantContext {
  const next = { ...current }
  if (variant) {
    next[providerName] = variant
  } else {
    delete next[providerName]
  }
  return next
}

function formatStudioProviderVariantUrlValue(variant: string): string {
  return encodeURIComponent(variant)
}

function parseStudioProviderVariantUrlValue(variant: string): string {
  try {
    return decodeURIComponent(variant)
  } catch {
    return variant
  }
}

export function initialStudioUrlSearchParams(selection: string | undefined, urlSearch: string | undefined): URLSearchParams {
  if (urlSearch !== undefined) return new URLSearchParams(urlSearch)
  if (typeof window !== "undefined" && window.location.search) {
    return new URLSearchParams(window.location.search)
  }

  const params = new URLSearchParams()
  if (selection) params.set("selection", selection)
  return params
}

export function createStudioCanvasTransformFromUrl(
  params: URLSearchParams,
  canvasScope: StudioCanvasUrlScope = "components",
): StudioCanvasTransform {
  const fallback = defaultStudioCanvasTransform()
  const names = studioCanvasTransformUrlParamNames(canvasScope)
  return {
    x: numberUrlParam(params, names.x, fallback.x),
    y: numberUrlParam(params, names.y, fallback.y),
    scale: clamp(numberUrlParam(params, names.scale, fallback.scale), studioCanvasMinScale, studioCanvasMaxScale),
  }
}

export function replaceStudioCanvasUrlState(
  canvas: StudioCanvasTransform,
  options: { canvasScope?: StudioCanvasUrlScope } = {},
) {
  if (typeof window === "undefined") return

  const params = new URLSearchParams(window.location.search)
  setStudioCanvasTransformUrlParams(params, canvas, options.canvasScope)
  const search = params.toString()
  const hash = window.location.hash ?? ""
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${hash}`
  if (nextUrl !== currentUrl) {
    window.history.replaceState({ runelightStudio: true }, "", nextUrl)
  }
}

export function pushStudioWorkspaceUrlState(
  selection: string | undefined,
  workspace: StudioWorkspaceState,
  options: { canvas?: StudioCanvasTransform; canvasScope?: StudioCanvasUrlScope } = {},
) {
  if (typeof window === "undefined") return

  const sourceParams = new URLSearchParams(window.location.search)
  const canvasScope = options.canvasScope ?? "components"
  const canvas = options.canvas ?? createStudioCanvasTransformFromUrl(sourceParams, canvasScope)
  const params = createStudioWorkspaceUrlSearchParams(selection, workspace, canvas, { canvasScope })
  preserveOtherStudioCanvasTransformUrlParams(params, sourceParams, canvasScope)
  preserveStudioViewUrlParams(params, sourceParams)
  preserveStudioDebugUrlParams(params, sourceParams)
  const search = params.toString()
  const hash = window.location.hash ?? ""
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${hash}`
  if (nextUrl !== currentUrl) {
    window.history.pushState({ runelightStudio: true }, "", nextUrl)
  }
}

export function isStudioPreviewPoolDebugEnabled(params: URLSearchParams): boolean {
  const debugModes = studioDebugModes(params)
  return (
    debugModes.includes("pool") ||
    debugModes.includes("preview-pool") ||
    debugModes.includes("no-pool") ||
    debugModes.includes("disable-pool") ||
    params.get("debugPool") === "1" ||
    isStudioPreviewPoolDisabled(params)
  )
}

export function isStudioPreviewQueueDebugEnabled(params: URLSearchParams): boolean {
  const debugModes = studioDebugModes(params)
  return debugModes.includes("queue") || debugModes.includes("preview-queue")
}

export function isStudioPreviewPoolDisabled(params: URLSearchParams): boolean {
  const debugModes = studioDebugModes(params)
  const debugPool = params.get("debugPool")?.trim().toLowerCase()
  return (
    debugModes.includes("no-pool") ||
    debugModes.includes("disable-pool") ||
    debugModes.includes("without-pool") ||
    debugPool === "0" ||
    debugPool === "false" ||
    debugPool === "off"
  )
}

function studioDebugModes(params: URLSearchParams): string[] {
  return params
    .getAll("debug")
    .join(",")
    .split(",")
    .map((mode) => mode.trim())
    .filter(Boolean)
}

function preserveStudioDebugUrlParams(target: URLSearchParams, source: URLSearchParams) {
  for (const name of [
    "debug",
    "debugPool",
    "debounce",
    "maximumConcurrentRenderTasks",
    "maximumConcurrentRenderTasksDuringCanvasMovement",
    "maximumRenderTaskCount",
    "minimumVisibleRenderTasksDuringCanvasMovement",
    "previewQueueActiveRenderTimeout",
    "previewQueueActiveRenderTimeoutMilliseconds",
    "previewQueueActive",
    "previewQueueActiveTimeout",
    "previewQueueBufferRenderDelay",
    "previewQueueBufferRenderDelayMilliseconds",
    "previewQueueBuffer",
    "previewQueueDebounce",
    "previewQueueLength",
    "previewQueueMaximumConcurrentRenderTasks",
    "previewQueueMaximumConcurrentRenderTasksDuringCanvasMovement",
    "previewQueueMaximumMountedPreviewSessions",
    "previewQueueMaximumRenderTaskCount",
    "previewQueueMinimumVisibleRenderTasksDuringCanvasMovement",
    "previewQueueVisibleRenderFloor",
    "previewQueueRenderBufferMargin",
    "previewQueueRenderDebounce",
    "previewQueueRenderDebounceMilliseconds",
    "previewQueueRenderThrottle",
    "previewQueueRenderThrottleMilliseconds",
    "previewQueueSafety",
    "previewQueueThrottle",
    "queueActiveRenderTimeout",
    "queueActive",
    "queueActiveTimeout",
    "queueBufferRenderDelay",
    "queueBuffer",
    "queueDebounce",
    "queueLength",
    "queueMaximumConcurrentRenderTasks",
    "queueMaximumConcurrentRenderTasksDuringCanvasMovement",
    "queueMaximumMountedPreviewSessions",
    "queueMaximumRenderTaskCount",
    "queueMinimumVisibleRenderTasksDuringCanvasMovement",
    "queueRenderBufferMargin",
    "queueRenderDebounce",
    "queueRenderThrottle",
    "queueSafety",
    "queueThrottle",
    "queueVisibleRenderFloor",
    "previewBuffer",
    "previewDebounce",
    "previewRenderBufferMargin",
    "previewRenderDebounce",
    "previewRenderThrottle",
    "previewThrottle",
    "throttle",
  ]) {
    target.delete(name)
    for (const value of source.getAll(name)) target.append(name, value)
  }
}

function preserveStudioViewUrlParams(target: URLSearchParams, source: URLSearchParams) {
  target.delete("view")
  for (const value of source.getAll("view")) target.append("view", value)
}

function preserveOtherStudioCanvasTransformUrlParams(
  target: URLSearchParams,
  source: URLSearchParams,
  activeScope: StudioCanvasUrlScope,
) {
  for (const scope of studioCanvasUrlScopes) {
    if (scope === activeScope) continue

    const names = studioCanvasTransformUrlParamNames(scope)
    for (const name of [names.x, names.y, names.scale]) {
      target.delete(name)
      for (const value of source.getAll(name)) target.append(name, value)
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function providerVariantSelectionValues(selection: string | string[] | undefined): string[] {
  if (!selection) return []
  return Array.isArray(selection) ? selection : [selection]
}

function formatProviderVariantSelection(selection: string | string[]): string {
  return Array.isArray(selection) ? selection.join(", ") : selection
}

export const studioCanvasMinScale = 0.325
const studioCanvasMaxScale = 2.5
const studioCanvasUrlScopes = ["components", "design"] as const

function setStudioCanvasTransformUrlParams(
  params: URLSearchParams,
  canvas: StudioCanvasTransform | undefined,
  canvasScope: StudioCanvasUrlScope = "components",
) {
  const names = studioCanvasTransformUrlParamNames(canvasScope)
  params.delete(names.x)
  params.delete(names.y)
  params.delete(names.scale)
  if (!canvas) return

  const fallback = defaultStudioCanvasTransform()
  if (canvas.x !== fallback.x) params.set(names.x, formatStudioCanvasNumber(canvas.x))
  if (canvas.y !== fallback.y) params.set(names.y, formatStudioCanvasNumber(canvas.y))
  if (canvas.scale !== fallback.scale) params.set(names.scale, formatStudioCanvasNumber(canvas.scale))
}

function studioCanvasTransformUrlParamNames(canvasScope: StudioCanvasUrlScope): { scale: string; x: string; y: string } {
  if (canvasScope === "design") {
    return {
      x: "designCanvasX",
      y: "designCanvasY",
      scale: "designCanvasScale",
    }
  }

  return {
    x: "canvasX",
    y: "canvasY",
    scale: "canvasScale",
  }
}

function numberUrlParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = params.get(name)
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatStudioCanvasNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

export function applyStudioCanvasWheel(current: StudioCanvasTransform, input: StudioCanvasWheelInput): StudioCanvasTransform {
  if (!input.ctrlKey && !input.metaKey) {
    return {
      ...current,
      x: current.x - input.deltaX,
      y: current.y - input.deltaY,
    }
  }

  const viewportX = input.focalViewportX ?? input.clientX - input.viewportLeft
  const viewportY = input.focalViewportY ?? input.clientY - input.viewportTop
  const focalCanvasX = (viewportX - current.x) / current.scale
  const focalCanvasY = (viewportY - current.y) / current.scale
  const wheelDelta = -input.deltaY * wheelDeltaModeMultiplier(input.deltaMode) * 10
  const nextScale = clamp(current.scale * 2 ** wheelDelta, studioCanvasMinScale, studioCanvasMaxScale)

  return {
    scale: nextScale,
    x: viewportX - focalCanvasX * nextScale,
    y: viewportY - focalCanvasY * nextScale,
  }
}

export function revealStudioCanvasRect(
  current: StudioCanvasTransform,
  input: {
    blockerRects?: StudioCanvasScreenRect[]
    margin?: number
    rect: StudioCanvasScreenRect
    viewportRect: StudioCanvasScreenRect
  },
): StudioCanvasTransform {
  const margin = input.margin ?? 24
  const visibleRect = visibleStudioCanvasRect(input.viewportRect, input.blockerRects ?? [], margin)
  const deltaX = revealIntervalDelta(input.rect.left, input.rect.right, visibleRect.left, visibleRect.right)
  const deltaY = revealIntervalDelta(input.rect.top, input.rect.bottom, visibleRect.top, visibleRect.bottom)

  if (deltaX === 0 && deltaY === 0) return current
  return {
    ...current,
    x: current.x + deltaX,
    y: current.y + deltaY,
  }
}

export function computeStudioColumnLayout(input: {
  columns: { componentCoordinates: string[]; parentCoordinate?: string }[]
  margin?: number
  measurementsByIndex: Record<number, StudioColumnLayoutMeasurement>
}): Record<number, StudioColumnLayout> {
  const margin = input.margin ?? 40
  const layoutsByIndex: Record<number, StudioColumnLayout> = {}
  const absoluteCardRectsByIndex: Record<number, Record<string, StudioCanvasScreenRect>> = {}

  input.columns.forEach((column, columnIndex) => {
    if (columnIndex === 0 || !column.parentCoordinate) {
      layoutsByIndex[columnIndex] = { x: 0, y: 0 }
    } else {
      const parentRect = findPreviousColumnCardRect(absoluteCardRectsByIndex, columnIndex, column.parentCoordinate)
      if (!parentRect) {
        layoutsByIndex[columnIndex] = { x: columnIndex * margin, y: 0 }
      } else {
        const columnHeight = input.measurementsByIndex[columnIndex]?.height ?? 0
        const bandTop = parentRect.top
        const bandBottom = bandTop + columnHeight
        const rightEdge = rightmostCardEdgeInBand(absoluteCardRectsByIndex, columnIndex, bandTop, bandBottom) ?? parentRect.right
        layoutsByIndex[columnIndex] = {
          x: rightEdge + margin,
          y: parentRect.top,
        }
      }
    }

    absoluteCardRectsByIndex[columnIndex] = absoluteColumnCardRects(
      input.measurementsByIndex[columnIndex]?.cardRectsByCoordinate ?? {},
      layoutsByIndex[columnIndex] ?? { x: 0, y: 0 },
      column.componentCoordinates,
    )
  })

  return layoutsByIndex
}

export function computeStudioFrameGridLayout(input: {
  frameChromeHeight?: number
  gap?: number
  items: StudioFrameGridItemLayout[]
  maxWidth?: number
  maxSide?: number
  minScale?: number
  previewScale?: number
}): StudioFrameGridLayout {
  return computeRunelightPreviewFrameGridLayout(input)
}

export function applyStudioCardSelectionAction(
  current: string | undefined,
  action: StudioCardSelectionAction,
): string | undefined {
  if (action.type === "clear") return undefined
  if (action.source === "keyboard") return undefined
  if (action.coordinate === current) return current
  return action.coordinate
}

function wheelDeltaModeMultiplier(deltaMode: number): number {
  if (deltaMode === 1) return 0.05
  if (deltaMode === 2) return 1
  return 0.002
}

function visibleStudioCanvasRect(
  viewportRect: StudioCanvasScreenRect,
  blockerRects: StudioCanvasScreenRect[],
  margin: number,
): StudioCanvasScreenRect {
  let left = viewportRect.left + margin
  let right = viewportRect.right - margin
  let top = viewportRect.top + margin
  let bottom = viewportRect.bottom - margin

  for (const blockerRect of blockerRects) {
    const overlapsVertically = blockerRect.bottom > top && blockerRect.top < bottom
    const overlapsHorizontally = blockerRect.right > left && blockerRect.left < right
    if (!overlapsVertically || !overlapsHorizontally) continue

    const touchesRightEdge = blockerRect.right >= viewportRect.right - 1
    const touchesLeftEdge = blockerRect.left <= viewportRect.left + 1
    const touchesBottomEdge = blockerRect.bottom >= viewportRect.bottom - 1
    const touchesTopEdge = blockerRect.top <= viewportRect.top + 1

    if (touchesRightEdge || touchesLeftEdge) {
      if (touchesRightEdge) right = Math.min(right, blockerRect.left - margin)
      if (touchesLeftEdge) left = Math.max(left, blockerRect.right + margin)
      continue
    }

    if (touchesBottomEdge) bottom = Math.min(bottom, blockerRect.top - margin)
    if (touchesTopEdge) top = Math.max(top, blockerRect.bottom + margin)
  }

  return { bottom: Math.max(top, bottom), left, right: Math.max(left, right), top }
}

function revealIntervalDelta(rectStart: number, rectEnd: number, visibleStart: number, visibleEnd: number): number {
  const rectSize = rectEnd - rectStart
  const visibleSize = visibleEnd - visibleStart

  if (rectSize > visibleSize) {
    if (rectEnd < visibleStart) return visibleStart - rectStart
    if (rectStart > visibleEnd) return visibleEnd - rectEnd
    return 0
  }

  if (rectStart < visibleStart) return visibleStart - rectStart
  if (rectEnd > visibleEnd) return visibleEnd - rectEnd
  return 0
}

function absoluteColumnCardRects(
  cardRectsByCoordinate: Record<string, StudioCanvasScreenRect>,
  layout: StudioColumnLayout,
  componentCoordinates: string[],
): Record<string, StudioCanvasScreenRect> {
  const absoluteRects: Record<string, StudioCanvasScreenRect> = {}

  for (const coordinate of componentCoordinates) {
    const rect = cardRectsByCoordinate[coordinate]
    if (!rect) continue
    absoluteRects[coordinate] = {
      bottom: rect.bottom + layout.y,
      left: rect.left + layout.x,
      right: rect.right + layout.x,
      top: rect.top + layout.y,
    }
  }

  return absoluteRects
}

function findPreviousColumnCardRect(
  cardRectsByIndex: Record<number, Record<string, StudioCanvasScreenRect>>,
  beforeColumnIndex: number,
  coordinate: string,
): StudioCanvasScreenRect | undefined {
  for (let columnIndex = beforeColumnIndex - 1; columnIndex >= 0; columnIndex -= 1) {
    const rect = cardRectsByIndex[columnIndex]?.[coordinate]
    if (rect) return rect
  }
  return undefined
}

function rightmostCardEdgeInBand(
  cardRectsByIndex: Record<number, Record<string, StudioCanvasScreenRect>>,
  beforeColumnIndex: number,
  bandTop: number,
  bandBottom: number,
): number | undefined {
  let rightEdge: number | undefined

  for (let columnIndex = 0; columnIndex < beforeColumnIndex; columnIndex += 1) {
    for (const rect of Object.values(cardRectsByIndex[columnIndex] ?? {})) {
      if (rect.bottom <= bandTop || rect.top >= bandBottom) continue
      rightEdge = rightEdge === undefined ? rect.right : Math.max(rightEdge, rect.right)
    }
  }

  return rightEdge
}

export function componentCardLayoutWidth(
  displaySize: { width: number | string },
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): number {
  const rect = studioBoundaryRectForCoordinate(tree, coordinate)
  if (rect) return studioComponentCardWidth(Math.ceil(Number(previewFrameLayoutWidth(displaySize, rect))))
  return typeof displaySize.width === "number" ? displaySize.width + 28 : 520
}

export function clipPreviewBoundaryRectToViewport(
  rect: GBoundaryRect | undefined,
  viewport: { width: number | string; height: number },
): GBoundaryRect | undefined {
  if (!rect) return undefined

  const viewportWidth = typeof viewport.width === "number" ? viewport.width : Number.POSITIVE_INFINITY
  const left = clamp(rect.x, 0, viewportWidth)
  const top = clamp(rect.y, 0, viewport.height)
  const right = clamp(rect.x + rect.width, 0, viewportWidth)
  const bottom = clamp(rect.y + rect.height, 0, viewport.height)

  if (right <= left || bottom <= top) return undefined

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

export function canvasViewportPresetForWorkspace(workspace: StudioWorkspaceState): StudioViewportPreset {
  if (workspace.canvasViewportPreset) return workspace.canvasViewportPreset

  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (selectedCoordinate) return workspace.selectedViewportPresetByCoordinate[selectedCoordinate] ?? "tablet"
  return Object.values(workspace.selectedViewportPresetByCoordinate)[0] ?? "tablet"
}

export function visibleWorkspaceComponents(workspace: StudioWorkspaceState): StudioManifestComponent[] {
  const seen = new Set<string>()
  const components: StudioManifestComponent[] = []
  for (const component of workspace.columns.flatMap((column) => column.components)) {
    if (seen.has(component.coordinate)) continue
    seen.add(component.coordinate)
    components.push(component)
  }
  return components
}

export type StudioWorkspaceComponentEntry = {
  columnIndex: number
  component: StudioManifestComponent
  path: string[]
}

export function visibleWorkspaceComponentEntries(workspace: StudioWorkspaceState): StudioWorkspaceComponentEntry[] {
  return workspace.columns.flatMap((column, columnIndex) =>
    column.components.map((component) => ({
      columnIndex,
      component,
      path: pathForWorkspaceColumn(workspace.columns, workspace.selectedCoordinatePath, columnIndex, component.coordinate),
    })),
  )
}

export function findManifestComponent(manifest: StudioManifest, coordinate: string): StudioManifestComponent | undefined {
  return manifest.files.flatMap((file) => file.components).find((component) => component.coordinate === coordinate)
}

export function studioDesignManifestComponents(manifest: StudioManifest): StudioManifestComponent[] {
  const componentsByCoordinate = new Map(
    manifest.files.flatMap((file) => file.components).map((component) => [component.coordinate, component] as const),
  )
  const seen = new Set<string>()
  const components: StudioManifestComponent[] = []

  for (const frame of manifest.design?.frames ?? []) {
    const component = componentsByCoordinate.get(frame.entry)
    if (!component || seen.has(component.coordinate)) continue

    seen.add(component.coordinate)
    components.push(component)
  }

  return components
}

export function createStudioPreviewUrl(
  manifest: StudioManifest,
  component: StudioManifestComponent,
  frameName: string,
  sessionId = previewSessionId(component, frameName),
  options: { frameOverrides?: readonly StudioPreviewFrameOverride[]; static?: boolean } = {},
): string {
  const params = new URLSearchParams({
    entry: component.coordinate,
    frame: frameName,
    chrome: "0",
    sessionId,
  })
  if (options.static) params.set("static", "1")
  for (const override of options.frameOverrides ?? []) {
    params.append(
      "frameOverride",
      encodeRunelightPreviewFrameOverride(override.coordinate, override.frameName),
    )
  }
  return appendStudioPreviewSearchParams(manifest.routes.preview, params)
}

export function createStudioPreviewPoolUrl(manifest: StudioManifest): string {
  return appendStudioPreviewSearchParams(manifest.routes.preview, new URLSearchParams({ chrome: "0", pool: "1" }))
}

export function studioPreviewRenderTargetFromUrl(
  previewUrl: string,
  fallbackSessionId: string,
): GPreviewRenderTarget {
  const url = new URL(previewUrl, "http://runelight.local")
  const frameOverrides = url.searchParams.getAll("frameOverride").flatMap((value) => {
    const override = decodeRunelightPreviewFrameOverride(value)
    return override ? [override] : []
  })

  return {
    frameName: url.searchParams.get("frame"),
    ...(frameOverrides.length > 0 ? { frameOverrides } : {}),
    chrome: url.searchParams.get("chrome"),
    entry: url.searchParams.get("entry"),
    sessionId: url.searchParams.get("sessionId") ?? fallbackSessionId,
    staticMode: url.searchParams.get("static") === "1",
  }
}

function appendStudioPreviewSearchParams(url: string, params: URLSearchParams): string {
  const serialized = params.toString()
  if (!serialized) return url
  return `${url}${url.includes("?") ? "&" : "?"}${serialized}`
}

export function previewSessionId(
  component: StudioManifestComponent,
  frameName: string,
  viewportPreset?: StudioViewportPreset,
): string {
  return `${component.coordinate}:${frameName}${viewportPreset && viewportPreset !== "tablet" ? `@${viewportPreset}` : ""}`
}

export function studioPreviewCacheKey(
  component: StudioManifestComponent,
  frameName: string,
  viewportPreset: StudioViewportPreset,
): string {
  return `${viewportPreset}\n${component.sourceHash}\n${component.coordinate}\n${frameName}`
}

export function studioPreviewFrameSize(
  preset: StudioViewportPreset,
  reportedSize: { width: number; height: number } | undefined,
): { width: number | string; height: number } {
  if (preset === "phone") return { width: 390, height: 844 }
  if (preset === "tablet") return { width: 768, height: 1024 }
  if (preset === "desktop") return { width: 1280, height: 900 }
  return { width: 768, height: clamp(reportedSize?.height ?? 1024, 160, 1200) }
}

export function mergeStudioPreviewFrameState(
  sessionId: string,
  current: StudioPreviewFrameState | undefined,
  cached: StudioPreviewFrameState | undefined,
): StudioPreviewFrameState | undefined {
  if (!current && !cached) return undefined

  return {
    expectedSessionId: sessionId,
    ready: current?.ready ?? false,
    ...(current?.tree ?? cached?.tree ? { tree: current?.tree ?? cached?.tree } : {}),
    ...(current?.size ?? cached?.size ? { size: current?.size ?? cached?.size } : {}),
    ...(current?.renderedSnapshot ?? cached?.renderedSnapshot ? {
      renderedSnapshot: current?.renderedSnapshot ?? cached?.renderedSnapshot,
    } : {}),
    ...(current?.error ? { error: current.error } : {}),
    ...(current?.valuesByBoundaryId ? { valuesByBoundaryId: current.valuesByBoundaryId } : {}),
  }
}

export function currentPreviewSessionIds(workspace: StudioWorkspaceState): Set<string> {
  const viewportPreset = canvasViewportPresetForWorkspace(workspace)
  return new Set(
    workspace.columns.flatMap((column) =>
      column.components.flatMap((component) =>
        component.frames.map((frame) => previewSessionId(component, frame.name, viewportPreset)),
      ),
    ),
  )
}

export function currentStudioPreviewTargets(manifest: StudioManifest, workspace: StudioWorkspaceState): StudioPreviewTarget[] {
  const viewportPreset = canvasViewportPresetForWorkspace(workspace)
  return visibleWorkspaceComponentEntries(workspace).flatMap(({ component, path }) => {
    const frameOverrides = studioPreviewFrameOverridesForProviderVariantContext(
      manifest,
      studioProviderVariantContextForPath(workspace, path),
    )
    return component.frames.map((frame) =>
      studioPreviewTarget(
        manifest,
        component,
        frame.name,
        viewportPreset,
        previewSessionId(component, frame.name, viewportPreset),
        frameOverrides,
      ),
    )
  })
}

export function currentStudioDesignPreviewTargets(
  manifest: StudioManifest,
  viewportPreset: StudioViewportPreset,
): StudioPreviewTarget[] {
  return studioDesignManifestComponents(manifest).flatMap((component) =>
    component.frames.map((frame) =>
      studioPreviewTarget(
        manifest,
        component,
        frame.name,
        viewportPreset,
        previewSessionId(component, frame.name, viewportPreset),
      ),
    ),
  )
}

export function currentStudioChangesPreviewTargets(
  manifest: StudioManifest,
  changes: StudioWorkspaceChanges | undefined,
  viewportPreset: StudioViewportPreset,
): StudioPreviewTarget[] {
  const currentComponentsByCoordinate = new Map(
    manifest.files.flatMap((file) => file.components).map((component) => [component.coordinate, component] as const),
  )
  const baselineManifest = changes?.base.kind === "git" ? changes.base.manifest : undefined
  const baselineComponentsByCoordinate = new Map(
    (baselineManifest?.files ?? []).flatMap((file) => file.components).map((component) => [component.coordinate, component] as const),
  )
  const targets: StudioPreviewTarget[] = []
  const seenSessionIds = new Set<string>()
  const appendComponentTargets = (
    targetManifest: StudioManifest | undefined,
    component: StudioManifestComponent | undefined,
    frameNames?: readonly string[],
  ) => {
    if (!targetManifest || !component) return

    const frameNameSet = frameNames ? new Set(frameNames) : undefined
    for (const frame of component.frames) {
      if (frameNameSet && !frameNameSet.has(frame.name)) continue
      const sessionId = previewSessionId(component, frame.name, viewportPreset)
      if (seenSessionIds.has(sessionId)) continue
      seenSessionIds.add(sessionId)
      targets.push(studioPreviewTarget(targetManifest, component, frame.name, viewportPreset, sessionId))
    }
  }

  for (const item of changes?.items ?? []) {
    let appendedBaselineImpact = false
    for (const impact of item.baselineImpacts ?? []) {
      const component = baselineComponentsByCoordinate.get(impact.rootCoordinate)
      appendedBaselineImpact ||= Boolean(component)
      appendComponentTargets(baselineManifest, component, studioChangesPreviewTargetFrameNames(impact, "before"))
    }
    if (!appendedBaselineImpact) {
      for (const component of item.baselineFile?.components ?? []) {
        appendComponentTargets(baselineManifest, component)
      }
    }

    let appendedCurrentImpact = false
    if (item.currentFile) {
      for (const impact of item.impacts) {
        const component = currentComponentsByCoordinate.get(impact.rootCoordinate)
        appendedCurrentImpact ||= Boolean(component)
        appendComponentTargets(manifest, component, studioChangesPreviewTargetFrameNames(impact, "current"))
      }
    }
    if (!appendedCurrentImpact) {
      for (const component of item.currentFile?.components ?? []) {
        appendComponentTargets(manifest, component)
      }
    }
  }

  return targets
}

function studioChangesPreviewTargetFrameNames(
  impact: StudioWorkspaceChanges["items"][number]["impacts"][number],
  side: "before" | "current",
): string[] {
  const frames = impact.frames ?? impact.frameNames.map((name) => ({ kind: "unknown" as const, name }))
  return frames.flatMap((frame) => {
    if (frame.kind === "unchanged") return []
    if (side === "before" && frame.kind === "added") return []
    if (side === "current" && frame.kind === "deleted") return []
    return [frame.name]
  })
}

function studioPreviewTarget(
  manifest: StudioManifest,
  component: StudioManifestComponent,
  frameName: string,
  viewportPreset: StudioViewportPreset,
  sessionId: string,
  frameOverrides: readonly StudioPreviewFrameOverride[] = [],
): StudioPreviewTarget {
  return {
    cacheKey: studioPreviewCacheKey(component, frameName, viewportPreset),
    previewUrl: createStudioPreviewUrl(manifest, component, frameName, sessionId, { frameOverrides, static: true }),
    sessionId,
    size: studioPreviewFrameSize(viewportPreset, undefined) as { width: number; height: number },
    title: `${component.componentName} ${frameName} preview`,
  }
}

export function resolveStudioSelection(
  manifest: StudioManifest,
  selection: string | undefined,
): { id: string; components: StudioManifestComponent[] } {
  if (!selection || selection === studioRootSelectionId) {
    return { id: studioRootSelectionId, components: rootStudioManifestComponents(manifest) }
  }

  if (selection?.startsWith("component:")) {
    const coordinate = selection.slice("component:".length)
    const component = studioComponentWorkspaceManifestComponents(manifest).find((candidate) => candidate.coordinate === coordinate)
    if (component) return { id: selection, components: [component] }
  }

  if (selection?.startsWith("file:")) {
    const filePath = selection.slice("file:".length)
    const file = manifest.files.find((candidate) => candidate.path === filePath)
    const components = file ? studioComponentWorkspaceFileComponents(manifest, file) : []
    if (components.length > 0) return { id: selection, components }
  }

  return { id: studioRootSelectionId, components: rootStudioManifestComponents(manifest) }
}

export function rootStudioManifestComponents(manifest: StudioManifest): StudioManifestComponent[] {
  const components = studioComponentWorkspaceManifestComponents(manifest)
  const childCoordinates = new Set(components.flatMap((component) => component.dependencies ?? []))
  const roots = components.filter((component) => !childCoordinates.has(component.coordinate))
  return roots.length > 0 ? roots : components
}

function studioComponentWorkspaceManifestComponents(manifest: StudioManifest): StudioManifestComponent[] {
  const designCoordinates = studioDesignComponentCoordinates(manifest)
  return manifest.files.flatMap((file) => studioComponentWorkspaceFileComponents(manifest, file, designCoordinates))
}

function studioComponentWorkspaceFileComponents(
  manifest: StudioManifest,
  file: StudioManifest["files"][number],
  designCoordinates = studioDesignComponentCoordinates(manifest),
): StudioManifestComponent[] {
  return file.components.filter((component) => !isStudioDesignComponent(component, designCoordinates))
}

function studioDesignComponentCoordinates(manifest: StudioManifest): Set<string> {
  return new Set((manifest.design?.frames ?? []).map((frame) => frame.entry))
}

function isStudioDesignComponent(component: StudioManifestComponent, designCoordinates: ReadonlySet<string>): boolean {
  return designCoordinates.has(component.coordinate)
}
