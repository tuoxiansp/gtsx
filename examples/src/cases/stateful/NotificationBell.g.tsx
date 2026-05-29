import { createGScopeHook, type GCases } from "@gtsx/core"

type NotificationBellProps = {
  label: string
}

type NotificationBellScope = {
  unread: number
  expanded: boolean
}

function useRealNotificationBellScope(): NotificationBellScope {
  return { unread: 0, expanded: false }
}

const useNotificationBellGScope = createGScopeHook(useRealNotificationBellScope)

export default function NotificationBell(props: NotificationBellProps) {
  const scope = useNotificationBellGScope()

  return (
    <aside className="notification-bell" data-expanded={scope.expanded}>
      <header>
        <span>{props.label}</span>
        <strong>{scope.unread}</strong>
      </header>
      {scope.expanded ? (
        <ul>
          <li>Build completed</li>
          <li>Design review requested</li>
          <li>Preview capture ready</li>
        </ul>
      ) : (
        <p>Collapsed notification summary</p>
      )}
    </aside>
  )
}

NotificationBell.cases = {
  quiet: {
    props: { label: "Notifications" },
    scope: { unread: 0, expanded: false },
  },
  expanded: {
    props: { label: "Notifications" },
    scope: { unread: 3, expanded: true },
  },
} satisfies GCases<NotificationBellProps, NotificationBellScope>
