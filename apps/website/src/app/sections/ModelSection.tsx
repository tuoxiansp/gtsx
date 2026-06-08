import { captureAssets } from "../../assets/captures"
import { CaptureImage } from "../components/CaptureImage"
import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type ModelSectionProps = {
  content: SiteContent["model"]
}

export function ModelSection({ content }: ModelSectionProps) {
  return (
    <section className="site-section model-section" id="model">
      <SectionIndex value="02" label="the model" />
      <div className="model-stage">
        <div className="model-intro">
          <p className="site-eyebrow">{content.eyebrow}</p>
          <h2>{content.headline}</h2>
          <p className="section-lead">{content.body}</p>
        </div>

        <div className="model-bento">
          {content.pillars.map((pillar, index) => (
            <article key={pillar.title} className={`pillar-card pillar-card-${index + 1}`}>
              <span className="pillar-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
              {pillar.detail ? <span className="pillar-detail">{pillar.detail}</span> : null}
            </article>
          ))}
        </div>

        <div className="model-rail-shot">
          <CaptureImage
            src={captureAssets.studioComponentsFocus}
            alt="Focused Runelight Studio drilldown from DataCase to InboxReviewQueue and InboxTaskRow"
            className="model-triptych-shot"
            variant="studio"
          />
        </div>
      </div>
    </section>
  )
}
