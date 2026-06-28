import type { GFrames } from "@runelight/react/runtime"

import { ThemeProvider } from "./UserCard.g"

export function ImportedProviderPanel() {
  return <span>Imported provider</span>
}

ImportedProviderPanel.frames = {
  light: {
    description: "light frame",
    props: {},
    providers: [[ThemeProvider, { mode: "light" }]],
  },
} satisfies GFrames<React.ComponentProps<typeof ImportedProviderPanel>, never, [typeof ThemeProvider]>
