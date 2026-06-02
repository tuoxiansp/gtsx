import type { GCases } from "@gtsx/core"

CasesBeforeExport.cases = {
  ready: { props: { label: "Ready" } },
} satisfies GCases<CasesBeforeExportProps>

type CasesBeforeExportProps = {
  label: string
}

export function CasesBeforeExport(props: CasesBeforeExportProps) {
  return <span>{props.label}</span>
}
