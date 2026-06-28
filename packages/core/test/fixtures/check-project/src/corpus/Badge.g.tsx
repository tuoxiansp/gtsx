import type { GFrames } from "@runelight/react/runtime"

type BadgeProps = {
  label: string
  tone: "neutral" | "success"
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: { description: "neutral frame", props: { label: "Ready", tone: "neutral" } },
  success: { description: "success frame", props: { label: "Shipped", tone: "success" } },
} satisfies GFrames<BadgeProps>
