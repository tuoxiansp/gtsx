import type { InjectionKey } from "vue"

declare const gVueInjectionKeyType: unique symbol
declare const gVueProviderFrameType: unique symbol

type GVueInjectionKeyType<Value, Variant extends string> = {
  value: Value
  variant: Variant
}

export type GVueInjectionKey<Value = unknown, Variant extends string = never> = InjectionKey<Value> & {
  readonly [gVueInjectionKeyType]?: GVueInjectionKeyType<Value, Variant>
}

export type AnyGVueInjectionKey = InjectionKey<any> & {
  readonly [gVueInjectionKeyType]?: GVueInjectionKeyType<any, string>
}

export type GVueInjectionValue<Key> = Key extends InjectionKey<infer Value> ? Value : never

export type GVueInjectionVariant<Key> =
  Key extends { readonly [gVueInjectionKeyType]?: GVueInjectionKeyType<any, infer Variant> } ? Extract<Variant, string> : never

export type GVueProviderEntry<Key extends AnyGVueInjectionKey = AnyGVueInjectionKey> = readonly [
  Key,
  GVueInjectionValue<Key>,
]

export type GVueProviderEntries = readonly GVueProviderEntry[]

export type GVueProviderEntriesFor<Providers extends readonly unknown[]> = readonly unknown[] extends Providers
  ? GVueProviderEntries
  : {
      readonly [Index in keyof Providers]: Providers[Index] extends AnyGVueInjectionKey
        ? readonly [Providers[Index], GVueInjectionValue<Providers[Index]>]
        : never
    }

export type GVueFrame<Props, Scope = never, Providers extends readonly unknown[] = readonly unknown[]> = {
  description: string
  props: Props
  providers?: GVueProviderEntriesFor<Providers>
} & ([Scope] extends [never] ? unknown : { scope?: Scope })

export type GVueFrames<
  Props,
  Scope = never,
  Providers extends readonly unknown[] = readonly unknown[],
> = Record<string, GVueFrame<Props, Scope, Providers>>

export type GVueProviderFrame<
  Provider extends AnyGVueInjectionKey,
  Variant extends GVueInjectionVariant<Provider>,
  Props = any,
  Scope = never,
  Providers extends readonly unknown[] = readonly [Provider],
> = GVueFrame<Props, Scope, Providers> & {
  readonly [gVueProviderFrameType]?: readonly [Provider, Variant]
}

export type GVueInjectionKeyOptions<Variants extends readonly string[] = readonly string[]> = {
  variants?: Variants
}

export function defineGInjectionKey<Value>(): GVueInjectionKey<Value>
export function defineGInjectionKey<Value, const Variants extends readonly string[] = readonly string[]>(
  options: GVueInjectionKeyOptions<Variants> & { variants: Variants },
): GVueInjectionKey<Value, Variants[number]>
export function defineGInjectionKey<Value, const Variants extends readonly string[] = readonly string[]>(
  options?: GVueInjectionKeyOptions<Variants>,
): GVueInjectionKey<Value, Variants[number]> {
  const description = options?.variants?.length ? `runelight-vue-injection:${options.variants.join("|")}` : "runelight-vue-injection"
  return Symbol(description) as GVueInjectionKey<Value, Variants[number]>
}
