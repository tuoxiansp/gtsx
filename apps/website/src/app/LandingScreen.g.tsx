import type { GFrames } from "@runelight/core"

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
  live: { props: {} },
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
  live: { props: {} },
} satisfies GFrames<EmptyProps>

export function LandingHero() {
  return (
    <section className="landing-hero">
      <p className="landing-kicker">The visual workspace for agent-built apps</p>
      <h1 className="landing-headline">
        <span>{siteContent.headline.lead}</span>
        <span className="landing-headline-emphasis">{siteContent.headline.emphasis}</span>
        <span>{siteContent.headline.tail}</span>
      </h1>
      <p className="landing-payoff">{siteContent.story.payoff}</p>
    </section>
  )
}

LandingHero.frames = {
  live: { props: {} },
} satisfies GFrames<EmptyProps>

export function LandingVisualProof() {
  return (
    <section className="landing-visual" aria-label="Runelight Studio preview">
      <div className="landing-visual-frame">
        <img
          className="landing-visual-shot"
          src={captureAssets.studioComponents}
          alt="Runelight Studio showing every component and visual state on one screen"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <a
          className="landing-visual-tag"
          href="/runelight/studio?canvasX=288.795&canvasY=9.462&canvasScale=1.574&path=src%2Fapp%2FLandingScreen.g.tsx%23LandingScreen&designCanvasX=35.213&designCanvasY=-61.229&designCanvasScale=1.491"
        >
          <span>live from this repo</span>
          <strong>/runelight/studio</strong>
        </a>
      </div>
    </section>
  )
}

LandingVisualProof.frames = {
  live: { props: {} },
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
      <p className="landing-cta-hint">{siteContent.cta.hint}</p>
    </section>
  )
}

LandingCta.frames = {
  live: { props: {} },
} satisfies GFrames<EmptyProps>

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <span>{siteContent.meta.hosts}</span>
      <span>{siteContent.meta.year}</span>
    </footer>
  )
}

LandingFooter.frames = {
  live: { props: {} },
} satisfies GFrames<EmptyProps>
