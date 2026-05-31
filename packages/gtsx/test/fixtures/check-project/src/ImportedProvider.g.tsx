import { type GCases } from "@gtsx/core"

import { ThemeProvider } from "./UserCard.g"

export function ImportedProviderPanel() {
  return <span>Imported provider</span>
}

ImportedProviderPanel.cases = {
  light: {
    props: {},
    providers: [[ThemeProvider, { mode: "light" }]],
  },
} satisfies GCases<React.ComponentProps<typeof ImportedProviderPanel>, never, [typeof ThemeProvider]>
