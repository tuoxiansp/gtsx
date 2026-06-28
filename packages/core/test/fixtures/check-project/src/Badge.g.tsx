import type { GFrames } from "@runelight/react/runtime"

export type BadgeProps = {
  tone: "neutral" | "warning"
  label: string
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: { description: "neutral frame", props: { tone: "neutral", label: "Ready" } },
  warning: { description: "warning frame", props: { tone: "warning", label: "Needs review" } },
} satisfies GFrames<BadgeProps>
