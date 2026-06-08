import { captureAssets } from "../../assets/captures"
import { CaptureImage } from "../components/CaptureImage"
import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type SharedContextSectionProps = {
  content: SiteContent["sharedContext"]
}

export function SharedContextSection({ content }: SharedContextSectionProps) {
  return (
    <section className="site-section shared-context-section">
      <SectionIndex value="04" label="shared context" />
      <div className="shared-context-stage">
        <div className="shared-context-heading">
          <p className="site-eyebrow">{content.eyebrow}</p>
          <h2>{content.headline}</h2>
          <p className="section-lead">{content.body}</p>
        </div>

        <div className="context-collage">
          <article className="context-card context-card-design">
            <span className="context-label">{content.designLabel}</span>
            <p>Sketch direction before code hardens.</p>
            <CaptureImage
              src={captureAssets.studioDesignStrip}
              alt="Design frames for this website in Runelight Studio"
              className="context-design-shot"
              variant="studio"
            />
          </article>

          <div className="context-bridge-mark">
            <span>{content.bridgeLabel}</span>
          </div>

          <article className="context-card context-card-component">
            <span className="context-label">{content.componentLabel}</span>
            <p>Prove the branches your UI ships.</p>
            <CaptureImage
              src={captureAssets.studioComponentsFocus}
              alt="Component frames expanded into child surfaces in Runelight Studio"
              className="context-component-shot"
              variant="studio"
            />
          </article>
        </div>
      </div>
    </section>
  )
}
