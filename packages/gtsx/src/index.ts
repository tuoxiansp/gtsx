export { analyzeEntry } from "./analyzer.js"
export type {
  AnalyzeEntryOptions,
  GTSXAnalysisResult,
  GTSXCaseSummary,
  GTSXDiagnostic,
  GTSXDiagnosticStage,
  GTSXProviderSummary,
} from "./analyzer.js"
export { defineGTSXConfig, loadGTSXConfig } from "./config.js"
export type { GTSXConfig, GTSXScriptConfig, LoadConfigResult } from "./config.js"
export { initGTSX } from "./init.js"
export type { InitOptions, InitResult } from "./init.js"
export { runCLI } from "./cli.js"
export type { CLIContext, CLIResult } from "./cli.js"
export { GTSXPreviewProvider, createGTSXScope, useGTSXContext } from "./runtime.js"
export type {
  GTSXProvider,
  AnyGTSXProvider,
  GTSXProviderCase,
  GTSXProviderCases,
  GTSXPureCase,
  GTSXPureCases,
  GTSXScopeCase,
  GTSXScopeCases,
  GTSXScopeHook,
} from "./types.js"
