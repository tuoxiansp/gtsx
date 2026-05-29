import type { GCases } from "@gtsx/core"

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
