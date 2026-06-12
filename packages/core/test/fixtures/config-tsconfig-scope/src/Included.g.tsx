import type { GFrames } from "@runelight/react/runtime"

type IncludedProps = {
  label: string
}

export default function Included(props: IncludedProps) {
  return <span>{props.label}</span>
}

Included.frames = {
  ready: {
    props: {
      label: "ready",
    },
  },
} satisfies GFrames<IncludedProps>
