import React from "react"
import type { GFrames } from "@gtsx/core"

export function HookDependencyChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

HookDependencyChild.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
