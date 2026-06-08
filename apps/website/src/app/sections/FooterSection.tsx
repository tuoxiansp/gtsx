import type { SiteContent } from "../../content/site-content"

type FooterSectionProps = {
  content: SiteContent["footer"]
}

export function FooterSection({ content }: FooterSectionProps) {
  return (
    <footer className="site-footer">
      <div className="site-container site-footer-inner">
        <p>{content.copyright}</p>
        <nav aria-label="Documentation">
          {content.docs.map((doc) => (
            <a key={doc.href} href={doc.href} target="_blank" rel="noreferrer">
              {doc.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
