import { createGScopeHook, type GFrames } from "@runelight/core"

type Props = {
  id: string
}

type Scope = {
  label: string
}

const useLegacyGScope = createGScopeHook((_props: Props): Scope => ({ label: "real" }))

useLegacyGScope.frames = {
  ready: { props: { id: "1" }, scope: { label: "legacy" } },
} satisfies GFrames<Props, Scope>

export default function LegacyScopeFrames(props: Props) {
  const scope = useLegacyGScope(props)
  return <span>{scope.label}</span>
}
