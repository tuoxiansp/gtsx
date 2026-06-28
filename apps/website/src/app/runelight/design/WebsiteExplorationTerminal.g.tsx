import type { GFrames } from "@runelight/react/runtime"

import { WebsiteBrowserShell } from "./browser-shell"

export default function WebsiteExplorationTerminal() {
  return (
    <WebsiteBrowserShell label="Direction C · Terminal gate" url="runelight.ai" pageClassName="wd-terminal">
      <header className="wd-terminal-bar">
        <span>runelight — zsh</span>
        <span>127.0.0.1</span>
      </header>

      <section className="wd-terminal-body">
        <p>
          <span className="wd-terminal-prompt">agent@repo</span> runelight serve
        </p>
        <p className="wd-terminal-muted">→ serving /runelight/studio through the project Host</p>
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
    </WebsiteBrowserShell>
  )
}

WebsiteExplorationTerminal.frames = {
  live: { description: "Terminal-style website exploration draft", props: {} },
} satisfies GFrames<Record<string, never>>
