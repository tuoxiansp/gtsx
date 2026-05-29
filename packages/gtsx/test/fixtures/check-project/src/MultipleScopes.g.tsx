import { createGScopeHook, type GCases } from "@gtsx/core"

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

MultipleScopes.cases = {
  ready: { props: { id: "1" }, scope: { label: "first" } },
} satisfies GCases<Props, { label: string }>
