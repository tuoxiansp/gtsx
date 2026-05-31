import type { GCases } from "@gtsx/core"

import {
  ImportedScopeProvider,
  useImportedScope,
} from "./ScopeSource.g"

export function ImportedScopeConsumer() {
  const scope = useImportedScope()
  return <span>{scope.label}</span>
}

ImportedScopeConsumer.cases = {
  ready: {
    props: {},
    providers: [[ImportedScopeProvider, { label: "imported" }]],
  },
} satisfies GCases<React.ComponentProps<typeof ImportedScopeConsumer>, never, [typeof ImportedScopeProvider]>
