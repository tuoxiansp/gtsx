import React from "react"
import type { GFrames } from "@runelight/react/runtime"

export function HookDependencyChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

HookDependencyChild.frames = {
  ready: { description: "ready frame", props: {} },
} satisfies GFrames<Record<string, never>>
