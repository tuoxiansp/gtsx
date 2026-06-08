import { siteContent } from "../content/site-content"
import { AiEraSection } from "./sections/AiEraSection"
import { FooterSection } from "./sections/FooterSection"
import { FrameworksSection } from "./sections/FrameworksSection"
import { HeroSection } from "./sections/HeroSection"
import { HumansAndAgentsSection } from "./sections/HumansAndAgentsSection"
import { InstallSection } from "./sections/InstallSection"
import { ModelSection } from "./sections/ModelSection"
import { ProofPanelsSection } from "./sections/ProofPanelsSection"
import { SharedContextSection } from "./sections/SharedContextSection"
import { SiteNav } from "./sections/SiteNav"
import { StudioShowcaseSection } from "./sections/StudioShowcaseSection"

export function WebsiteApp() {
  return (
    <div className="site-shell">
      <SiteNav content={siteContent.nav} productName={siteContent.meta.productName} />
      <main>
        <HeroSection content={siteContent.hero} />
        <AiEraSection content={siteContent.aiEra} />
        <ModelSection content={siteContent.model} />
        <ProofPanelsSection content={siteContent.proofPanels} />
        <SharedContextSection content={siteContent.sharedContext} />
        <HumansAndAgentsSection content={siteContent.humansAndAgents} />
        <StudioShowcaseSection content={siteContent.studioShowcase} />
        <InstallSection content={siteContent.install} />
        <FrameworksSection content={siteContent.frameworks} />
      </main>
      <FooterSection content={siteContent.footer} />
    </div>
  )
}
