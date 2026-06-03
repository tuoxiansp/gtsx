import { type GFrames } from "@gtsx/core"

import { ThemeProvider } from "./UserCard.g"

export function ImportedProviderPanel() {
  return <span>Imported provider</span>
}

ImportedProviderPanel.frames = {
  light: {
    props: {},
    providers: [[ThemeProvider, { mode: "light" }]],
  },
} satisfies GFrames<React.ComponentProps<typeof ImportedProviderPanel>, never, [typeof ThemeProvider]>
