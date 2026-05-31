import type { GCases } from "@gtsx/core"

import { HookDependencyChild } from "./HookDependencyChild.g"

export default function AliasImportedDependency() {
  const PreviewChild = HookDependencyChild as any

  return <PreviewChild />
}

AliasImportedDependency.cases = {
  ready: { props: {} },
} satisfies GCases<Record<string, never>>
