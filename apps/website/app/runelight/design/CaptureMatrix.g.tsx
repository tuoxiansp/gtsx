import type { GFrames } from "@runelight/core"

export default function CaptureMatrix() {
  return (
    <section className="design-frame design-capture-matrix">
      <header className="design-frame-header">
        <p className="site-eyebrow">Capture proof</p>
        <h2>Screenshot every branch that can fail visually.</h2>
      </header>

      <div className="design-capture-grid">
        <CaptureTile branch="anonymous" component="AuthCase" state="ready" />
        <CaptureTile branch="signed-in" component="AuthCase" state="ready" />
        <CaptureTile branch="empty" component="DataCase" state="ready" />
        <CaptureTile branch="error" component="DataCase" state="needs review" />
        <CaptureTile branch="admin" component="PermissionCase" state="ready" />
        <CaptureTile branch="overflowing" component="LayoutCase" state="ready" />
      </div>
    </section>
  )
}

function CaptureTile(props: { branch: string; component: string; state: string }) {
  return (
    <article className="design-capture-tile">
      <span>{props.component}</span>
      <strong>{props.branch}</strong>
      <i>{props.state}</i>
    </article>
  )
}

CaptureMatrix.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
