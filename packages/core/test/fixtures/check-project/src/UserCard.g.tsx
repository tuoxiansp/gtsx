import {
  createGProvider,
  createGScopeHook,
  type GFrames,
  type GProviderFrame,
} from "@runelight/core"

export type Props = {
  userId: string
}

export type ThemeScope = {
  mode: "light" | "dark"
}

export type Scope =
  | { status: "loading" }
  | { status: "ready"; title: string; onOpen: () => void }

export const ThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeScope>({ mode: "light" }),
  { variants: ["light", "dark"] as const },
)

const providers = [ThemeProvider] as const

function useRealUserCardScope(_props: Props, [_theme]: [ThemeScope]): Scope {
  return { status: "loading" }
}

const useUserCardGScope = createGScopeHook(useRealUserCardScope, providers)

export default function UserCard(props: Props) {
  const scope = useUserCardGScope(props)

  return <span>{scope.status}</span>
}

UserCard.frames = {
  loading: {
    props: { userId: "user_1" },
    providers: [[ThemeProvider, { mode: "light" }]],
    scope: { status: "loading" },
  } satisfies GProviderFrame<typeof ThemeProvider, "light">,
  ready: {
    props: { userId: "user_1" },
    providers: [[ThemeProvider, { mode: "dark" }]],
    scope: { status: "ready", title: "Ada Lovelace", onOpen: () => {} },
  } satisfies GProviderFrame<typeof ThemeProvider, "dark">,
} satisfies GFrames<Props, Scope, typeof providers>
