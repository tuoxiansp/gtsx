import type { GCases } from "gtsx"

type Props = {
  label: string
}

export default function Child(props: Props) {
  return <span>{props.label}</span>
}

Child.cases = {
  ready: { props: { label: "Child" } },
} satisfies GCases<Props>

export { Child }
