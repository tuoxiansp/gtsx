import {
  createGProvider,
  useGContext,
  type GFrames,
  type GProviderFrame,
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

MissingProviderVariant.frames = {
  login: {
    props: {},
    providers: [[LoginProvider, { kind: "login", name: "Ada" }]],
  } satisfies GProviderFrame<typeof LoginProvider, "login">,
} satisfies GFrames<Record<string, never>, never, [typeof LoginProvider]>
