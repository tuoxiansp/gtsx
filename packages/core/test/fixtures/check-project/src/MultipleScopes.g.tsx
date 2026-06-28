import { createGScopeHook, type GFrames } from "@runelight/react/runtime"

type Props = {
  id: string
}

const useFirstScope = createGScopeHook((_props: Props) => ({ label: "first" }))
const useSecondScope = createGScopeHook((_props: Props) => ({ label: "second" }))

export default function MultipleScopes(props: Props) {
  const first = useFirstScope(props)
  const second = useSecondScope(props)
  return <span>{first.label + second.label}</span>
}

MultipleScopes.frames = {
  ready: { description: "ready frame", props: { id: "1" }, scope: { label: "first" } },
} satisfies GFrames<Props, { label: string }>
