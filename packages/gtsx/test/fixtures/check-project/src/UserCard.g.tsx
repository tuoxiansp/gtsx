import {
  createGTSXScope,
  useGTSXContext,
  type GTSXProviderCases,
  type GTSXScopeCases,
} from "gtsx"

export type Props = {
  userId: string
}

export type ThemeScope = {
  mode: "light" | "dark"
}

export type Scope =
  | { status: "loading" }
  | { status: "ready"; title: string; onOpen: () => void }

export function ThemeGTSXProvider(props: { value?: ThemeScope; children: React.ReactNode }) {
  return <>{props.children}</>
}

ThemeGTSXProvider.cases = {
  light: { value: { mode: "light" } },
  dark: { value: { mode: "dark" } },
} satisfies GTSXProviderCases<ThemeScope>

function useRealUserCardScope(_props: Props, _theme: ThemeScope): Scope {
  return { status: "loading" }
}

const useUserCardScopeForGTSX = createGTSXScope(useRealUserCardScope)

useUserCardScopeForGTSX.cases = {
  loading: {
    props: { userId: "user_1" },
    providers: { ThemeGTSXProvider: "light" },
    scope: { status: "loading" },
  },
  ready: {
    props: { userId: "user_1" },
    providers: { ThemeGTSXProvider: "dark" },
    scope: { status: "ready", title: "Ada Lovelace", onOpen: () => {} },
  },
} satisfies GTSXScopeCases<Props, Scope, [typeof ThemeGTSXProvider]>

export default function UserCard(props: Props) {
  const theme = useGTSXContext(ThemeGTSXProvider)
  const scope = useUserCardScopeForGTSX(props, theme)

  return <span>{scope.status}</span>
}
