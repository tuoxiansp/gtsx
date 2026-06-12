import { resolve } from "node:path"
import ts from "typescript"

import type {
  RunelightContract,
  RunelightContractCacheContext,
  RunelightContractIndexFileContext,
  RunelightContractIndexFileResult,
  RunelightContractComponent,
} from "@runelight/core/contract"
import {
  analyzeRunelightVueEntry,
  createRunelightVueAnalysisCache,
  createRunelightVueAnalysisCacheData,
  readRunelightVueAnalysisCacheData,
  isRunelightVueComponentFile,
  vueComponentNameFromFilePath,
  type RunelightVueAnalysisCache,
} from "./contract-analyzer.js"

export {
  RUNELIGHT_VUE_COMPONENT_FILE_EXTENSION,
  analyzeRunelightVueEntry,
  createRunelightVueAnalysisCache,
  extractVueFrameNames,
  extractVueFrames,
  isRunelightVueComponentFile,
  vueComponentNameFromFilePath,
} from "./contract-analyzer.js"
export type { RunelightVueAnalysisCache } from "./contract-analyzer.js"
export {
  RUNELIGHT_VUE_PREVIEW_QUERY,
  elideRunelightVueFrames,
  hasRunelightVuePreviewQuery,
  normalizeRunelightVueModuleId,
  transformRunelightVuePreviewModule,
  transformRunelightVuePreviewSfc,
} from "./contract-transform.js"
export type { RunelightVueTransformInput, RunelightVueTransformResult } from "./contract-transform.js"

export function createRunelightVueContractCache(context: RunelightContractCacheContext): RunelightVueAnalysisCache {
  return createRunelightVueAnalysisCacheData(
    new Map(
      [...context.files.values()]
        .filter((file) => file.filePath.endsWith(".g.vue"))
        .map((file) => [
          resolve(context.cwd, file.filePath),
          ts.createSourceFile(file.filePath, file.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
        ] as const),
    ),
  )
}

export function indexVueFile(context: RunelightContractIndexFileContext<RunelightVueAnalysisCache>): RunelightContractIndexFileResult {
  const coordinate = `${context.file.filePath}#default`
  const component = buildVueProjectIndexComponent(context.cwd, context.file.filePath, context.file.sourceHash, context.cache, coordinate)

  return {
    components: [component],
    diagnostics: component.diagnostics,
  }
}

function buildVueProjectIndexComponent(
  cwd: string,
  filePath: string,
  sourceHash: string,
  cache: RunelightVueAnalysisCache | undefined,
  coordinate: string,
): RunelightContractComponent {
  const analysisCache = readRunelightVueAnalysisCacheData(cache)
  const analysis = analyzeRunelightVueEntry({ cache: analysisCache, cwd, entry: coordinate })

  return {
    coordinate,
    filePath,
    sourceHash,
    exportName: "default",
    componentName: vueComponentNameFromFilePath(filePath),
    mode: analysis.mode,
    frames: analysis.frames,
    providers: analysis.providers,
    diagnostics: analysis.diagnostics,
  }
}

export const runelightVueContract: RunelightContract<RunelightVueAnalysisCache> = {
  id: "vue",
  isEntryFile: isRunelightVueComponentFile,
  createCache: createRunelightVueContractCache,
  analyzeEntry: analyzeRunelightVueEntry,
  indexFile: indexVueFile,
}

export default runelightVueContract
