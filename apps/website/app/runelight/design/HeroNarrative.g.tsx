import type { GFrames } from "@runelight/core"

export default function HeroNarrative() {
  return (
    <main className="design-frame design-hero-folio">
      <section className="design-hero-folio-copy">
        <p className="site-eyebrow">Source-level visual model</p>
        <h1>Declare the branches. Inspect the interface.</h1>
        <p>
          Runelight turns the states an agent can reason about into a Studio canvas people can inspect,
          compare, and capture from the same source tree.
        </p>
        <div className="design-action-row">
          <span className="site-button site-button-primary site-button-large">Install with one prompt</span>
          <span className="site-button site-button-secondary site-button-large">Open Studio</span>
        </div>
      </section>

      <section className="design-hero-folio-visual" aria-label="Branch map preview">
        <div className="design-branch-map-card design-branch-map-card-main">
          <span>AuthCase</span>
          <strong>anonymous / signed-in</strong>
          <i />
        </div>
        <div className="design-branch-map-card design-branch-map-card-side">
          <span>DataCase</span>
          <strong>empty / ready / error</strong>
          <i />
        </div>
        <div className="design-branch-map-card design-branch-map-card-low">
          <span>LayoutCase</span>
          <strong>comfortable / compact / overflow</strong>
          <i />
        </div>
        <div className="design-proof-strip">
          <span>source</span>
          <span>studio</span>
          <span>capture</span>
        </div>
      </section>
    </main>
  )
}

HeroNarrative.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
