import type { GFrames } from "@runelight/core"

export default function InstallSection() {
  return (
    <section className="design-frame design-install-console">
      <div className="design-install-copy">
        <p className="site-eyebrow">Install with one prompt</p>
        <h2>Give your agent a visual workspace without leaving the repo.</h2>
        <p>The setup flow detects the host, wires Studio, creates preview routes, and verifies the first frames.</p>
      </div>

      <div className="design-console-stack">
        <header>
          <span>agent prompt</span>
          <strong>ready to paste</strong>
        </header>
        <pre>{`Install or upgrade Runelight in this project.

Fetch skills/setup-runelight from the Runelight repo,
install it as a project-level skill,
then run setup-runelight and verify Studio.`}</pre>
        <div className="design-install-checks">
          <span>detect host</span>
          <span>wire preview</span>
          <span>run check</span>
        </div>
      </div>
    </section>
  )
}

InstallSection.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
