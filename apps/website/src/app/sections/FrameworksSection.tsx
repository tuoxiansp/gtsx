import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type FrameworksSectionProps = {
  content: SiteContent["frameworks"]
}

export function FrameworksSection({ content }: FrameworksSectionProps) {
  return (
    <section className="site-section frameworks-section">
      <div className="frameworks-stage">
        <div className="frameworks-heading">
          <p className="site-eyebrow">{content.eyebrow}</p>
          <h2>{content.headline}</h2>
          <p className="section-lead">{content.body}</p>
        </div>

        <div className="framework-grid">
          {content.hosts.map((host, index) => (
            <article key={host.name} className="framework-card">
              <span className="framework-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{host.name}</h3>
              <p>{host.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
