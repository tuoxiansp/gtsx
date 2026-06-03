import type { GFrames } from "@gtsx/core"

type ExportListBadgeProps = {
  label: string
}

function ExportListBadge(props: ExportListBadgeProps) {
  return <span>{props.label}</span>
}

ExportListBadge.frames = {
  ready: { props: { label: "Export list" } },
} satisfies GFrames<ExportListBadgeProps>

function ExportListHelper() {
  return <span>Helper</span>
}

export { ExportListBadge, ExportListHelper }
