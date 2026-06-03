import type { GFrames } from "@gtsx/core"

import NotificationBell from "./NotificationBell.g"

type DashboardShellProps = {
  title: string
  environment: "local" | "staging"
}

export default function DashboardShell(props: DashboardShellProps) {
  return (
    <main className="dashboard-shell" data-environment={props.environment}>
      <section>
        <span className="dashboard-kicker">{props.environment}</span>
        <h1>{props.title}</h1>
        <p>
          This parent frame controls the page shell while the nested notification bell chooses its own GTSX frame.
        </p>
      </section>
      <NotificationBell label="Agent inbox" />
    </main>
  )
}

DashboardShell.frames = {
  stagingReview: {
    props: {
      title: "Staging review",
      environment: "staging",
    },
  },
  localDebug: {
    props: {
      title: "Local debug dashboard",
      environment: "local",
    },
  },
} satisfies GFrames<DashboardShellProps>
