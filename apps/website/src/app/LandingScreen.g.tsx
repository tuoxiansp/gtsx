import type { GFrames } from "@runelight/react/runtime"

import { CopyPromptButton } from "./CopyPromptButton"
import { siteContent } from "../content/site-content"

type EmptyProps = Record<string, never>

export function LandingScreen() {
  return (
    <div className="paper">
      <PaperHeader />
      <main className="paper-main">
        <HeroSection />
        <NewLoopSection />
        <CraftSection />
        <GainsSection />
        <WorkStartsSection />
        <ProtocolSection />
        <CoverageSection />
        <BuiltCloseSection />
        <AdditiveSection />
        <FinalCtaSection />
      </main>
      <PaperFooter />
    </div>
  )
}

LandingScreen.frames = {
  live: { description: "Manifesto whitepaper homepage", props: {} },
} satisfies GFrames<EmptyProps>

function PaperHeader() {
  return (
    <header className="paper-header">
      <div className="paper-header-inner">
        <a className="paper-wordmark" href="#">
          {siteContent.productName}
        </a>
        <nav className="paper-nav" aria-label="Site">
          {siteContent.headerNav.map((item) => (
            <a key={item.label} href={item.href} target="_blank" rel="noreferrer">
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}

PaperHeader.frames = {
  live: { description: "Header with navigation", props: {} },
} satisfies GFrames<EmptyProps>

function SectionHeading({ number, title }: { number: string; title: string }) {
  return (
    <h2 className="paper-section-heading">
      <span className="paper-section-number">{number}</span>
      <span className="paper-section-slash" aria-hidden="true">
        {" "}
        /{" "}
      </span>
      {title}
    </h2>
  )
}

function HeroSection() {
  return (
    <section className="paper-section paper-hero" aria-labelledby="hero-title">
      <h1 id="hero-title" className="paper-hero-title">
        {siteContent.hero.title}
      </h1>
      <p className="paper-hero-lead">{siteContent.hero.lead}</p>
      {siteContent.hero.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <MetadataBlock items={siteContent.hero.metadata} />
      <CtaGroup items={siteContent.hero.ctas} />
    </section>
  )
}

HeroSection.frames = {
  live: { description: "Hero and abstract", props: {} },
} satisfies GFrames<EmptyProps>

function MetadataBlock({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="paper-metadata">
      {items.map((item) => (
        <div key={item.label} className="paper-metadata-row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function LoopBlock({ flow }: { flow: string }) {
  return (
    <pre className="paper-code paper-loop-block">
      <code>{flow}</code>
    </pre>
  )
}

function NewLoopSection() {
  const { newLoop } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-new-loop">
      <SectionHeading number={newLoop.number} title={newLoop.title} />
      {newLoop.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <LoopBlock flow={newLoop.flow} />
    </section>
  )
}

NewLoopSection.frames = {
  live: { description: "The new loop section", props: {} },
} satisfies GFrames<EmptyProps>

function CraftSection() {
  const { craft } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-craft">
      <SectionHeading number={craft.number} title={craft.title} />
      {craft.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <blockquote className="paper-quote">{craft.quote}</blockquote>
    </section>
  )
}

CraftSection.frames = {
  live: { description: "UI polish as visual craft", props: {} },
} satisfies GFrames<EmptyProps>

function GainsSection() {
  const { gains } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-gains">
      <SectionHeading number={gains.number} title={gains.title} />
      <div className="paper-gain-list">
        {gains.blocks.map((block) => (
          <article key={block.heading} className="paper-gain">
            <h3 className="paper-gain-heading">{block.heading}</h3>
            <p className="paper-body">{block.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

GainsSection.frames = {
  live: { description: "What the agent gains", props: {} },
} satisfies GFrames<EmptyProps>

function WorkStartsSection() {
  const { workStarts } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-work">
      <SectionHeading number={workStarts.number} title={workStarts.title} />
      {workStarts.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <ol className="paper-numbered-list">
        {workStarts.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <pre className="paper-code">
        <code>{workStarts.promptShort}</code>
      </pre>
      <CopyPromptButton text={workStarts.promptFull} />
      {workStarts.skills.map((skill) => (
        <pre key={skill.command} className="paper-code paper-skill-block">
          <code>
            {skill.command}
            {"\n"}
            {skill.body}
          </code>
        </pre>
      ))}
    </section>
  )
}

WorkStartsSection.frames = {
  live: { description: "Covering real UI and skills", props: {} },
} satisfies GFrames<EmptyProps>

function ProtocolSection() {
  const { protocol } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-protocol">
      <SectionHeading number={protocol.number} title={protocol.title} />
      {protocol.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <pre className="paper-code">
        <code>{protocol.surfaceBlock}</code>
      </pre>
    </section>
  )
}

ProtocolSection.frames = {
  live: { description: "The .g protocol", props: {} },
} satisfies GFrames<EmptyProps>

function CoverageSection() {
  const { coverage } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-coverage">
      <SectionHeading number={coverage.number} title={coverage.title} />
      <p className="paper-body">{coverage.intro}</p>
      <ul className="paper-examples">
        {coverage.examples.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
      {coverage.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <p className="paper-closing-line">{coverage.closing}</p>
    </section>
  )
}

CoverageSection.frames = {
  live: { description: "Growing coverage", props: {} },
} satisfies GFrames<EmptyProps>

function BuiltCloseSection() {
  const { builtClose } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-built">
      <SectionHeading number={builtClose.number} title={builtClose.title} />
      {builtClose.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <p className="paper-body paper-body-note">{builtClose.focus}</p>
      <p className="paper-body paper-body-note">{builtClose.setupPaths}</p>
      <p className="paper-body paper-body-muted">{builtClose.prerelease}</p>
    </section>
  )
}

BuiltCloseSection.frames = {
  live: { description: "Built close to the app", props: {} },
} satisfies GFrames<EmptyProps>

function AdditiveSection() {
  const { additive } = siteContent
  return (
    <section className="paper-section" aria-labelledby="section-additive">
      <SectionHeading number={additive.number} title={additive.title} />
      {additive.paragraphs.map((paragraph) => (
        <p key={paragraph} className="paper-body">
          {paragraph}
        </p>
      ))}
      <blockquote className="paper-quote">{additive.quote}</blockquote>
    </section>
  )
}

AdditiveSection.frames = {
  live: { description: "Additive by design", props: {} },
} satisfies GFrames<EmptyProps>

function FinalCtaSection() {
  const { finalCta } = siteContent
  return (
    <section className="paper-section paper-final-cta" aria-labelledby="final-cta-title">
      <h2 id="final-cta-title" className="paper-final-title">
        {finalCta.title}
      </h2>
      <p className="paper-body">{finalCta.body}</p>
      <CtaGroup items={finalCta.ctas} />
    </section>
  )
}

FinalCtaSection.frames = {
  live: { description: "Final call to action", props: {} },
} satisfies GFrames<EmptyProps>

function CtaGroup({
  items,
}: {
  items: Array<{ label: string; href: string; primary?: boolean }>
}) {
  return (
    <div className="paper-cta-group">
      {items.map((item) => (
        <a
          key={item.label}
          className={
            item.primary ? "paper-button paper-button-primary" : "paper-button paper-button-secondary"
          }
          href={item.href}
          target="_blank"
          rel="noreferrer"
        >
          {item.label}
        </a>
      ))}
    </div>
  )
}

function PaperFooter() {
  return (
    <footer className="paper-footer">
      <a href={siteContent.meta.authorUrl} target="_blank" rel="noreferrer">
        {siteContent.meta.byline}
      </a>
      <span>{siteContent.meta.license}</span>
    </footer>
  )
}

PaperFooter.frames = {
  live: { description: "Footer", props: {} },
} satisfies GFrames<EmptyProps>
