import type { GCases } from "@gtsx/core"

type BadgeProps = {
  label: string
  tone: "neutral" | "success"
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.cases = {
  neutral: { props: { label: "Ready", tone: "neutral" } },
  success: { props: { label: "Shipped", tone: "success" } },
} satisfies GCases<BadgeProps>
