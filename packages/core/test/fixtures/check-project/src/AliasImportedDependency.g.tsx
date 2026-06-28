import type { GFrames } from "@runelight/react/runtime"

import { HookDependencyChild } from "./HookDependencyChild.g"

export default function AliasImportedDependency() {
  const PreviewChild = HookDependencyChild as any

  return <PreviewChild />
}

AliasImportedDependency.frames = {
  ready: { description: "ready frame", props: {} },
} satisfies GFrames<Record<string, never>>
