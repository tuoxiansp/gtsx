import React from "react"
import { createContainer } from "react-tracked"

import type { GRuntimeValuesSnapshot } from "./preview-protocol.js"
import { serializeGRuntimeValue } from "./runtime-values.js"
import type {
  AnyGProvider,
  GCases,
  GCase,
  GProvider,
  GProviderStates,
  GProviderUpdate,
  GProviderUpdateFn,
  GProviderUseValue,
} from "./types.js"

type PreviewRuntimeValue = {
  scope?: unknown
  providerValues: Map<AnyGProvider, unknown>
  caseOverrides: Map<string, string>
  boundaryCollector?: GBoundaryCollector
}

type AnyComponentCases<Props> = Record<string, GCase<Props> | GCase<Props, unknown>>

const PreviewRuntimeContext = React.createContext<PreviewRuntimeValue | null>(null)
const ActiveComponentCaseContext = React.createContext<GCase<unknown, unknown> | null>(null)
const BoundaryParentContext = React.createContext<string | null>(null)
const noopUpdate = () => {}

type ManagedGProvider<State = unknown, Update extends GProviderUpdateFn = GProviderUpdateFn> = GProvider<State, Update> & {
  readonly __gtsxPresenceContext: React.Context<boolean>
  readonly __gtsxUseTrackedState: () => State
  readonly __gtsxUseUpdate: () => Update
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
  registerBoundary(coordinate: string, parentId: string | null): string
  updateBoundaryRect(id: string, rect: GBoundaryRect): void
  updateBoundaryValues(id: string, values: Omit<GRuntimeValuesSnapshot, "boundaryId">): void
  getValues(id: string): GRuntimeValuesSnapshot | undefined
  getTree(): GBoundaryTreeNode[]
}

export type GPreviewProviderProps = {
  scope?: unknown
  providerValues?: Map<AnyGProvider, unknown>
  caseOverrides?: Map<string, string>
  boundaryCollector?: GBoundaryCollector
  children: React.ReactNode
}

export function GPreviewProvider(props: GPreviewProviderProps) {
  props.boundaryCollector?.reset()
  const previewValue: PreviewRuntimeValue = {
    ...(Object.prototype.hasOwnProperty.call(props, "scope") ? { scope: props.scope } : {}),
    providerValues: props.providerValues ?? new Map(),
    caseOverrides: props.caseOverrides ?? new Map(),
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
    registerBoundary(coordinate, parentId) {
      const id = `gtsx-boundary:${nodes.length}`
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
): GProvider<State, Update, Props> {
  const PresenceContext = React.createContext(false)
  const container = createContainer<State, Update, Props & { children?: React.ReactNode }>(useValue)
  const TrackedProvider = container.Provider

  const Provider = ((props: Props & { children?: React.ReactNode }) => {
    return (
      <PresenceContext.Provider value={true}>
        <TrackedProvider {...props}>{props.children}</TrackedProvider>
      </PresenceContext.Provider>
    )
  }) as GProvider<State, Update, Props> & {
    __gtsxPresenceContext: React.Context<boolean>
    __gtsxUseTrackedState: () => State
    __gtsxUseUpdate: () => Update
  }

  Provider.useUpdate = () => useGContextUpdate(Provider)
  Object.defineProperties(Provider, {
    __gtsxPresenceContext: { value: PresenceContext },
    __gtsxUseTrackedState: { value: container.useTrackedState },
    __gtsxUseUpdate: { value: container.useUpdate },
  })

  return Provider
}

export function useGContextUpdate<Provider extends GProvider<any, any, any>>(
  provider: Provider,
): GProviderUpdate<Provider> {
  if (isManagedGProvider(provider)) {
    const hasProvider = React.useContext(provider.__gtsxPresenceContext)
    if (hasProvider) {
      return provider.__gtsxUseUpdate() as GProviderUpdate<Provider>
    }
  }

  const preview = React.useContext(PreviewRuntimeContext)
  const activeCase = React.useContext(ActiveComponentCaseContext)
  if (preview && readCaseProviderValue(activeCase, provider).found) {
    return noopUpdate as GProviderUpdate<Provider>
  }

  throw new Error(`No GTSX provider update is active for ${provider.name || "anonymous provider"}.`)
}

export function createGScopeHook<Scope>(useRealScope: () => Scope): () => Scope
export function createGScopeHook<Props, Scope>(useRealScope: (props: Props) => Scope): (props: Props) => Scope
export function createGScopeHook<Props, Providers extends readonly GProvider<any, any, any>[], Scope>(
  useRealScope: (props: Props, providers: GProviderStates<Providers>) => Scope,
  providers: Providers,
): (props: Props) => Scope
export function createGScopeHook<Props, Providers extends readonly GProvider<any, any, any>[], Scope>(
  useRealScope: (() => Scope) | ((props: Props) => Scope) | ((props: Props, providers: GProviderStates<Providers>) => Scope),
  providers?: Providers,
): ((props: Props) => Scope) | (() => Scope) {
  return ((props?: Props): Scope => {
    const providerStates = providers?.map((provider) => useGContext(provider)) as GProviderStates<Providers> | undefined
    const activeCase = React.useContext(ActiveComponentCaseContext)
    if (activeCase && "scope" in activeCase) {
      return activeCase.scope as Scope
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
    const hasProvider = React.useContext(provider.__gtsxPresenceContext)
    if (hasProvider) {
      return provider.__gtsxUseTrackedState()
    }
  }

  const preview = React.useContext(PreviewRuntimeContext)
  if (preview?.providerValues.has(provider)) {
    return preview.providerValues.get(provider) as Value
  }

  const activeCase = React.useContext(ActiveComponentCaseContext)
  const caseValue = readCaseProviderValue(activeCase, provider)
  if (caseValue.found) {
    return caseValue.value as Value
  }

  throw new Error(`No GTSX provider value is active for ${provider.name || "anonymous provider"}.`)
}

function isManagedGProvider<State, Update extends GProviderUpdateFn>(
  provider: GProvider<State, Update> | AnyGProvider,
): provider is ManagedGProvider<State, Update> {
  return "__gtsxPresenceContext" in provider && "__gtsxUseTrackedState" in provider && "__gtsxUseUpdate" in provider
}

function readCaseProviderValue(
  activeCase: GCase<unknown, unknown> | null,
  provider: AnyGProvider,
): { found: true; value: unknown } | { found: false } {
  if (!activeCase || !Array.isArray(activeCase.providers)) {
    return { found: false }
  }

  for (const [entryProvider, value] of activeCase.providers) {
    if (entryProvider === provider) {
      return { found: true, value }
    }
  }

  return { found: false }
}

export function defineGComponent<Props extends object>(
  coordinate: string,
  Component: React.ComponentType<Props>,
): React.ComponentType<Props> & { cases?: AnyComponentCases<Props> } {
  const GComponentBoundary = ((props: Props) => {
    const preview = React.useContext(PreviewRuntimeContext)
    const parentBoundaryId = React.useContext(BoundaryParentContext)
    const boundaryId = preview?.boundaryCollector?.registerBoundary(coordinate, parentBoundaryId) ?? null
    const activeCase = preview ? resolveComponentCase(coordinate, GComponentBoundary.cases, preview) : null
    if (preview && boundaryId) {
      preview.boundaryCollector?.updateBoundaryValues(boundaryId, {
        props: serializeGRuntimeValue(props),
        scope: serializeGRuntimeValue(readScopeSnapshot(activeCase, preview)),
        providerValues: serializeProviderValues(preview.providerValues),
      })
    }
    const rendered = activeCase ? (
      <ActiveComponentCaseContext.Provider value={activeCase as GCase<unknown, unknown>}>
        <Component {...props} />
      </ActiveComponentCaseContext.Provider>
    ) : (
      <Component {...props} />
    )

    if (!boundaryId) return rendered
    return (
      <BoundaryParentContext.Provider value={boundaryId}>
        <div data-gtsx-boundary-id={boundaryId} style={{ display: "contents" }}>
          {rendered}
        </div>
      </BoundaryParentContext.Provider>
    )
  }) as React.ComponentType<Props> & { cases?: AnyComponentCases<Props>; displayName?: string }

  GComponentBoundary.displayName = Component.displayName || Component.name
  return GComponentBoundary
}

function readScopeSnapshot(activeCase: object | null, preview: PreviewRuntimeValue): unknown {
  if (activeCase && "scope" in activeCase) return (activeCase as { scope: unknown }).scope
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

function readActiveComponentCaseIfRendering(): GCase<unknown, unknown> | null {
  try {
    return React.useContext(ActiveComponentCaseContext)
  } catch {
    return null
  }
}

function resolveComponentCase<Props extends object>(
  coordinate: string,
  cases: AnyComponentCases<Props> | undefined,
  preview: PreviewRuntimeValue,
): GCase<Props> | GCase<Props, unknown> | null {
  if (!cases) return null

  const overrideName = preview.caseOverrides.get(coordinate)
  if (overrideName) {
    const overrideCase = cases[overrideName]
    if (!overrideCase) {
      throw new Error(`Unknown GTSX case "${overrideName}" for ${coordinate}.`)
    }
    return overrideCase
  }

  return Object.values(cases)[0] ?? null
}
