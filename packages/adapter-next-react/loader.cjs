"use strict"

const { pathToFileURL } = require("node:url")

module.exports = function runelightNextReactLoader(source, inputSourceMap) {
  const callback = this.async()
  const options = readLoaderOptions(this)
  const root = typeof options.root === "string" ? options.root : process.cwd()
  const transformModule = typeof options.transformPath === "string" ? pathToFileURL(options.transformPath).href : "@runelight/core/react-transform"
  const filePath = this.resourcePath
  const previewQuery = typeof options.previewQuery === "string" ? options.previewQuery : "runelight-preview"
  const isPreviewImport = hasResourceQuery(this.resourceQuery, previewQuery)
  const shouldTranspilePreview = options.transpilePreview !== false
  const code = Buffer.isBuffer(source) ? source.toString("utf8") : String(source)

  import(transformModule).then(
    ({ transformRunelightReactModule, transpileRunelightReactModuleCode }) => {
      try {
        const transformed = transformRunelightReactModule({
          code,
          filePath,
          ...(isPreviewImport ? { previewImportQuery: previewQuery } : {}),
          root,
        })
        const output = transformed?.code ?? code
        const finalOutput =
          isPreviewImport && shouldTranspilePreview && typeof transpileRunelightReactModuleCode === "function"
            ? transpileRunelightReactModuleCode({ code: output, filePath })
            : output
        callback(null, finalOutput, inputSourceMap)
      } catch (error) {
        callback(error)
      }
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

function hasResourceQuery(resourceQuery, queryName) {
  if (typeof resourceQuery !== "string" || resourceQuery.length === 0) return false
  const query = resourceQuery.startsWith("?") ? resourceQuery.slice(1) : resourceQuery
  return query.split("&").some((part) => part === queryName || part.startsWith(`${queryName}=`))
}
