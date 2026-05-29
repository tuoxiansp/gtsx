import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { createGScopeHook } from "@gtsx/core"
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
})
