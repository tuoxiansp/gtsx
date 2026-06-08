import { useState } from "react"

import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type InstallSectionProps = {
  content: SiteContent["install"]
}

export function InstallSection({ content }: InstallSectionProps) {
  const [copied, setCopied] = useState(false)

  async function copyPrompt() {
    await navigator.clipboard.writeText(content.prompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="site-section install-section" id="install">
      <SectionIndex value="07" label="install" />
      <div className="install-stage">
        <div className="install-copy">
          <p className="site-eyebrow">{content.eyebrow}</p>
          <h2>{content.headline}</h2>
          <p className="section-lead">{content.body}</p>

          <div className="install-meta">
            <div>
              <h3>{content.exitHeadline}</h3>
              <p>{content.exitBody}</p>
            </div>
          </div>
        </div>

        <div className="install-prompt-stack">
          <div className="install-prompt-panel">
            <div className="install-prompt-header">
              <span>One prompt</span>
              <button type="button" className="site-button site-button-ghost" onClick={() => void copyPrompt()}>
                {copied ? content.copiedLabel : content.copyLabel}
              </button>
            </div>
            <pre className="install-prompt-body">
              <code>{content.prompt}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
