import React from "react"
import { createContainer } from "react-tracked"

import type { GRuntimeValuesSnapshot } from "./preview-protocol.js"
import { serializeGRuntimeValue } from "./runtime-values.js"
import type {
  AnyGProvider,
  GFrames,
  GFrame,
  GProvider,
  GProviderOptions,
  GProviderStates,
  GProviderUpdate,
  GProviderUpdateFn,
  GProviderUseValue,
} from "./types.js"

type PreviewRuntimeValue = {
  scope?: unknown
  providerValues: Map<AnyGProvider, unknown>
  frameOverrides: Map<string, string>
  boundaryCollector?: GBoundaryCollector
}

type AnyComponentFrames<Props> = Record<string, GFrame<Props> | GFrame<Props, unknown>>

const PreviewRuntimeContext = React.createContext<PreviewRuntimeValue | null>(null)
const ActiveComponentFrameContext = React.createContext<GFrame<unknown, unknown> | null>(null)
const BoundaryParentContext = React.createContext<string | null>(null)
const noopUpdate = () => {}

type ManagedGProvider<State = unknown, Update extends GProviderUpdateFn = GProviderUpdateFn> = GProvider<State, Update> & {
  readonly __runelightPresenceContext: React.Context<boolean>
  readonly __runelightUseTrackedState: () => State
  readonly __runelightUseUpdate: () => Update
}

type FlatBoundaryNode = {
  id: string
  coordinate: string
  parentId: string | null
  rect?: GBoundaryRect
}

export type GBoundaryRect = {
  x: number
  y: number
  width: number
  height: number
}

export type GBoundaryTreeNode = {
  id: string
  coordinate: string
  rect?: GBoundaryRect
  children: GBoundaryTreeNode[]
}

export type GBoundaryCollector = {
  reset(): void
  registerBoundary(coordinate: string, parentId: string | null, id?: string): string
  updateBoundaryRect(id: string, rect: GBoundaryRect): void
  updateBoundaryValues(id: string, values: Omit<GRuntimeValuesSnapshot, "boundaryId">): void
  getValues(id: string): GRuntimeValuesSnapshot | undefined
  getTree(): GBoundaryTreeNode[]
}

export type GPreviewProviderProps = {
  scope?: unknown
  providerValues?: Map<AnyGProvider, unknown>
  frameOverrides?: Map<string, string>
  boundaryCollector?: GBoundaryCollector
  children: React.ReactNode
}

export function GPreviewProvider(props: GPreviewProviderProps) {
  props.boundaryCollector?.reset()
  const previewValue: PreviewRuntimeValue = {
    ...(Object.prototype.hasOwnProperty.call(props, "scope") ? { scope: props.scope } : {}),
    providerValues: props.providerValues ?? new Map(),
    frameOverrides: props.frameOverrides ?? new Map(),
    boundaryCollector: props.boundaryCollector,
  }

  return (
    <PreviewRuntimeContext.Provider value={previewValue}>
      {props.children}
    </PreviewRuntimeContext.Provider>
  )
}

export function createGBoundaryCollector(): GBoundaryCollector {
  let nodes: FlatBoundaryNode[] = []
  let valuesByBoundaryId = new Map<string, Omit<GRuntimeValuesSnapshot, "boundaryId">>()

  return {
    reset() {
      nodes = []
      valuesByBoundaryId = new Map()
    },
    registerBoundary(coordinate, parentId, requestedId) {
      const id = requestedId ?? `runelight-boundary:${nodes.length}`
      const existing = nodes.find((candidate) => candidate.id === id)
      if (existing) {
        existing.coordinate = coordinate
        existing.parentId = parentId
        return id
      }

      nodes.push({ id, coordinate, parentId })
      return id
    },
    updateBoundaryRect(id, rect) {
      const node = nodes.find((candidate) => candidate.id === id)
      if (node) {
        node.rect = rect
      }
    },
    updateBoundaryValues(id, values) {
      valuesByBoundaryId.set(id, values)
    },
    getValues(id) {
      const values = valuesByBoundaryId.get(id)
      return values ? { boundaryId: id, ...values } : undefined
    },
    getTree() {
      const nodesById = new Map<string, GBoundaryTreeNode>()
      for (const node of nodes) {
        nodesById.set(node.id, {
          id: node.id,
          coordinate: node.coordinate,
          ...(node.rect ? { rect: node.rect } : {}),
          children: [],
        })
      }

      const roots: GBoundaryTreeNode[] = []
      for (const node of nodes) {
        const treeNode = nodesById.get(node.id)
        if (!treeNode) continue

        const parent = node.parentId ? nodesById.get(node.parentId) : undefined
        if (parent) {
          parent.children.push(treeNode)
        } else {
          roots.push(treeNode)
        }
      }

      return roots
    },
  }
}

export function createGProvider<Props extends object, State, Update extends GProviderUpdateFn>(
  useValue: GProviderUseValue<Props, State, Update>,
): GProvider<State, Update, Props>
export function createGProvider<
  Props extends object,
  State,
  Update extends GProviderUpdateFn,
  Variants extends readonly string[],
>(
  useValue: GProviderUseValue<Props, State, Update>,
  options: GProviderOptions<Variants> & { variants: Variants },
): GProvider<State, Update, Props, Variants[number]>
export function createGProvider<Props extends object, State, Update extends GProviderUpdateFn>(
  useValue: GProviderUseValue<Props, State, Update>,
  options?: GProviderOptions,
): GProvider<State, Update, Props> {
  const PresenceContext = React.createContext(false)
  const container = createContainer<State, Update, Props & { children?: React.ReactNode }>(useValue)
  const TrackedProvider = container.Provider

  const Provider = ((props: Props & { children?: React.ReactNode }) => {
    const preview = React.useContext(PreviewRuntimeContext)
    const activeFrame = React.useContext(ActiveComponentFrameContext)
    if (preview && (preview.providerValues.has(Provider) || readFrameProviderValue(activeFrame, Provider).found)) {
      return <>{props.children}</>
    }

    return (
      <PresenceContext.Provider value={true}>
        <TrackedProvider {...props}>{props.children}</TrackedProvider>
      </PresenceContext.Provider>
    )
  }) as GProvider<State, Update, Props> & {
    __runelightPresenceContext: React.Context<boolean>
    __runelightUseTrackedState: () => State
    __runelightUseUpdate: () => Update
  }

  Provider.useUpdate = () => useGContextUpdate(Provider)
  Object.defineProperties(Provider, {
    __runelightPresenceContext: { value: PresenceContext },
    __runelightUseTrackedState: { value: container.useTrackedState },
    __runelightUseUpdate: { value: container.useUpdate },
    ...(options?.variants ? { __runelightVariants: { value: options.variants } } : {}),
  })

  return Provider
}

export function useGContextUpdate<Provider extends GProvider<any, any, any, any>>(
  provider: Provider,
): GProviderUpdate<Provider> {
  if (isManagedGProvider(provider)) {
    const hasProvider = React.useContext(provider.__runelightPresenceContext)
    if (hasProvider) {
      return provider.__runelightUseUpdate() as GProviderUpdate<Provider>
    }
  }

  const preview = React.useContext(PreviewRuntimeContext)
  const activeFrame = React.useContext(ActiveComponentFrameContext)
  if (preview && (preview.providerValues.has(provider) || readFrameProviderValue(activeFrame, provider).found)) {
    return noopUpdate as GProviderUpdate<Provider>
  }

  throw new Error(`No Runelight provider update is active for ${provider.name || "anonymous provider"}.`)
}

export function createGScopeHook<Scope>(useRealScope: () => Scope): () => Scope
export function createGScopeHook<Props, Scope>(useRealScope: (props: Props) => Scope): (props: Props) => Scope
export function createGScopeHook<Props, Providers extends readonly GProvider<any, any, any, any>[], Scope>(
  useRealScope: (props: Props, providers: GProviderStates<Providers>) => Scope,
  providers: Providers,
): (props: Props) => Scope
export function createGScopeHook<Props, Providers extends readonly GProvider<any, any, any, any>[], Scope>(
  useRealScope: (() => Scope) | ((props: Props) => Scope) | ((props: Props, providers: GProviderStates<Providers>) => Scope),
  providers?: Providers,
): ((props: Props) => Scope) | (() => Scope) {
  return ((props?: Props): Scope => {
    const providerStates = providers?.map((provider) => useGContext(provider)) as GProviderStates<Providers> | undefined
    const activeFrame = React.useContext(ActiveComponentFrameContext)
    if (activeFrame && "scope" in activeFrame) {
      return activeFrame.scope as Scope
    }

    const preview = React.useContext(PreviewRuntimeContext)
    if (preview && "scope" in preview) {
      return preview.scope as Scope
    }

    if (providers) {
      return (useRealScope as (props: Props, providers: GProviderStates<Providers>) => Scope)(props as Props, providerStates!)
    }

    return (useRealScope as (props?: Props) => Scope)(props)
  }) as ((props: Props) => Scope) | (() => Scope)
}

export function useGContext<Value>(provider: GProvider<Value> | AnyGProvider): Value {
  if (isManagedGProvider<Value, GProviderUpdateFn>(provider)) {
    const hasProvider = React.useContext(provider.__runelightPresenceContext)
    if (hasProvider) {
      return provider.__runelightUseTrackedState()
    }
  }

  const preview = React.useContext(PreviewRuntimeContext)
  if (preview?.providerValues.has(provider)) {
    return preview.providerValues.get(provider) as Value
  }

  const activeFrame = React.useContext(ActiveComponentFrameContext)
  const frameValue = readFrameProviderValue(activeFrame, provider)
  if (frameValue.found) {
    return frameValue.value as Value
  }

  throw new Error(`No Runelight provider value is active for ${provider.name || "anonymous provider"}.`)
}

function isManagedGProvider<State, Update extends GProviderUpdateFn>(
  provider: GProvider<State, Update> | AnyGProvider,
): provider is ManagedGProvider<State, Update> {
  return "__runelightPresenceContext" in provider && "__runelightUseTrackedState" in provider && "__runelightUseUpdate" in provider
}

function readFrameProviderValue(
  activeFrame: GFrame<unknown, unknown> | null,
  provider: AnyGProvider,
): { found: true; value: unknown } | { found: false } {
  if (!activeFrame || !Array.isArray(activeFrame.providers)) {
    return { found: false }
  }

  for (const [entryProvider, value] of activeFrame.providers) {
    if (entryProvider === provider) {
      return { found: true, value }
    }
  }

  return { found: false }
}

export function defineGComponent<Props extends object>(
  coordinate: string,
  Component: React.ComponentType<Props>,
): React.ComponentType<Props> & { frames?: AnyComponentFrames<Props> } {
  const GComponentBoundary = ((props: Props) => {
    const stableBoundaryId = `runelight-boundary:${React.useId()}`
    const preview = React.useContext(PreviewRuntimeContext)
    const parentBoundaryId = React.useContext(BoundaryParentContext)
    const boundaryId = preview?.boundaryCollector?.registerBoundary(coordinate, parentBoundaryId, stableBoundaryId) ?? null
    const activeFrame = preview ? resolveComponentFrame(coordinate, GComponentBoundary.frames, preview) : null
    if (preview && boundaryId) {
      preview.boundaryCollector?.updateBoundaryValues(boundaryId, {
        props: serializeGRuntimeValue(props),
        scope: serializeGRuntimeValue(readScopeSnapshot(activeFrame, preview)),
        providerValues: serializeProviderValues(preview.providerValues),
      })
    }
    const rendered = activeFrame ? (
      <ActiveComponentFrameContext.Provider value={activeFrame as GFrame<unknown, unknown>}>
        <Component {...props} />
      </ActiveComponentFrameContext.Provider>
    ) : (
      <Component {...props} />
    )

    if (!boundaryId) return rendered
    return (
      <BoundaryParentContext.Provider value={boundaryId}>
        <div data-runelight-boundary-id={boundaryId} style={{ display: "contents" }}>
          {rendered}
        </div>
      </BoundaryParentContext.Provider>
    )
  }) as React.ComponentType<Props> & { frames?: AnyComponentFrames<Props>; displayName?: string }

  GComponentBoundary.displayName = Component.displayName || Component.name
  return GComponentBoundary
}

function readScopeSnapshot(activeFrame: object | null, preview: PreviewRuntimeValue): unknown {
  if (activeFrame && "scope" in activeFrame) return (activeFrame as { scope: unknown }).scope
  return preview.scope
}

function serializeProviderValues(providerValues: Map<AnyGProvider, unknown>): GRuntimeValuesSnapshot["providerValues"] {
  return [...providerValues.entries()].map(([provider, value]) => ({
    providerName: provider.displayName || provider.name || "anonymous provider",
    value: serializeGRuntimeValue(value),
  }))
}

function readPreviewContextIfRendering(): PreviewRuntimeValue | null {
  try {
    return React.useContext(PreviewRuntimeContext)
  } catch {
    return null
  }
}

function readActiveComponentFrameIfRendering(): GFrame<unknown, unknown> | null {
  try {
    return React.useContext(ActiveComponentFrameContext)
  } catch {
    return null
  }
}

function resolveComponentFrame<Props extends object>(
  coordinate: string,
  frames: AnyComponentFrames<Props> | undefined,
  preview: PreviewRuntimeValue,
): GFrame<Props> | GFrame<Props, unknown> | null {
  if (!frames) return null

  const overrideName = preview.frameOverrides.get(coordinate)
  if (overrideName) {
    const overrideFrame = frames[overrideName]
    if (!overrideFrame) {
      throw new Error(`Unknown Runelight frame "${overrideName}" for ${coordinate}.`)
    }
    return overrideFrame
  }

  return Object.values(frames)[0] ?? null
}
