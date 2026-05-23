import type { GCases } from "gtsx"

type BadgeProps = {
  label: string
}

export function NamedBadge(props: BadgeProps) {
  return <span>{props.label}</span>
}

NamedBadge.cases = {
  ready: { props: { label: "Named" } },
} satisfies GCases<BadgeProps>

type DefaultBadgeProps = {
  label: string
}

export default function DefaultBadge(props: DefaultBadgeProps) {
  return <strong>{props.label}</strong>
}

DefaultBadge.cases = {
  defaultReady: { props: { label: "Default" } },
} satisfies GCases<DefaultBadgeProps>
