"use strict"

const { pathToFileURL } = require("node:url")

module.exports = function gtsxNextReactLoader(source, inputSourceMap) {
  const callback = this.async()
  const options = readLoaderOptions(this)
  const root = typeof options.root === "string" ? options.root : process.cwd()
  const transformModule = typeof options.transformPath === "string" ? pathToFileURL(options.transformPath).href : "@gtsx/core/react-transform"
  const filePath = this.resourcePath
  const code = Buffer.isBuffer(source) ? source.toString("utf8") : String(source)

  import(transformModule).then(
    ({ transformGTSXReactModule }) => {
      const transformed = transformGTSXReactModule({
        code,
        filePath,
        root,
      })
      callback(null, transformed?.code ?? code, inputSourceMap)
    },
    (error) => {
      callback(error)
    },
  )
}

function readLoaderOptions(context) {
  if (typeof context.getOptions === "function") {
    return context.getOptions() ?? {}
  }

  if (!context.query || typeof context.query !== "object") {
    return {}
  }

  return context.query
}
