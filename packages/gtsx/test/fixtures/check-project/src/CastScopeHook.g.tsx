import { createGScopeHook, type GCases } from "@gtsx/core"

type CastScope = {
  label: string
}

const useCastScope = createGScopeHook((_props: undefined): CastScope => ({ label: "real" })) as () => CastScope

export function CastScopeHook() {
  const scope = useCastScope()

  return <span>{scope.label}</span>
}

CastScopeHook.cases = {
  ready: {
    props: {},
    scope: { label: "Preview" },
  },
} satisfies GCases<React.ComponentProps<typeof CastScopeHook>, CastScope>
