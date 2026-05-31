import type { GCases } from "@gtsx/core"

import { HookDependencyChild } from "./HookDependencyChild.g"

export default function ImportedHookDependency() {
  return <HookDependencyChild />
}

ImportedHookDependency.cases = {
  ready: { props: {} },
} satisfies GCases<Record<string, never>>
