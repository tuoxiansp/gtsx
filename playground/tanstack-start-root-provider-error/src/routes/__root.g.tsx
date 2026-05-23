import {
  createGTSXScope,
  useGTSXContext,
  type GTSXProviderCases,
  type GTSXScopeCases,
} from "gtsx"

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

export function QueryClientGTSXProvider(props: {
  value?: QueryClientScope
  children: React.ReactNode
}) {
  return <>{props.children}</>
}

QueryClientGTSXProvider.cases = {
  healthy: { value: { apiBaseUrl: "https://api.example.test" } },
  booting: { value: { apiBaseUrl: "https://api.example.test", retryAfterMs: 5000 } },
} satisfies GTSXProviderCases<QueryClientScope>

function useRootProviderScope(_props: RootProps, _queryClient: QueryClientScope): RootScope {
  return { status: "ready", userName: "Production User" }
}

const useRootProviderScopeForGTSX = createGTSXScope(useRootProviderScope)

useRootProviderScopeForGTSX.cases = {
  apiDown: {
    props: { requestId: "req_tanstack_7133" },
    providers: { QueryClientGTSXProvider: "booting" },
    scope: {
      status: "apiDown",
      message: "HTTPError while root providers boot.",
      refetch: () => {},
    },
  },
  recovering: {
    props: { requestId: "req_tanstack_7133" },
    providers: { QueryClientGTSXProvider: "booting" },
    scope: { status: "recovering", message: "Retrying provider query." },
  },
  ready: {
    props: { requestId: "req_tanstack_7133" },
    providers: { QueryClientGTSXProvider: "healthy" },
    scope: { status: "ready", userName: "Ada Lovelace" },
  },
} satisfies GTSXScopeCases<RootProps, RootScope, [typeof QueryClientGTSXProvider]>

export default function RootRouteShell(props: RootProps) {
  const queryClient = useGTSXContext(QueryClientGTSXProvider)
  const scope = useRootProviderScopeForGTSX(props, queryClient)

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
