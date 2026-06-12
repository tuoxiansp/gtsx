import { useState } from "react"
import type { GFrames } from "@runelight/react/runtime"

type Props = {
  label: string
}

function renderLabel(label: string) {
  const [count] = useState(0)
  return label + count
}

export default function HelperHook(props: Props) {
  return <span>{renderLabel(props.label)}</span>
}

HelperHook.frames = {
  ready: { props: { label: "Ready" } },
} satisfies GFrames<Props>
