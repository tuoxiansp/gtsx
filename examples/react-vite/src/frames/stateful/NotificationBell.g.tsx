import { createGProvider, createGScopeHook, useGContext, type GFrames } from "@runelight/react/runtime"

export type NotificationBellEnvironment = {
  environment: "local" | "staging"
  reviewLane: "debug" | "release"
}

export const NotificationBellEnvironmentProvider = createGProvider(
  (props: { value: NotificationBellEnvironment }) => [props.value, () => {}] as const,
)

type NotificationBellProps = {
  label: string
  unread: number
  expanded: boolean
  items: string[]
}

type NotificationBellScope = {
  expanded: boolean
  items: string[]
}

function useRealNotificationBellScope(props: NotificationBellProps): NotificationBellScope {
  return {
    expanded: props.expanded,
    items: props.items,
  }
}

const useNotificationBellGScope = createGScopeHook(useRealNotificationBellScope)

export default function NotificationBell(props: NotificationBellProps) {
  const scope = useNotificationBellGScope(props)
  const environment = useGContext(NotificationBellEnvironmentProvider)

  return (
    <aside className="notification-bell" data-expanded={scope.expanded} data-environment={environment.environment}>
      <header>
        <span>
          {props.label}
          <small>{environment.reviewLane}</small>
        </span>
        <strong>{props.unread}</strong>
      </header>
      {scope.expanded ? (
        <ul>
          {scope.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{environment.environment === "staging" ? "Staging quiet period" : "Collapsed notification summary"}</p>
      )}
    </aside>
  )
}

NotificationBell.frames = {
  quiet: {
    props: { label: "Notifications", unread: 0, expanded: false, items: [] },
    providers: [[NotificationBellEnvironmentProvider, { environment: "local", reviewLane: "debug" }]],
    scope: { expanded: false, items: [] },
  },
  expanded: {
    props: {
      label: "Notifications",
      unread: 3,
      expanded: true,
      items: ["Build completed", "Design review requested", "Preview capture ready"],
    },
    providers: [[NotificationBellEnvironmentProvider, { environment: "staging", reviewLane: "release" }]],
    scope: {
      expanded: true,
      items: ["Build completed", "Design review requested", "Preview capture ready"],
    },
  },
} satisfies GFrames<NotificationBellProps, NotificationBellScope, [typeof NotificationBellEnvironmentProvider]>
