import type { GFrames } from "@gtsx/core"

import { studioColors, studioFontFamily, studioRadii } from "../studio-theme"

type PreviewErrorProps = {
  frameName: string
  coordinate: string
  error: {
    message: string
    stack?: string
  }
  previewUrl: string
}

export default function PreviewError(props: PreviewErrorProps) {
  return (
    <div
      role="status"
      style={{
        background: studioColors.errorBg,
        border: `1px solid ${studioColors.errorBorder}`,
        borderRadius: studioRadii.md,
        color: studioColors.errorText,
        fontFamily: studioFontFamily,
        fontSize: 11,
        padding: 12,
      }}
    >
      <strong>Preview unavailable</strong>
      <p style={{ margin: "6px 0 0" }}>{props.error.message}</p>
      {props.error.stack ? <pre style={{ fontSize: 10, whiteSpace: "pre-wrap" }}>{props.error.stack}</pre> : null}
      <dl style={{ display: "grid", fontSize: 10, gap: 4, margin: "8px 0 0" }}>
        <div>
          <dt>Entry</dt>
          <dd style={{ margin: 0 }}>{props.coordinate}</dd>
        </div>
        <div>
          <dt>Frame</dt>
          <dd style={{ margin: 0 }}>{props.frameName}</dd>
        </div>
        <div>
          <dt>Preview URL</dt>
          <dd style={{ margin: 0 }}>
            <code>{props.previewUrl}</code>
          </dd>
        </div>
      </dl>
    </div>
  )
}

PreviewError.frames = {
  renderFailure: {
    props: {
      frameName: "ready",
      coordinate: "src/UserCard.g.tsx#default",
      error: {
        message: "Cannot read properties of undefined",
        stack: "TypeError: Cannot read properties of undefined\n    at UserCard",
      },
      previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0",
    },
  },
} satisfies GFrames<PreviewErrorProps>
