import type { GFrames } from "@runelight/react/runtime"

type WebsiteHeroPreviewProps = {
  branchLabel: string
  headline: string
  body: string
}

export default function WebsiteHeroPreview(props: WebsiteHeroPreviewProps) {
  return (
    <article className="case-surface case-website-hero" data-branch={props.branchLabel}>
      <header className="case-header">
        <span className="case-branch-tag">{props.branchLabel}</span>
        <strong>runelight-website</strong>
      </header>
      <h2>{props.headline}</h2>
      <p>{props.body}</p>
      <div className="case-meta-row">
        <span>Frame · live branch</span>
        <span className="case-action case-action-primary">Open in Studio</span>
      </div>
    </article>
  )
}

WebsiteHeroPreview.frames = {
  anonymous: {
    description: "anonymous frame",
    props: {
      branchLabel: "anonymous",
      headline: "Sign in to review branches",
      body: "This frame belongs to the Runelight website project — the same surface visitors see on the homepage.",
    },
  },
  signedIn: {
    description: "signedIn frame",
    props: {
      branchLabel: "signed-in",
      headline: "Ada Lovelace · workspace ready",
      body: "Production website frames and curated case components render together in this project's Studio.",
    },
  },
} satisfies GFrames<WebsiteHeroPreviewProps>
