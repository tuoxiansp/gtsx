import type { GFrames } from "@gtsx/core"

type Props = {
  label: string
}

export default function Child(props: Props) {
  return <span>{props.label}</span>
}

Child.frames = {
  ready: { props: { label: "Child" } },
} satisfies GFrames<Props>

export { Child }
