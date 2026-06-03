import React from "react"
import type { GFrames } from "@gtsx/core"

function HookChild() {
  const [count] = React.useState(0)
  return <span>{count}</span>
}

export default function LocalHookDependency() {
  return <HookChild />
}

LocalHookDependency.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
