import type { InjectionKey } from "vue"

export type GVueInjectionKey<Value = unknown, Variant extends string = never> = InjectionKey<Value> & {
  readonly __runelightVariants?: readonly Variant[]
  readonly __runelightState?: Value
}

export type AnyGVueInjectionKey = InjectionKey<any> & {
  readonly __runelightVariants?: readonly string[]
}

export type GVueInjectionValue<Key> = Key extends InjectionKey<infer Value> ? Value : never

export type GVueInjectionVariant<Key> =
  Key extends { readonly __runelightVariants?: readonly (infer Variant)[] } ? Extract<Variant, string> : never

export type GVueProvideEntry<Key extends AnyGVueInjectionKey = AnyGVueInjectionKey> = readonly [
  Key,
  GVueInjectionValue<Key>,
]

export type GVueProvideEntries = readonly GVueProvideEntry[]

export type GVueProvideEntriesFor<Providers extends readonly unknown[]> = readonly unknown[] extends Providers
  ? GVueProvideEntries
  : {
      readonly [Index in keyof Providers]: Providers[Index] extends AnyGVueInjectionKey
        ? readonly [Providers[Index], GVueInjectionValue<Providers[Index]>]
        : never
    }

export type GVueFrame<Props, Scope = never, Providers extends readonly unknown[] = readonly unknown[]> = {
  props: Props
  provide?: GVueProvideEntriesFor<Providers>
} & ([Scope] extends [never] ? unknown : { scope?: Scope })

export type GVueFrames<
  Props,
  Scope = never,
  Providers extends readonly unknown[] = readonly unknown[],
> = Record<string, GVueFrame<Props, Scope, Providers>>

export type GVueProvideFrame<
  Provider extends AnyGVueInjectionKey,
  Variant extends GVueInjectionVariant<Provider>,
  Props = any,
  Scope = never,
  Providers extends readonly unknown[] = readonly [Provider],
> = GVueFrame<Props, Scope, Providers> & {
  readonly __runelightProviderVariant?: readonly [Provider, Variant]
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
