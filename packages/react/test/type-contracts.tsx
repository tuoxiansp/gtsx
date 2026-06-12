import React from "react"

import {
  createGProvider,
  type AnyGProvider,
  type GProviderEntries,
  type GProviderEntriesFor,
  type GProviderEntry,
  type GProviderOptions,
  type GProviderUpdateFn,
  type GProviderUseValue,
  type GFrames,
} from "../src/index.js"
import {
  createRunelightReactAnalysisCache,
  createRunelightReactContractCache,
  type RunelightReactAnalysisCache,
  type RunelightReactContractCache,
} from "../src/contract.js"

type Props = {
  userId: string
}

type Scope = {
  title: string
}

type ThemeState = {
  color: string
}

type RuntimeSupportTypesArePublic = [
  AnyGProvider,
  GProviderEntries,
  GProviderEntriesFor<readonly []>,
  GProviderEntry,
  GProviderOptions,
  GProviderUpdateFn,
  GProviderUseValue<Record<string, never>, ThemeState, React.Dispatch<React.SetStateAction<ThemeState>>>,
]

type _AssertRuntimeSupportTypesArePublic = RuntimeSupportTypesArePublic

const publicAnalysisCache: RunelightReactAnalysisCache = createRunelightReactAnalysisCache()
void publicAnalysisCache
// @ts-expect-error React analysis cache construction does not expose AST preloading.
createRunelightReactAnalysisCache(new Map())
// @ts-expect-error React analysis cache internals are not public API.
publicAnalysisCache.sourceFilesByPath

const publicContractCache: RunelightReactContractCache = createRunelightReactContractCache({ cwd: "/", files: new Map() })
void publicContractCache
// @ts-expect-error React contract cache internals are not public API.
publicContractCache.projectIndex

const ThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeState>({ color: "#111" }),
)
const CounterProvider = createGProvider((_props: Record<string, never>) => React.useState(0))
const providers = [ThemeProvider, CounterProvider] as const

// @ts-expect-error Provider update is read through useGContextUpdate(Provider), not a provider property.
ThemeProvider.useUpdate

const validFrames = {
  ready: {
    props: { userId: "user_1" },
    providers: [
      [ThemeProvider, { color: "#0af" }],
      [CounterProvider, 42],
    ],
    scope: { title: "Ada" },
  },
} satisfies GFrames<Props, Scope, typeof providers>

void validFrames

const wrongOrderFrames = {
  ready: {
    props: { userId: "user_1" },
    providers: [
      // @ts-expect-error provider entries must match the declared provider order.
      [CounterProvider, 42],
      // @ts-expect-error provider entries must match the declared provider order.
      [ThemeProvider, { color: "#0af" }],
    ],
    scope: { title: "Ada" },
  },
} satisfies GFrames<Props, Scope, typeof providers>

void wrongOrderFrames
