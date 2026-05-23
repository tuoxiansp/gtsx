import React from "react"

import type { AnyGTSXProvider, GTSXProvider, GTSXScopeHook } from "./types.js"

type PreviewRuntimeValue = {
  scope?: unknown
  providerValues: Map<AnyGTSXProvider, unknown>
}

const PreviewRuntimeContext = React.createContext<PreviewRuntimeValue | null>(null)

export type GTSXPreviewProviderProps = {
  scope?: unknown
  providerValues?: Map<AnyGTSXProvider, unknown>
  children: React.ReactNode
}

export function GTSXPreviewProvider(props: GTSXPreviewProviderProps) {
  return (
    <PreviewRuntimeContext.Provider
      value={{ scope: props.scope, providerValues: props.providerValues ?? new Map() }}
    >
      {props.children}
    </PreviewRuntimeContext.Provider>
  )
}

export function createGTSXScope<Args extends unknown[], Scope>(
  useRealScope: (...args: Args) => Scope,
): GTSXScopeHook<Args, Scope> {
  const useScope = ((...args: Args): Scope => {
    const preview = readPreviewContextIfRendering()
    if (preview && "scope" in preview) {
      return preview.scope as Scope
    }

    return useRealScope(...args)
  }) as GTSXScopeHook<Args, Scope>

  return useScope
}

export function useGTSXContext<Value>(provider: GTSXProvider<Value>): Value {
  const preview = React.useContext(PreviewRuntimeContext)
  if (!preview?.providerValues.has(provider)) {
    throw new Error(`No GTSX provider value is active for ${provider.name || "anonymous provider"}.`)
  }

  return preview.providerValues.get(provider) as Value
}

function readPreviewContextIfRendering(): PreviewRuntimeValue | null {
  try {
    return React.useContext(PreviewRuntimeContext)
  } catch {
    return null
  }
}
