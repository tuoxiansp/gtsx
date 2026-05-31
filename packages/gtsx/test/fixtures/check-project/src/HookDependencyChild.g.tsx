import React from "react"
import type { GCases } from "@gtsx/core"

export function HookDependencyChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

HookDependencyChild.cases = {
  ready: { props: {} },
} satisfies GCases<Record<string, never>>
