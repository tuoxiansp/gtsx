import React from "react"
import type { GCases } from "@gtsx/core"

function HookChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

export default function LocalHookDependency() {
  return <HookChild />
}

LocalHookDependency.cases = {
  ready: { props: {} },
} satisfies GCases<Record<string, never>>
