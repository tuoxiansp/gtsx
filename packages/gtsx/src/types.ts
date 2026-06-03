import type React from "react"

export type GProviderUpdateFn = (...args: any[]) => any

export type GProviderUseValue<Props extends object, State, Update extends GProviderUpdateFn> = (
  props: Props,
) => readonly [State, Update]

export type GProvider<
  State = unknown,
  Update extends GProviderUpdateFn = GProviderUpdateFn,
  Props extends object = any,
  Variant extends string = never,
> = React.ComponentType<
  Props & { children?: React.ReactNode }
> & {
  useUpdate?: () => Update
  readonly __gtsxVariants?: readonly Variant[]
  readonly __gtsxState?: State
  readonly __gtsxUpdate?: Update
  readonly __gtsxProps?: Props
}

export type AnyGProvider = React.ComponentType<any> & {
  useUpdate?: () => GProviderUpdateFn
  readonly __gtsxVariants?: readonly string[]
}

export type GProviderState<Provider> = Provider extends GProvider<infer State, any, any, any> ? State : never

export type GProviderUpdate<Provider> = Provider extends GProvider<any, infer Update, any, any> ? Update : never

export type GProviderVariant<Provider> = Provider extends GProvider<any, any, any, infer Variant> ? Variant : never

export type GProviderFrame<
  Provider extends AnyGProvider,
  Variant extends GProviderVariant<Provider>,
  Props = any,
  Scope = never,
  Providers extends readonly unknown[] = readonly unknown[],
> = GFrame<Props, Scope, Providers> & {
  readonly __gtsxProviderVariant?: readonly [Provider, Variant]
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
  props: Props
  providers?: GProviderEntriesFor<Providers>
} & ([Scope] extends [never] ? unknown : { scope?: Scope })

export type GFrames<
  Props,
  Scope = never,
  Providers extends readonly unknown[] = readonly unknown[],
> = Record<string, GFrame<Props, Scope, Providers>>
