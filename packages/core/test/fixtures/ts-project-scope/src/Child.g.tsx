import type { GFrames } from "@runelight/react/runtime"

type Props = {
  label: string
}

export default function Child(props: Props) {
  return <span>{props.label}</span>
}

Child.frames = {
  ready: { description: "ready frame", props: { label: "Child" } },
} satisfies GFrames<Props>

export { Child }
