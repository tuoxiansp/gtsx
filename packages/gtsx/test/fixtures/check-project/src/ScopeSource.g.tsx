import {
  createGProvider,
  createGScopeHook,
  type GCases,
} from "@gtsx/core"

type ImportedScope = {
  label: string
}

export const ImportedScopeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ImportedScope>({ label: "real" }),
)

const useImportedScope = createGScopeHook(
  (_props: undefined, [scope]: readonly [ImportedScope]) => scope,
  [ImportedScopeProvider] as const,
) as () => ImportedScope

function ScopeSource() {
  const scope = useImportedScope()
  return <span>{scope.label}</span>
}

export { ScopeSource, useImportedScope }

ScopeSource.cases = {
  ready: {
    props: {},
    providers: [[ImportedScopeProvider, { label: "source" }]],
  },
} satisfies GCases<React.ComponentProps<typeof ScopeSource>, never, [typeof ImportedScopeProvider]>
