import type { GCases } from "@gtsx/core"

export type PreviewMessageProps = {
  detail: string
  title: string
}

export default function PreviewMessage(props: PreviewMessageProps) {
  return (
    <main
      data-gtsx-preview-message
      style={{
        color: "#172033",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 28, lineHeight: 1.15, margin: "0 0 12px" }}>{props.title}</h1>
      <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.45, margin: 0 }}>{props.detail}</p>
    </main>
  )
}

PreviewMessage.cases = {
  missingEntry: {
    props: {
      detail: "Pass ?entry=src/components/.../*.g.tsx to render a Studio package case.",
      title: "Missing entry",
    },
  },
  unknownCase: {
    props: {
      detail: "No cases declared",
      title: "Unknown case",
    },
  },
  loading: {
    props: {
      detail: "src/components/StudioWorkspaceView.g.tsx",
      title: "Loading",
    },
  },
} satisfies GCases<PreviewMessageProps>
