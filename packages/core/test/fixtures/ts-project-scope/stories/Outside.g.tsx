import type { GFrames } from "@runelight/react/runtime"

type Props = {
  label: string
}

export default function Outside(props: Props) {
  return <span>{props.label}</span>
}

Outside.frames = {
  ready: { description: "ready frame", props: { label: "Outside" } },
} satisfies GFrames<Props>
