import { createGProvider, createGScopeHook, useGContext, type GFrames, type GProviderFrame } from "@gtsx/core"

import Child from "./Child.g"

type Props = {
  mode?: "hide" | "show"
  showChild?: boolean
}

type Item = {
  label: string
  show?: boolean
}

type ListProps = {
  items: Item[]
}

type LoginState = { variant: "login" } | { variant: "anonymous" }

export const LoginProvider = createGProvider(
  () => [{ variant: "anonymous" } as LoginState, () => {}] as const,
  { variants: ["login", "anonymous"] as const },
)

type BranchScope = { status: "loading" } | { status: "ready" }

const useBranchScope = createGScopeHook((_props: Props): BranchScope => ({ status: "loading" }))

export function CoveredByProps({ showChild = false }: Props) {
  return showChild ? <Child /> : null
}

CoveredByProps.frames = {
  hidden: { props: {} },
  shown: { props: { showChild: true } },
} satisfies GFrames<Props>

export function UncoveredByProps({ showChild = false }: Props) {
  return showChild ? <Child /> : null
}

UncoveredByProps.frames = {
  hidden: { props: {} },
} satisfies GFrames<Props>

export function CoveredByScope(props: Props) {
  const scope = useBranchScope(props)

  return scope.status === "ready" ? <Child /> : null
}

CoveredByScope.frames = {
  loading: {
    props: {},
    scope: { status: "loading" },
  },
  ready: {
    props: {},
    scope: { status: "ready" },
  },
} satisfies GFrames<Props, BranchScope>

export function CoveredByContext() {
  const login = useGContext(LoginProvider)

  return login.variant === "anonymous" ? <Child /> : null
}

CoveredByContext.frames = {
  login: {
    props: {},
  } satisfies GProviderFrame<typeof LoginProvider, "login">,
  anonymous: {
    props: {},
  } satisfies GProviderFrame<typeof LoginProvider, "anonymous">,
} satisfies GFrames<Record<string, never>>

function shouldShow(mode: Props["mode"]) {
  return mode === "show"
}

export function OpaqueByHelper({ mode = "hide" }: Props) {
  return shouldShow(mode) ? <Child /> : null
}

OpaqueByHelper.frames = {
  hidden: { props: {} },
  shown: { props: { mode: "show" } },
} satisfies GFrames<Props>

export function CoveredByMapItem({ items }: ListProps) {
  return (
    <>
      {items.map((item) => {
        if (item.show) return <Child />
        return null
      })}
    </>
  )
}

CoveredByMapItem.frames = {
  hidden: { props: { items: [{ label: "Hidden", show: false }] } },
  shown: { props: { items: [{ label: "Shown", show: true }] } },
} satisfies GFrames<ListProps>

export function CoveredByMapItemNegation({ items }: ListProps) {
  return <>{items.map((item) => (!item.show ? <Child /> : null))}</>
}

CoveredByMapItemNegation.frames = {
  mixed: { props: { items: [{ label: "Hidden", show: false }, { label: "Shown", show: true }] } },
} satisfies GFrames<ListProps>

export function UncoveredByMapItem({ items }: ListProps) {
  return (
    <>
      {items.map((item) => {
        if (item.show) return <Child />
        return null
      })}
    </>
  )
}

UncoveredByMapItem.frames = {
  hidden: { props: { items: [{ label: "Hidden", show: false }] } },
} satisfies GFrames<ListProps>

function shouldShowItem(item: Item) {
  return item.show
}

export function OpaqueByMapHelper({ items }: ListProps) {
  return <>{items.map((item) => (shouldShowItem(item) ? <Child /> : null))}</>
}

OpaqueByMapHelper.frames = {
  shown: { props: { items: [{ label: "Shown", show: true }] } },
} satisfies GFrames<ListProps>

export function OpaqueBySwitch({ mode = "hide" }: Props) {
  switch (mode) {
    case "show":
      return <Child />
    default:
      return null
  }
}

OpaqueBySwitch.frames = {
  hidden: { props: {} },
  shown: { props: { mode: "show" } },
} satisfies GFrames<Props>

export function OpaqueByStoredJSX({ showChild = false }: Props) {
  const child = showChild ? <Child /> : null
  return <>{child}</>
}

OpaqueByStoredJSX.frames = {
  hidden: { props: {} },
  shown: { props: { showChild: true } },
} satisfies GFrames<Props>

export function OpaqueByForOf({ items }: ListProps) {
  for (const item of items) {
    if (item.show) return <Child />
  }

  return null
}

OpaqueByForOf.frames = {
  shown: { props: { items: [{ label: "Shown", show: true }] } },
} satisfies GFrames<ListProps>

function RenderList(_props: { items: Item[]; renderItem: (item: Item) => unknown }) {
  return null
}

export function CoveredByRenderProp({ items }: ListProps) {
  return <RenderList items={items} renderItem={(item) => (item.show ? <Child /> : null)} />
}

CoveredByRenderProp.frames = {
  hidden: { props: { items: [{ label: "Hidden", show: false }] } },
  shown: { props: { items: [{ label: "Shown", show: true }] } },
} satisfies GFrames<ListProps>

function Panel(_props: { footer: unknown }) {
  return null
}

export function CoveredBySlot() {
  return <Panel footer={<Child />} />
}

CoveredBySlot.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>
