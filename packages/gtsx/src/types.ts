import type React from "react"

export type GTSXProviderCase<Value> = {
  value: Value
}

export type GTSXProviderCases<Value> = Record<string, GTSXProviderCase<Value>>

export type GTSXProvider<Value = unknown> = React.ComponentType<{
  value?: Value
  children: React.ReactNode
}> & {
  cases?: GTSXProviderCases<Value>
}

export type AnyGTSXProvider = React.ComponentType<any> & {
  cases?: GTSXProviderCases<any>
}

export type GTSXScopeCase<Props, Scope> = {
  props: Props
  scope: Scope
  providers?: Record<string, string>
}

export type GTSXScopeCases<
  Props,
  Scope,
  _Providers extends readonly unknown[] = readonly unknown[],
> = Record<string, GTSXScopeCase<Props, Scope>>

export type GTSXPureCase<Props> = {
  props: Props
  providers?: Record<string, string>
}

export type GTSXPureCases<Props> = Record<string, GTSXPureCase<Props>>

export type GTSXScopeHook<Args extends unknown[], Scope> = ((...args: Args) => Scope) & {
  cases?: GTSXScopeCases<Args[0], Scope>
}
