import { createGProvider, useGContext, type GFrames, type GProviderFrame } from "@runelight/react/runtime"

type AuthCaseProps = {
  productName: string
}

type AuthSurfaceProps = {
  productName: string
}

type SignedInSurfaceProps = AuthSurfaceProps & {
  role: string
  userName: string
}

type SessionState =
  | { variant: "anonymous" }
  | { variant: "signed-in"; user: { name: string; role: string } }

export const SessionProvider = createGProvider(
  () => [{ variant: "anonymous" } as SessionState, () => {}] as const,
  { variants: ["anonymous", "signed-in"] as const },
)

export default function AuthCase(props: AuthCaseProps) {
  const session = useGContext(SessionProvider)

  if (session.variant === "anonymous") {
    return <AnonymousWorkspaceCard productName={props.productName} />
  }

  return (
    <SignedInWorkspaceCard
      productName={props.productName}
      role={session.user.role}
      userName={session.user.name}
    />
  )
}

export function AnonymousWorkspaceCard(props: AuthSurfaceProps) {
  return (
    <section className="case-surface case-auth case-auth-anonymous" data-branch="anonymous">
      <header className="case-header">
        <span className="case-branch-tag">anonymous</span>
        <strong>{props.productName}</strong>
      </header>
      <h2>Sign in to open your workspace</h2>
      <p>Your agent can declare anonymous and signed-in branches without switching accounts in the host app.</p>
      <div className="case-auth-detail-grid">
        <span>Provider variant</span>
        <strong>SessionProvider.anonymous</strong>
      </div>
      <span className="case-action case-action-primary">Continue with GitHub</span>
    </section>
  )
}

export function SignedInWorkspaceCard(props: SignedInSurfaceProps) {
  return (
    <section className="case-surface case-auth case-auth-signed-in" data-branch="signed-in">
      <header className="case-header">
        <span className="case-branch-tag">signed-in</span>
        <strong>{props.productName}</strong>
      </header>
      <h2>{props.userName}</h2>
      <p>{props.role}</p>
      <div className="case-auth-detail-grid">
        <span>Provider variant</span>
        <strong>SessionProvider.signed-in</strong>
      </div>
      <div className="case-meta-row">
        <span>Workspace ready</span>
        <span className="case-action case-action-secondary">Open Studio</span>
      </div>
    </section>
  )
}

AuthCase.frames = {
  anonymous: {
    description: "anonymous frame",
    props: { productName: "Runelight" },
    providers: [[SessionProvider, { variant: "anonymous" }]],
  } satisfies GProviderFrame<typeof SessionProvider, "anonymous">,
  signedIn: {
    description: "signedIn frame",
    props: { productName: "Runelight" },
    providers: [[SessionProvider, { variant: "signed-in", user: { name: "Ada Lovelace", role: "Preview systems engineer" } }]],
  } satisfies GProviderFrame<typeof SessionProvider, "signed-in">,
} satisfies GFrames<AuthCaseProps>

AnonymousWorkspaceCard.frames = {
  default: {
    description: "default frame",
    props: { productName: "Runelight" },
  },
} satisfies GFrames<AuthSurfaceProps>

SignedInWorkspaceCard.frames = {
  ready: {
    description: "ready frame",
    props: {
      productName: "Runelight",
      role: "Preview systems engineer",
      userName: "Ada Lovelace",
    },
    providers: [[SessionProvider, { variant: "signed-in", user: { name: "Ada Lovelace", role: "Preview systems engineer" } }]],
  } satisfies GProviderFrame<typeof SessionProvider, "signed-in">,
} satisfies GFrames<SignedInSurfaceProps>
