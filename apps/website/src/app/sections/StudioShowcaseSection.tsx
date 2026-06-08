import { captureAssets } from "../../assets/captures"
import { CaptureImage } from "../components/CaptureImage"
import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type StudioShowcaseSectionProps = {
  content: SiteContent["studioShowcase"]
}

export function StudioShowcaseSection({ content }: StudioShowcaseSectionProps) {
  return (
    <section className="site-section studio-showcase-section" id="studio">
      <SectionIndex value="06" label="studio" />
      <div className="studio-showcase-stage">
        <div className="studio-showcase-copy">
          <p className="site-eyebrow">{content.eyebrow}</p>
          <h2>{content.headline}</h2>
          <p className="section-lead">{content.body}</p>
          <div className="hero-actions">
            <a className="site-button site-button-primary site-button-large" href={content.primaryCta.href}>
              {content.primaryCta.label}
            </a>
            <a className="site-button site-button-secondary site-button-large" href={content.secondaryCta.href}>
              {content.secondaryCta.label}
            </a>
          </div>
        </div>

        <div className="studio-showcase-visual">
          <CaptureImage
            src={captureAssets.studioDesignStrip}
            alt="Runelight Studio design workspace for the Runelight website project"
            className="studio-board-shot"
            variant="studio"
          />
        </div>
      </div>
    </section>
  )
}
