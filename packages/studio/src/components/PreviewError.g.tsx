import type { GCases } from "@gtsx/core"

type PreviewErrorProps = {
  caseName: string
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
      style={{ background: "#fff8c5", border: "1px solid #d4a72c", borderRadius: 8, color: "#5a1e02", padding: 12 }}
    >
      <strong>Preview unavailable</strong>
      <p style={{ margin: "6px 0 0" }}>{props.error.message}</p>
      {props.error.stack ? <pre style={{ whiteSpace: "pre-wrap" }}>{props.error.stack}</pre> : null}
      <dl style={{ display: "grid", gap: 4, margin: "8px 0 0" }}>
        <div>
          <dt>Entry</dt>
          <dd style={{ margin: 0 }}>{props.coordinate}</dd>
        </div>
        <div>
          <dt>Case</dt>
          <dd style={{ margin: 0 }}>{props.caseName}</dd>
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

PreviewError.cases = {
  renderFailure: {
    props: {
      caseName: "ready",
      coordinate: "src/UserCard.g.tsx#default",
      error: {
        message: "Cannot read properties of undefined",
        stack: "TypeError: Cannot read properties of undefined\n    at UserCard",
      },
      previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
    },
  },
} satisfies GCases<PreviewErrorProps>
