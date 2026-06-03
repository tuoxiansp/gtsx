import type { GFrames } from "@gtsx/core"

export default function Child() {
  return <span>Child</span>
}

Child.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
