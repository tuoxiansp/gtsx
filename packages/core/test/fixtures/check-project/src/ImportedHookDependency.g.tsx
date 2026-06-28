import type { GFrames } from "@runelight/react/runtime"

import { HookDependencyChild } from "./HookDependencyChild.g"

export default function ImportedHookDependency() {
  return <HookDependencyChild />
}

ImportedHookDependency.frames = {
  ready: { description: "ready frame", props: {} },
} satisfies GFrames<Record<string, never>>
