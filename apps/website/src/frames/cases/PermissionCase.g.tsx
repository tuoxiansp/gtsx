import { createGProvider, useGContext, type GFrames, type GProviderFrame } from "@runelight/core"

type PermissionCaseProps = {
  section: string
}

type PermissionSurfaceProps = {
  section: string
}

type AccessState = { role: "viewer" } | { role: "admin" }

export const AccessProvider = createGProvider(
  () => [{ role: "viewer" } as AccessState, () => {}] as const,
  { variants: ["viewer", "admin"] as const },
)

export default function PermissionCase(props: PermissionCaseProps) {
  const access = useGContext(AccessProvider)

  if (access.role === "admin") {
    return <AdminWorkspacePolicy section={props.section} />
  }

  return <ViewerWorkspaceSummary section={props.section} />
}

export function ViewerWorkspaceSummary(props: PermissionSurfaceProps) {
  return (
    <section className="case-surface case-permission case-permission-viewer" data-branch="viewer">
      <header className="case-header">
        <span className="case-branch-tag">viewer</span>
        <strong>{props.section}</strong>
      </header>
      <h2>Read-only workspace summary</h2>
      <p>Viewer controls stay visible beside admin branches in the same component map.</p>
      <PermissionMetric label="editable controls" value="0" />
    </section>
  )
}

export function AdminWorkspacePolicy(props: PermissionSurfaceProps) {
  return (
    <section className="case-surface case-permission case-permission-admin" data-branch="admin">
      <header className="case-header">
        <span className="case-branch-tag">admin</span>
        <strong>{props.section}</strong>
      </header>
      <h2>Manage workspace access</h2>
      <p>Role-specific UI becomes provider variants your agent can verify in Studio.</p>
      <div className="case-policy-grid">
        <PermissionMetric label="editable controls" value="8" />
        <PermissionMetric label="guarded branches" value="2" />
      </div>
      <span className="case-action case-action-primary">Save policy</span>
    </section>
  )
}

export function PermissionMetric(props: { label: string; value: string }) {
  return (
    <div className="case-permission-metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  )
}

PermissionCase.frames = {
  viewer: {
    props: { section: "Workspace settings" },
    providers: [[AccessProvider, { role: "viewer" }]],
  } satisfies GProviderFrame<typeof AccessProvider, "viewer">,
  admin: {
    props: { section: "Workspace settings" },
    providers: [[AccessProvider, { role: "admin" }]],
  } satisfies GProviderFrame<typeof AccessProvider, "admin">,
} satisfies GFrames<PermissionCaseProps>

ViewerWorkspaceSummary.frames = {
  readOnly: {
    props: { section: "Workspace settings" },
  },
} satisfies GFrames<PermissionSurfaceProps>

AdminWorkspacePolicy.frames = {
  editable: {
    props: { section: "Workspace settings" },
  },
} satisfies GFrames<PermissionSurfaceProps>

PermissionMetric.frames = {
  zero: {
    props: { label: "editable controls", value: "0" },
  },
  active: {
    props: { label: "guarded branches", value: "2" },
  },
} satisfies GFrames<{ label: string; value: string }>
