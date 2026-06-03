import { createGProvider, createGScopeHook, useGContext, type GFrames, type GProviderFrame } from "@gtsx/core"

import Child from "./Child.g"
import defaultImportedStatic, {
  exportedAliasStatic,
  importedConfig,
  importedItems,
  importedSpreadConfig,
  importedSpreadItems,
  reExportedLocalStatic,
} from "./StaticValues"
import * as StaticValues from "./StaticValues"
import {
  barreledConfig,
  barreledDefaultStatic,
  importedConfigAlias,
  importedItems as starImportedItems,
  reExportedImportedConfig,
} from "./static-barrel"
import { StaticNamespace } from "./static-namespace-barrel"
import * as NamespaceBarrel from "./static-namespace-barrel"

type Props = {
  mode?: "hide" | "show"
  showChild?: boolean
}

type Item = {
  label: string
  show?: boolean
}

const staticProgressDays = [
  { day: "1", label: "初识", state: "done" },
  { day: "2", label: "设定", state: "done" },
  { day: "3", label: "今日", state: "current" },
] as const

const staticItems = [
  { label: "Hidden", show: false },
  { label: "Shown", show: true },
] as const

const hiddenStaticItems = [{ label: "Hidden", show: false }] as const

const staticEnabled = true
const staticMode = "show" as const
const staticCount = 3
const staticConfig = {
  nested: {
    show: true,
  },
} as const
const hiddenStaticConfig = {
  nested: {
    show: false,
  },
} as const
const staticConfigWithoutConstAssertion = {
  nested: {
    show: true,
    mode: "show",
  },
}
const staticItemsWithoutConstAssertion = [{ label: "Shown", show: true }]
const staticSpreadBase = {
  show: true,
  tone: "base",
}
const staticSpreadConfig = {
  ...staticSpreadBase,
  tone: "final",
}
const staticSpreadItems = [...hiddenStaticItems, { label: "Shown", show: true }]

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

export function CoveredByStaticConstMap() {
  return (
    <>
      {staticProgressDays.map((step) => (
        <Child key={step.day} />
      ))}
    </>
  )
}

CoveredByStaticConstMap.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStaticConstMapItem() {
  return <>{staticItems.map((item) => (item.show ? <Child /> : null))}</>
}

CoveredByStaticConstMapItem.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStaticConstBoolean() {
  return staticEnabled ? <Child /> : null
}

CoveredByStaticConstBoolean.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStaticConstObject() {
  return staticConfig.nested.show ? <Child /> : null
}

CoveredByStaticConstObject.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStaticConstComparison() {
  return staticMode === "show" && staticCount > 0 ? <Child /> : null
}

CoveredByStaticConstComparison.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByLocalStaticConst() {
  const localConfig = { show: true } as const

  return localConfig.show ? <Child /> : null
}

CoveredByLocalStaticConst.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStaticConstWithoutConstAssertion() {
  return (
    <>
      {staticConfigWithoutConstAssertion.nested.show ? <Child /> : null}
      {staticConfigWithoutConstAssertion.nested.mode === "show" ? <Child /> : null}
      {staticItemsWithoutConstAssertion.map((item) => (item.show ? <Child /> : null))}
    </>
  )
}

CoveredByStaticConstWithoutConstAssertion.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStaticConstObjectSpread() {
  return staticSpreadConfig.show && staticSpreadConfig.tone === "final" ? <Child /> : null
}

CoveredByStaticConstObjectSpread.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStaticConstArraySpread() {
  return <>{staticSpreadItems.map((item) => (item.show ? <Child /> : null))}</>
}

CoveredByStaticConstArraySpread.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByLocalStaticSpread() {
  const localBase = { show: true, tone: "base" }
  const localConfig = { ...localBase, tone: "final" }

  return localConfig.show && localConfig.tone === "final" ? <Child /> : null
}

CoveredByLocalStaticSpread.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByImportedStaticConst() {
  return (
    <>
      {importedConfig.nested.show ? <Child /> : null}
      {importedConfig.nested.mode === "show" ? <Child /> : null}
      {importedItems.map((item) => (item.show ? <Child /> : null))}
      {reExportedLocalStatic.show ? <Child /> : null}
      {exportedAliasStatic.show ? <Child /> : null}
      {defaultImportedStatic.show ? <Child /> : null}
    </>
  )
}

CoveredByImportedStaticConst.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByNamespaceImportedStaticConst() {
  return StaticValues.importedConfig.nested.show ? <Child /> : null
}

CoveredByNamespaceImportedStaticConst.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByBarrelImportedStaticConst() {
  return (
    <>
      {barreledConfig.nested.show ? <Child /> : null}
      {barreledDefaultStatic.show ? <Child /> : null}
    </>
  )
}

CoveredByBarrelImportedStaticConst.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByStarAndAliasImportedStaticConst() {
  return (
    <>
      {importedConfigAlias.nested.show ? <Child /> : null}
      {reExportedImportedConfig.nested.show ? <Child /> : null}
      {starImportedItems.map((item) => (item.show ? <Child /> : null))}
    </>
  )
}

CoveredByStarAndAliasImportedStaticConst.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByNamespaceReExportedStaticConst() {
  return (
    <>
      {StaticNamespace.importedConfig.nested.show ? <Child /> : null}
      {NamespaceBarrel.StaticNamespace.importedConfig.nested.show ? <Child /> : null}
    </>
  )
}

CoveredByNamespaceReExportedStaticConst.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function CoveredByImportedStaticSpread() {
  return (
    <>
      {importedSpreadConfig.show && importedSpreadConfig.tone === "final" ? <Child /> : null}
      {importedSpreadItems.map((item) => (item.show ? <Child /> : null))}
    </>
  )
}

CoveredByImportedStaticSpread.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

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

export function UncoveredByStaticConstMapItem() {
  return <>{hiddenStaticItems.map((item) => (item.show ? <Child /> : null))}</>
}

UncoveredByStaticConstMapItem.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function UncoveredByStaticConstObject() {
  return hiddenStaticConfig.nested.show ? <Child /> : null
}

UncoveredByStaticConstObject.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

export function UncoveredByStaticConstObjectSpreadOverride() {
  return staticSpreadConfig.tone === "base" ? <Child /> : null
}

UncoveredByStaticConstObjectSpreadOverride.frames = {
  default: { props: {} },
} satisfies GFrames<Record<string, never>>

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
