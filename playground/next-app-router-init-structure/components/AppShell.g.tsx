import type { GTSXPureCases } from "gtsx"

export type AppShellProps = {
  route: "/"
  routeHandlerStatus: "healthy" | "hanging"
}

export default function AppShell(props: AppShellProps) {
  return (
    <main>
      <h1>Next.js App Router playground</h1>
      <p data-route={props.route}>Root route is present.</p>
      <p data-api-state={props.routeHandlerStatus}>Route handler: {props.routeHandlerStatus}</p>
    </main>
  )
}

AppShell.cases = {
  firstLoad: {
    props: { route: "/", routeHandlerStatus: "healthy" },
  },
  routeHandlerTrouble: {
    props: { route: "/", routeHandlerStatus: "hanging" },
  },
} satisfies GTSXPureCases<AppShellProps>
