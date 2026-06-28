import type { GFrames } from "@runelight/react/runtime"

import { WebsiteBrowserShell } from "./browser-shell"

export default function WebsiteExplorationVertical() {
  return (
    <WebsiteBrowserShell label="Direction A · Vertical calm" pageClassName="wd-vertical">
      <header className="wd-vertical-brand">
        <i aria-hidden="true" />
        Runelight
      </header>

      <section className="wd-vertical-hero">
        <p className="wd-vertical-kicker">The visual workspace for agent-built apps</p>
        <h1>
          Every UI
          <em>state</em>
          One screen.
        </h1>
        <p className="wd-vertical-payoff">
          Design, build, and review agent-built UI without clicking through your app.
        </p>
      </section>

      <section className="wd-vertical-shot" aria-label="Studio preview">
        <img src="/captures/studio-components.png" alt="" />
        <span>/runelight/studio</span>
      </section>

      <footer className="wd-vertical-footer">
        <span className="wd-vertical-cta">View on GitHub →</span>
        <span className="wd-vertical-hint">Install with one agent prompt · React & Vue</span>
      </footer>
    </WebsiteBrowserShell>
  )
}

WebsiteExplorationVertical.frames = {
  live: { description: "Vertical website exploration draft", props: {} },
} satisfies GFrames<Record<string, never>>
