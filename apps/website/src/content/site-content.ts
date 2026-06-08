export type ProofPanelCaseId = "auth" | "data" | "permission" | "layout"

export type ProofPanelCase = {
  id: ProofPanelCaseId
  title: string
  summary: string
  branchLabels: [string, string] | [string, string, string]
  sourceCode: string
  frameDeclaration: string
}

export type ModelPillar = {
  title: string
  body: string
  detail?: string
}

export type FrameworkHost = {
  name: string
  detail: string
}

export type DocLink = {
  label: string
  href: string
}

export type SiteContent = {
  meta: {
    productName: string
    tagline: string
  }
  nav: {
    links: Array<{ label: string; href: string }>
    studioLabel: string
    installLabel: string
  }
  hero: {
    headline: string
    subhead: string
    primaryCta: { label: string; href: string }
    secondaryCta: { label: string; href: string }
  }
  aiEra: {
    eyebrow: string
    headline: string
    body: string
    bullets: string[]
  }
  model: {
    eyebrow: string
    headline: string
    body: string
    pillars: ModelPillar[]
  }
  proofPanels: {
    eyebrow: string
    headline: string
    body: string
    cases: ProofPanelCase[]
  }
  sharedContext: {
    eyebrow: string
    headline: string
    body: string
    designLabel: string
    componentLabel: string
    bridgeLabel: string
  }
  humansAndAgents: {
    eyebrow: string
    headline: string
    body: string
    humanCard: { title: string; body: string }
    agentCard: { title: string; body: string }
  }
  studioShowcase: {
    eyebrow: string
    headline: string
    body: string
    primaryCta: { label: string; href: string }
    secondaryCta: { label: string; href: string }
  }
  install: {
    eyebrow: string
    headline: string
    body: string
    prompt: string
    copyLabel: string
    copiedLabel: string
    exitHeadline: string
    exitBody: string
  }
  frameworks: {
    eyebrow: string
    headline: string
    body: string
    hosts: FrameworkHost[]
  }
  footer: {
    docs: DocLink[]
    copyright: string
  }
}

export const siteContent = {
  meta: {
    productName: "Runelight",
    tagline: "Visual branches from source to Studio.",
  },
  nav: {
    links: [
      { label: "Model", href: "#model" },
      { label: "Proof", href: "#proof" },
      { label: "Studio", href: "#studio" },
      { label: "Install", href: "#install" },
    ],
    studioLabel: "Open Studio",
    installLabel: "Install",
  },
  hero: {
    headline: "Visual branches, from source to Studio.",
    subhead:
      "Declare UI states as typed frames, inspect the branch map, and export real screenshots before merge.",
    primaryCta: { label: "Install Runelight", href: "#install" },
    secondaryCta: { label: "Open Studio", href: "/runelight/studio#/design" },
  },
  aiEra: {
    eyebrow: "AI-era GUI work",
    headline: "Rendered branches beat guesses.",
    body: "Agents and reviewers see the same thing: source condition, frame, render, screenshot.",
    bullets: [
      "Named states live beside component source.",
      "Studio expands branches into a visual map.",
      "Capture exports reviewable proof.",
    ],
  },
  model: {
    eyebrow: "How the model works",
    headline: "A visual model in source.",
    body: "`.g` files turn important UI states into inspectable, capturable branches.",
    pillars: [
      {
        title: "Declare",
        body: "Frames name the states worth reviewing.",
        detail: "source + frames + checks",
      },
      {
        title: "Inspect",
        body: "Studio renders the branch map and lets you drill into child components.",
      },
      {
        title: "Capture",
        body: "The CLI exports the rendered branches as screenshots.",
      },
    ],
  },
  proofPanels: {
    eyebrow: "Proof panels",
    headline: "Condition to screenshot.",
    body: "Each case ties code, frame declaration, and captured rendering together.",
    cases: [
      {
        id: "auth",
        title: "Auth branch",
        summary: "Anonymous and signed-in states render side by side.",
        branchLabels: ["anonymous", "signed-in"],
        sourceCode: `const session = useGContext(SessionProvider)

if (session.variant === "anonymous") {
  return <SignInPrompt />
}

return <AccountMenu name={session.user.name} role={session.user.role} />`,
        frameDeclaration: `AuthCase.frames = {
  anonymous: {
    providers: [[SessionProvider, { variant: "anonymous" }]],
  },
  signedIn: {
    providers: [[SessionProvider, {
      variant: "signed-in",
      user: { name: "Ada Lovelace", role: "Preview systems engineer" },
    }]],
  },
} satisfies GFrames<AuthCaseProps>`,
      },
      {
        id: "data",
        title: "Data branch",
        summary: "Empty, populated, and error paths without clicking through flows.",
        branchLabels: ["empty", "populated", "error"],
        sourceCode: `const scope = useInboxScope(props)

if (scope.status === "empty") {
  return <EmptyInbox />
}
if (scope.status === "error") {
  return <ErrorState message={scope.message} />
}
return <InboxList items={scope.items} />`,
        frameDeclaration: `DataCase.frames = {
  empty: { props: {}, scope: { status: "empty" } },
  populated: {
    props: {},
    scope: { status: "ready", items: [{ id: "1", title: "Review auth branches" }] },
  },
  error: {
    props: {},
    scope: { status: "error", message: "Could not load inbox." },
  },
} satisfies GFrames<DataCaseProps, InboxScope>`,
      },
      {
        id: "permission",
        title: "Permission branch",
        summary: "Viewer and admin controls become provider variants.",
        branchLabels: ["viewer", "admin"],
        sourceCode: `const access = useGContext(AccessProvider)

return access.role === "admin"
  ? <AdminControls />
  : <ReadOnlySummary />`,
        frameDeclaration: `PermissionCase.frames = {
  viewer: {
    providers: [[AccessProvider, { role: "viewer" }]],
  },
  admin: {
    providers: [[AccessProvider, { role: "admin" }]],
  },
} satisfies GFrames<PermissionCaseProps>`,
      },
      {
        id: "layout",
        title: "Layout branch",
        summary: "Compact and overflow states stay visible before merge.",
        branchLabels: ["comfortable", "compact"],
        sourceCode: `return (
  <article
    data-density={props.density}
    className={props.density === "compact" ? "panel-compact" : "panel-comfortable"}
  >
    {props.children}
  </article>
)`,
        frameDeclaration: `LayoutCase.frames = {
  comfortable: { props: { density: "comfortable", title: "Release notes", body: "..." } },
  compact: { props: { density: "compact", title: "Release notes", body: "..." } },
  overflowing: { props: { density: "comfortable", title: "Release notes", body: "..." } },
} satisfies GFrames<LayoutCaseProps>`,
      },
    ],
  },
  sharedContext: {
    eyebrow: "Design and code share context",
    headline: "Design and coverage share Studio.",
    body: "Exploratory design frames and production component frames stay in one project.",
    designLabel: "Design Frames",
    componentLabel: "Component Frames",
    bridgeLabel: "Same project context",
  },
  humansAndAgents: {
    eyebrow: "For humans and agents",
    headline: "One surface, two audiences.",
    body: "People review the map. Agents satisfy the static frame contract.",
    humanCard: {
      title: "Human review",
      body: "Scan auth, data, role, and layout states without navigating the app.",
    },
    agentCard: {
      title: "Agent verification",
      body: "Agents add typed frames and verify coverage before merge.",
    },
  },
  studioShowcase: {
    eyebrow: "This site in Studio",
    headline: "Inspect the project behind this page.",
    body: "Open the real Studio board used to design and verify this website.",
    primaryCta: { label: "Open design board", href: "/runelight/studio#/design" },
    secondaryCta: { label: "Open components", href: "/runelight/studio" },
  },
  install: {
    eyebrow: "Install",
    headline: "Start from your repo.",
    body: "Paste one prompt. Your agent installs Runelight, wires Studio, and verifies the first frames.",
    prompt: `Install or upgrade Runelight in this project.

Fetch or refresh only this Runelight Agent Skill from
https://github.com/tuoxiansp/runelight:

- skills/setup-runelight

Install it as a project-level skill in this repository.

After refreshing that setup skill, run \`setup-runelight\` in this project now.
Follow it through setup and verification.`,
    copyLabel: "Copy prompt",
    copiedLabel: "Copied",
    exitHeadline: "Leave anytime",
    exitBody: "Rename `.g.tsx` or `.g.vue`, delete frames, remove the Studio route. Plain app code remains.",
  },
  frameworks: {
    eyebrow: "Works with your host",
    headline: "Same protocol, familiar hosts.",
    body: "Keep normal React or Vue authoring. Add frames, checks, and Studio around it.",
    hosts: [
      { name: "TypeScript React", detail: ".g.tsx components" },
      { name: "TypeScript Vue 3", detail: ".g.vue SFCs" },
      { name: "Vite React", detail: "Sidecar Studio on dev server" },
      { name: "Vite Vue", detail: "Sidecar Studio on dev server" },
      { name: "Next.js App Router", detail: "React adapter for App Router" },
      { name: "More frameworks", detail: "Same `.g` protocol idea" },
    ],
  },
  footer: {
    docs: [
      { label: "Authoring Guide", href: "https://github.com/tuoxiansp/runelight/blob/main/docs/runelight-authoring-guide.md" },
      { label: ".g Protocol", href: "https://github.com/tuoxiansp/runelight/blob/main/docs/g-protocol.md" },
      { label: "Static Contract", href: "https://github.com/tuoxiansp/runelight/blob/main/docs/runelight-static-contract.md" },
      { label: "Design Workspace", href: "https://github.com/tuoxiansp/runelight/blob/main/docs/runelight-design-workspace.md" },
      { label: "GitHub", href: "https://github.com/tuoxiansp/runelight" },
    ],
    copyright: "Runelight — the source-level visual model for GUI.",
  },
} satisfies SiteContent
