import type { GFrames } from "@runelight/react/runtime"

type BadgeProps = {
  label: string
  tone: "neutral" | "success"
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: { props: { label: "Ready", tone: "neutral" } },
  success: { props: { label: "Shipped", tone: "success" } },
} satisfies GFrames<BadgeProps>
