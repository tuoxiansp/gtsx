import type { GCases } from "gtsx"

type Props = {
  label: string
}

export default function Included(props: Props) {
  return <span>{props.label}</span>
}

Included.cases = {
  ready: { props: { label: "Included" } },
} satisfies GCases<Props>
