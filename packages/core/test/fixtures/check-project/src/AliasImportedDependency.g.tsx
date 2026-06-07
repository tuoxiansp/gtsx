import type { GFrames } from "@runelight/core"

import { HookDependencyChild } from "./HookDependencyChild.g"

export default function AliasImportedDependency() {
  const PreviewChild = HookDependencyChild as any

  return <PreviewChild />
}

AliasImportedDependency.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
