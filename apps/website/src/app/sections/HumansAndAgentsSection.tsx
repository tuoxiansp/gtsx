import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type HumansAndAgentsSectionProps = {
  content: SiteContent["humansAndAgents"]
}

export function HumansAndAgentsSection({ content }: HumansAndAgentsSectionProps) {
  return (
    <section className="site-section humans-agents-section">
      <SectionIndex value="05" label="review surface" />
      <div className="humans-agents-stage">
        <div className="humans-agents-heading">
          <p className="site-eyebrow">{content.eyebrow}</p>
          <h2>{content.headline}</h2>
          <p className="section-lead">{content.body}</p>
        </div>

        <div className="dual-split">
          <article className="dual-card dual-card-human">
            <span className="dual-card-tag human-tag">Human</span>
            <h3>{content.humanCard.title}</h3>
            <p>{content.humanCard.body}</p>
          </article>
          <article className="dual-card dual-card-agent">
            <span className="dual-card-tag agent-tag">Agent</span>
            <h3>{content.agentCard.title}</h3>
            <p>{content.agentCard.body}</p>
          </article>
        </div>
      </div>
    </section>
  )
}
