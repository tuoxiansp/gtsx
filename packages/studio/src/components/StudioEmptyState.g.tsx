import type { GCases } from "gtsx"

type StudioEmptyStateProps = {
  title: string
  detail: string
  actionLabel?: string
}

export default function StudioEmptyState(props: StudioEmptyStateProps) {
  return (
    <section
      style={{
        border: "1px solid #d7dce5",
        borderRadius: 16,
        color: "#172033",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        maxWidth: 420,
        padding: 24,
      }}
    >
      <p style={{ color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: 1, margin: "0 0 12px", textTransform: "uppercase" }}>
        GTSX Studio
      </p>
      <h1 style={{ fontSize: 24, lineHeight: 1.2, margin: "0 0 8px" }}>{props.title}</h1>
      <p style={{ color: "#475569", lineHeight: 1.5, margin: 0 }}>{props.detail}</p>
      {props.actionLabel ? (
        <button
          style={{
            background: "#172033",
            border: 0,
            borderRadius: 999,
            color: "white",
            font: "inherit",
            fontWeight: 700,
            marginTop: 20,
            padding: "10px 16px",
          }}
          type="button"
        >
          {props.actionLabel}
        </button>
      ) : null}
    </section>
  )
}

StudioEmptyState.cases = {
  empty: {
    props: {
      title: "No components selected",
      detail: "Studio can inspect this package the same way it inspects any other GTSX project.",
      actionLabel: "Create a case",
    },
  },
} satisfies GCases<StudioEmptyStateProps>
