import type { GFrames } from "@runelight/core"

import {
  ImportedScopeProvider,
  useImportedScope,
} from "./ScopeSource.g"

export function ImportedScopeConsumer() {
  const scope = useImportedScope()
  return <span>{scope.label}</span>
}

ImportedScopeConsumer.frames = {
  ready: {
    props: {},
    providers: [[ImportedScopeProvider, { label: "imported" }]],
  },
} satisfies GFrames<React.ComponentProps<typeof ImportedScopeConsumer>, never, [typeof ImportedScopeProvider]>
