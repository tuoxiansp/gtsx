import type { GTSXPureCases } from "gtsx"

type Notification = {
  id: string
  title: string
  body: string
  priority: "normal" | "high"
}

type NotificationCenterProps = {
  heading: string
  tag: string
  notifications: Notification[]
}

export default function NotificationCenter(props: NotificationCenterProps) {
  return (
    <section className="notification-shell">
      <header>
        <span className="notification-tag">{props.tag}</span>
        <h1>{props.heading}</h1>
      </header>
      {props.notifications.length === 0 ? (
        <div className="notification-empty">No notifications. The system is quiet.</div>
      ) : (
        <div className="notification-list">
          {props.notifications.map((notification) => (
            <article className="notification-item" data-priority={notification.priority} key={notification.id}>
              <h2>{notification.title}</h2>
              <p>{notification.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

NotificationCenter.cases = {
  empty: {
    props: {
      heading: "Notification center",
      tag: "empty",
      notifications: [],
    },
  },
  mixedPriority: {
    props: {
      heading: "Deploy monitor",
      tag: "live",
      notifications: [
        {
          id: "n1",
          title: "Build passed",
          body: "The production bundle compiled in 38 seconds.",
          priority: "normal",
        },
        {
          id: "n2",
          title: "Manual approval required",
          body: "Agent review found a visual change in the checkout panel.",
          priority: "high",
        },
      ],
    },
  },
} satisfies GTSXPureCases<NotificationCenterProps>
