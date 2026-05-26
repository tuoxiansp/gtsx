"use strict"

const { resolve } = require("node:path")

function gtsxNextReact(options = {}) {
  const root = options.root ?? process.cwd()
  const loaderPath = resolve(__dirname, "loader.cjs")
  const transformPath = require.resolve("gtsx/react-transform", {
    paths: [root, process.cwd()],
  })

  return function withGTSXNextReact(nextConfig = {}) {
    const userWebpack = nextConfig.webpack

    return {
      ...nextConfig,
      webpack(config, context) {
        const resolvedConfig = typeof userWebpack === "function" ? userWebpack(config, context) : config
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
    }
  }
}

function withGTSXTurbopackRules(turbopack, loaderPath, root, transformPath) {
  const gtsxRule = {
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

function prependRule(rule, existing) {
  if (!existing) return rule
  return Array.isArray(existing) ? [rule, ...existing] : [rule, existing]
}

module.exports = {
  gtsxNextReact,
}
