import React from "react"
import type { GCases } from "@gtsx/core"

function HookChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

export default function AliasHookDependency() {
  const PreviewChild = HookChild as any

  return <PreviewChild />
}

AliasHookDependency.cases = {
  ready: { props: {} },
} satisfies GCases<Record<string, never>>
