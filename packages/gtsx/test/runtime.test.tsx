import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { describe, expect, it } from "vitest"

import {
  GPreviewProvider,
  createGBoundaryCollector,
  createGProvider,
  createGScopeHook,
  defineGComponent,
  readGBoundaryElementRect,
  useGContext,
  useGContextUpdate,
  type GCases,
} from "../src/index.js"

type Props = {
  userId: string
}

type ThemeScope = {
  mode: "light" | "dark"
}

const PreviewThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeScope>({ mode: "light" }),
)
PreviewThemeProvider.displayName = "PreviewThemeProvider"

describe("GTSX runtime", () => {
  it("creates a provider with readable state and an update hook", () => {
    type ThemeState = {
      mode: "light" | "dark"
    }

    const ThemeProvider = createGProvider((props: { initialState: ThemeState }) =>
      React.useState<ThemeState>(props.initialState),
    )

    function ThemeButton() {
      const theme = useGContext(ThemeProvider)
      const setTheme = useGContextUpdate(ThemeProvider)

      return (
        <button onClick={() => setTheme((prev) => ({ ...prev, mode: "dark" }))}>
          {theme.mode}
        </button>
      )
    }

    let renderer: ReactTestRenderer | undefined
    act(() => {
      renderer = create(
        <ThemeProvider initialState={{ mode: "light" }}>
          <ThemeButton />
        </ThemeProvider>,
      )
    })

    expect(renderer?.toJSON()).toMatchObject({ type: "button", children: ["light"] })

    act(() => {
      renderer?.root.findByType("button").props.onClick()
    })

    expect(renderer?.toJSON()).toMatchObject({ type: "button", children: ["dark"] })
  })

  it("delegates a GTSX scope hook to the real hook by default", () => {
    const useScope = createGScopeHook((props: Props) => ({ title: `user:${props.userId}` }))

    function Card(props: Props) {
      const scope = useScope(props)
      return <span>{scope.title}</span>
    }

    expect(renderToStaticMarkup(<Card userId="user_1" />)).toBe("<span>user:user_1</span>")
  })

  it("returns the active preview case scope inside a preview provider", () => {
    const useScope = createGScopeHook((props: Props) => ({ title: `real:${props.userId}` }))

    const cases = {
      ready: {
        props: { userId: "user_1" },
        providers: [[PreviewThemeProvider, { mode: "dark" }]],
        scope: { title: "Ada Lovelace" },
      },
    } satisfies GCases<Props, { title: string }, [typeof PreviewThemeProvider]>

    function Card(props: Props) {
      const scope = useScope(props)
      return <span>{scope.title}</span>
    }

    const html = renderToStaticMarkup(
      <GPreviewProvider scope={cases.ready.scope} providerValues={new Map([[PreviewThemeProvider, { mode: "dark" }]])}>
        <Card userId="user_1" />
      </GPreviewProvider>,
    )

    expect(html).toBe("<span>Ada Lovelace</span>")
  })

  it("derives scope from provider states declared on a GScope hook", () => {
    type ThemeState = {
      color: string
    }

    const ThemeProvider = createGProvider((props: { initialState: ThemeState }) =>
      React.useState<ThemeState>(props.initialState),
    )
    const CounterProvider = createGProvider((props: { initialState: number }) =>
      React.useState<number>(props.initialState),
    )
    const providers = [ThemeProvider, CounterProvider] as const

    const useScope = createGScopeHook(
      (props: Props, [theme, counter]) => ({
        title: `${props.userId}:${theme.color}:${counter}`,
      }),
      providers,
    )

    function Card(props: Props) {
      const scope = useScope(props)
      return <span>{scope.title}</span>
    }

    const html = renderToStaticMarkup(
      <ThemeProvider initialState={{ color: "#0af" }}>
        <CounterProvider initialState={42}>
          <Card userId="user_1" />
        </CounterProvider>
      </ThemeProvider>,
    )

    expect(html).toBe("<span>user_1:#0af:42</span>")
  })

  it("derives preview scope from active case provider entries when no real provider exists", () => {
    type ThemeState = {
      color: string
    }

    const ThemeProvider = createGProvider((_props: Record<string, never>) =>
      React.useState<ThemeState>({ color: "#111" }),
    )
    const CounterProvider = createGProvider((_props: Record<string, never>) => React.useState(0))
    const providers = [ThemeProvider, CounterProvider] as const

    const useScope = createGScopeHook(
      (props: Props, [theme, counter]) => ({
        title: `${props.userId}:${theme.color}:${counter}`,
      }),
      providers,
    )

    const Card = defineGComponent("src/Card.g.tsx#default", function CardImpl(props: Props) {
      const scope = useScope(props)
      return <span>{scope.title}</span>
    })
    Card.cases = {
      preview: {
        props: { userId: "user_1" },
        providers: [
          [ThemeProvider, { color: "#f0a" }],
          [CounterProvider, 7],
        ],
      },
    } satisfies GCases<Props, { title: string }, typeof providers>

    const html = renderToStaticMarkup(
      <GPreviewProvider>
        <Card userId="user_1" />
      </GPreviewProvider>,
    )

    expect(html).toBe("<span>user_1:#f0a:7</span>")
  })

  it("reads provider values selected by the active preview case", () => {
    function ThemeLabel() {
      const theme = useGContext(PreviewThemeProvider)
      return <span>{theme.mode}</span>
    }

    const html = renderToStaticMarkup(
      <GPreviewProvider providerValues={new Map([[PreviewThemeProvider, { mode: "dark" }]])}>
        <ThemeLabel />
      </GPreviewProvider>,
    )

    expect(html).toBe("<span>dark</span>")
  })

  it("falls back to the active component case provider entries in preview", () => {
    type ThemeState = {
      mode: "light" | "dark"
    }

    const ThemeProvider = createGProvider((_props: Record<string, never>) =>
      React.useState<ThemeState>({ mode: "light" }),
    )

    const ThemeLabel = defineGComponent("src/ThemeLabel.g.tsx#default", function ThemeLabelImpl() {
      const theme = useGContext(ThemeProvider)
      return <span>{theme.mode}</span>
    })
    ThemeLabel.cases = {
      dark: {
        props: {},
        providers: [[ThemeProvider, { mode: "dark" }]],
      },
    } satisfies GCases<Record<string, never>>

    const html = renderToStaticMarkup(
      <GPreviewProvider>
        <ThemeLabel />
      </GPreviewProvider>,
    )

    expect(html).toBe("<span>dark</span>")
  })

  it("returns a noop update for preview case provider entries without a real provider", () => {
    type ThemeState = {
      mode: "light" | "dark"
    }

    const ThemeProvider = createGProvider((_props: Record<string, never>) =>
      React.useState<ThemeState>({ mode: "light" }),
    )

    const ThemeButton = defineGComponent("src/ThemeButton.g.tsx#default", function ThemeButtonImpl() {
      const theme = useGContext(ThemeProvider)
      const setTheme = useGContextUpdate(ThemeProvider)

      return (
        <button onClick={() => setTheme((prev) => ({ ...prev, mode: "dark" }))}>
          {theme.mode}
        </button>
      )
    })
    ThemeButton.cases = {
      preview: {
        props: {},
        providers: [[ThemeProvider, { mode: "light" }]],
      },
    } satisfies GCases<Record<string, never>>

    let renderer: ReactTestRenderer | undefined
    act(() => {
      renderer = create(
        <GPreviewProvider>
          <ThemeButton />
        </GPreviewProvider>,
      )
    })

    expect(renderer?.toJSON()).toMatchObject({ type: "button", children: ["light"] })

    act(() => {
      renderer?.root.findByType("button").props.onClick()
    })

    expect(renderer?.toJSON()).toMatchObject({ type: "button", children: ["light"] })
  })

  it("selects a nested component case by component coordinate", () => {
    const useChildScope = createGScopeHook(() => ({ label: "real" }))

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

    const tree = collector.getTree()
    const parentId = tree[0]?.id
    const childId = tree[0]?.children[0]?.id

    expect(parentId).toMatch(/^gtsx-boundary:/)
    expect(childId).toMatch(/^gtsx-boundary:/)
    expect(collector.getTree()).toEqual([
      {
        id: parentId,
        coordinate: "src/Parent.g.tsx#default",
        children: [
          {
            id: childId,
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

  it("clips display-contents boundary fallback rects to overflow ancestors", () => {
    const restoreGetComputedStyle = installFakeComputedStyle()
    const overflowingChild = fakeElement({ x: 0, y: 0, width: 184, height: 246 })
    const clippedPreview = fakeElement({ x: 0, y: 0, width: 184, height: 96 }, { overflowX: "hidden", overflowY: "hidden" }, [
      overflowingChild,
    ])
    const boundary = fakeElement({ x: 0, y: 0, width: 0, height: 0 }, {}, [clippedPreview])

    try {
      expect(readGBoundaryElementRect(boundary)).toEqual({
        x: 0,
        y: 0,
        width: 184,
        height: 96,
      })
    } finally {
      restoreGetComputedStyle()
    }
  })

  it("uses rendered root rects instead of absolute descendant overflow for boundary fallbacks", () => {
    const restoreGetComputedStyle = installFakeComputedStyle()
    const previewIframe = fakeElement({ x: 0, y: 0, width: 390, height: 844 })
    const previewRoot = fakeElement({ x: 0, y: 0, width: 390, height: 108 }, {}, [previewIframe])
    const boundary = fakeElement({ x: 0, y: 0, width: 0, height: 0 }, {}, [previewRoot])

    try {
      expect(readGBoundaryElementRect(boundary)).toEqual({
        x: 0,
        y: 0,
        width: 390,
        height: 108,
      })
    } finally {
      restoreGetComputedStyle()
    }
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
      <GPreviewProvider boundaryCollector={collector} providerValues={new Map([[PreviewThemeProvider, { mode: "dark" }]])}>
        <ProfileCard user={{ name: "Ada" }} onOpen={onOpen} />
      </GPreviewProvider>,
    )

    const boundaryId = collector.getTree()[0]?.id
    expect(boundaryId).toMatch(/^gtsx-boundary:/)
    expect(collector.getValues(boundaryId!)).toEqual({
      boundaryId,
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
          providerName: "PreviewThemeProvider",
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

type FakeElement = HTMLElement & {
  fakeChildren: FakeElement[]
  fakeOverflowX?: string
  fakeOverflowY?: string
}

function fakeElement(
  rect: { x: number; y: number; width: number; height: number },
  style: { overflowX?: string; overflowY?: string } = {},
  children: FakeElement[] = [],
): FakeElement {
  const element = {
    children,
    fakeChildren: children,
    fakeOverflowX: style.overflowX,
    fakeOverflowY: style.overflowY,
    parentElement: null,
    getBoundingClientRect() {
      return {
        ...rect,
        bottom: rect.y + rect.height,
        left: rect.x,
        right: rect.x + rect.width,
        top: rect.y,
      } as DOMRect
    },
    querySelectorAll() {
      return children.flatMap((child) => [child, ...child.querySelectorAll("*")]) as unknown as NodeListOf<HTMLElement>
    },
  } as unknown as FakeElement

  for (const child of children) {
    ;(child as unknown as { parentElement: HTMLElement }).parentElement = element
  }

  return element
}

function installFakeComputedStyle(): () => void {
  const original = globalThis.getComputedStyle
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value(element: Element) {
      const fake = element as FakeElement
      return {
        overflowX: fake.fakeOverflowX ?? "visible",
        overflowY: fake.fakeOverflowY ?? "visible",
      } as CSSStyleDeclaration
    },
  })

  return () => {
    Object.defineProperty(globalThis, "getComputedStyle", {
      configurable: true,
      value: original,
    })
  }
}
