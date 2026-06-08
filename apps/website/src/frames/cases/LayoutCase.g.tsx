import type { GFrames } from "@runelight/core"

type LayoutCaseProps = {
  body: string
  density: "comfortable" | "compact"
  title: string
}

type ReleaseNoteCardProps = LayoutCaseProps & {
  footer: string
}

type ReleaseMetaProps = {
  label: string
  value: string
}

export default function LayoutCase(props: LayoutCaseProps) {
  return (
    <ReleaseNoteCard
      body={props.body}
      density={props.density}
      footer={props.density === "compact" ? "small viewport" : "reader viewport"}
      title={props.title}
    />
  )
}

export function ReleaseNoteCard(props: ReleaseNoteCardProps) {
  return (
    <article className="case-surface case-layout" data-density={props.density} data-branch={props.density}>
      <header className="case-header">
        <span className="case-branch-tag">{props.density}</span>
        <strong>{props.title}</strong>
      </header>
      <p>{props.body}</p>
      <div className="case-release-meta-row">
        <ReleaseMeta label="viewport" value={props.footer} />
        <ReleaseMeta label="branch" value={props.density} />
      </div>
    </article>
  )
}

export function ReleaseMeta(props: ReleaseMetaProps) {
  return (
    <span className="case-release-meta">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </span>
  )
}

LayoutCase.frames = {
  comfortable: {
    props: {
      density: "comfortable",
      title: "Release notes",
      body: "Comfortable spacing keeps long-form content readable while still exposing layout branches in Studio.",
    },
  },
  compact: {
    props: {
      density: "compact",
      title: "Release notes",
      body: "Compact density models admin surfaces and smaller viewports as first-class visual branches.",
    },
  },
  overflowing: {
    props: {
      density: "comfortable",
      title: "Release notes",
      body:
        "Overflowing content reveals real layout pressure without hiding the branch. Metadata, paragraphs, and trailing actions stay visible for review.",
    },
  },
} satisfies GFrames<LayoutCaseProps>

ReleaseNoteCard.frames = {
  comfortable: {
    props: {
      density: "comfortable",
      title: "Release notes",
      body: "Comfortable spacing keeps long-form content readable while still exposing layout branches in Studio.",
      footer: "reader viewport",
    },
  },
  compact: {
    props: {
      density: "compact",
      title: "Release notes",
      body: "Compact density models admin surfaces and smaller viewports as first-class visual branches.",
      footer: "small viewport",
    },
  },
} satisfies GFrames<ReleaseNoteCardProps>

ReleaseMeta.frames = {
  viewport: {
    props: { label: "viewport", value: "reader viewport" },
  },
  branch: {
    props: { label: "branch", value: "comfortable" },
  },
} satisfies GFrames<ReleaseMetaProps>
