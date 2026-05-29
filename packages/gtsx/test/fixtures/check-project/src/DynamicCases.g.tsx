import type { GCases } from "@gtsx/core"

type Props = {
  label: string
}

const caseName = "ready"

export default function DynamicCases(props: Props) {
  return <span>{props.label}</span>
}

DynamicCases.cases = {
  [caseName]: { props: { label: "Ready" } },
} satisfies GCases<Props>
