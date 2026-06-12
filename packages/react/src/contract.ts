import type { RunelightContract } from "@runelight/core/contract"
import { analyzeEntry as analyzeRunelightReactEntry } from "./contract-analyzer.js"
import { createRunelightReactContractCache, indexReactFile, type RunelightReactContractCache } from "./contract-index.js"
import { isRunelightReactComponentFile } from "./contract-transform.js"

export {
  RUNELIGHT_REACT_COMPONENT_FILE_EXTENSION,
  elideRunelightReactFrames,
  isRunelightReactComponentFile,
  normalizeRunelightReactModuleId,
  transformRunelightReactComponentBoundaries,
  transformRunelightReactModule,
  transpileRunelightReactPreviewModule,
} from "./contract-transform.js"
export type { RunelightReactTransformInput, RunelightReactTransformResult } from "./contract-transform.js"
export { analyzeEntry as analyzeRunelightReactEntry, createRunelightReactAnalysisCache } from "./contract-analyzer.js"
export type {
  AnalyzeEntryOptions as AnalyzeRunelightReactEntryOptions,
  RunelightAnalysisCache as RunelightReactAnalysisCache,
} from "./contract-analyzer.js"
export { createRunelightReactContractCache, indexReactFile }
export type { RunelightReactContractCache }

export const runelightReactContract: RunelightContract<RunelightReactContractCache> = {
  id: "react",
  isEntryFile: isRunelightReactComponentFile,
  isTypeScriptProgramFile: isRunelightReactComponentFile,
  createCache: createRunelightReactContractCache,
  analyzeEntry: analyzeRunelightReactEntry,
  indexFile: indexReactFile,
}

export default runelightReactContract
