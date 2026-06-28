import React from "react"
import type { GFrames } from "@runelight/react/runtime"

function HookChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

export default function LocalHookDependency() {
  return <HookChild />
}

LocalHookDependency.frames = {
  ready: { description: "ready frame", props: {} },
} satisfies GFrames<Record<string, never>>
