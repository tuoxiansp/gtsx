import type { GFrames } from "@runelight/react/runtime"

import { Child } from "@fixture/Child.g"

type Props = {
  label: string
}

export default function Included(props: Props) {
  return <Child label={props.label} />
}

Included.frames = {
  ready: { description: "ready frame", props: { label: "Included" } },
} satisfies GFrames<Props>
