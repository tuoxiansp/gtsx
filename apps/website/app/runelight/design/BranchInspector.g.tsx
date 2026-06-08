import type { GFrames } from "@runelight/core"

export default function BranchInspector() {
  return (
    <section className="design-frame design-inspector-frame">
      <header className="design-frame-header">
        <p className="site-eyebrow">Branch inspector</p>
        <h2>Selection should explain why this UI exists.</h2>
      </header>

      <div className="design-inspector-layout">
        <article className="design-inspector-preview">
          <span className="case-branch-tag">signed-in</span>
          <strong>Ada Lovelace</strong>
          <p>Preview systems engineer</p>
          <div className="case-meta-row">
            <span>Workspace ready</span>
            <span className="case-action case-action-secondary">Open Studio</span>
          </div>
        </article>
        <aside className="design-inspector-panel">
          <span>selected frame</span>
          <strong>AuthCase.signedIn</strong>
          <dl>
            <div>
              <dt>provider</dt>
              <dd>SessionProvider</dd>
            </div>
            <div>
              <dt>variant</dt>
              <dd>signed-in</dd>
            </div>
            <div>
              <dt>children</dt>
              <dd>SignedInWorkspaceCard</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  )
}

BranchInspector.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
