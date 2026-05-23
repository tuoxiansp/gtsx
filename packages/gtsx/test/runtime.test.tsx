import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  GPreviewProvider,
  createGBoundaryCollector,
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

  it("reports an unknown component case override instead of falling back", () => {
    function ChildImpl() {
      return <span>child</span>
    }

    const Child = defineGComponent("src/Child.g.tsx#Child", ChildImpl)
    Child.cases = {
      closed: { props: {} },
    } satisfies GCases<Record<string, never>>

    expect(() =>
      renderToStaticMarkup(
        <GPreviewProvider caseOverrides={new Map([["src/Child.g.tsx#Child", "missing"]])}>
          <Child />
        </GPreviewProvider>,
      ),
    ).toThrow('Unknown GTSX case "missing" for src/Child.g.tsx#Child.')
  })

  it("records GTSX boundary parent-child relationships through runtime context", () => {
    const collector = createGBoundaryCollector()

    function OrdinaryReactChild() {
      return <em>ordinary child</em>
    }

    const Child = defineGComponent("src/Child.g.tsx#default", function ChildImpl() {
      return <span>child</span>
    })

    const Parent = defineGComponent("src/Parent.g.tsx#default", function ParentImpl() {
      return (
        <section>
          <OrdinaryReactChild />
          <Child />
        </section>
      )
    })

    renderToStaticMarkup(
      <GPreviewProvider boundaryCollector={collector}>
        <Parent />
      </GPreviewProvider>,
    )

    expect(collector.getTree()).toEqual([
      {
        id: "gtsx-boundary:0",
        coordinate: "src/Parent.g.tsx#default",
        children: [
          {
            id: "gtsx-boundary:1",
            coordinate: "src/Child.g.tsx#default",
            children: [],
          },
        ],
      },
    ])
  })

  it("adds DOM rects as positioning metadata without using them for hierarchy", () => {
    const collector = createGBoundaryCollector()
    const parentId = collector.registerBoundary("src/Parent.g.tsx#default", null)
    const childId = collector.registerBoundary("src/Child.g.tsx#default", parentId)

    collector.updateBoundaryRect(childId, {
      x: 10,
      y: 20,
      width: 120,
      height: 40,
    })
    collector.updateBoundaryRect(parentId, {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })

    expect(collector.getTree()).toEqual([
      {
        id: "gtsx-boundary:0",
        coordinate: "src/Parent.g.tsx#default",
        rect: { x: 0, y: 0, width: 200, height: 100 },
        children: [
          {
            id: "gtsx-boundary:1",
            coordinate: "src/Child.g.tsx#default",
            rect: { x: 10, y: 20, width: 120, height: 40 },
            children: [],
          },
        ],
      },
    ])
  })

  it("records serialized props, scope, and provider values for each boundary instance without executing functions", () => {
    const collector = createGBoundaryCollector()
    let calls = 0
    const onOpen = function handleOpen() {
      calls += 1
    }

    const ProfileCard = defineGComponent("src/ProfileCard.g.tsx#default", function ProfileCardImpl(props: {
      user: { name: string }
      onOpen: () => void
    }) {
      return <span>{props.user.name}</span>
    })
    ProfileCard.cases = {
      ready: {
        props: { user: { name: "Ada" }, onOpen },
        scope: { selectedUserId: "user_1" },
      },
    } satisfies GCases<{ user: { name: string }; onOpen: () => void }, { selectedUserId: string }>

    renderToStaticMarkup(
      <GPreviewProvider boundaryCollector={collector} providerValues={new Map([[ThemeGTSXProvider, { mode: "dark" }]])}>
        <ProfileCard user={{ name: "Ada" }} onOpen={onOpen} />
      </GPreviewProvider>,
    )

    expect(collector.getValues("gtsx-boundary:0")).toEqual({
      boundaryId: "gtsx-boundary:0",
      props: {
        type: "object",
        constructorName: "Object",
        entries: [
          {
            key: "user",
            value: {
              type: "object",
              constructorName: "Object",
              entries: [{ key: "name", value: { type: "string", value: "Ada" } }],
            },
          },
          { key: "onOpen", value: { type: "function", name: "handleOpen", displayName: "[Function handleOpen]" } },
        ],
      },
      scope: {
        type: "object",
        constructorName: "Object",
        entries: [{ key: "selectedUserId", value: { type: "string", value: "user_1" } }],
      },
      providerValues: [
        {
          providerName: "ThemeGTSXProvider",
          value: {
            type: "object",
            constructorName: "Object",
            entries: [{ key: "mode", value: { type: "string", value: "dark" } }],
          },
        },
      ],
    })
    expect(calls).toBe(0)
  })
})
