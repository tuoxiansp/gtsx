import type { GFrames } from "@runelight/core"

export default function StudioShowcase() {
  return (
    <section className="design-frame design-studio-wall">
      <div className="design-studio-wall-copy">
        <p className="site-eyebrow">This site in Studio</p>
        <h2>A real branch map, not a marketing diagram.</h2>
        <p>Design frames sit beside component frames so the public website can be reviewed like product UI.</p>
      </div>

      <div className="design-studio-board">
        <div className="design-studio-column">
          <span className="studio-frame-heading">design</span>
          <span className="studio-frame-chip design-chip">HeroNarrative</span>
          <span className="studio-frame-chip design-chip">ProofPanel</span>
          <span className="studio-frame-chip design-chip">CaptureMatrix</span>
          <span className="studio-frame-chip design-chip">AgentReviewBoard</span>
        </div>
        <div className="design-studio-column is-wide">
          <span className="studio-frame-heading">components</span>
          <span className="studio-frame-chip component-chip">AuthCase</span>
          <span className="studio-frame-chip component-chip">AnonymousWorkspaceCard</span>
          <span className="studio-frame-chip component-chip">InboxReviewQueue</span>
          <span className="studio-frame-chip component-chip">PermissionMetric</span>
        </div>
        <div className="design-studio-inspector">
          <span>selected</span>
          <strong>DataCase / populated</strong>
          <p>3 child surfaces, 3 rendered rows, desktop viewport</p>
        </div>
      </div>
    </section>
  )
}

StudioShowcase.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
