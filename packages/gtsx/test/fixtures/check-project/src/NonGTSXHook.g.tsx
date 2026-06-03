import { useState, type ReactNode } from "react"
import type { GFrames } from "@gtsx/core"

type Props = {
  label: string
  children?: ReactNode
}

export default function NonGTSXHook(props: Props) {
  const [count] = useState(0)
  return <span>{props.label + count}</span>
}

NonGTSXHook.frames = {
  ready: { props: { label: "Ready" } },
} satisfies GFrames<Props>
