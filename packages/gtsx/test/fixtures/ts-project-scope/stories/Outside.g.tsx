import type { GCases } from "gtsx"

type Props = {
  label: string
}

export default function Outside(props: Props) {
  return <span>{props.label}</span>
}

Outside.cases = {
  ready: { props: { label: "Outside" } },
} satisfies GCases<Props>
