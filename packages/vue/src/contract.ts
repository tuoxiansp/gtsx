import { createHash } from "node:crypto"
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
  projectVueVisualFrames,
  vueComponentNameFromFilePath,
  type RunelightVueAnalysisCache,
  type RunelightVueVisualFrameProjection,
} from "./contract-analyzer.js"

export {
  RUNELIGHT_VUE_COMPONENT_FILE_EXTENSION,
  analyzeRunelightVueEntry,
  createRunelightVueAnalysisCache,
  extractVueFrameNames,
  extractVueFrames,
  isRunelightVueComponentFile,
  projectVueVisualFrames,
  vueComponentNameFromFilePath,
} from "./contract-analyzer.js"
export type { RunelightVueAnalysisCache, RunelightVueVisualFrameProjection } from "./contract-analyzer.js"
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
  const visualFrameProjections = projectVueVisualFrames({ cache: analysisCache, cwd, entry: coordinate })
  const visualSignature = visualSignatureForVueComponent(filePath, vueComponentNameFromFilePath(filePath), visualFrameProjections)

  return {
    coordinate,
    filePath,
    sourceHash,
    exportName: "default",
    componentName: vueComponentNameFromFilePath(filePath),
    mode: analysis.mode,
    frames: analysis.frames,
    providers: analysis.providers,
    ...(visualSignature.dependencies.length > 0 ? { dependencies: visualSignature.dependencies } : {}),
    frameDependencies: visualSignature.frameDependencies,
    frameVisualSignatures: visualSignature.frameVisualSignatures,
    visualSignature: visualSignature.visualSignature,
    diagnostics: analysis.diagnostics,
  }
}

function visualSignatureForVueComponent(
  filePath: string,
  componentName: string,
  visualFrameProjections: readonly RunelightVueVisualFrameProjection[],
): {
  dependencies: string[]
  frameDependencies: Record<string, string[]>
  frameVisualSignatures: Record<string, string>
  visualSignature: string
} {
  const frameDependencies = Object.fromEntries(
    visualFrameProjections.map((projection) => [projection.name, projection.dependencies] as const),
  )
  const frameVisualSignatures = Object.fromEntries(visualFrameProjections.map((projection) => [
    projection.name,
    hashVueVisualSignature({
      component: componentName,
      filePath,
      frame: { name: projection.name },
      projection: projection.signatureParts,
    }),
  ] as const))
  const dependencies = [...new Set(visualFrameProjections.flatMap((projection) => projection.dependencies))]
    .sort((left, right) => left.localeCompare(right))

  return {
    dependencies,
    frameDependencies,
    frameVisualSignatures,
    visualSignature: hashVueVisualSignature({
      component: componentName,
      filePath,
      projections: visualFrameProjections.map((projection) => ({
        dependencies: projection.dependencies,
        name: projection.name,
        signatureParts: projection.signatureParts,
      })),
    }),
  }
}

function hashVueVisualSignature(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export const runelightVueContract: RunelightContract<RunelightVueAnalysisCache> = {
  id: "vue",
  isEntryFile: isRunelightVueComponentFile,
  createCache: createRunelightVueContractCache,
  analyzeEntry: analyzeRunelightVueEntry,
  indexFile: indexVueFile,
}

export default runelightVueContract
