import type { GCases } from "@gtsx/core"

import { Child } from "@fixture/Child.g"

type Props = {
  label: string
}

export default function Included(props: Props) {
  return <Child label={props.label} />
}

Included.cases = {
  ready: { props: { label: "Included" } },
} satisfies GCases<Props>
