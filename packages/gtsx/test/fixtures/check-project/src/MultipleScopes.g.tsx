import { createGTSXScope, type GTSXScopeCases } from "gtsx"

type Props = {
  id: string
}

const useFirstScope = createGTSXScope((_props: Props) => ({ label: "first" }))
const useSecondScope = createGTSXScope((_props: Props) => ({ label: "second" }))

useFirstScope.cases = {
  ready: { props: { id: "1" }, scope: { label: "first" } },
} satisfies GTSXScopeCases<Props, { label: string }>

useSecondScope.cases = {
  ready: { props: { id: "1" }, scope: { label: "second" } },
} satisfies GTSXScopeCases<Props, { label: string }>

export default function MultipleScopes(props: Props) {
  const first = useFirstScope(props)
  const second = useSecondScope(props)
  return <span>{first.label + second.label}</span>
}
