import type { GFrames } from "@runelight/react/runtime"

export type BadgeProps = {
  label: string
  tone: "neutral" | "warning"
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: {
    description: "Neutral badge ready state.",
    props: { label: "Ready", tone: "neutral" },
  },
  warning: {
    description: "Warning badge attention state.",
    props: { label: "Needs review", tone: "warning" },
  },
} satisfies GFrames<BadgeProps>
