import type { GFrames } from "@runelight/react/runtime"

export default function Sketch() {
  return null
}

Sketch.frames = {
  live: { description: "live frame", props: {} },
} satisfies GFrames<Record<string, never>>
