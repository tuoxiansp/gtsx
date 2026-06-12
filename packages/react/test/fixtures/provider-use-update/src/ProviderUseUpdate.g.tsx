import React from "react"
import { createGProvider, type GFrames } from "@runelight/react/runtime"

type ThemeValue = {
  tone: "light" | "dark"
}

const ThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeValue>({ tone: "light" }),
)

export default function ProviderUseUpdate() {
  // @ts-expect-error Provider update is read through useGContextUpdate(Provider), not a provider property.
  const updateTheme = ThemeProvider.useUpdate()
  return <button onClick={() => updateTheme({ tone: "dark" })}>Dark</button>
}

ProviderUseUpdate.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
