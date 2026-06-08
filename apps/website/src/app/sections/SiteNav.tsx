import type { SiteContent } from "../../content/site-content"

type SiteNavProps = {
  content: SiteContent["nav"]
  productName: string
}

const railLinks = [
  { index: "00", label: "model", href: "#model" },
  { index: "03", label: "proof", href: "#proof" },
  { index: "06", label: "studio", href: "#studio" },
  { index: "07", label: "install", href: "#install" },
]

export function SiteNav({ content, productName }: SiteNavProps) {
  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <a className="site-logo" href="#top">
          <span className="site-logo-mark" aria-hidden="true" />
          <span>{productName}</span>
        </a>
        <div className="site-nav-actions">
          <a className="site-button site-button-ghost" href="/runelight/studio#/design">
            {content.studioLabel}
          </a>
          <a className="site-button site-button-primary" href="#install">
            {content.installLabel}
          </a>
        </div>
      </div>
      <nav className="site-nav-rail" aria-label="Primary sections">
        {railLinks.map((link) => (
          <a key={link.href} href={link.href}>
            <span>{link.index}</span>
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  )
}
