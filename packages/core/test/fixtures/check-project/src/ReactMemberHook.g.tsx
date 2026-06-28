import React from "react"
import type { GFrames } from "@runelight/react/runtime"

type Props = {
  label: string
}

export default function ReactMemberHook(props: Props) {
  const [count] = React.useState(0)
  return <span>{props.label + count}</span>
}

ReactMemberHook.frames = {
  ready: { description: "ready frame", props: { label: "Ready" } },
} satisfies GFrames<Props>
