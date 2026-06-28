import type React from "react"

declare const gProviderType: unique symbol
declare const gProviderFrameType: unique symbol

export type GProviderUpdateFn = (...args: any[]) => any

export type GProviderUseValue<Props extends object, State, Update extends GProviderUpdateFn> = (
  props: Props,
) => readonly [State, Update]

type GProviderType<State, Update extends GProviderUpdateFn, Props extends object, Variant extends string> = {
  props: Props
  state: State
  update: Update
  variant: Variant
}

export type GProvider<
  State = unknown,
  Update extends GProviderUpdateFn = GProviderUpdateFn,
  Props extends object = any,
  Variant extends string = never,
> = React.ComponentType<
  Props & { children?: React.ReactNode }
> & {
  readonly [gProviderType]?: GProviderType<State, Update, Props, Variant>
}

export type AnyGProvider = React.ComponentType<any> & {
  readonly [gProviderType]?: GProviderType<any, GProviderUpdateFn, any, string>
}

export type GProviderState<Provider> =
  Provider extends { readonly [gProviderType]?: GProviderType<infer State, any, any, any> } ? State : never

export type GProviderUpdate<Provider> =
  Provider extends { readonly [gProviderType]?: GProviderType<any, infer Update, any, any> } ? Update : never

export type GProviderVariant<Provider> =
  Provider extends { readonly [gProviderType]?: GProviderType<any, any, any, infer Variant> } ? Extract<Variant, string> : never

export type GProviderFrame<
  Provider extends AnyGProvider,
  Variant extends GProviderVariant<Provider>,
  Props = any,
  Scope = never,
  Providers extends readonly unknown[] = readonly unknown[],
> = GFrame<Props, Scope, Providers> & {
  readonly [gProviderFrameType]?: readonly [Provider, Variant]
}

export type GProviderStates<Providers extends readonly unknown[]> = {
  readonly [Index in keyof Providers]: Providers[Index] extends GProvider<infer State, any, any, any> ? State : never
}

export type GProviderEntry<Provider extends AnyGProvider = AnyGProvider> = readonly [
  Provider,
  Provider extends GProvider<infer State, any, any, any> ? State : unknown,
]

export type GProviderEntries = readonly GProviderEntry[]

export type GProviderEntriesFor<Providers extends readonly unknown[]> = readonly unknown[] extends Providers
  ? GProviderEntries
  : {
      readonly [Index in keyof Providers]: Providers[Index] extends AnyGProvider
        ? readonly [Providers[Index], GProviderState<Providers[Index]>]
        : never
    }

export type GProviderOptions<Variants extends readonly string[] = readonly string[]> = {
  variants?: Variants
}

export type GFrame<Props, Scope = never, Providers extends readonly unknown[] = readonly unknown[]> = {
  description: string
  props: Props
  providers?: GProviderEntriesFor<Providers>
} & ([Scope] extends [never] ? unknown : { scope?: Scope })

export type GFrames<
  Props,
  Scope = never,
  Providers extends readonly unknown[] = readonly unknown[],
> = Record<string, GFrame<Props, Scope, Providers>>
