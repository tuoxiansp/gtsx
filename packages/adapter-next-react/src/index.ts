import { dirname, resolve } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

type WebpackRule = {
  enforce?: string
  test?: RegExp
  use?: Array<{ loader: string; options?: Record<string, unknown> }>
}

type WebpackConfig = {
  module?: {
    rules?: WebpackRule[]
  }
  [key: string]: unknown
}

type NextWebpackConfig = (config: any, context: any) => any

type TurbopackRuleConfigItem = {
  loaders?: Array<string | { loader: string; options?: Record<string, unknown> }>
  as?: string
  type?: string
  [key: string]: unknown
}

type NextConfigLike = {
  webpack?: NextWebpackConfig | null
  turbopack?: any
  [key: string]: any
}

type GTSXNextReactOptions = {
  root?: string
}

export function gtsxNextReact(options: GTSXNextReactOptions = {}) {
  const root = options.root ?? process.cwd()
  const loaderPath = resolve(dirname(fileURLToPath(import.meta.url)), "../loader.cjs")
  const transformPath = resolveGTSXReactTransform(root)

  return function withGTSXNextReact<Config extends NextConfigLike>(nextConfig: Config = {} as Config): Config & NextConfigLike {
    const userWebpack = nextConfig.webpack

    return {
      ...nextConfig,
      webpack(config: WebpackConfig, context: any) {
        const resolvedConfig = (typeof userWebpack === "function" ? userWebpack(config, context) : config) as WebpackConfig
        resolvedConfig.module ??= {}
        resolvedConfig.module.rules ??= []
        resolvedConfig.module.rules.unshift({
          test: /\.g\.tsx$/,
          enforce: "pre",
          use: [{ loader: loaderPath, options: { root, transformPath } }],
        })
        return resolvedConfig
      },
      turbopack: withGTSXTurbopackRules(nextConfig.turbopack, loaderPath, root, transformPath),
    } as Config & NextConfigLike
  }
}

function withGTSXTurbopackRules(
  turbopack: NextConfigLike["turbopack"],
  loaderPath: string,
  root: string,
  transformPath: string,
): NonNullable<NextConfigLike["turbopack"]> {
  const gtsxRule: TurbopackRuleConfigItem = {
    loaders: [{ loader: loaderPath, options: { root, transformPath } }],
    as: "*.tsx",
  }
  const rules = turbopack?.rules ?? {}

  return {
    ...turbopack,
    rules: {
      ...rules,
      "*.g.tsx": prependRule(gtsxRule, rules["*.g.tsx"]),
    },
  }
}

function prependRule(
  rule: TurbopackRuleConfigItem,
  existing: TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> | undefined,
): TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> {
  if (!existing) return rule
  return Array.isArray(existing) ? [rule, ...existing] : [rule, existing]
}

function resolveGTSXReactTransform(root: string): string {
  return createRequire(import.meta.url).resolve("gtsx/react-transform", {
    paths: [root, process.cwd()],
  })
}
