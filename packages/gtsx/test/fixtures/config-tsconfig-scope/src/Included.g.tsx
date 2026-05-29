import type { GCases } from "gtsx"

type IncludedProps = {
  label: string
}

export default function Included(props: IncludedProps) {
  return <span>{props.label}</span>
}

Included.cases = {
  ready: {
    props: {
      label: "ready",
    },
  },
} satisfies GCases<IncludedProps>
