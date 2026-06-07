import type { GFrames } from "@runelight/core"

type Props = {
  label: string
}

export function MissingDefault(props: Props) {
  return <span>{props.label}</span>
}

MissingDefault.frames = {
  ready: { props: { label: "Ready" } },
} satisfies GFrames<Props>
