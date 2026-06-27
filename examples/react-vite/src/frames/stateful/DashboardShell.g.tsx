import { createGScopeHook, type GFrames } from "@runelight/react/runtime"

import NotificationBell, { NotificationBellEnvironmentProvider } from "./NotificationBell.g"

type DashboardShellProps = {
  title: string
  environment: "local" | "staging"
}

type DashboardShellScope = {
  notifications: {
    unread: number
    expanded: boolean
    items: string[]
  }
}

function useRealDashboardShellScope(props: DashboardShellProps): DashboardShellScope {
  return props.environment === "staging"
    ? {
        notifications: {
          unread: 5,
          expanded: true,
          items: ["Release branch deployed", "Visual diff queued", "Agent review requested", "Smoke capture ready", "Docs sync pending"],
        },
      }
    : {
        notifications: {
          unread: 1,
          expanded: false,
          items: ["Local preview attached"],
        },
      }
}

const useDashboardShellGScope = createGScopeHook(useRealDashboardShellScope)

export default function DashboardShell(props: DashboardShellProps) {
  const scope = useDashboardShellGScope(props)
  const reviewLane = props.environment === "staging" ? "release" : "debug"

  return (
    <main className="dashboard-shell" data-environment={props.environment}>
      <section>
        <span className="dashboard-kicker">{props.environment}</span>
        <h1>{props.title}</h1>
        <p>
          This parent frame owns the page data. The nested notification bell keeps its child-local frame state while
          receiving props and provider environment from this render.
        </p>
      </section>
      <NotificationBellEnvironmentProvider value={{ environment: props.environment, reviewLane }}>
        <NotificationBell
          label="Agent inbox"
          unread={scope.notifications.unread}
          expanded={scope.notifications.expanded}
          items={scope.notifications.items}
        />
      </NotificationBellEnvironmentProvider>
    </main>
  )
}

DashboardShell.frames = {
  stagingReview: {
    props: {
      title: "Staging review",
      environment: "staging",
    },
    scope: {
      notifications: {
        unread: 5,
        expanded: true,
        items: ["Release branch deployed", "Visual diff queued", "Agent review requested", "Smoke capture ready", "Docs sync pending"],
      },
    },
  },
  localDebug: {
    props: {
      title: "Local debug dashboard",
      environment: "local",
    },
    scope: {
      notifications: {
        unread: 1,
        expanded: false,
        items: ["Local preview attached"],
      },
    },
  },
} satisfies GFrames<DashboardShellProps, DashboardShellScope>
