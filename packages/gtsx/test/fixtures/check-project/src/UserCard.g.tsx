import {
  createGProvider,
  createGScopeHook,
  type GCases,
} from "@gtsx/core"

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

UserCard.cases = {
  loading: {
    props: { userId: "user_1" },
    providers: [[ThemeProvider, { mode: "light" }]],
    scope: { status: "loading" },
  },
  ready: {
    props: { userId: "user_1" },
    providers: [[ThemeProvider, { mode: "dark" }]],
    scope: { status: "ready", title: "Ada Lovelace", onOpen: () => {} },
  },
} satisfies GCases<Props, Scope, typeof providers>
