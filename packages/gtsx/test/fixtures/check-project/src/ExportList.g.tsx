import type { GCases } from "@gtsx/core"

type ExportListBadgeProps = {
  label: string
}

function ExportListBadge(props: ExportListBadgeProps) {
  return <span>{props.label}</span>
}

ExportListBadge.cases = {
  ready: { props: { label: "Export list" } },
} satisfies GCases<ExportListBadgeProps>

function ExportListHelper() {
  return <span>Helper</span>
}

export { ExportListBadge, ExportListHelper }
