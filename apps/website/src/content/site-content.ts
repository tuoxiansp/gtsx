export type SiteSection = {
  number: string
  title: string
}

export type GainBlock = {
  heading: string
  body: string
}

export type SiteContent = {
  productName: string
  githubUrl: string
  docsUrl: string
  setupPlaybookUrl: string
  hero: {
    title: string
    lead: string
    paragraphs: string[]
    metadata: Array<{ label: string; value: string }>
    ctas: Array<{ label: string; href: string; primary?: boolean }>
  }
  newLoop: SiteSection & {
    paragraphs: string[]
    flow: string
  }
  craft: SiteSection & {
    paragraphs: string[]
    quote: string
  }
  gains: SiteSection & {
    blocks: GainBlock[]
  }
  workStarts: SiteSection & {
    paragraphs: string[]
    steps: string[]
    promptShort: string
    promptFull: string
    skills: Array<{ command: string; body: string }>
  }
  protocol: SiteSection & {
    paragraphs: string[]
    surfaceBlock: string
  }
  coverage: SiteSection & {
    intro: string
    examples: string[]
    paragraphs: string[]
    closing: string
  }
  builtClose: SiteSection & {
    paragraphs: string[]
    focus: string
    setupPaths: string
    prerelease: string
  }
  additive: SiteSection & {
    paragraphs: string[]
    quote: string
  }
  finalCta: {
    title: string
    body: string
    ctas: Array<{ label: string; href: string; primary?: boolean }>
  }
  headerNav: Array<{ label: string; href: string }>
  meta: {
    byline: string
    authorUrl: string
    license: string
  }
}

export const siteContent = {
  productName: "Runelight",
  githubUrl: "https://github.com/tuoxiansp/runelight",
  docsUrl: "https://github.com/tuoxiansp/runelight#documentation",
  setupPlaybookUrl:
    "https://github.com/tuoxiansp/runelight/blob/main/installer/runelight-setup.md",
  hero: {
    title: "Let agents polish your UI with eyes.",
    lead: "Runelight turns frontend UI work into a visible loop for AI coding agents: preview the current screen, sync on the change, edit the source, capture the result, and check what improved.",
    paragraphs: [
      "Frontend polish has always been iterative.",
      "Runelight gives agents that same rhythm inside the project they are already editing.",
    ],
    metadata: [
      { label: "Status", value: "Pre-release" },
      { label: "Scope", value: "TypeScript React · Vue 3" },
      { label: "Core loop", value: "preview → sync → edit → capture → check" },
      { label: "Use", value: "frontend UI polish by AI coding agents" },
    ],
    ctas: [
      {
        label: "Read the setup playbook",
        href: "https://github.com/tuoxiansp/runelight/blob/main/installer/runelight-setup.md",
        primary: true,
      },
      {
        label: "View GitHub",
        href: "https://github.com/tuoxiansp/runelight",
      },
    ],
  },
  newLoop: {
    number: "01",
    title: "The new loop for frontend agents",
    paragraphs: [
      "A coding agent can already change files.",
      "Runelight gives that agent a way to work visually: open the relevant UI, understand the current state, state the intended polish, edit the source, capture the result, and report what changed.",
    ],
    flow: `preview current UI
→ sync on intended change
→ edit code
→ capture updated UI
→ check outcome`,
  },
  craft: {
    number: "02",
    title: "UI polish is a visual craft",
    paragraphs: [
      "Spacing, hierarchy, density, contrast, layout, and state design are not only code transformations.",
      "They are visual decisions made against a real screen.",
      "When an agent works on frontend polish, it needs to see the surface, understand the surrounding context, make a focused change, and look again after the code has moved.",
    ],
    quote:
      "Eyes mean iteration: the ability to look, change, look again, and explain the difference.",
  },
  gains: {
    number: "03",
    title: "What the agent gains",
    blocks: [
      {
        heading: "A place to look",
        body: "Runelight gives important UI surfaces named preview targets, so the agent can return to the same screen while it works.",
      },
      {
        heading: "A moment to sync",
        body: "Before subjective polish, the agent observes the UI and tells you what it intends to change.",
      },
      {
        heading: "A way to prove",
        body: "After editing, the agent captures the updated UI and reports the result with visual evidence.",
      },
      {
        heading: "A memory of surfaces",
        body: "As coverage grows, future agents can find and revisit the UI surfaces that matter to the project.",
      },
    ],
  },
  workStarts: {
    number: "04",
    title: "The work starts by covering real UI",
    paragraphs: [
      "Runelight is installed once. Then the agent refactors real frontend surfaces into Runelight coverage.",
      "Coverage gives the agent a stable place to preview. Polish uses that place to observe, sync, edit, capture, and report.",
    ],
    steps: [
      "Install Runelight in the project.",
      "Refactor a real screen or panel into Runelight coverage.",
      "Run the polish loop on that covered surface.",
    ],
    promptShort: `Install or upgrade Runelight in this project.

Read the latest Runelight setup playbook.
Follow that playbook in this repository.

Use real UI surfaces.
Do not create placeholder coverage or draft artifacts.`,
    promptFull: `Install or upgrade Runelight in this project.

Read the latest Runelight setup playbook:
https://github.com/tuoxiansp/runelight/blob/main/installer/runelight-setup.md

Follow that playbook in this repository.

Detect the framework, install or upgrade the compatible @runelight packages,
wire the preview integration, refresh the matching authoring/refactor/polish
skills, and verify the setup.

Use real UI surfaces. Do not create placeholder coverage or draft artifacts.`,
    skills: [
      {
        command: "/refactor-to-runelight-react",
        body: `Convert the settings panel into Runelight coverage.
Use real UI from this project, then verify the preview works.`,
      },
      {
        command: "/polish",
        body: `Polish the Runelight-covered settings panel.
Preview it first, sync on the intended change before editing,
then capture the result and tell me what changed.`,
      },
    ],
  },
  protocol: {
    number: "05",
    title: "The .g protocol",
    paragraphs: [
      "Runelight marks previewable UI surfaces beside the source.",
      "React surfaces use .g.tsx. Vue surfaces use .g.vue.",
      "A .g surface gives the agent a named place to open, a set of states to check, and a stable target to revisit after editing.",
    ],
    surfaceBlock: `.g surface
  - lives beside source
  - declares previewable frames
  - can be discovered by the agent
  - can be opened in development preview
  - can be captured after edits`,
  },
  coverage: {
    number: "06",
    title: "Coverage grows with the product",
    intro: "Runelight coverage grows from the real surfaces your agent works on.",
    examples: [
      "A settings panel.",
      "A billing screen.",
      "A dense table.",
      "An empty state.",
      "A role-specific admin view.",
    ],
    paragraphs: [
      "Each covered surface becomes easier for future agents to find, preview, polish, and verify.",
    ],
    closing: "The more surfaces are covered, the less the agent has to guess.",
  },
  builtClose: {
    number: "07",
    title: "Built close to the app",
    paragraphs: [
      "Runelight works inside the frontend project the agent is already editing.",
      "It wires a development preview, adds project-level skills, and gives the agent commands to verify setup, discover previews, and capture results.",
    ],
    focus: "Current focus: TypeScript React and Vue 3.",
    setupPaths:
      "Current setup paths: Vite React, Next.js App Router, Vite Vue, and custom TypeScript React hosts with the preview contract.",
    prerelease:
      "Runelight is pre-release. The protocol, adapters, setup playbook, skills, examples, and tests are still moving together.",
  },
  additive: {
    number: "08",
    title: "Additive by design",
    paragraphs: [
      "Runelight coverage lives beside ordinary React and Vue code.",
      "It gives agents named surfaces to preview and polish, while keeping the underlying app recognizable.",
      "If coverage is removed, what remains is ordinary React or Vue code.",
    ],
    quote:
      "The tool should make the project more workable for agents, not less understandable for humans.",
  },
  finalCta: {
    title: "Start the first visible polish loop.",
    body: "Install Runelight, cover one real UI surface, and let your agent preview, sync, edit, capture, and check.",
    ctas: [
      {
        label: "Read the setup playbook",
        href: "https://github.com/tuoxiansp/runelight/blob/main/installer/runelight-setup.md",
        primary: true,
      },
      {
        label: "View GitHub",
        href: "https://github.com/tuoxiansp/runelight",
      },
    ],
  },
  headerNav: [
    { label: "Docs", href: "https://github.com/tuoxiansp/runelight#documentation" },
    { label: "GitHub", href: "https://github.com/tuoxiansp/runelight" },
    {
      label: "Get started",
      href: "https://github.com/tuoxiansp/runelight/blob/main/installer/runelight-setup.md",
    },
  ],
  meta: {
    byline: "Made by tuoxiansp",
    authorUrl: "https://github.com/tuoxiansp",
    license: "MIT · 2026",
  },
} satisfies SiteContent
