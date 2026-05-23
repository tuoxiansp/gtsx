import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  GTSXPreviewProvider,
  createGTSXScope,
  useGTSXContext,
  type GTSXProviderCases,
  type GTSXScopeCases,
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
} satisfies GTSXProviderCases<ThemeScope>

describe("GTSX runtime", () => {
  it("delegates a GTSX scope hook to the real hook by default", () => {
    const useScope = createGTSXScope((props: Props) => ({ title: `user:${props.userId}` }))

    expect(useScope({ userId: "user_1" })).toEqual({ title: "user:user_1" })
  })

  it("returns the active preview case scope inside a preview provider", () => {
    const useScope = createGTSXScope((props: Props) => ({ title: `real:${props.userId}` }))

    useScope.cases = {
      ready: {
        props: { userId: "user_1" },
        providers: { ThemeGTSXProvider: "dark" },
        scope: { title: "Ada Lovelace" },
      },
    } satisfies GTSXScopeCases<Props, { title: string }, [typeof ThemeGTSXProvider]>

    function Card(props: Props) {
      const scope = useScope(props)
      return <span>{scope.title}</span>
    }

    const html = renderToStaticMarkup(
      <GTSXPreviewProvider
        scope={useScope.cases.ready.scope}
        providerValues={new Map([[ThemeGTSXProvider, ThemeGTSXProvider.cases.dark.value]])}
      >
        <Card userId="user_1" />
      </GTSXPreviewProvider>,
    )

    expect(html).toBe("<span>Ada Lovelace</span>")
  })

  it("reads provider values selected by the active preview case", () => {
    function ThemeLabel() {
      const theme = useGTSXContext(ThemeGTSXProvider)
      return <span>{theme.mode}</span>
    }

    const html = renderToStaticMarkup(
      <GTSXPreviewProvider providerValues={new Map([[ThemeGTSXProvider, { mode: "dark" }]])}>
        <ThemeLabel />
      </GTSXPreviewProvider>,
    )

    expect(html).toBe("<span>dark</span>")
  })
})
