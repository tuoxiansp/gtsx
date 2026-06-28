import { createGScopeHook, type GFrames } from "@runelight/react/runtime"

type CastScope = {
  label: string
}

const useCastScope = createGScopeHook((_props: undefined): CastScope => ({ label: "real" })) as () => CastScope

export function CastScopeHook() {
  const scope = useCastScope()

  return <span>{scope.label}</span>
}

CastScopeHook.frames = {
  ready: {
    description: "ready frame",
    props: {},
    scope: { label: "Preview" },
  },
} satisfies GFrames<React.ComponentProps<typeof CastScopeHook>, CastScope>
