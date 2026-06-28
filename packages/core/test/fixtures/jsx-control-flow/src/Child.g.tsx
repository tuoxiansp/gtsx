import type { GFrames } from "@runelight/react/runtime"

export default function Child() {
  return <span>Child</span>
}

Child.frames = {
  ready: { description: "ready frame", props: {} },
} satisfies GFrames<Record<string, never>>
