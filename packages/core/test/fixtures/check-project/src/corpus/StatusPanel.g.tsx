import type { GFrames } from "@runelight/react/runtime"

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
  loading: { description: "loading frame", props: { state: "loading", message: "Fetching data" } },
  error: { description: "error frame", props: { state: "error", message: "Request failed" } },
} satisfies GFrames<StatusPanelProps>
