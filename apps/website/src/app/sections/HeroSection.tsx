import { captureAssets } from "../../assets/captures"
import { CaptureImage } from "../components/CaptureImage"
import { SectionIndex } from "../components/SectionIndex"
import type { SiteContent } from "../../content/site-content"

type HeroSectionProps = {
  content: SiteContent["hero"]
}

export function HeroSection({ content }: HeroSectionProps) {
  return (
    <section className="site-section hero-section" id="top">
      <SectionIndex value="00" label="visual model" />
      <div className="hero-stage">
        <div className="hero-copy-block">
          <p className="site-eyebrow">Source-level visual model</p>
          <h1>{content.headline}</h1>
          <p className="hero-subhead">{content.subhead}</p>
          <div className="hero-actions">
            <a className="site-button site-button-primary site-button-large" href={content.primaryCta.href}>
              {content.primaryCta.label}
            </a>
            <a className="site-button site-button-secondary site-button-large" href={content.secondaryCta.href}>
              {content.secondaryCta.label}
            </a>
          </div>
        </div>

        <div className="hero-visual-block">
          <div className="hero-visual-frame">
            <CaptureImage
              src={captureAssets.hero}
              alt="Runelight source-to-Studio visual branch map captured from this project"
              className="hero-constellation-shot"
              variant="hero"
            />
            <div className="hero-visual-caption">
              <span>/runelight/studio</span>
              <strong>Source frames rendered into a branch map</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
