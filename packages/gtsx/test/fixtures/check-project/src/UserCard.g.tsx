import {
  createGScope,
  useGContext,
  type GCases,
  type GProviderCases,
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
} satisfies GProviderCases<ThemeScope>

function useRealUserCardScope(_props: Props, _theme: ThemeScope): Scope {
  return { status: "loading" }
}

const useUserCardGScope = createGScope(useRealUserCardScope)

export default function UserCard(props: Props) {
  const theme = useGContext(ThemeGTSXProvider)
  const scope = useUserCardGScope(props, theme)

  return <span>{scope.status}</span>
}

UserCard.cases = {
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
} satisfies GCases<Props, Scope, [typeof ThemeGTSXProvider]>
