import React from "react"

import type { AnyGProvider, GCases, GCase, GProvider, GScopeHook } from "./types.js"

type PreviewRuntimeValue = {
  scope?: unknown
  providerValues: Map<AnyGProvider, unknown>
  caseOverrides: Map<string, string>
}

const PreviewRuntimeContext = React.createContext<PreviewRuntimeValue | null>(null)
const ActiveComponentCaseContext = React.createContext<GCase<unknown, unknown> | null>(null)

export type GPreviewProviderProps = {
  scope?: unknown
  providerValues?: Map<AnyGProvider, unknown>
  caseOverrides?: Map<string, string>
  children: React.ReactNode
}

export function GPreviewProvider(props: GPreviewProviderProps) {
  return (
    <PreviewRuntimeContext.Provider
      value={{
        scope: props.scope,
        providerValues: props.providerValues ?? new Map(),
        caseOverrides: props.caseOverrides ?? new Map(),
      }}
    >
      {props.children}
    </PreviewRuntimeContext.Provider>
  )
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
): React.ComponentType<Props> & { cases?: GCases<Props, unknown> } {
  const GComponentBoundary = ((props: Props) => {
    const preview = React.useContext(PreviewRuntimeContext)
    const activeCase = preview ? resolveComponentCase(coordinate, GComponentBoundary.cases, preview) : null

    if (!activeCase) return <Component {...props} />

    return (
      <ActiveComponentCaseContext.Provider value={activeCase as GCase<unknown, unknown>}>
        <Component {...props} />
      </ActiveComponentCaseContext.Provider>
    )
  }) as React.ComponentType<Props> & { cases?: GCases<Props, unknown>; displayName?: string }

  GComponentBoundary.displayName = Component.displayName || Component.name
  return GComponentBoundary
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
  cases: GCases<Props, unknown> | undefined,
  preview: PreviewRuntimeValue,
): GCase<Props, unknown> | null {
  if (!cases) return null

  const overrideName = preview.caseOverrides.get(coordinate)
  if (overrideName && cases[overrideName]) {
    return cases[overrideName]
  }

  return Object.values(cases)[0] ?? null
}
