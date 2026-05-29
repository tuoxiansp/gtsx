import { useState, type ReactNode } from "react"
import type { GCases } from "@gtsx/core"

type Props = {
  label: string
  children?: ReactNode
}

export default function NonGTSXHook(props: Props) {
  const [count] = useState(0)
  return <span>{props.label + count}</span>
}

NonGTSXHook.cases = {
  ready: { props: { label: "Ready" } },
} satisfies GCases<Props>
