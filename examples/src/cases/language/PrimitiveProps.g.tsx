import type { GTSXPureCases } from "gtsx"

type PrimitiveProps = {
  title: string
  count: number
  active: boolean
  tone: "neutral" | "positive" | "warning"
  items: string[]
}

export default function PrimitiveProps(props: PrimitiveProps) {
  return (
    <article className="primitive-card" data-active={props.active}>
      <h1>{props.title}</h1>
      <div className="primitive-stats">
        <span>{props.count} events</span>
        <span>{props.tone}</span>
        <span>{props.active ? "active" : "paused"}</span>
      </div>
      <ul className="primitive-items">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  )
}

PrimitiveProps.cases = {
  neutralEmpty: {
    props: {
      title: "Primitive props",
      count: 0,
      active: false,
      tone: "neutral",
      items: ["string", "number", "boolean", "union"],
    },
  },
  positiveActive: {
    props: {
      title: "Active language fixture",
      count: 42,
      active: true,
      tone: "positive",
      items: ["static case key", "literal props", "array rendering"],
    },
  },
  warningLongText: {
    props: {
      title: "Long text should remain legible inside the contact sheet frame",
      count: 7,
      active: true,
      tone: "warning",
      items: ["overflow pressure", "visual distinction", "agent-readable labels"],
    },
  },
} satisfies GTSXPureCases<PrimitiveProps>
