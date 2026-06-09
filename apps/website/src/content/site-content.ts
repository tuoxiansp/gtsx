export type SiteContent = {
  productName: string
  githubUrl: string
  kicker: string
  headline: {
    lead: string
    emphasis: string
    tail: string
  }
  story: {
    steps: Array<{ label: string; detail: string }>
    payoff: string
  }
  cta: {
    label: string
    hint: string
  }
  meta: {
    hosts: string
    year: string
  }
}

export const siteContent = {
  productName: "Runelight",
  githubUrl: "https://github.com/tuoxiansp/runelight",
  kicker: "Design · Codebase · Visible UI States",
  headline: {
    lead: "The missing workspace",
    emphasis: "for AI-era",
    tail: "UI development.",
  },
  story: {
    steps: [
      { label: ".g source", detail: "Agents declare UI states beside real components." },
      { label: "typed frames", detail: "Auth, empty, admin — named branches, type-checked." },
      { label: "/runelight/studio", detail: "Every component, every state — rendered at once." },
    ],
    payoff:
      "A GUI workflow where design intent, component code, and agent output stay connected in one place.",
  },
  cta: {
    label: "View on GitHub",
    hint: "Install with one agent prompt · React & Vue",
  },
  meta: {
    hosts: "TypeScript React · Vue 3",
    year: "2026",
  },
} satisfies SiteContent
