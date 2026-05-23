import React from "react"

import type { GRuntimeValuesSnapshot } from "./preview-protocol.js"
import { serializeGRuntimeValue } from "./runtime-values.js"
import type { AnyGProvider, GCases, GCase, GProvider, GScopeHook } from "./types.js"

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

  return (
    <PreviewRuntimeContext.Provider
      value={{
        scope: props.scope,
        providerValues: props.providerValues ?? new Map(),
        caseOverrides: props.caseOverrides ?? new Map(),
        boundaryCollector: props.boundaryCollector,
      }}
    >
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

export function createGScope<Args extends unknown[], Scope>(
  useRealScope: (...args: Args) => Scope,
): GScopeHook<Args, Scope> {
  const useScope = ((...args: Args): Scope => {
    const activeCase = readActiveComponentCaseIfRendering()
    if (activeCase && "scope" in activeCase) {
      return activeCase.scope as Scope
    }

    const preview = readPreviewContextIfRendering()
    if (preview && "scope" in preview) {
      return preview.scope as Scope
    }

    return useRealScope(...args)
  }) as GScopeHook<Args, Scope>

  return useScope
}

export function useGContext<Value>(provider: GProvider<Value>): Value {
  const preview = React.useContext(PreviewRuntimeContext)
  if (!preview?.providerValues.has(provider)) {
    throw new Error(`No GTSX provider value is active for ${provider.name || "anonymous provider"}.`)
  }

  return preview.providerValues.get(provider) as Value
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
