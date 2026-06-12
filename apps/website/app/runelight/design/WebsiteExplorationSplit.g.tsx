import type { GFrames } from "@runelight/react/runtime"

import { WebsiteBrowserShell } from "./browser-shell"

export default function WebsiteExplorationSplit() {
  return (
    <WebsiteBrowserShell label="Direction B · Split manifesto" pageClassName="wd-split">
      <div className="wd-split-slash" aria-hidden="true" />

      <section className="wd-split-copy">
        <p className="wd-split-index">01 / website</p>
        <h1>
          Every
          <br />
          UI state.
          <br />
          <span>One screen.</span>
        </h1>
        <p>Source declares branches. Studio renders them all. GitHub is the front door.</p>
        <span className="wd-split-cta">github.com/tuoxiansp/runelight →</span>
      </section>

      <section className="wd-split-visual" aria-label="Studio collage">
        <div className="wd-split-tile wd-split-tile-a">
          <span>AuthCase</span>
          <strong>anonymous · signed-in</strong>
        </div>
        <div className="wd-split-tile wd-split-tile-b">
          <span>DataCase</span>
          <strong>empty · ready · error</strong>
        </div>
        <div className="wd-split-tile wd-split-tile-c">
          <span>Studio</span>
          <strong>all frames · one URL</strong>
        </div>
      </section>
    </WebsiteBrowserShell>
  )
}

WebsiteExplorationSplit.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
