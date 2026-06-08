import type { ReactNode } from "react"

type WebsiteBrowserShellProps = {
  label: string
  url?: string
  pageClassName?: string
  children: ReactNode
}

export function WebsiteBrowserShell({
  label,
  url = "runelight.ai",
  pageClassName,
  children,
}: WebsiteBrowserShellProps) {
  return (
    <main className="wd-explore">
      <span className="wd-explore-label">{label}</span>

      <div className="wd-browser" aria-label="Desktop browser preview">
        <div className="wd-browser-chrome">
          <div className="wd-browser-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="wd-browser-tab">Runelight - Official site</div>
        </div>
        <div className="wd-browser-urlbar">{url}</div>
        <div className="wd-browser-viewport">
          <div className={`wd-browser-page${pageClassName ? ` ${pageClassName}` : ""}`}>{children}</div>
        </div>
      </div>
    </main>
  )
}
