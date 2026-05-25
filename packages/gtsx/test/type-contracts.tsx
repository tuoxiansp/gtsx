import React from "react"

import { createGProvider, type GCases } from "../src/index.js"

type Props = {
  userId: string
}

type Scope = {
  title: string
}

type ThemeState = {
  color: string
}

const ThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeState>({ color: "#111" }),
)
const CounterProvider = createGProvider((_props: Record<string, never>) => React.useState(0))
const providers = [ThemeProvider, CounterProvider] as const

const validCases = {
  ready: {
    props: { userId: "user_1" },
    providers: [
      [ThemeProvider, { color: "#0af" }],
      [CounterProvider, 42],
    ],
    scope: { title: "Ada" },
  },
} satisfies GCases<Props, Scope, typeof providers>

void validCases

const wrongOrderCases = {
  ready: {
    props: { userId: "user_1" },
    providers: [
      // @ts-expect-error provider entries must match the declared provider order.
      [CounterProvider, 42],
      // @ts-expect-error provider entries must match the declared provider order.
      [ThemeProvider, { color: "#0af" }],
    ],
    scope: { title: "Ada" },
  },
} satisfies GCases<Props, Scope, typeof providers>

void wrongOrderCases
