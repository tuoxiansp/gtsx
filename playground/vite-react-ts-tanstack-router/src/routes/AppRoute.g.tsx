import type { GTSXPureCases } from "gtsx"

export type AppRouteProps = {
  template: "react-ts"
  routerVariant: "tanstack-router"
  scaffoldStatus: "too-many-args" | "first-route" | "ready"
}

export default function AppRoute(props: AppRouteProps) {
  if (props.scaffoldStatus === "too-many-args") {
    return (
      <main data-state="scaffold-error">
        <h1>Create Vite TanStack Router failed</h1>
        <p>too many arguments for create</p>
      </main>
    )
  }

  if (props.scaffoldStatus === "first-route") {
    return (
      <main data-state="first-route">
        <h1>TanStack Router route generated</h1>
        <p>{props.template}</p>
      </main>
    )
  }

  return (
    <main data-state="ready">
      <h1>Vite React TS app ready</h1>
      <p>{props.routerVariant}</p>
    </main>
  )
}

AppRoute.cases = {
  createVitePnpmFailure: {
    props: {
      template: "react-ts",
      routerVariant: "tanstack-router",
      scaffoldStatus: "too-many-args",
    },
  },
  generatedFirstRoute: {
    props: {
      template: "react-ts",
      routerVariant: "tanstack-router",
      scaffoldStatus: "first-route",
    },
  },
  ready: {
    props: {
      template: "react-ts",
      routerVariant: "tanstack-router",
      scaffoldStatus: "ready",
    },
  },
} satisfies GTSXPureCases<AppRouteProps>
