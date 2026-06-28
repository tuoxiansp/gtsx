import type { GFrames } from "@runelight/react/runtime"

import { WebsiteBrowserShell } from "./browser-shell"

export default function WebsiteExplorationSplit() {
  return (
    <WebsiteBrowserShell label="Direction B · Split manifesto" pageClassName="wd-split">
      <div className="wd-split-slash" aria-hidden="true" />

      <section className="wd-split-copy">
        <p className="wd-split-index">01 / website</p>
        <h1>
          Observe
          <br />
          polish
          <br />
          <span>verify.</span>
        </h1>
        <p>Source declares frames. Studio and capture give agents the loop before merge.</p>
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
          <strong>covered frames · one URL</strong>
        </div>
      </section>
    </WebsiteBrowserShell>
  )
}

WebsiteExplorationSplit.frames = {
  live: { description: "Split-layout website exploration draft", props: {} },
} satisfies GFrames<Record<string, never>>
