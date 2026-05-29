import {
  createGProvider,
  createGScopeHook,
  type GCases,
} from "@gtsx/core"
import React from "react"

export type RootProps = {
  requestId: string
}

export type QueryClientScope = {
  apiBaseUrl: string
  retryAfterMs?: number
}

export type RootScope =
  | { status: "apiDown"; message: string; refetch: () => void }
  | { status: "recovering"; message: string }
  | { status: "ready"; userName: string }

export const QueryClientProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<QueryClientScope>({ apiBaseUrl: "https://api.example.test" }),
)

const providers = [QueryClientProvider] as const

function useRootProviderScope(_props: RootProps, [_queryClient]: [QueryClientScope]): RootScope {
  return { status: "ready", userName: "Production User" }
}

const useRootProviderGScope = createGScopeHook(useRootProviderScope, providers)

export default function RootRouteShell(props: RootProps) {
  const scope = useRootProviderGScope(props)

  if (scope.status === "apiDown") {
    return (
      <main data-state="api-down">
        <h1>Root provider failed</h1>
        <p>{scope.message}</p>
        <button onClick={scope.refetch}>Retry</button>
      </main>
    )
  }

  if (scope.status === "recovering") {
    return (
      <main data-state="recovering">
        <h1>Recovering</h1>
        <p>{scope.message}</p>
      </main>
    )
  }

  return (
    <main data-state="ready">
      <h1>Welcome {scope.userName}</h1>
    </main>
  )
}

RootRouteShell.cases = {
  apiDown: {
    props: { requestId: "req_tanstack_7133" },
    providers: [[QueryClientProvider, { apiBaseUrl: "https://api.example.test", retryAfterMs: 5000 }]],
    scope: {
      status: "apiDown",
      message: "HTTPError while root providers boot.",
      refetch: () => {},
    },
  },
  recovering: {
    props: { requestId: "req_tanstack_7133" },
    providers: [[QueryClientProvider, { apiBaseUrl: "https://api.example.test", retryAfterMs: 5000 }]],
    scope: { status: "recovering", message: "Retrying provider query." },
  },
  ready: {
    props: { requestId: "req_tanstack_7133" },
    providers: [[QueryClientProvider, { apiBaseUrl: "https://api.example.test" }]],
    scope: { status: "ready", userName: "Ada Lovelace" },
  },
} satisfies GCases<RootProps, RootScope, typeof providers>
