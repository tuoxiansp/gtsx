import type { GFrames } from "@runelight/core"

export default function ProofPanel() {
  return (
    <section className="design-frame design-proof-lab">
      <header className="design-frame-header">
        <p className="site-eyebrow">Proof panels</p>
        <h2>Every rendered state has a source reason.</h2>
      </header>

      <div className="design-proof-lab-grid">
        <article className="design-code-slab">
          <span>01 condition</span>
          <pre>{`const session = useGContext(SessionProvider)

if (session.variant === "anonymous") {
  return <AnonymousWorkspaceCard />
}

return <SignedInWorkspaceCard />`}</pre>
        </article>
        <article className="design-code-slab">
          <span>02 frame</span>
          <pre>{`AuthCase.frames = {
  anonymous: {
    providers: [[SessionProvider, {
      variant: "anonymous"
    }]],
  },
  signedIn: { ... },
}`}</pre>
        </article>
        <article className="design-render-proof">
          <span>03 visual output</span>
          <div className="design-render-card">
            <strong>anonymous</strong>
            <p>Sign in to open your workspace</p>
          </div>
          <div className="design-render-card is-selected">
            <strong>signed-in</strong>
            <p>Ada Lovelace, workspace ready</p>
          </div>
        </article>
      </div>
    </section>
  )
}

ProofPanel.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
