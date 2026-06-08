export type SiteContent = {
  productName: string
  githubUrl: string
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
  headline: {
    lead: "Every visual",
    emphasis: "branch",
    tail: "on one screen.",
  },
  story: {
    steps: [
      { label: ".g source", detail: "Agents declare UI states beside real components." },
      { label: "typed frames", detail: "Auth, empty, admin — named branches, type-checked." },
      { label: "/runelight/studio", detail: "Every component, every state — rendered at once." },
    ],
    payoff: "Design, build, and review agent-built UI without clicking through your app.",
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
