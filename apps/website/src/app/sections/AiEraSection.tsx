import { captureAssets } from "../../assets/captures"
import { CaptureImage } from "../components/CaptureImage"
import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type AiEraSectionProps = {
  content: SiteContent["aiEra"]
}

export function AiEraSection({ content }: AiEraSectionProps) {
  return (
    <section className="site-section ai-era-section">
      <SectionIndex value="01" label="ai-era gui" />
      <div className="ai-era-stage">
        <div className="ai-era-copy">
          <p className="site-eyebrow">{content.eyebrow}</p>
          <h2>{content.headline}</h2>
          <p className="section-lead">{content.body}</p>
          <ul className="signal-list">
            {content.bullets.map((bullet, index) => (
              <li key={bullet}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {bullet}
              </li>
            ))}
          </ul>
        </div>
        <div className="ai-era-visual">
          <CaptureImage
            src={captureAssets.studioComponentsFocus}
            alt="Runelight Studio component workspace expanded from DataCase to child visual surfaces"
            className="ai-era-design-shot"
            variant="studio"
          />
        </div>
      </div>
    </section>
  )
}
