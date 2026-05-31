import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { createGProvider, createGScopeHook } from "@gtsx/core"
import { GTSXPreviewCaseSheet, type GTSXPreviewComponent } from "../src/index.js"

describe("GTSXPreviewCaseSheet", () => {
  it("does not turn a missing case scope into an undefined preview override", () => {
    const useChildScope = createGScopeHook(() => ({ label: "real child scope" }))

    function Child() {
      const scope = useChildScope()
      return <span>{scope.label}</span>
    }

    const Parent = (() => <Child />) as GTSXPreviewComponent
    Parent.cases = {
      ready: {
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <GTSXPreviewCaseSheet
        component={Parent}
        entry="src/Parent.g.tsx#default"
        selectedCases={[{ name: "ready", testCase: Parent.cases.ready }]}
      />,
    )

    expect(html).toContain("real child scope")
  })

  it("makes case providers available to the top-level preview component", () => {
    const MessageProvider = createGProvider((props: { value: string }) => [props.value, () => {}] as const)
    const useMessage = createGScopeHook(
      (_props: Record<string, never>, [message]: readonly [string]) => ({ message }),
      [MessageProvider] as const,
    )

    const Message = (() => {
      const scope = useMessage({})
      return <span>{scope.message}</span>
    }) as GTSXPreviewComponent
    Message.cases = {
      ready: {
        props: {},
        providers: [[MessageProvider, "case provider value"]],
      },
    }

    const html = renderToStaticMarkup(
      <GTSXPreviewCaseSheet
        component={Message}
        entry="src/Message.g.tsx#default"
        selectedCases={[{ name: "ready", testCase: Message.cases.ready }]}
      />,
    )

    expect(html).toContain("case provider value")
  })
})
