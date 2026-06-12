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
    installUrl: string
  }
  meta: {
    byline: string
    authorUrl: string
    license: string
  }
}

export const siteContent = {
  productName: "Runelight",
  githubUrl: "https://github.com/tuoxiansp/runelight",
  kicker: "For agent-built apps",
  headline: {
    lead: "Every component.",
    emphasis: "Every state.",
    tail: "One screen.",
  },
  story: {
    steps: [
      { label: ".g source", detail: "Agents declare UI states beside real components." },
      { label: "typed frames", detail: "Auth, empty, admin — named branches, type-checked." },
      { label: "/runelight/studio", detail: "Every component, every state — rendered at once." },
    ],
    payoff: "Typed, checked, and maintained by your agent. Review on one URL.",
  },
  cta: {
    label: "View on GitHub",
    hint: "Install with one agent prompt · React & Vue",
    installUrl: "https://github.com/tuoxiansp/runelight?tab=readme-ov-file#get-started--one-prompt",
  },
  meta: {
    byline: "Made by tuoxiansp",
    authorUrl: "https://github.com/tuoxiansp",
    license: "MIT · 2026",
  },
} satisfies SiteContent
