import type { GFrames } from "@gtsx/core"

type Props = {
  label: string
}

export default function Outside(props: Props) {
  return <span>{props.label}</span>
}

Outside.frames = {
  ready: { props: { label: "Outside" } },
} satisfies GFrames<Props>
