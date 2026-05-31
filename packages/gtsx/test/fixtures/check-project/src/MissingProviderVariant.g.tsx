import {
  createGProvider,
  useGContext,
  type GCases,
  type GProviderCase,
} from "@gtsx/core"

type LoginState =
  | { kind: "login"; name: string }
  | { kind: "anonymous" }

export const LoginProvider = createGProvider(
  (_props: Record<string, never>) => [{ kind: "anonymous" } as LoginState, () => {}] as const,
  { variants: ["login", "anonymous"] as const },
)

export default function MissingProviderVariant() {
  const login = useGContext(LoginProvider)
  return <span>{login.kind === "login" ? login.name : "Guest"}</span>
}

MissingProviderVariant.cases = {
  login: {
    props: {},
    providers: [[LoginProvider, { kind: "login", name: "Ada" }]],
  } satisfies GProviderCase<typeof LoginProvider, "login">,
} satisfies GCases<Record<string, never>, never, [typeof LoginProvider]>
