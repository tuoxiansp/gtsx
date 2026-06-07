import type { GFrames } from "@runelight/core"

type StatusPanelProps = {
  state: "loading" | "error"
  message: string
}

export default function StatusPanel(props: StatusPanelProps) {
  return (
    <section data-state={props.state}>
      <strong>{props.state}</strong>
      <p>{props.message}</p>
    </section>
  )
}

StatusPanel.frames = {
  loading: { props: { state: "loading", message: "Fetching data" } },
  error: { props: { state: "error", message: "Request failed" } },
} satisfies GFrames<StatusPanelProps>
