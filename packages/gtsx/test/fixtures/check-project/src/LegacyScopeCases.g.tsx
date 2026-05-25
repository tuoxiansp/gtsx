import { createGScopeHook, type GCases } from "gtsx"

type Props = {
  id: string
}

type Scope = {
  label: string
}

const useLegacyGScope = createGScopeHook((_props: Props): Scope => ({ label: "real" }))

useLegacyGScope.cases = {
  ready: { props: { id: "1" }, scope: { label: "legacy" } },
} satisfies GCases<Props, Scope>

export default function LegacyScopeCases(props: Props) {
  const scope = useLegacyGScope(props)
  return <span>{scope.label}</span>
}
