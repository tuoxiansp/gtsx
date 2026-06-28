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
  kicker: "For agent-polished frontends",
  headline: {
    lead: "See it.",
    emphasis: "Change it.",
    tail: "See it again.",
  },
  story: {
    steps: [
      { label: ".g coverage", detail: "Agents expose real UI states beside source." },
      { label: "preview targets", detail: "Runelight gives exact browser paths for meaningful states." },
      { label: "polish loop", detail: "Observe, edit, and re-observe before merge." },
    ],
    payoff: "A visual feedback loop for Runelight-covered UI.",
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
