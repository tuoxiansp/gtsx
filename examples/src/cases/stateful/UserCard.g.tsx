import { createGScope, type GCases } from "gtsx"

type UserCardProps = {
  userId: string
}

type UserCardScope =
  | { status: "loading" }
  | { status: "error"; message: string; onRetry: () => void }
  | { status: "ready"; name: string; role: string; lastSeen: string }

function useRealUserCardScope(_props: UserCardProps): UserCardScope {
  return { status: "loading" }
}

const useUserCardGScope = createGScope(useRealUserCardScope)

export default function UserCard(props: UserCardProps) {
  const scope = useUserCardGScope(props)

  if (scope.status === "loading") {
    return (
      <section className="user-card" data-state="loading">
        <span className="user-card-eyebrow">{props.userId}</span>
        <h1>Loading user...</h1>
        <div className="user-card-skeleton" />
      </section>
    )
  }

  if (scope.status === "error") {
    return (
      <section className="user-card" data-state="error">
        <span className="user-card-eyebrow">{props.userId}</span>
        <h1>User failed to load</h1>
        <p>{scope.message}</p>
        <button onClick={scope.onRetry}>Retry</button>
      </section>
    )
  }

  return (
    <section className="user-card" data-state="ready">
      <span className="user-card-eyebrow">{props.userId}</span>
      <h1>{scope.name}</h1>
      <p>{scope.role}</p>
      <strong>{scope.lastSeen}</strong>
    </section>
  )
}

UserCard.cases = {
  loading: {
    props: { userId: "user_1" },
    scope: { status: "loading" },
  },
  error: {
    props: { userId: "user_1" },
    scope: { status: "error", message: "The profile service timed out.", onRetry: () => {} },
  },
  ready: {
    props: { userId: "user_42" },
    scope: {
      status: "ready",
      name: "Ada Lovelace",
      role: "Preview systems engineer",
      lastSeen: "Active 3 minutes ago",
    },
  },
} satisfies GCases<UserCardProps, UserCardScope>
