import { createGProvider, createGScopeHook, type GFrames } from "@runelight/react/runtime"

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

ScopeSource.frames = {
  ready: {
    description: "ready frame",
    props: {},
    providers: [[ImportedScopeProvider, { label: "source" }]],
  },
} satisfies GFrames<React.ComponentProps<typeof ScopeSource>, never, [typeof ImportedScopeProvider]>
