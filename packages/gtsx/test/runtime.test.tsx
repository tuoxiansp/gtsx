import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  GPreviewProvider,
  createGScope,
  defineGComponent,
  useGContext,
  type GCases,
  type GProviderCases,
} from "../src/index.js"

type Props = {
  userId: string
}

type ThemeScope = {
  mode: "light" | "dark"
}

function ThemeGTSXProvider(_props: { value?: ThemeScope; children: React.ReactNode }) {
  return null
}

ThemeGTSXProvider.cases = {
  light: { value: { mode: "light" } },
  dark: { value: { mode: "dark" } },
} satisfies GProviderCases<ThemeScope>

describe("GTSX runtime", () => {
  it("delegates a GTSX scope hook to the real hook by default", () => {
    const useScope = createGScope((props: Props) => ({ title: `user:${props.userId}` }))

    expect(useScope({ userId: "user_1" })).toEqual({ title: "user:user_1" })
  })

  it("returns the active preview case scope inside a preview provider", () => {
    const useScope = createGScope((props: Props) => ({ title: `real:${props.userId}` }))

    const cases = {
      ready: {
        props: { userId: "user_1" },
        providers: { ThemeGTSXProvider: "dark" },
        scope: { title: "Ada Lovelace" },
      },
    } satisfies GCases<Props, { title: string }, [typeof ThemeGTSXProvider]>

    function Card(props: Props) {
      const scope = useScope(props)
      return <span>{scope.title}</span>
    }

    const html = renderToStaticMarkup(
      <GPreviewProvider
        scope={cases.ready.scope}
        providerValues={new Map([[ThemeGTSXProvider, ThemeGTSXProvider.cases.dark.value]])}
      >
        <Card userId="user_1" />
      </GPreviewProvider>,
    )

    expect(html).toBe("<span>Ada Lovelace</span>")
  })

  it("reads provider values selected by the active preview case", () => {
    function ThemeLabel() {
      const theme = useGContext(ThemeGTSXProvider)
      return <span>{theme.mode}</span>
    }

    const html = renderToStaticMarkup(
      <GPreviewProvider providerValues={new Map([[ThemeGTSXProvider, { mode: "dark" }]])}>
        <ThemeLabel />
      </GPreviewProvider>,
    )

    expect(html).toBe("<span>dark</span>")
  })

  it("selects a nested component case by component coordinate", () => {
    const useChildScope = createGScope(() => ({ label: "real" }))

    function ChildImpl() {
      const scope = useChildScope()
      return <span>{scope.label}</span>
    }

    const Child = defineGComponent("src/Child.g.tsx#Child", ChildImpl)
    Child.cases = {
      closed: { props: {}, scope: { label: "closed" } },
      open: { props: {}, scope: { label: "open" } },
    } satisfies GCases<Record<string, never>, { label: string }>

    function Parent() {
      return <Child />
    }

    const html = renderToStaticMarkup(
      <GPreviewProvider caseOverrides={new Map([["src/Child.g.tsx#Child", "open"]])}>
        <Parent />
      </GPreviewProvider>,
    )

    expect(html).toBe("<span>open</span>")
  })
})
