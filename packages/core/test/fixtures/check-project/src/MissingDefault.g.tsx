import type { GFrames } from "@runelight/react/runtime"

type Props = {
  label: string
}

export function MissingDefault(props: Props) {
  return <span>{props.label}</span>
}

MissingDefault.frames = {
  ready: { description: "ready frame", props: { label: "Ready" } },
} satisfies GFrames<Props>
