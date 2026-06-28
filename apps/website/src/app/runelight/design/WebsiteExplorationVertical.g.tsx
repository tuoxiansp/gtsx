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
        <p className="wd-vertical-kicker">The visual feedback loop for agent-polished UI</p>
        <h1>
          See it
          <em>change it</em>
          see it again.
        </h1>
        <p className="wd-vertical-payoff">
          Observe, polish, and verify Runelight-covered UI without clicking through your app.
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
