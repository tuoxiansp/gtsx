import { useState } from "react"
import type { GCases } from "@gtsx/core"

type Props = {
  label: string
}

function renderLabel(label: string) {
  const [count] = useState(0)
  return label + count
}

export default function HelperHook(props: Props) {
  return <span>{renderLabel(props.label)}</span>
}

HelperHook.cases = {
  ready: { props: { label: "Ready" } },
} satisfies GCases<Props>
