import React from "react"
import type { GCases } from "@gtsx/core"

type Props = {
  label: string
}

export default function ReactMemberHook(props: Props) {
  const [count] = React.useState(0)
  return <span>{props.label + count}</span>
}

ReactMemberHook.cases = {
  ready: { props: { label: "Ready" } },
} satisfies GCases<Props>
