import type { GTSXPureCases } from "gtsx"

type Props = {
  label: string
}

export function MissingDefault(props: Props) {
  return <span>{props.label}</span>
}

MissingDefault.cases = {
  ready: { props: { label: "Ready" } },
} satisfies GTSXPureCases<Props>
