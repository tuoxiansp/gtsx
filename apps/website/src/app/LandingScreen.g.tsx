import type { GFrames } from "@runelight/react/runtime"

import { captureAssets } from "../assets/captures"
import { siteContent } from "../content/site-content"

type EmptyProps = Record<string, never>

export function LandingScreen() {
  return (
    <div className="landing">
      <LandingBackground />
      <LandingHeader />

      <main className="landing-main">
        <LandingHero />
        <LandingVisualProof />
        <LandingCta />
      </main>

      <LandingFooter />
    </div>
  )
}

LandingScreen.frames = {
  live: { description: "Complete landing page with all sections", props: {} },
} satisfies GFrames<EmptyProps>

function LandingBackground() {
  return (
    <>
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-slash" aria-hidden="true" />
    </>
  )
}

export function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-brand">
        <span className="landing-brand-mark" aria-hidden="true" />
        <span>{siteContent.productName}</span>
      </div>
    </header>
  )
}

LandingHeader.frames = {
  live: { description: "Landing header with Runelight brand", props: {} },
} satisfies GFrames<EmptyProps>

export function LandingHero() {
  return (
    <section className="landing-hero">
      <p className="landing-kicker">{siteContent.kicker}</p>
      <h1 className="landing-headline">
        <span>{siteContent.headline.lead}</span>
        <span>{siteContent.headline.emphasis}</span>
        <span className="landing-headline-emphasis">{siteContent.headline.tail}</span>
      </h1>
      <p className="landing-payoff">{siteContent.story.payoff}</p>
    </section>
  )
}

LandingHero.frames = {
  live: { description: "Landing hero headline and payoff copy", props: {} },
} satisfies GFrames<EmptyProps>

export function LandingVisualProof() {
  return (
    <section className="landing-visual" aria-label="Runelight preview capture">
      <div className="landing-visual-frame">
        <img
          className="landing-visual-shot"
          src={captureAssets.hero}
          alt="Runelight preview captures showing covered frames and visual states"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <a
          className="landing-visual-tag"
          href="/runelight?entry=src%2Fapp%2FLandingScreen.g.tsx%23LandingScreen&frame=live&chrome=0"
        >
          <span>live from this repo</span>
          <strong>/runelight?...</strong>
        </a>
      </div>
    </section>
  )
}

LandingVisualProof.frames = {
  live: { description: "Landing proof section with preview capture", props: {} },
} satisfies GFrames<EmptyProps>

export function LandingCta() {
  return (
    <section className="landing-cta-section">
      <a className="landing-cta" href={siteContent.githubUrl} target="_blank" rel="noreferrer">
        {siteContent.cta.label}
        <span className="landing-cta-arrow" aria-hidden="true">
          →
        </span>
      </a>
      <p className="landing-cta-hint">
        <a href={siteContent.cta.installUrl} target="_blank" rel="noreferrer">
          {siteContent.cta.hint}
        </a>
      </p>
    </section>
  )
}

LandingCta.frames = {
  live: { description: "Landing call-to-action section", props: {} },
} satisfies GFrames<EmptyProps>

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <a href={siteContent.meta.authorUrl} target="_blank" rel="noreferrer">
        {siteContent.meta.byline}
      </a>
      <span>{siteContent.meta.license}</span>
    </footer>
  )
}

LandingFooter.frames = {
  live: { description: "Landing footer metadata links", props: {} },
} satisfies GFrames<EmptyProps>
