import type React from "react"

export type GProviderCase<Value> = {
  value: Value
}

export type GProviderCases<Value> = Record<string, GProviderCase<Value>>

export type GProvider<Value = unknown> = React.ComponentType<{
  value?: Value
  children: React.ReactNode
}> & {
  cases?: GProviderCases<Value>
}

export type AnyGProvider = React.ComponentType<any> & {
  cases?: GProviderCases<any>
}

export type GCase<Props, Scope = never> = {
  props: Props
  providers?: Record<string, string>
} & ([Scope] extends [never] ? unknown : { scope: Scope })

export type GCases<
  Props,
  Scope = never,
  _Providers extends readonly unknown[] = readonly unknown[],
> = Record<string, GCase<Props, Scope>>

export type GScopeHook<Args extends unknown[], Scope> = (...args: Args) => Scope
