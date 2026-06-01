import type { GCases } from "@gtsx/core"

import { studioColors, studioFontFamily, studioRadii } from "../studio-theme"

type StudioEmptyStateProps = {
  title: string
  detail: string
  actionLabel?: string
}

export default function StudioEmptyState(props: StudioEmptyStateProps) {
  return (
    <section
      style={{
        background: studioColors.panelBg,
        border: `1px solid ${studioColors.panelBorder}`,
        borderRadius: studioRadii.md,
        color: studioColors.text,
        fontFamily: studioFontFamily,
        maxWidth: 420,
        padding: 24,
      }}
    >
      <p
        style={{
          color: studioColors.textDim,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          margin: "0 0 12px",
          textTransform: "uppercase",
        }}
      >
        GTSX Studio
      </p>
      <h1 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, margin: "0 0 8px" }}>{props.title}</h1>
      <p style={{ color: studioColors.textMuted, fontSize: 12, lineHeight: 1.5, margin: 0 }}>{props.detail}</p>
      {props.actionLabel ? (
        <button
          style={{
            background: studioColors.buttonPrimaryBg,
            border: 0,
            borderRadius: studioRadii.sm,
            color: studioColors.buttonPrimaryText,
            cursor: "pointer",
            font: "inherit",
            fontWeight: 600,
            marginTop: 20,
            padding: "8px 14px",
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
