import React from "react"
import type { GFrames } from "@runelight/core"

function HookChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

export default function AliasHookDependency() {
  const PreviewChild = HookChild as any

  return <PreviewChild />
}

AliasHookDependency.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
