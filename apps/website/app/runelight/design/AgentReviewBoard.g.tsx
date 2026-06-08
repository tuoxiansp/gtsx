import type { GFrames } from "@runelight/core"

export default function AgentReviewBoard() {
  return (
    <section className="design-frame design-review-board">
      <div className="design-review-copy">
        <p className="site-eyebrow">Human and agent review</p>
        <h2>One board for intent, implementation, and visual proof.</h2>
      </div>

      <div className="design-review-lanes">
        <article>
          <span>agent task</span>
          <strong>Add permission-aware settings</strong>
          <p>Frames required: viewer, admin, disabled save, overflow.</p>
        </article>
        <article className="is-active">
          <span>studio review</span>
          <strong>Admin branch selected</strong>
          <p>Provider variant and rendered controls match the source declaration.</p>
        </article>
        <article>
          <span>capture proof</span>
          <strong>4 screenshots exported</strong>
          <p>Attached to PR before merge.</p>
        </article>
      </div>
    </section>
  )
}

AgentReviewBoard.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
