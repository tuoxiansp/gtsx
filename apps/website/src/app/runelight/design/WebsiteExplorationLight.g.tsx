import type { GFrames } from "@runelight/react/runtime"

import { WebsiteBrowserShell } from "./browser-shell"

export default function WebsiteExplorationLight() {
  return (
    <WebsiteBrowserShell label="Direction D · Light catalog" pageClassName="wd-light">
      <header className="wd-light-top">
        <span>Runelight</span>
        <span>2026</span>
      </header>

      <section className="wd-light-hero">
        <h1>
          The visual feedback loop
          <br />
          for agent-polished UI.
        </h1>
        <hr />
        <p>
          Typed frames live beside source. Agents observe exact preview targets, edit source, and re-observe before
          merge.
        </p>
      </section>

      <section className="wd-light-strip" aria-label="Pipeline">
        <article>
          <span>01</span>
          <strong>.g source</strong>
        </article>
        <article>
          <span>02</span>
          <strong>observe</strong>
        </article>
        <article>
          <span>03</span>
          <strong>polish</strong>
        </article>
      </section>

      <footer className="wd-light-footer">
        <span>View on GitHub</span>
        <span>React · Vue 3</span>
      </footer>
    </WebsiteBrowserShell>
  )
}

WebsiteExplorationLight.frames = {
  live: { description: "Light website exploration draft", props: {} },
} satisfies GFrames<Record<string, never>>
