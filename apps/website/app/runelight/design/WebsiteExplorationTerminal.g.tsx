import type { GFrames } from "@runelight/core"

export default function WebsiteExplorationTerminal() {
  return (
    <main className="wd-explore wd-terminal">
      <span className="wd-explore-label">Direction C · Terminal gate</span>

      <header className="wd-terminal-bar">
        <span>runelight — zsh</span>
        <span>127.0.0.1</span>
      </header>

      <section className="wd-terminal-body">
        <p>
          <span className="wd-terminal-prompt">agent@repo</span> runelight init --react
        </p>
        <p className="wd-terminal-muted">→ wiring /runelight/studio</p>
        <p className="wd-terminal-muted">→ declaring .g frames beside components</p>
        <p className="wd-terminal-out">
          <strong>Every UI state on one screen.</strong>
        </p>
        <p className="wd-terminal-muted">auth · empty · admin · overflow — rendered without navigation</p>
        <p>
          <span className="wd-terminal-prompt">agent@repo</span> open{" "}
          <span className="wd-terminal-link">https://github.com/tuoxiansp/runelight</span>
        </p>
        <p className="wd-terminal-cursor" aria-hidden="true">
          ▌
        </p>
      </section>
    </main>
  )
}

WebsiteExplorationTerminal.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
