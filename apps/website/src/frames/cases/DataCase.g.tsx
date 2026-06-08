import { createGScopeHook, type GFrames } from "@runelight/core"

type DataCaseProps = {
  title: string
}

type InboxItem = {
  id: string
  meta: string
  priority: "high" | "medium" | "low"
  title: string
}

type InboxScope =
  | { status: "empty" }
  | { status: "ready"; items: InboxItem[] }
  | { status: "error"; message: string }

type InboxPanelProps = {
  title: string
}

type InboxReviewQueueProps = InboxPanelProps & {
  items: InboxItem[]
}

type InboxTaskRowProps = {
  item: InboxItem
}

type InboxErrorPanelProps = InboxPanelProps & {
  message: string
}

function useRealInboxScope(_props: DataCaseProps): InboxScope {
  return { status: "empty" }
}

const useInboxScope = createGScopeHook(useRealInboxScope)

export default function DataCase(props: DataCaseProps) {
  const scope = useInboxScope(props)

  if (scope.status === "empty") {
    return <EmptyInboxPanel title={props.title} />
  }

  if (scope.status === "error") {
    return <InboxErrorPanel message={scope.message} title={props.title} />
  }

  return <InboxReviewQueue items={scope.items} title={props.title} />
}

export function EmptyInboxPanel(props: InboxPanelProps) {
  return (
    <section className="case-surface case-data case-data-empty" data-branch="empty">
      <header className="case-header">
        <span className="case-branch-tag">empty</span>
        <strong>{props.title}</strong>
      </header>
      <h2>No frames yet</h2>
      <p>Declare empty, populated, and error branches as typed source — no seeded database required.</p>
      <div className="case-state-meter">
        <span />
        <span />
        <span />
      </div>
    </section>
  )
}

export function InboxReviewQueue(props: InboxReviewQueueProps) {
  return (
    <section className="case-surface case-data case-data-populated" data-branch="populated">
      <header className="case-header">
        <span className="case-branch-tag">populated</span>
        <strong>{props.title}</strong>
      </header>
      <div className="case-list case-inbox-list">
        {props.items.map((item) => (
          <InboxTaskRow item={item} key={item.id} />
        ))}
      </div>
    </section>
  )
}

export function InboxTaskRow(props: InboxTaskRowProps) {
  return (
    <article className="case-task-row" data-priority={props.item.priority}>
      <span className="case-task-priority">{props.item.priority}</span>
      <div>
        <strong>{props.item.title}</strong>
        <span>{props.item.meta}</span>
      </div>
    </article>
  )
}

export function InboxErrorPanel(props: InboxErrorPanelProps) {
  return (
    <section className="case-surface case-data case-data-error" data-branch="error">
      <header className="case-header">
        <span className="case-branch-tag">error</span>
        <strong>{props.title}</strong>
      </header>
      <h2>Could not load inbox</h2>
      <p>{props.message}</p>
      <div className="case-error-trace">
        <span>preview worker</span>
        <strong>timed out after 8.4s</strong>
      </div>
      <span className="case-action case-action-secondary">Retry sync</span>
    </section>
  )
}

DataCase.frames = {
  empty: {
    props: { title: "Agent inbox" },
    scope: { status: "empty" },
  },
  populated: {
    props: { title: "Agent inbox" },
    scope: {
      status: "ready",
      items: [
        { id: "1", title: "Review auth branches", meta: "SessionPanel · 2 frames", priority: "high" },
        { id: "2", title: "Verify layout overflow", meta: "ContentPanel · 3 frames", priority: "medium" },
        { id: "3", title: "Approve agent diff", meta: "StudioBoard · 4 frames", priority: "low" },
      ],
    },
  },
  error: {
    props: { title: "Agent inbox" },
    scope: { status: "error", message: "The inbox service timed out while loading visual branches." },
  },
} satisfies GFrames<DataCaseProps, InboxScope>

EmptyInboxPanel.frames = {
  default: {
    props: { title: "Agent inbox" },
  },
} satisfies GFrames<InboxPanelProps>

InboxReviewQueue.frames = {
  populated: {
    props: {
      items: [
        { id: "1", title: "Review auth branches", meta: "SessionPanel · 2 frames", priority: "high" },
        { id: "2", title: "Verify layout overflow", meta: "ContentPanel · 3 frames", priority: "medium" },
        { id: "3", title: "Approve agent diff", meta: "StudioBoard · 4 frames", priority: "low" },
      ],
      title: "Agent inbox",
    },
  },
} satisfies GFrames<InboxReviewQueueProps>

InboxTaskRow.frames = {
  high: {
    props: { item: { id: "1", title: "Review auth branches", meta: "SessionPanel · 2 frames", priority: "high" } },
  },
  medium: {
    props: { item: { id: "2", title: "Verify layout overflow", meta: "ContentPanel · 3 frames", priority: "medium" } },
  },
  low: {
    props: { item: { id: "3", title: "Approve agent diff", meta: "StudioBoard · 4 frames", priority: "low" } },
  },
} satisfies GFrames<InboxTaskRowProps>

InboxErrorPanel.frames = {
  timeout: {
    props: {
      message: "The inbox service timed out while loading visual branches.",
      title: "Agent inbox",
    },
  },
} satisfies GFrames<InboxErrorPanelProps>
