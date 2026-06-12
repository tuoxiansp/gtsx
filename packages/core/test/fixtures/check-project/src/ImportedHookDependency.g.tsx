import type { GFrames } from "@runelight/react/runtime"

import { HookDependencyChild } from "./HookDependencyChild.g"

export default function ImportedHookDependency() {
  return <HookDependencyChild />
}

ImportedHookDependency.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
