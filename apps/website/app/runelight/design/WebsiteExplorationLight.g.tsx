import type { GFrames } from "@runelight/core"

export default function WebsiteExplorationLight() {
  return (
    <main className="wd-explore wd-light">
      <span className="wd-explore-label wd-explore-label-dark">Direction D · Light catalog</span>

      <header className="wd-light-top">
        <span>Runelight</span>
        <span>2026</span>
      </header>

      <section className="wd-light-hero">
        <h1>
          The visual workspace
          <br />
          for agent-built apps.
        </h1>
        <hr />
        <p>
          Typed frames live beside source. Studio shows every branch at once. Review before merge — not after
          clicking through flows.
        </p>
      </section>

      <section className="wd-light-strip" aria-label="Pipeline">
        <article>
          <span>01</span>
          <strong>.g source</strong>
        </article>
        <article>
          <span>02</span>
          <strong>Studio</strong>
        </article>
        <article>
          <span>03</span>
          <strong>GitHub</strong>
        </article>
      </section>

      <footer className="wd-light-footer">
        <span>View on GitHub</span>
        <span>React · Vue 3</span>
      </footer>
    </main>
  )
}

WebsiteExplorationLight.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
