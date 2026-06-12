import type { GFrames } from "@runelight/react/runtime"

type Props = {
  label: string
}

const frameName = "ready"

export default function DynamicFrames(props: Props) {
  return <span>{props.label}</span>
}

DynamicFrames.frames = {
  [frameName]: { props: { label: "Ready" } },
} satisfies GFrames<Props>
