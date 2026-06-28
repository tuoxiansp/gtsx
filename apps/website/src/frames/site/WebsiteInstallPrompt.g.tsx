import type { GFrames } from "@runelight/react/runtime"

type WebsiteInstallPromptProps = {
  copied: boolean
}

export default function WebsiteInstallPrompt(props: WebsiteInstallPromptProps) {
  return (
    <section className="case-surface case-website-install">
      <header className="case-header">
        <span className="case-branch-tag">install</span>
        <strong>One prompt</strong>
      </header>
      <h2>Install with one prompt</h2>
      <p>Paste this into your agent from the project you want to light up.</p>
      <pre className="case-install-snippet">{`Install or upgrade Runelight in this project.
Fetch skills/setup-runelight, then run setup-runelight.`}</pre>
      <span className="case-action case-action-secondary">{props.copied ? "Copied" : "Copy prompt"}</span>
    </section>
  )
}

WebsiteInstallPrompt.frames = {
  default: { description: "default frame", props: { copied: false } },
  copied: { description: "copied frame", props: { copied: true } },
} satisfies GFrames<WebsiteInstallPromptProps>
