import { useState, type ReactNode } from "react"
import type { GFrames } from "@runelight/react/runtime"

type Props = {
  label: string
  children?: ReactNode
}

export default function NonRunelightHook(props: Props) {
  const [count] = useState(0)
  return <span>{props.label + count}</span>
}

NonRunelightHook.frames = {
  ready: { props: { label: "Ready" } },
} satisfies GFrames<Props>
