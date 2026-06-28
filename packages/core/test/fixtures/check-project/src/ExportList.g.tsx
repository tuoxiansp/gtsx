import type { GFrames } from "@runelight/react/runtime"

type ExportListBadgeProps = {
  label: string
}

function ExportListBadge(props: ExportListBadgeProps) {
  return <span>{props.label}</span>
}

ExportListBadge.frames = {
  ready: { description: "ready frame", props: { label: "Export list" } },
} satisfies GFrames<ExportListBadgeProps>

function ExportListHelper() {
  return <span>Helper</span>
}

export { ExportListBadge, ExportListHelper }
