import type { GFrames } from "@runelight/react/runtime"

export type PreviewMessageProps = {
  detail: string
  title: string
}

export default function PreviewMessage(props: PreviewMessageProps) {
  return (
    <main
      data-runelight-preview-message
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

PreviewMessage.frames = {
  missingEntry: {
    props: {
      detail: "Pass ?entry=src/components/.../*.g.tsx to render a Studio package frame.",
      title: "Missing entry",
    },
  },
  unknownFrame: {
    props: {
      detail: "No frames declared",
      title: "Unknown frame",
    },
  },
  loading: {
    props: {
      detail: "src/components/StudioWorkspaceView.g.tsx",
      title: "Loading",
    },
  },
} satisfies GFrames<PreviewMessageProps>
