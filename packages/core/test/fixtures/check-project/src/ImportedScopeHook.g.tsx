import type { GFrames } from "@runelight/react/runtime"

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
    description: "ready frame",
    props: {},
    providers: [[ImportedScopeProvider, { label: "imported" }]],
  },
} satisfies GFrames<React.ComponentProps<typeof ImportedScopeConsumer>, never, [typeof ImportedScopeProvider]>
