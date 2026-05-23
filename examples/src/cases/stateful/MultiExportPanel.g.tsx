import type { GCases } from "gtsx"

type PanelProps = {
  label: string
}

export function NamedPanel(props: PanelProps) {
  return <section className="named-panel">Named export: {props.label}</section>
}

NamedPanel.cases = {
  namedReady: { props: { label: "selected by file coordinate" } },
} satisfies GCases<PanelProps>

export default function DefaultPanel(props: PanelProps) {
  return <section className="named-panel">Default export: {props.label}</section>
}

DefaultPanel.cases = {
  defaultReady: { props: { label: "default coordinate" } },
} satisfies GCases<PanelProps>
