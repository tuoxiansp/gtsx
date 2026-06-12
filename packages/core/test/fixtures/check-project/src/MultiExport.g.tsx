import type { GFrames } from "@runelight/react/runtime"

type BadgeProps = {
  label: string
}

export function NamedBadge(props: BadgeProps) {
  return <span>{props.label}</span>
}

NamedBadge.frames = {
  ready: { props: { label: "Named" } },
} satisfies GFrames<BadgeProps>

type DefaultBadgeProps = {
  label: string
}

export default function DefaultBadge(props: DefaultBadgeProps) {
  return <strong>{props.label}</strong>
}

DefaultBadge.frames = {
  defaultReady: { props: { label: "Default" } },
} satisfies GFrames<DefaultBadgeProps>
