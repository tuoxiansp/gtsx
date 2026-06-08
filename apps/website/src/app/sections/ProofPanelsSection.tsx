import { useState } from "react"

import { captureAssets } from "../../assets/captures"
import { CaptureImage } from "../components/CaptureImage"
import { SectionIndex } from "../components/SectionIndex"
import type { ProofPanelCaseId, SiteContent } from "../../content/site-content"

const proofCaptures: Record<ProofPanelCaseId, string> = captureAssets.proof

type ProofPanelsSectionProps = {
  content: SiteContent["proofPanels"]
}

export function ProofPanelsSection({ content }: ProofPanelsSectionProps) {
  const [activeCase, setActiveCase] = useState<ProofPanelCaseId>("data")
  const selected = content.cases.find((item) => item.id === activeCase) ?? content.cases[0]

  return (
    <section className="site-section proof-section" id="proof">
      <SectionIndex value="03" label="proof" />
      <div className="proof-layout-stage">
        <aside className="proof-rail">
          <div className="proof-rail-heading">
            <p className="site-eyebrow">{content.eyebrow}</p>
            <h2>{content.headline}</h2>
            <p className="section-lead">{content.body}</p>
          </div>

          <div className="proof-selector" role="tablist" aria-label="Proof panel cases">
            {content.cases.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === activeCase}
                className={item.id === activeCase ? "is-active" : undefined}
                onClick={() => setActiveCase(item.id)}
              >
                <span className="proof-selector-index">{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.title}</strong>
                <span>{item.summary}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="proof-panel" role="tabpanel">
          <div className="proof-panel-top">
            <div>
              <h3>{selected.title}</h3>
              <p>{selected.summary}</p>
            </div>
            <div className="branch-pills">
              {selected.branchLabels.map((label) => (
                <span key={label} className="branch-pill">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="proof-code-rail">
            <article className="proof-code-stage">
              <header>
                <span>01</span>
                <strong>Code branch</strong>
              </header>
              <pre>
                <code>{selected.sourceCode}</code>
              </pre>
            </article>
            <article className="proof-code-stage">
              <header>
                <span>02</span>
                <strong>Frame declaration</strong>
              </header>
              <pre>
                <code>{selected.frameDeclaration}</code>
              </pre>
            </article>
          </div>

          <div className="proof-render-block">
            <header>
              <span>03</span>
              <strong>Studio rendering</strong>
            </header>
            <div className="proof-render-frame">
              <CaptureImage
                src={proofCaptures[selected.id]}
                alt={`${selected.title} contact sheet captured with runelight capture`}
                className="proof-render-shot"
                variant="case"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
