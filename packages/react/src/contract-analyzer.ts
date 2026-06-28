import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import ts from "typescript"

import type {
  RunelightEntryAnalysisResult,
  RunelightContract,
  RunelightContractFile,
  RunelightContractIndexFileResult,
  RunelightDiagnostic,
  RunelightFrameSummary,
  RunelightContractComponent,
  RunelightProviderSummary,
  RunelightProviderVariantSelection,
} from "@runelight/core/contract"

export type {
  RunelightEntryAnalysisResult,
  RunelightDiagnostic,
  RunelightFrameSummary,
  RunelightProviderSummary,
  RunelightProviderVariantSelection,
} from "@runelight/core/contract"

declare const runelightReactAnalysisCacheType: unique symbol

export type RunelightAnalysisCache = {
  readonly [runelightReactAnalysisCacheType]: "RunelightReactAnalysisCache"
}

export type RunelightAnalysisCacheData = RunelightAnalysisCache & {
  componentDependencyBindingsByPath: Map<string, ComponentDependencyBindings>
  exportedStaticValuesByPath: Map<string, Map<string, StaticExportValue>>
  exportedComponentTargetsByPath: Map<string, Map<string, ComponentDependencyTarget>>
  importedRunelightPathByKey: Map<string, string | null>
  importedStaticSourcePathByKey: Map<string, string | null>
  importedScopeHookNamesByPath: Map<string, Set<string>>
  providerSummariesByPath: Map<string, Map<string, RunelightProviderSummary>>
  scopeHookProviderNamesByPath: Map<string, Map<string, string[]>>
  sourceFilesByPath: Map<string, ts.SourceFile>
  topLevelFunctionLikeBodiesByPath: Map<string, Map<string, ts.ConciseBody>>
}

export function createRunelightReactAnalysisCache(): RunelightAnalysisCache {
  return createRunelightReactAnalysisCacheData()
}

export function createRunelightReactAnalysisCacheData(
  sourceFilesByPath = new Map<string, ts.SourceFile>(),
): RunelightAnalysisCacheData {
  return {
    componentDependencyBindingsByPath: new Map(),
    exportedStaticValuesByPath: new Map(),
    exportedComponentTargetsByPath: new Map(),
    importedRunelightPathByKey: new Map(),
    importedStaticSourcePathByKey: new Map(),
    importedScopeHookNamesByPath: new Map(),
    providerSummariesByPath: new Map(),
    scopeHookProviderNamesByPath: new Map(),
    sourceFilesByPath,
    topLevelFunctionLikeBodiesByPath: new Map(),
  } as RunelightAnalysisCacheData
}

export function readRunelightReactAnalysisCacheData(cache: RunelightAnalysisCache | undefined): RunelightAnalysisCacheData | undefined {
  return cache as RunelightAnalysisCacheData | undefined
}

export type AnalyzeEntryOptions = {
  cache?: RunelightAnalysisCache
  cwd: string
  entry: string
}

export type RunelightReactVisualFrameProjection = {
  dependencies: string[]
  name: string
  signatureParts: string[]
}

type FramesAssignment = {
  targetName: string
  frames: RunelightFrameSummary[]
  staticFrames: RunelightFrameStaticFacts[]
  statementStart: number
}

type RunelightFrameStaticFacts = {
  name: string
  providerVariants?: Record<string, RunelightProviderVariantSelection>
  values: Map<string, StaticBranchValue>
}

type StaticBranchValue =
  | { kind: "array"; length: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "number"; value: number }
  | { kind: "object" }
  | { kind: "oneOf"; values: StaticBranchValue[] }
  | { kind: "string"; value: string }
  | { kind: "truthy" }
  | { kind: "unknown" }
  | { kind: "undefined" }

type StaticExportValue =
  | { kind: "expression"; expression: ts.Expression }
  | { kind: "facts"; values: Map<string, StaticBranchValue> }
  | { kind: "namespace"; exports: Map<string, StaticExportValue> }

type RunelightFactorReference =
  | { root: "props" | "scope" | "static"; path: string[] }
  | { root: "context"; providerName: string; path: string[] }

type JSXBranchPredicate =
  | { kind: "always" }
  | { kind: "and"; predicates: JSXBranchPredicate[] }
  | { kind: "equals"; ref: RunelightFactorReference; value: StaticBranchValue }
  | { kind: "equals-ref"; left: RunelightFactorReference; right: RunelightFactorReference }
  | { kind: "not"; predicate: JSXBranchPredicate }
  | { kind: "opaque"; reason: string; text: string }
  | { kind: "or"; predicates: JSXBranchPredicate[] }
  | { kind: "relation"; operator: "<" | "<=" | ">" | ">="; ref: RunelightFactorReference; value: StaticBranchValue }
  | { kind: "static"; value: boolean }
  | { kind: "truthy"; ref: RunelightFactorReference }

type JSXReachableDependency = {
  condition: JSXBranchPredicate
  tagName: string
  target: ComponentDependencyTarget
}

type JSXBranchAnalysisContext = {
  expressionAliases: Map<string, ts.Expression>
  factorBindings: Map<string, RunelightFactorReference>
  sourceFile: ts.SourceFile
  staticValues: Map<string, StaticBranchValue>
}

type EntryCoordinate = {
  file: string
  exportName?: string
  explicitExportName: boolean
}

type HookViolation = {
  hookName: string
  componentName: string
  file: string
}

type ComponentDependencyTarget = {
  filePath: string
  componentName: string
}

type ComponentDependencyBindings = {
  names: Map<string, ComponentDependencyTarget>
  namespaces: Map<string, Map<string, ComponentDependencyTarget>>
}

type LocalComponentAliasBindings = Map<string, string>

type NonRunelightHookAnalysisContext = {
  cache?: RunelightAnalysisCacheData
  cwd: string
  entryPath: string
  sourceFilesByPath: Map<string, ts.SourceFile>
  visitedComponents: Set<string>
}

export function analyzeEntry(options: AnalyzeEntryOptions): RunelightEntryAnalysisResult {
  const entryCoordinate = parseEntryCoordinate(options.entry)
  const entryPath = resolve(options.cwd, entryCoordinate.file)
  const cache = readRunelightReactAnalysisCacheData(options.cache)
  const diagnostics: RunelightDiagnostic[] = []

  if (!existsSync(entryPath)) {
    return {
      entry: options.entry,
      mode: "unknown",
      defaultExport: false,
      frames: [],
      providers: {},
      diagnostics: [
        {
          stage: "contract-extraction",
          severity: "error",
          code: "entry-not-found",
          message: `Runelight entry does not exist: ${options.entry}`,
          file: options.entry,
        },
      ],
    }
  }

  const sourceFile = sourceFileForAbsolutePath(entryPath, cache)
  if (!sourceFile) {
    return {
      entry: options.entry,
      mode: "unknown",
      defaultExport: false,
      frames: [],
      providers: {},
      diagnostics: [
        {
          stage: "contract-extraction",
          severity: "error",
          code: "entry-not-found",
          message: `Runelight entry does not exist: ${options.entry}`,
          file: options.entry,
        },
      ],
    }
  }
  const componentExportName = getComponentExportName(sourceFile, entryCoordinate.exportName)
  const scopeHookNames = new Set([
    ...getScopeHookNames(sourceFile),
    ...getImportedScopeHookNames(sourceFile, entryPath, options.cwd, cache),
  ])
  const providerFrames: Record<string, RunelightProviderSummary> = Object.fromEntries(
    getGProviderSummariesForFile(sourceFile, entryPath, options.cwd, cache),
  )
  const componentAssignments: FramesAssignment[] = []
  const scopeAssignments: FramesAssignment[] = []

  for (const statement of sourceFile.statements) {
    const assignment = getFramesAssignment(statement, sourceFile, diagnostics)
    if (!assignment) continue

    if (scopeHookNames.has(assignment.targetName)) {
      scopeAssignments.push(assignment)
    } else if (!componentExportName || assignment.targetName === componentExportName) {
      componentAssignments.push(assignment)
    }
  }

  if (!componentExportName) {
    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code:
        entryCoordinate.explicitExportName && entryCoordinate.exportName === "default"
          ? "missing-default-export"
          : "missing-component-export",
      message:
        entryCoordinate.explicitExportName && entryCoordinate.exportName === "default"
          ? "A .g.tsx entry must have a default React component export."
          : entryCoordinate.explicitExportName
            ? `A .g.tsx entry must export component "${entryCoordinate.exportName}".`
            : "A .g.tsx entry must export at least one React component.",
      file: options.entry,
    })
  } else {
    validateFramesAssignmentOrder(sourceFile, componentExportName, componentAssignments, diagnostics, options.entry)

    const usedScopeHooks = getGScopeHookCalls(sourceFile, componentExportName, scopeHookNames)
    if (usedScopeHooks.length > 1) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "multiple-scope-hooks",
        message: "A stateful Runelight component may have exactly one primary GScope hook.",
        file: options.entry,
      })
    }

    for (const violation of getNonRunelightHookCalls(sourceFile, componentExportName, scopeHookNames, {
      cwd: options.cwd,
      entryPath,
      cache,
      sourceFilesByPath: cache?.sourceFilesByPath ?? new Map([[entryPath, sourceFile]]),
      visitedComponents: new Set(),
    })) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "non-runelight-hook",
        message:
          violation.file === normalizeProjectPath(relative(options.cwd, entryPath))
            ? `Runelight components may only call Runelight hooks; found "${violation.hookName}" in "${violation.componentName}". Wrap production hooks with createGScopeHook(...).`
            : `Runelight components may only call Runelight hooks; found "${violation.hookName}" in dependency "${violation.file}#${violation.componentName}". Wrap production hooks with createGScopeHook(...).`,
        file: violation.file,
      })
    }

  }

  if (scopeAssignments.length > 1) {
    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "multiple-scope-hooks",
      message: "A non-pure Runelight entry may have exactly one primary scope hook with frames.",
      file: options.entry,
    })
  }

  if (scopeAssignments.length > 0) {
    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "scope-hook-frames-unsupported",
      message: "GScope hooks do not own frames; move frames to the exported component.",
      file: options.entry,
    })
  }

  const componentFrames = componentAssignments.flatMap((assignment) => assignment.frames)
  const componentStaticFrames = componentAssignments.flatMap((assignment) => assignment.staticFrames)
  const mode =
    componentFrames.length === 0
      ? "unknown"
      : componentFrames.some((frame) => frame.kind === "scope")
        ? "scope"
        : "pure"
  const selectedFrames =
    mode === "scope"
      ? componentFrames.map((frame) => ({ ...frame, kind: "scope" as const }))
      : componentFrames.map((frame) => ({ ...frame, kind: "pure" as const }))

  const importedNames = getImportedNames(sourceFile)
  for (const frame of selectedFrames) {
    for (const providerName of frame.providers ?? []) {
      if (!providerFrames[providerName] && importedNames.has(providerName)) {
        providerFrames[providerName] = { name: providerName, frames: [] }
      }
    }
  }

  if (selectedFrames.length === 0) {
    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "missing-frames",
      message: "A Runelight entry must expose statically enumerable pure or scope frames.",
      file: options.entry,
    })
  }

  for (const frame of selectedFrames) {
    validateProviderSelections(frame, providerFrames, diagnostics, options.entry)
    validateProviderVariantSelections(frame, providerFrames, diagnostics, options.entry)
  }

  if (componentExportName) {
    const consumedProviderNames = getGProviderConsumers(sourceFile, componentExportName, {
      cwd: options.cwd,
      entryPath,
      cache,
      sourceFilesByPath: cache?.sourceFilesByPath ?? new Map([[entryPath, sourceFile]]),
      visitedComponents: new Set(),
    })
    validateProviderVariantCoverage(consumedProviderNames, providerFrames, selectedFrames, diagnostics, options.entry)
    validateJSXTreeFrameReachability(sourceFile, componentExportName, scopeHookNames, componentStaticFrames, diagnostics, options.entry, {
      cwd: options.cwd,
      entryPath,
      cache,
      sourceFilesByPath: cache?.sourceFilesByPath ?? new Map([[entryPath, sourceFile]]),
      visitedComponents: new Set(),
    })
    validateProviderProjectionWarnings(
      sourceFile,
      componentExportName,
      scopeHookNames,
      providerFrames,
      diagnostics,
      options.entry,
      {
        cwd: options.cwd,
        entryPath,
        cache,
        sourceFilesByPath: cache?.sourceFilesByPath ?? new Map([[entryPath, sourceFile]]),
        visitedComponents: new Set(),
      },
    )
  }

  return {
    entry: options.entry,
    mode,
    defaultExport: Boolean(componentExportName),
    frames: selectedFrames,
    providers: providerFrames,
    diagnostics,
  }
}

export function projectReactVisualFrames(options: AnalyzeEntryOptions): RunelightReactVisualFrameProjection[] {
  const entryCoordinate = parseEntryCoordinate(options.entry)
  const entryPath = resolve(options.cwd, entryCoordinate.file)
  const cache = readRunelightReactAnalysisCacheData(options.cache)
  const sourceFile = sourceFileForAbsolutePath(entryPath, cache)
  if (!sourceFile) return []

  const componentExportName = getComponentExportName(sourceFile, entryCoordinate.exportName)
  if (!componentExportName) return []

  const component = getFunctionLikeDeclaration(sourceFile, componentExportName)
  if (!component?.body) return []

  const diagnostics: RunelightDiagnostic[] = []
  const componentStaticFrames = sourceFile.statements.flatMap((statement) => {
    const assignment = getFramesAssignment(statement, sourceFile, diagnostics)
    return assignment?.targetName === componentExportName ? assignment.staticFrames : []
  })
  if (componentStaticFrames.length === 0) return []

  const scopeHookNames = new Set([
    ...getScopeHookNames(sourceFile),
    ...getImportedScopeHookNames(sourceFile, entryPath, options.cwd, cache),
  ])
  const context: NonRunelightHookAnalysisContext = {
    cwd: options.cwd,
    entryPath,
    cache,
    sourceFilesByPath: cache?.sourceFilesByPath ?? new Map([[entryPath, sourceFile]]),
    visitedComponents: new Set(),
  }
  const branchContext = createJSXBranchAnalysisContext(sourceFile, component, scopeHookNames, context)
  const defaultValues = defaultStaticValuesForFunctionLike(component)

  return componentStaticFrames.map((frame) => {
    const values = new Map([...branchContext.staticValues, ...defaultValues, ...frame.values])
    const projection = projectReachableReactVisualFrame(sourceFile, componentExportName, branchContext, values, context)
    return {
      dependencies: projection.dependencies,
      name: frame.name,
      signatureParts: projection.signatureParts,
    }
  })
}

function parseEntryCoordinate(entry: string): EntryCoordinate {
  const separatorIndex = entry.indexOf("#")
  if (separatorIndex < 0) {
    return { file: entry, explicitExportName: false }
  }

  return {
    file: entry.slice(0, separatorIndex),
    exportName: entry.slice(separatorIndex + 1) || "default",
    explicitExportName: true,
  }
}

function getComponentExportName(sourceFile: ts.SourceFile, exportName: string | undefined): string | undefined {
  if (!exportName) return getDefaultExportName(sourceFile) ?? getFirstNamedExportName(sourceFile)
  if (exportName === "default") return getDefaultExportName(sourceFile)
  return getNamedExportName(sourceFile, exportName)
}

function getDefaultExportName(sourceFile: ts.SourceFile): string | undefined {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement.name?.text
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      return statement.expression.text
    }

    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text === "default") {
          return element.propertyName?.text ?? element.name.text
        }
      }
    }
  }

  return undefined
}

function getNamedExportName(sourceFile: ts.SourceFile, exportName: string): string | undefined {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name?.text === exportName &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      return exportName
    }

    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && getFunctionLikeBody(sourceFile, exportName)) {
          return exportName
        }
      }
    }

    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text === exportName) {
          return element.propertyName?.text ?? element.name.text
        }
      }
    }
  }

  return undefined
}

function getFirstNamedExportName(sourceFile: ts.SourceFile): string | undefined {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      return statement.name.text
    }

    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && getFunctionLikeBody(sourceFile, declaration.name.text)) {
          return declaration.name.text
        }
      }
    }

    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      const element = statement.exportClause.elements[0]
      if (element) return element.propertyName?.text ?? element.name.text
    }
  }

  return undefined
}

function getScopeHookNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      if (isCreateGScopeCall(unwrapExpression(declaration.initializer))) {
        names.add(declaration.name.text)
      }
    }
  }

  return names
}

function validateFramesAssignmentOrder(
  sourceFile: ts.SourceFile,
  componentName: string,
  assignments: FramesAssignment[],
  diagnostics: RunelightDiagnostic[],
  file: string,
) {
  const declarationStart = topLevelValueDeclarationStart(sourceFile, componentName)
  if (declarationStart === undefined) return

  for (const assignment of assignments) {
    if (assignment.targetName !== componentName || assignment.statementStart >= declarationStart) continue

    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "frames-before-component-export",
      message: `Move ${componentName}.frames after the "${componentName}" component declaration. Runelight component boundaries are initialized at runtime, so frames cannot rely on function hoisting.`,
      file,
    })
  }
}

function topLevelValueDeclarationStart(sourceFile: ts.SourceFile, name: string): number | undefined {
  for (const statement of sourceFile.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) {
      return statement.getStart(sourceFile)
    }

    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return statement.getStart(sourceFile)
      }
    }
  }

  return undefined
}

function getScopeHookProviderNamesForFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  cache?: RunelightAnalysisCacheData,
): Map<string, string[]> {
  const cached = cache?.scopeHookProviderNamesByPath.get(filePath)
  if (cached) return cached

  const hookProviders = new Map<string, string[]>()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const initializer = unwrapExpression(declaration.initializer)
      if (!isCreateGScopeCall(initializer)) continue

      const providersExpression = initializer.arguments[1]
      if (!providersExpression) continue

      const providerNames = readProviderNameList(providersExpression, sourceFile)
      if (providerNames.length > 0) hookProviders.set(declaration.name.text, providerNames)
    }
  }

  cache?.scopeHookProviderNamesByPath.set(filePath, hookProviders)
  return hookProviders
}

function readProviderNameList(expression: ts.Expression, sourceFile: ts.SourceFile, visited = new Set<string>()): string[] {
  const value = unwrapExpression(expression)
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.flatMap((element) => {
      const provider = unwrapExpression(element)
      return ts.isIdentifier(provider) ? [provider.text] : []
    })
  }

  if (ts.isIdentifier(value)) {
    if (visited.has(value.text)) return []
    visited.add(value.text)

    const initializer = topLevelVariableInitializer(sourceFile, value.text)
    return initializer ? readProviderNameList(initializer, sourceFile, visited) : []
  }

  return []
}

function topLevelVariableInitializer(sourceFile: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer
    }
  }

  return undefined
}

function getGProviderSummaries(sourceFile: ts.SourceFile): Map<string, RunelightProviderSummary> {
  const providers = new Map<string, RunelightProviderSummary>()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const initializer = unwrapExpression(declaration.initializer)
      if (!isCreateGProviderCall(initializer)) continue

      const variants = readCreateGProviderVariants(initializer)
      providers.set(declaration.name.text, {
        name: declaration.name.text,
        frames: [],
        ...(variants && variants.length > 0 ? { variants } : {}),
      })
    }
  }

  return providers
}

function getGProviderSummariesForFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  cwd: string,
  cache?: RunelightAnalysisCacheData,
): Map<string, RunelightProviderSummary> {
  const cached = cache?.providerSummariesByPath.get(filePath)
  if (cached) return cached

  const providers = new Map(getGProviderSummaries(sourceFile))
  cache?.providerSummariesByPath.set(filePath, providers)

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetPath = resolveImportedRunelightPath(filePath, cwd, statement.moduleSpecifier.text, cache)
    if (!targetPath) continue

    const targetSource = sourceFileForAbsolutePath(targetPath, cache)
    if (!targetSource) continue

    const targetProviders = getGProviderSummariesForFile(targetSource, targetPath, cwd, cache)
    const importClause = statement.importClause

    if (importClause.name) {
      const importedDefault = targetProviders.get("default")
      if (importedDefault) {
        providers.set(importClause.name.text, { ...importedDefault, name: importClause.name.text })
      }
    }

    const namedBindings = importClause.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      const importedProvider = targetProviders.get(importedName)
      if (importedProvider) {
        providers.set(element.name.text, { ...importedProvider, name: element.name.text })
      }
    }
  }

  return providers
}

function readCreateGProviderVariants(expression: ts.CallExpression): string[] | undefined {
  const options = expression.arguments[1] ? unwrapExpression(expression.arguments[1]) : undefined
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined

  const variantsProperty = options.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && getStaticPropertyName(property.name) === "variants",
  )
  if (!variantsProperty) return undefined

  const variantsValue = unwrapExpression(variantsProperty.initializer)
  if (!ts.isArrayLiteralExpression(variantsValue)) return undefined

  return variantsValue.elements.flatMap((element) => {
    const variant = unwrapExpression(element)
    return ts.isStringLiteral(variant) ? [variant.text] : []
  })
}

function getImportedScopeHookNames(
  sourceFile: ts.SourceFile,
  entryPath: string,
  cwd: string,
  cache?: RunelightAnalysisCacheData,
): Set<string> {
  const cached = cache?.importedScopeHookNamesByPath.get(entryPath)
  if (cached) return cached

  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const clause = statement.importClause
    if (!clause || !ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetPath = resolveImportedRunelightPath(entryPath, cwd, statement.moduleSpecifier.text, cache)
    if (!targetPath) continue

    const targetSource = sourceFileForAbsolutePath(targetPath, cache)
    if (!targetSource) continue
    const exportedScopeHookNames = getExportedScopeHookNames(targetSource)

    if (clause.name && exportedScopeHookNames.has("default") && isHookName(clause.name.text)) {
      names.add(clause.name.text)
    }

    const namedBindings = clause.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      if (exportedScopeHookNames.has(importedName) && isHookName(element.name.text)) {
        names.add(element.name.text)
      }
    }
  }

  cache?.importedScopeHookNamesByPath.set(entryPath, names)
  return names
}

function getExportedScopeHookNames(sourceFile: ts.SourceFile): Set<string> {
  const localScopeHookNames = getScopeHookNames(sourceFile)
  const exportedScopeHookNames = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && localScopeHookNames.has(declaration.name.text)) {
          exportedScopeHookNames.add(declaration.name.text)
        }
      }
      continue
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression) && localScopeHookNames.has(statement.expression.text)) {
      exportedScopeHookNames.add("default")
      continue
    }

    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue
    }

    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text ?? element.name.text
      if (localScopeHookNames.has(localName)) {
        exportedScopeHookNames.add(element.name.text)
      }
    }
  }

  return exportedScopeHookNames
}

function resolveImportedRunelightPath(
  entryPath: string,
  cwd: string,
  specifier: string,
  cache?: RunelightAnalysisCacheData,
): string | undefined {
  const cacheKey = `${entryPath}\0${specifier}`
  const cached = cache?.importedRunelightPathByKey.get(cacheKey)
  if (cached !== undefined) return cached ?? undefined

  const basePath = resolveImportBasePath(entryPath, cwd, specifier)
  if (!basePath) {
    cache?.importedRunelightPathByKey.set(cacheKey, null)
    return undefined
  }

  const visited = new Set<string>()
  const resolved = resolveImportedRunelightPathFromBase(basePath, cwd, visited, cache)
  cache?.importedRunelightPathByKey.set(cacheKey, resolved ?? null)
  return resolved
}

function resolveImportedStaticSourcePath(
  entryPath: string,
  cwd: string,
  specifier: string,
  cache?: RunelightAnalysisCacheData,
): string | undefined {
  const cacheKey = `${entryPath}\0${specifier}`
  const cached = cache?.importedStaticSourcePathByKey.get(cacheKey)
  if (cached !== undefined) return cached ?? undefined

  const basePath = resolveImportBasePath(entryPath, cwd, specifier)
  if (!basePath) {
    cache?.importedStaticSourcePathByKey.set(cacheKey, null)
    return undefined
  }

  const resolved = importedStaticSourcePathCandidates(basePath).find((candidate) => isFile(candidate))
  cache?.importedStaticSourcePathByKey.set(cacheKey, resolved ?? null)
  return resolved
}

function getExportedStaticValuesForFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  cwd: string,
  cache?: RunelightAnalysisCacheData,
  visited = new Set<string>(),
): Map<string, StaticExportValue> {
  const cached = cache?.exportedStaticValuesByPath.get(filePath)
  if (cached) return cached
  if (visited.has(filePath)) return new Map()
  visited.add(filePath)

  const exports = new Map<string, StaticExportValue>()
  const localStaticValues = new Map<string, StaticExportValue>()

  cache?.exportedStaticValuesByPath.set(filePath, exports)

  bindImportedStaticValuesForFile(sourceFile, filePath, cwd, localStaticValues, cache, visited)

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isConstDeclarationList(statement.declarationList)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue

      const staticValue = staticExportValueForExpression(declaration.initializer, localStaticValues)
      if (!staticValue) continue

      localStaticValues.set(declaration.name.text, staticValue)
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        exports.set(declaration.name.text, staticValue)
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      const staticValue = staticExportValueForExpression(statement.expression, localStaticValues)
      if (staticValue) exports.set("default", staticValue)
      continue
    }

    if (!ts.isExportDeclaration(statement)) continue

    if (!statement.exportClause && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      for (const [exportName, staticValue] of getReExportedStaticValues(
        filePath,
        cwd,
        statement.moduleSpecifier.text,
        cache,
        visited,
      )) {
        if (exportName !== "default" && !exports.has(exportName)) exports.set(exportName, staticValue)
      }
      continue
    }

    if (statement.exportClause && ts.isNamespaceExport(statement.exportClause) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      exports.set(statement.exportClause.name.text, {
        kind: "namespace",
        exports: getReExportedStaticValues(filePath, cwd, statement.moduleSpecifier.text, cache, visited),
      })
      continue
    }

    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue

    const targetExports =
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? getReExportedStaticValues(filePath, cwd, statement.moduleSpecifier.text, cache, visited)
        : localStaticValues

    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text ?? element.name.text
      const expression = targetExports.get(localName)
      if (expression) exports.set(element.name.text, expression)
    }
  }

  visited.delete(filePath)
  return exports
}

function bindImportedStaticValuesForFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  cwd: string,
  localStaticValues: Map<string, StaticExportValue>,
  cache: RunelightAnalysisCacheData | undefined,
  visited: Set<string>,
) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetExports = getReExportedStaticValues(filePath, cwd, statement.moduleSpecifier.text, cache, visited)
    if (targetExports.size === 0) continue

    const importClause = statement.importClause
    if (importClause.name) {
      const defaultValue = targetExports.get("default")
      if (defaultValue) localStaticValues.set(importClause.name.text, defaultValue)
    }

    const namedBindings = importClause.namedBindings
    if (!namedBindings) continue

    if (ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text
        const staticValue = targetExports.get(importedName)
        if (staticValue) localStaticValues.set(element.name.text, staticValue)
      }
      continue
    }

    localStaticValues.set(namedBindings.name.text, { kind: "namespace", exports: targetExports })
  }
}

function staticExportValueForExpression(
  expression: ts.Expression,
  localStaticValues: Map<string, StaticExportValue>,
): StaticExportValue | undefined {
  const value = unwrapExpression(expression)
  if (ts.isIdentifier(value)) return localStaticValues.get(value.text)

  const context = staticExportMaterializationContext(value.getSourceFile(), localStaticValues)
  if (!readStaticBranchValue(value) && !isStaticSpreadLiteral(value, context)) return undefined

  const values = new Map<string, StaticBranchValue>()
  flattenStaticObjectExpression(value, "$", values, context)
  return { kind: "facts", values: relativeStaticFacts("$", values) }
}

function staticExportMaterializationContext(
  sourceFile: ts.SourceFile,
  localStaticValues: Map<string, StaticExportValue>,
): JSXBranchAnalysisContext {
  const context: JSXBranchAnalysisContext = {
    expressionAliases: new Map(),
    factorBindings: new Map(),
    sourceFile,
    staticValues: new Map(),
  }

  for (const [name, value] of localStaticValues) {
    bindStaticExportValueAtPath([name], value, context, name)
  }

  return context
}

function relativeStaticFacts(rootPrefix: string, values: Map<string, StaticBranchValue>): Map<string, StaticBranchValue> {
  const facts = new Map<string, StaticBranchValue>()
  const childPrefix = `${rootPrefix}.`
  for (const [key, value] of values) {
    if (key === rootPrefix) {
      facts.set("", value)
    } else if (key.startsWith(childPrefix)) {
      facts.set(key.slice(childPrefix.length), value)
    }
  }
  return facts
}

function getReExportedStaticValues(
  filePath: string,
  cwd: string,
  specifier: string,
  cache: RunelightAnalysisCacheData | undefined,
  visited: Set<string>,
): Map<string, StaticExportValue> {
  const targetPath = resolveImportedStaticSourcePath(filePath, cwd, specifier, cache)
  if (!targetPath) return new Map()

  const targetSource = sourceFileForAbsolutePath(targetPath, cache)
  return targetSource ? getExportedStaticValuesForFile(targetSource, targetPath, cwd, cache, visited) : new Map()
}

function resolveImportedRunelightPathFromBase(
  basePath: string,
  cwd: string,
  visited: Set<string>,
  cache?: RunelightAnalysisCacheData,
): string | undefined {
  for (const candidate of importedRunelightPathCandidates(basePath)) {
    if (isFile(candidate)) return candidate
  }

  for (const barrelCandidate of importedTSXBarrelCandidates(basePath)) {
    if (!isFile(barrelCandidate) || visited.has(barrelCandidate)) continue
    visited.add(barrelCandidate)

    const barrelSource = sourceFileForAbsolutePath(barrelCandidate, cache)
    if (!barrelSource) continue

    for (const statement of barrelSource.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const nextBasePath = resolveImportBasePath(barrelCandidate, cwd, statement.moduleSpecifier.text)
      const resolvedPath = nextBasePath ? resolveImportedRunelightPathFromBase(nextBasePath, cwd, visited, cache) : undefined
      if (resolvedPath) return resolvedPath
    }
  }

  return undefined
}

function resolveImportBasePath(entryPath: string, cwd: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) {
    const direct = resolve(cwd, specifier.slice(2))
    if (
      importedRunelightPathCandidates(direct).some((candidate) => isFile(candidate)) ||
      importedTSXBarrelCandidates(direct).some((candidate) => isFile(candidate))
    ) {
      return direct
    }
    return resolve(cwd, "src", specifier.slice(2))
  }
  if (specifier.startsWith(".")) return resolve(dirname(entryPath), specifier)
  return undefined
}

function importedRunelightPathCandidates(basePath: string): string[] {
  const extensionCandidate = /\.(?:tsx|ts|jsx|js)$/.test(basePath) ? basePath.replace(/\.(?:tsx|ts|jsx|js)$/, ".g.tsx") : undefined
  const extensionTypeCandidate = /\.(?:tsx|ts|jsx|js)$/.test(basePath) ? basePath.replace(/\.(?:tsx|ts|jsx|js)$/, ".g.ts") : undefined
  const candidates = [
    basePath.endsWith(".g.tsx") ? basePath : undefined,
    basePath.endsWith(".g.ts") ? basePath : undefined,
    basePath.endsWith(".g") ? `${basePath}.tsx` : undefined,
    basePath.endsWith(".g") ? `${basePath}.ts` : undefined,
    `${basePath}.g.tsx`,
    `${basePath}.g.ts`,
    extensionCandidate,
    extensionTypeCandidate,
    join(basePath, "index.g.tsx"),
    join(basePath, "index.g.ts"),
  ]

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

function importedStaticSourcePathCandidates(basePath: string): string[] {
  const hasKnownExtension = /\.(?:tsx|ts|jsx|js)$/.test(basePath)
  const candidates = [
    hasKnownExtension ? basePath : undefined,
    !hasKnownExtension ? `${basePath}.ts` : undefined,
    !hasKnownExtension ? `${basePath}.tsx` : undefined,
    !hasKnownExtension ? `${basePath}.js` : undefined,
    !hasKnownExtension ? `${basePath}.jsx` : undefined,
    !hasKnownExtension ? `${basePath}.g.tsx` : undefined,
    !hasKnownExtension ? `${basePath}.g.ts` : undefined,
    join(basePath, "index.ts"),
    join(basePath, "index.tsx"),
    join(basePath, "index.js"),
    join(basePath, "index.jsx"),
  ]

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function importedTSXBarrelCandidates(basePath: string): string[] {
  const candidates = [
    basePath.endsWith(".tsx") ? basePath : undefined,
    `${basePath}.tsx`,
    join(basePath, "index.tsx"),
  ]

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

function getImportedNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const clause = statement.importClause
    if (!clause) continue

    if (clause.name) {
      names.add(clause.name.text)
    }

    const namedBindings = clause.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue

    for (const element of namedBindings.elements) {
      names.add(element.name.text)
    }
  }

  return names
}

function validateProviderSelections(
  frame: RunelightFrameSummary,
  providerFrames: Record<string, RunelightProviderSummary>,
  diagnostics: RunelightDiagnostic[],
  file: string,
) {
  if (!frame.providers) return

  for (const providerName of frame.providers) {
    if (!providerFrames[providerName]) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "missing-provider",
        message: `Frame "${frame.name}" selects unknown provider "${providerName}".`,
        file,
        frameName: frame.name,
      })
    }
  }
}

function validateProviderVariantSelections(
  frame: RunelightFrameSummary,
  providerFrames: Record<string, RunelightProviderSummary>,
  diagnostics: RunelightDiagnostic[],
  file: string,
) {
  if (!frame.providerVariants) return

  for (const [providerName, selection] of Object.entries(frame.providerVariants)) {
    const variants = providerVariantSelectionValues(selection)
    const provider = providerFrames[providerName]
    if (!provider) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "missing-provider",
        message: `Frame "${frame.name}" marks unknown provider "${providerName}" variants "${variants.join(", ")}".`,
        file,
        frameName: frame.name,
      })
      continue
    }

    if (!provider.variants || provider.variants.length === 0) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "missing-provider-variants",
        message: `Frame "${frame.name}" marks provider "${providerName}" variants "${variants.join(", ")}", but "${providerName}" does not declare variants.`,
        file,
        frameName: frame.name,
      })
      continue
    }

    const unknownVariants = variants.filter((variant) => !provider.variants?.includes(variant))
    if (unknownVariants.length > 0) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "unknown-provider-variant",
        message: `Frame "${frame.name}" marks unknown "${providerName}" variants "${unknownVariants.join(", ")}". Expected one of: ${provider.variants.join(", ")}.`,
        file,
        frameName: frame.name,
      })
    }
  }
}

function validateProviderVariantCoverage(
  consumedProviderNames: ReadonlySet<string>,
  providerFrames: Record<string, RunelightProviderSummary>,
  selectedFrames: RunelightFrameSummary[],
  diagnostics: RunelightDiagnostic[],
  file: string,
) {
  for (const providerName of consumedProviderNames) {
    const provider = providerFrames[providerName]
    if (!provider?.variants || provider.variants.length === 0) continue

    const coveredVariants = new Set(
      selectedFrames.flatMap((frame) => {
        const selection = frame.providerVariants?.[providerName]
        return selection ? providerVariantSelectionValues(selection) : []
      }),
    )
    const missingVariants = provider.variants.filter((variant) => !coveredVariants.has(variant))
    if (missingVariants.length === 0) continue

    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "missing-provider-variant-frames",
      message: `Runelight entry consumes provider "${providerName}" but its frames do not cover variants: ${missingVariants.join(", ")}.`,
      file,
    })
  }
}

function providerVariantSelectionValues(selection: RunelightProviderVariantSelection): string[] {
  return Array.isArray(selection) ? selection : [selection]
}

function validateJSXTreeFrameReachability(
  sourceFile: ts.SourceFile,
  componentName: string,
  scopeHookNames: Set<string>,
  staticFrames: RunelightFrameStaticFacts[],
  diagnostics: RunelightDiagnostic[],
  file: string,
  context: NonRunelightHookAnalysisContext,
) {
  if (staticFrames.length === 0) return

  const component = getFunctionLikeDeclaration(sourceFile, componentName)
  if (!component?.body) return

  const branchContext = createJSXBranchAnalysisContext(sourceFile, component, scopeHookNames, context)
  const defaultValues = defaultStaticValuesForFunctionLike(component)
  const frameFacts = staticFrames.map((frame) => ({
    ...frame,
    values: new Map([...branchContext.staticValues, ...defaultValues, ...frame.values]),
  }))
  const dependencies = reachableJSXDependenciesForComponent(sourceFile, componentName, branchContext, context)
  const reported = new Set<string>()

  for (const dependency of dependencies) {
    const opaque = firstOpaqueJSXBranchPredicate(dependency.condition)
    if (opaque) {
      const key = `opaque:${dependency.tagName}:${opaque.text}`
      if (reported.has(key)) continue
      reported.add(key)
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "opaque-jsx-control-flow",
        message: `JSX dependency <${dependency.tagName}> is controlled by an opaque expression "${opaque.text}". Use props, Runelight context, or GScope values directly so frames can cover the tree structure.`,
        file,
      })
      continue
    }

    const evaluations = frameFacts.map((frame) => evaluateJSXBranchPredicate(dependency.condition, frame.values))
    const coveredFrameNames = frameFacts
      .filter((_frame, index) => evaluations[index] === true)
      .map((frame) => frame.name)
    if (coveredFrameNames.length > 0) continue

    const unknownFrameNames = frameFacts
      .filter((_frame, index) => evaluations[index] === "unknown")
      .map((frame) => frame.name)
    if (unknownFrameNames.length > 0) {
      const key = `unknown:${dependency.tagName}:${formatJSXBranchPredicate(dependency.condition)}`
      if (reported.has(key)) continue
      reported.add(key)
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "unknown-jsx-branch-coverage",
        message: `JSX dependency <${dependency.tagName}> is controlled by "${formatJSXBranchPredicate(dependency.condition)}", but frame values are not static enough to prove coverage. Unknown frames: ${unknownFrameNames.join(", ")}.`,
        file,
      })
      continue
    }

    const key = `uncovered:${dependency.tagName}:${formatJSXBranchPredicate(dependency.condition)}`
    if (reported.has(key)) continue
    reported.add(key)
    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "uncovered-jsx-branch",
      message: `No frame renders JSX dependency <${dependency.tagName}> behind "${formatJSXBranchPredicate(dependency.condition)}". Add a frame whose props, Runelight context, or GScope values make that branch reachable.`,
      file,
    })
  }
}

function validateProviderProjectionWarnings(
  sourceFile: ts.SourceFile,
  componentName: string,
  scopeHookNames: Set<string>,
  providerFrames: Record<string, RunelightProviderSummary>,
  diagnostics: RunelightDiagnostic[],
  file: string,
  context: NonRunelightHookAnalysisContext,
) {
  const warnings = providerProjectionWarningsForComponent(sourceFile, componentName, scopeHookNames, providerFrames, context)
  const reported = new Set<string>()

  for (const warning of warnings) {
    const key = `${warning.target.filePath}#${warning.target.componentName}:${warning.providerName}`
    if (reported.has(key)) continue
    reported.add(key)

    diagnostics.push({
      stage: "contract-extraction",
      severity: "warning",
      code: "unmarked-provider-variant-projection",
      message: `JSX dependency <${warning.tagName}> receives props derived from provider "${warning.providerName}", but its frames do not mark "${warning.providerName}" variants. If those props are environment projections, add GProviderFrame markers; if the child is environment-neutral, this warning can be ignored.`,
      file,
    })
  }
}

function providerProjectionWarningsForComponent(
  sourceFile: ts.SourceFile,
  componentName: string,
  scopeHookNames: Set<string>,
  providerFrames: Record<string, RunelightProviderSummary>,
  context: NonRunelightHookAnalysisContext,
): { providerName: string; tagName: string; target: ComponentDependencyTarget }[] {
  const component = getFunctionLikeDeclaration(sourceFile, componentName)
  if (!component?.body) return []

  const warnings: { providerName: string; tagName: string; target: ComponentDependencyTarget }[] = []
  const branchContext = createJSXBranchAnalysisContext(sourceFile, component, scopeHookNames, context)
  const helperFunctions = getTopLevelFunctionLikeBodiesForPath(sourceFile, context.entryPath, context.cache)
  const importBindings = componentDependencyBindingsForFile(sourceFile, context.entryPath, context)
  const visitedHelpers = new Set<string>([componentName])

  visitFunctionLikeBody(component, branchContext, visitedHelpers)
  return warnings

  function visitFunctionLikeBody(
    functionLike: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (!functionLike.body) return
    const localAliases = localComponentAliasBindingsForBody(functionLike.body)
    visit(functionLike.body, currentBranchContext, currentVisitedHelpers, localAliases)
  }

  function visit(
    node: ts.Node,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
    localAliases: LocalComponentAliasBindings,
  ) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && !isHookName(node.expression.text)) {
      const helper = getFunctionLikeDeclaration(sourceFile, node.expression.text)
      if (helper?.body && expressionContainsJSX(helper.body) && !currentVisitedHelpers.has(node.expression.text)) {
        const helperVisited = new Set(currentVisitedHelpers)
        helperVisited.add(node.expression.text)
        const helperContext = bindFunctionCallArguments(helper, node.arguments, currentBranchContext)
        visitFunctionLikeBody(helper, helperContext, helperVisited)
        return
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      visitJSXOpeningLike(node, currentBranchContext, localAliases)
    }

    ts.forEachChild(node, (child) => visit(child, currentBranchContext, currentVisitedHelpers, localAliases))
  }

  function visitJSXOpeningLike(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    currentBranchContext: JSXBranchAnalysisContext,
    localAliases: LocalComponentAliasBindings,
  ) {
    const target = componentDependencyTargetForJsxTag(node.tagName, {
      filePath: context.entryPath,
      importBindings,
      localAliases,
      localComponentNames: helperFunctions,
    })
    if (!target) return

    const projectedProviderNames = providerVariantNamesReferencedByJsxAttributes(node.attributes, providerFrames, currentBranchContext)
    if (projectedProviderNames.size === 0) return

    const targetSourceFile = sourceFileForPath(target.filePath, context)
    if (!targetSourceFile) return

    for (const providerName of projectedProviderNames) {
      const markerStatus = componentFramesProviderVariantMarkerStatus(targetSourceFile, target.componentName, providerName)
      if (markerStatus !== false) continue

      warnings.push({
        providerName,
        tagName: jsxTagNameText(node.tagName, sourceFile),
        target,
      })
    }
  }
}

function providerVariantNamesReferencedByJsxAttributes(
  attributes: ts.JsxAttributes,
  providerFrames: Record<string, RunelightProviderSummary>,
  context: JSXBranchAnalysisContext,
): Set<string> {
  const providerNames = new Set<string>()

  for (const property of attributes.properties) {
    const expression =
      ts.isJsxAttribute(property) && property.initializer
        ? ts.isJsxExpression(property.initializer)
          ? property.initializer.expression
          : property.initializer
        : ts.isJsxSpreadAttribute(property)
          ? property.expression
          : undefined
    if (!expression) continue

    for (const providerName of providerVariantNamesReferencedByExpression(expression, providerFrames, context)) {
      providerNames.add(providerName)
    }
  }

  return providerNames
}

function providerVariantNamesReferencedByExpression(
  expression: ts.Expression,
  providerFrames: Record<string, RunelightProviderSummary>,
  context: JSXBranchAnalysisContext,
): Set<string> {
  const providerNames = new Set<string>()
  visit(expression)
  return providerNames

  function visit(node: ts.Node) {
    if (ts.isExpression(node)) {
      const reference = factorReferenceForExpression(node, context)
      if (reference?.root === "context" && (providerFrames[reference.providerName]?.variants?.length ?? 0) > 0) {
        providerNames.add(reference.providerName)
      }
    }

    ts.forEachChild(node, visit)
  }
}

function componentFramesProviderVariantMarkerStatus(
  sourceFile: ts.SourceFile,
  componentName: string,
  providerName: string,
): boolean | undefined {
  let hasFrames = false

  for (const statement of sourceFile.statements) {
    const assignment = getFramesAssignment(statement, sourceFile, [])
    if (!assignment || assignment.targetName !== componentName) continue
    if (assignment.frames.length === 0) continue

    hasFrames = true
    if (assignment.frames.some((frame) => frame.providerVariants?.[providerName])) return true
  }

  return hasFrames ? false : undefined
}

function createJSXBranchAnalysisContext(
  sourceFile: ts.SourceFile,
  component: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  scopeHookNames: Set<string>,
  analysisContext: NonRunelightHookAnalysisContext,
): JSXBranchAnalysisContext {
  const context: JSXBranchAnalysisContext = {
    expressionAliases: new Map(),
    factorBindings: new Map(),
    sourceFile,
    staticValues: new Map(),
  }

  bindImportedStaticConstDeclarations(sourceFile, analysisContext.entryPath, analysisContext.cwd, context, analysisContext.cache)
  bindTopLevelStaticConstDeclarations(sourceFile, context)
  bindFunctionParameters(component, context)

  if (component.body && ts.isBlock(component.body)) {
    for (const statement of component.body.statements) {
      bindTopLevelBranchVariableStatement(statement, context, scopeHookNames)
    }
  }

  return context
}

function bindTopLevelStaticConstDeclarations(sourceFile: ts.SourceFile, context: JSXBranchAnalysisContext) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isConstDeclarationList(statement.declarationList)) continue
    bindStaticConstDeclarations(statement.declarationList, context, (name) => [name])
  }
}

function bindImportedStaticConstDeclarations(
  sourceFile: ts.SourceFile,
  filePath: string,
  cwd: string,
  context: JSXBranchAnalysisContext,
  cache?: RunelightAnalysisCacheData,
) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetPath = resolveImportedStaticSourcePath(filePath, cwd, statement.moduleSpecifier.text, cache)
    if (!targetPath) continue

    const targetSource = sourceFileForAbsolutePath(targetPath, cache)
    if (!targetSource) continue

    const targetExports = getExportedStaticValuesForFile(targetSource, targetPath, cwd, cache)
    if (targetExports.size === 0) continue

    const importClause = statement.importClause
    if (importClause.name) {
      bindImportedStaticExpression(importClause.name.text, targetExports.get("default"), context)
    }

    const namedBindings = importClause.namedBindings
    if (!namedBindings) continue

    if (ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text
        bindImportedStaticExpression(element.name.text, targetExports.get(importedName), context)
      }
      continue
    }

    for (const [exportName, staticValue] of targetExports) {
      bindStaticExportValueAtPath([namedBindings.name.text, exportName], staticValue, context)
    }
    context.factorBindings.set(namedBindings.name.text, { root: "static", path: [namedBindings.name.text] })
  }
}

function bindFunctionParameters(
  component: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  context: JSXBranchAnalysisContext,
) {
  const propsParameter = component.parameters[0]
  if (!propsParameter) return

  if (ts.isIdentifier(propsParameter.name)) {
    context.factorBindings.set(propsParameter.name.text, { root: "props", path: [] })
    return
  }

  if (ts.isObjectBindingPattern(propsParameter.name)) {
    bindObjectBindingPattern(propsParameter.name, { root: "props", path: [] }, context)
  }
}

function bindTopLevelBranchVariableStatement(
  statement: ts.Statement,
  context: JSXBranchAnalysisContext,
  scopeHookNames: Set<string>,
) {
  if (!ts.isVariableStatement(statement)) return

  for (const declaration of statement.declarationList.declarations) {
    if (!declaration.initializer) continue

    const initializer = unwrapExpression(declaration.initializer)
    const scopeProvider = scopeHookProviderFromCall(initializer, scopeHookNames)
    const contextProvider = ts.isCallExpression(initializer) ? gContextProviderNameFromCall(initializer) : undefined
    const rootReference: RunelightFactorReference | undefined = scopeProvider
      ? { root: "scope", path: [] }
      : contextProvider
        ? { root: "context", providerName: contextProvider, path: [] }
        : factorReferenceForExpression(initializer, context)

    if (rootReference) {
      if (ts.isIdentifier(declaration.name)) {
        context.factorBindings.set(declaration.name.text, rootReference)
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        bindObjectBindingPattern(declaration.name, rootReference, context)
      }
      continue
    }

    if (isConstDeclarationList(statement.declarationList) && bindStaticConstDeclaration(declaration, context, (name) => [
      `local:${declaration.name.getStart(context.sourceFile)}:${name}`,
    ])) {
      continue
    }

    if (ts.isIdentifier(declaration.name) && !expressionContainsJSX(initializer)) {
      context.expressionAliases.set(declaration.name.text, initializer)
    }
  }
}

function bindStaticConstDeclarations(
  declarationList: ts.VariableDeclarationList,
  context: JSXBranchAnalysisContext,
  staticPathForName: (name: string) => string[],
) {
  for (const declaration of declarationList.declarations) {
    bindStaticConstDeclaration(declaration, context, staticPathForName)
  }
}

function bindStaticConstDeclaration(
  declaration: ts.VariableDeclaration,
  context: JSXBranchAnalysisContext,
  staticPathForName: (name: string) => string[],
): boolean {
  if (!declaration.initializer) return false

  const initializer = unwrapExpression(declaration.initializer)
  const rootReference = factorReferenceForExpression(initializer, context)
  if (rootReference) {
    if (ts.isIdentifier(declaration.name)) {
      context.factorBindings.set(declaration.name.text, rootReference)
      return true
    }

    if (ts.isObjectBindingPattern(declaration.name)) {
      bindObjectBindingPattern(declaration.name, rootReference, context)
      return true
    }

    return false
  }

  if (!ts.isIdentifier(declaration.name)) return false
  return bindStaticExpressionAtPath(staticPathForName(declaration.name.text), initializer, context, declaration.name.text)
}

function bindImportedStaticExpression(
  localName: string,
  staticValue: StaticExportValue | undefined,
  context: JSXBranchAnalysisContext,
): boolean {
  return bindStaticExportValueAtPath([localName], staticValue, context, localName)
}

function bindStaticExportValueAtPath(
  staticPath: string[],
  staticValue: StaticExportValue | undefined,
  context: JSXBranchAnalysisContext,
  bindingName?: string,
): boolean {
  if (!staticValue) return false

  const reference: RunelightFactorReference = { root: "static", path: staticPath }
  if (bindingName) context.factorBindings.set(bindingName, reference)

  if (staticValue.kind === "expression") {
    return bindStaticExpressionAtPath(staticPath, staticValue.expression, context, bindingName)
  }

  if (staticValue.kind === "facts") {
    let bound = false
    const prefix = factorReferenceKey(reference)
    for (const [suffix, value] of staticValue.values) {
      writeStaticBranchValue(context.staticValues, suffix ? `${prefix}.${suffix}` : prefix, value, "override")
      bound = true
    }
    return bound
  }

  let bound = false
  context.staticValues.set(factorReferenceKey(reference), { kind: "object" })
  for (const [exportName, childValue] of staticValue.exports) {
    bound = bindStaticExportValueAtPath([...staticPath, exportName], childValue, context) || bound
  }
  return bound
}

function bindStaticExpressionAtPath(
  staticPath: string[],
  expression: ts.Expression | undefined,
  context: JSXBranchAnalysisContext,
  bindingName?: string,
): boolean {
  if (!expression) return false

  const initializer = unwrapExpression(expression)
  if (!readStaticBranchValue(initializer) && !isStaticSpreadLiteral(initializer, context)) return false

  const reference: RunelightFactorReference = {
    root: "static",
    path: staticPath,
  }
  if (bindingName) context.factorBindings.set(bindingName, reference)
  flattenStaticObjectExpression(initializer, factorReferenceKey(reference), context.staticValues, context)
  return true
}

function isConstDeclarationList(declarationList: ts.VariableDeclarationList): boolean {
  return (declarationList.flags & ts.NodeFlags.Const) !== 0
}

function bindObjectBindingPattern(
  pattern: ts.ObjectBindingPattern,
  rootReference: RunelightFactorReference,
  context: JSXBranchAnalysisContext,
) {
  for (const element of pattern.elements) {
    if (element.dotDotDotToken) continue

    const propertyName = element.propertyName ? bindingNameText(element.propertyName) : bindingNameText(element.name)
    if (!propertyName) continue

    const nextReference = appendFactorReferencePath(rootReference, propertyName)
    if (ts.isIdentifier(element.name)) {
      context.factorBindings.set(element.name.text, nextReference)
    } else if (ts.isObjectBindingPattern(element.name)) {
      bindObjectBindingPattern(element.name, nextReference, context)
    }
  }
}

function bindingNameText(name: ts.BindingName | ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function cloneJSXBranchAnalysisContext(context: JSXBranchAnalysisContext): JSXBranchAnalysisContext {
  return {
    expressionAliases: new Map(context.expressionAliases),
    factorBindings: new Map(context.factorBindings),
    sourceFile: context.sourceFile,
    staticValues: new Map(context.staticValues),
  }
}

function bindCallbackItemParameter(
  callback: ts.ArrowFunction | ts.FunctionExpression,
  sourceReference: RunelightFactorReference,
  context: JSXBranchAnalysisContext,
): JSXBranchAnalysisContext {
  const callbackContext = cloneJSXBranchAnalysisContext(context)
  const itemReference = appendFactorReferencePath(sourceReference, "number")
  const parameter = callback.parameters[0]
  if (!parameter) return callbackContext

  if (ts.isIdentifier(parameter.name)) {
    callbackContext.factorBindings.set(parameter.name.text, itemReference)
  } else if (ts.isObjectBindingPattern(parameter.name)) {
    bindObjectBindingPattern(parameter.name, itemReference, callbackContext)
  }

  return callbackContext
}

function bindFunctionCallArguments(
  functionLike: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  args: ts.NodeArray<ts.Expression>,
  context: JSXBranchAnalysisContext,
): JSXBranchAnalysisContext {
  const callContext = cloneJSXBranchAnalysisContext(context)

  for (let index = 0; index < functionLike.parameters.length; index += 1) {
    const parameter = functionLike.parameters[index]
    const argument = args[index]
    if (!parameter || !argument) continue

    const argumentReference = factorReferenceForExpression(argument, context)
    if (argumentReference) {
      if (ts.isIdentifier(parameter.name)) {
        callContext.factorBindings.set(parameter.name.text, argumentReference)
      } else if (ts.isObjectBindingPattern(parameter.name)) {
        bindObjectBindingPattern(parameter.name, argumentReference, callContext)
      }
      continue
    }

    if (ts.isIdentifier(parameter.name) && !expressionContainsJSX(argument)) {
      callContext.expressionAliases.set(parameter.name.text, argument)
    }
  }

  return callContext
}

function bindJSXComponentCallProps(
  functionLike: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  context: JSXBranchAnalysisContext,
): JSXBranchAnalysisContext {
  const propsParameter = functionLike.parameters[0]
  if (!propsParameter) return context

  const propsContext = cloneJSXBranchAnalysisContext(context)
  const attributeExpressions = jsxAttributeExpressions(node.attributes, context.sourceFile)

  if (ts.isObjectBindingPattern(propsParameter.name)) {
    for (const element of propsParameter.name.elements) {
      if (element.dotDotDotToken) continue

      const propertyName = element.propertyName ? bindingNameText(element.propertyName) : bindingNameText(element.name)
      if (!propertyName) continue

      const expression = attributeExpressions.get(propertyName)
      if (!expression) continue
      bindJSXComponentPropBinding(element.name, propertyName, expression, propsContext)
    }
  }

  return propsContext
}

function jsxAttributeExpressions(attributes: ts.JsxAttributes, sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const expressions = new Map<string, ts.Expression>()

  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue
    if (!property.initializer) {
      expressions.set(property.name.text, ts.factory.createTrue())
      continue
    }

    if (ts.isStringLiteral(property.initializer)) {
      expressions.set(property.name.text, property.initializer)
      continue
    }

    if (ts.isJsxExpression(property.initializer) && property.initializer.expression) {
      expressions.set(property.name.text, property.initializer.expression)
      continue
    }

    expressions.set(property.name.text, ts.factory.createIdentifier(property.name.getText(sourceFile)))
  }

  return expressions
}

function bindJSXComponentPropBinding(
  bindingName: ts.BindingName,
  propertyName: string,
  expression: ts.Expression,
  context: JSXBranchAnalysisContext,
) {
  const reference = factorReferenceForExpression(expression, context)
  if (reference) {
    if (ts.isIdentifier(bindingName)) {
      context.factorBindings.set(bindingName.text, reference)
    } else if (ts.isObjectBindingPattern(bindingName)) {
      bindObjectBindingPattern(bindingName, reference, context)
    }
    return
  }

  const staticPath = [`jsx:${expression.getStart(context.sourceFile)}`, propertyName]
  if (bindStaticExpressionAtPath(staticPath, expression, context, ts.isIdentifier(bindingName) ? bindingName.text : undefined)) {
    return
  }

  if (ts.isIdentifier(bindingName) && !expressionContainsJSX(expression)) {
    context.expressionAliases.set(bindingName.text, expression)
  }
}

function nonEmptyCollectionPredicate(reference: RunelightFactorReference): JSXBranchPredicate {
  return {
    kind: "relation",
    operator: ">",
    ref: appendFactorReferencePath(reference, "length"),
    value: { kind: "number", value: 0 },
  }
}

function opaqueJSXBranchPredicate(expression: ts.Expression, context: JSXBranchAnalysisContext): JSXBranchPredicate {
  return {
    kind: "opaque",
    reason: "JSX callback source is not a direct props/context/scope expression",
    text: expression.getText(context.sourceFile),
  }
}

function jsxAttributeFactorReference(
  attributes: ts.JsxAttributes,
  context: JSXBranchAnalysisContext,
): RunelightFactorReference | undefined {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || !property.initializer) continue
    if (!ts.isIdentifier(property.name)) continue
    if (!new Set(["items", "rows", "data", "options"]).has(property.name.text)) continue
    if (!ts.isJsxExpression(property.initializer) || !property.initializer.expression) continue

    const reference = factorReferenceForExpression(property.initializer.expression, context)
    if (reference) return reference
  }

  return undefined
}

function defaultStaticValuesForFunctionLike(
  component: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
): Map<string, StaticBranchValue> {
  const values = new Map<string, StaticBranchValue>()
  const propsParameter = component.parameters[0]
  if (!propsParameter || !ts.isObjectBindingPattern(propsParameter.name)) return values

  collectBindingDefaults(propsParameter.name, { root: "props", path: [] }, values)
  return values
}

function collectBindingDefaults(
  pattern: ts.ObjectBindingPattern,
  rootReference: RunelightFactorReference,
  values: Map<string, StaticBranchValue>,
) {
  for (const element of pattern.elements) {
    if (element.dotDotDotToken) continue

    const propertyName = element.propertyName ? bindingNameText(element.propertyName) : bindingNameText(element.name)
    if (!propertyName) continue

    const nextReference = appendFactorReferencePath(rootReference, propertyName)
    if (element.initializer) {
      const value = readStaticBranchValue(element.initializer)
      if (value) values.set(factorReferenceKey(nextReference), value)
    }

    if (ts.isObjectBindingPattern(element.name)) {
      collectBindingDefaults(element.name, nextReference, values)
    }
  }
}

function scopeHookProviderFromCall(expression: ts.Expression, scopeHookNames: Set<string>): string | undefined {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && scopeHookNames.has(expression.expression.text)
    ? expression.expression.text
    : undefined
}

function reachableJSXDependenciesForComponent(
  sourceFile: ts.SourceFile,
  componentName: string,
  branchContext: JSXBranchAnalysisContext,
  context: NonRunelightHookAnalysisContext,
): JSXReachableDependency[] {
  const dependencies: JSXReachableDependency[] = []
  const componentBody = getFunctionLikeBody(sourceFile, componentName)
  if (!componentBody) return dependencies

  const helperFunctions = getTopLevelFunctionLikeBodiesForPath(sourceFile, context.entryPath, context.cache)
  const localComponentNames = helperFunctions
  const importBindings = componentDependencyBindingsForFile(sourceFile, context.entryPath, context)
  const localAliases = localComponentAliasBindingsForBody(componentBody)
  const always: JSXBranchPredicate = { kind: "always" }

  const visitedHelpers = new Set<string>([componentName])

  if (ts.isBlock(componentBody)) {
    for (const statement of componentBody.statements) visitStatement(statement, always, branchContext, visitedHelpers)
  } else {
    visitExpression(componentBody, always, branchContext, visitedHelpers)
  }

  return dependencies

  function visitStatement(
    statement: ts.Statement,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (ts.isBlock(statement)) {
      for (const child of statement.statements) visitStatement(child, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isReturnStatement(statement)) {
      if (statement.expression) visitExpression(statement.expression, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isIfStatement(statement)) {
      const predicate = parseJSXBranchPredicate(statement.expression, currentBranchContext)
      visitStatementOrBlock(statement.thenStatement, andJSXBranchPredicates(condition, predicate), currentBranchContext, currentVisitedHelpers)
      if (statement.elseStatement) {
        visitStatementOrBlock(
          statement.elseStatement,
          andJSXBranchPredicates(condition, notJSXBranchPredicate(predicate)),
          currentBranchContext,
          currentVisitedHelpers,
        )
      }
      return
    }

    if (ts.isExpressionStatement(statement)) {
      visitExpression(statement.expression, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (nodeContainsJSX(statement)) {
      visitOpaqueJSXSubtree(statement, condition, currentBranchContext, currentVisitedHelpers)
    }
  }

  function visitStatementOrBlock(
    statement: ts.Statement,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (ts.isBlock(statement)) {
      for (const child of statement.statements) visitStatement(child, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    visitStatement(statement, condition, currentBranchContext, currentVisitedHelpers)
  }

  function visitExpression(
    expression: ts.Expression,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    const value = unwrapExpression(expression)

    if (ts.isJsxElement(value)) {
      visitJSXOpeningLike(value.openingElement, condition, currentBranchContext, currentVisitedHelpers)
      for (const child of value.children) visitJSXChild(child, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isJsxSelfClosingElement(value)) {
      visitJSXOpeningLike(value, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isJsxFragment(value)) {
      for (const child of value.children) visitJSXChild(child, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isConditionalExpression(value)) {
      const predicate = parseJSXBranchPredicate(value.condition, currentBranchContext)
      visitExpression(value.whenTrue, andJSXBranchPredicates(condition, predicate), currentBranchContext, currentVisitedHelpers)
      visitExpression(
        value.whenFalse,
        andJSXBranchPredicates(condition, notJSXBranchPredicate(predicate)),
        currentBranchContext,
        currentVisitedHelpers,
      )
      return
    }

    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const predicate = parseJSXBranchPredicate(value.left, currentBranchContext)
      visitExpression(value.right, andJSXBranchPredicates(condition, predicate), currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      const predicate = parseJSXBranchPredicate(value.left, currentBranchContext)
      visitExpression(
        value.right,
        andJSXBranchPredicates(condition, notJSXBranchPredicate(predicate)),
        currentBranchContext,
        currentVisitedHelpers,
      )
      return
    }

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
      visitFunctionLikeBody(value, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isCallExpression(value) && visitJSXProducingCall(value, condition, currentBranchContext, currentVisitedHelpers)) {
      return
    }

    ts.forEachChild(value, (child) => {
      if (isExpressionWithPossibleJSX(child)) visitExpression(child, condition, currentBranchContext, currentVisitedHelpers)
    })
  }

  function visitFunctionLikeBody(
    functionLike: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (!functionLike.body) return
    if (ts.isBlock(functionLike.body)) {
      for (const statement of functionLike.body.statements) visitStatement(statement, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    visitExpression(functionLike.body, condition, currentBranchContext, currentVisitedHelpers)
  }

  function visitJSXProducingCall(
    call: ts.CallExpression,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ): boolean {
    if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "map") {
      const callback = call.arguments[0] ? unwrapExpression(call.arguments[0]) : undefined
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const sourceReference = factorReferenceForExpression(call.expression.expression, currentBranchContext)
        const callbackCondition = sourceReference
          ? andJSXBranchPredicates(condition, nonEmptyCollectionPredicate(sourceReference))
          : andJSXBranchPredicates(condition, opaqueJSXBranchPredicate(call.expression.expression, currentBranchContext))
        const callbackContext = sourceReference
          ? bindCallbackItemParameter(callback, sourceReference, currentBranchContext)
          : cloneJSXBranchAnalysisContext(currentBranchContext)
        visitFunctionLikeBody(callback, callbackCondition, callbackContext, currentVisitedHelpers)
        return true
      }
    }

    if (ts.isIdentifier(call.expression)) {
      const helper = getFunctionLikeDeclaration(sourceFile, call.expression.text)
      if (helper?.body && expressionContainsJSX(helper.body) && !currentVisitedHelpers.has(call.expression.text)) {
        const helperVisited = new Set(currentVisitedHelpers)
        helperVisited.add(call.expression.text)
        const helperContext = bindFunctionCallArguments(helper, call.arguments, currentBranchContext)
        visitFunctionLikeBody(helper, condition, helperContext, helperVisited)
        return true
      }
    }

    let handled = false
    for (const argument of call.arguments) {
      if (!expressionContainsJSX(argument)) continue
      visitExpression(argument, condition, currentBranchContext, currentVisitedHelpers)
      handled = true
    }
    return handled
  }

  function visitOpaqueJSXSubtree(
    node: ts.Node,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    const opaqueCondition = andJSXBranchPredicates(condition, {
      kind: "opaque",
      reason: "JSX is produced from unsupported statement-level control flow",
      text: summarizeNodeText(node, currentBranchContext.sourceFile),
    })

    visit(node)

    function visit(current: ts.Node) {
      if (ts.isJsxElement(current)) {
        visitJSXOpeningLike(current.openingElement, opaqueCondition, currentBranchContext, currentVisitedHelpers)
        for (const child of current.children) visit(child)
        return
      }

      if (ts.isJsxSelfClosingElement(current)) {
        visitJSXOpeningLike(current, opaqueCondition, currentBranchContext, currentVisitedHelpers)
        return
      }

      if (ts.isJsxFragment(current)) {
        for (const child of current.children) visit(child)
        return
      }

      ts.forEachChild(current, visit)
    }
  }

  function visitJSXChild(
    child: ts.JsxChild,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (ts.isJsxText(child)) return
    if (ts.isJsxExpression(child)) {
      if (child.expression) visitExpression(child.expression, condition, currentBranchContext, currentVisitedHelpers)
      return
    }

    visitExpression(child, condition, currentBranchContext, currentVisitedHelpers)
  }

  function visitJSXOpeningLike(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    const target = componentDependencyTargetForJsxTag(node.tagName, {
      filePath: context.entryPath,
      importBindings,
      localAliases,
      localComponentNames,
    })
    if (target) {
      dependencies.push({
        condition,
        tagName: jsxTagNameText(node.tagName, sourceFile),
        target,
      })
    }

    visitJSXAttributes(node.attributes, condition, currentBranchContext, currentVisitedHelpers)
  }

  function visitJSXAttributes(
    attributes: ts.JsxAttributes,
    condition: JSXBranchPredicate,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    const itemSource = jsxAttributeFactorReference(attributes, currentBranchContext)
    for (const property of attributes.properties) {
      if (!ts.isJsxAttribute(property) || !property.initializer) continue

      const initializer = property.initializer
      const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer
      if (!expression || !expressionContainsJSX(expression)) continue

      const value = unwrapExpression(expression)
      if ((ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && value.parameters.length > 0) {
        const callbackCondition = itemSource
          ? andJSXBranchPredicates(condition, nonEmptyCollectionPredicate(itemSource))
          : andJSXBranchPredicates(condition, opaqueJSXBranchPredicate(value, currentBranchContext))
        const callbackContext = itemSource ? bindCallbackItemParameter(value, itemSource, currentBranchContext) : currentBranchContext
        visitFunctionLikeBody(value, callbackCondition, callbackContext, currentVisitedHelpers)
        continue
      }

      visitExpression(expression, condition, currentBranchContext, currentVisitedHelpers)
    }
  }
}

function projectReachableReactVisualFrame(
  sourceFile: ts.SourceFile,
  componentName: string,
  branchContext: JSXBranchAnalysisContext,
  frameValues: Map<string, StaticBranchValue>,
  context: NonRunelightHookAnalysisContext,
): Pick<RunelightReactVisualFrameProjection, "dependencies" | "signatureParts"> {
  const dependencies: string[] = []
  const dependencySet = new Set<string>()
  const signatureParts: string[] = []
  const componentBody = getFunctionLikeBody(sourceFile, componentName)
  if (!componentBody) return { dependencies, signatureParts }

  const helperFunctions = getTopLevelFunctionLikeBodiesForPath(sourceFile, context.entryPath, context.cache)
  const localComponentNames = helperFunctions
  const importBindings = componentDependencyBindingsForFile(sourceFile, context.entryPath, context)
  const localAliases = localComponentAliasBindingsForBody(componentBody)
  const ownCoordinate = `${normalizeProjectPath(relative(context.cwd, context.entryPath))}#${getExportNameForComponentTarget(sourceFile, context.entryPath, componentName, context.cache) ?? componentName}`
  const visitedHelpers = new Set<string>([componentName])

  if (ts.isBlock(componentBody)) {
    for (const statement of componentBody.statements) visitStatement(statement, branchContext, visitedHelpers)
  } else {
    visitExpression(componentBody, branchContext, visitedHelpers)
  }

  return { dependencies: dependencies.sort(), signatureParts }

  function addDependency(target: ComponentDependencyTarget | undefined) {
    const coordinate = target ? componentCoordinateForDependencyTarget(target, context.cwd, context.cache) : undefined
    if (!coordinate || coordinate === ownCoordinate || dependencySet.has(coordinate)) return
    dependencySet.add(coordinate)
    dependencies.push(coordinate)
  }

  function addSignature(part: string) {
    const normalized = part.replace(/\s+/g, " ").trim()
    if (normalized) signatureParts.push(normalized)
  }

  function visitStatement(
    statement: ts.Statement,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (ts.isBlock(statement)) {
      for (const child of statement.statements) visitStatement(child, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isReturnStatement(statement)) {
      if (statement.expression) visitExpression(statement.expression, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isIfStatement(statement)) {
      visitConditionalBranch(
        statement.expression,
        () => visitStatementOrBlock(statement.thenStatement, currentBranchContext, currentVisitedHelpers),
        () => {
          if (statement.elseStatement) visitStatementOrBlock(statement.elseStatement, currentBranchContext, currentVisitedHelpers)
        },
        currentBranchContext,
      )
      return
    }

    if (ts.isExpressionStatement(statement)) {
      visitExpression(statement.expression, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (nodeContainsJSX(statement)) {
      addSignature(`opaque-statement:${summarizeNodeText(statement, currentBranchContext.sourceFile)}`)
      ts.forEachChild(statement, (child) => {
        if (isExpressionWithPossibleJSX(child)) visitExpression(child, currentBranchContext, currentVisitedHelpers)
      })
    }
  }

  function visitStatementOrBlock(
    statement: ts.Statement,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (ts.isBlock(statement)) {
      for (const child of statement.statements) visitStatement(child, currentBranchContext, currentVisitedHelpers)
      return
    }

    visitStatement(statement, currentBranchContext, currentVisitedHelpers)
  }

  function visitExpression(
    expression: ts.Expression,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    const value = unwrapExpression(expression)

    if (ts.isJsxElement(value)) {
      visitJSXOpeningLike(value.openingElement, currentBranchContext, currentVisitedHelpers)
      for (const child of value.children) visitJSXChild(child, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isJsxSelfClosingElement(value)) {
      visitJSXOpeningLike(value, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isJsxFragment(value)) {
      addSignature("fragment")
      for (const child of value.children) visitJSXChild(child, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isConditionalExpression(value)) {
      visitConditionalBranch(
        value.condition,
        () => visitExpression(value.whenTrue, currentBranchContext, currentVisitedHelpers),
        () => visitExpression(value.whenFalse, currentBranchContext, currentVisitedHelpers),
        currentBranchContext,
      )
      return
    }

    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const predicate = parseJSXBranchPredicate(value.left, currentBranchContext)
      const evaluation = evaluateJSXBranchPredicate(predicate, frameValues)
      if (evaluation === true || evaluation === "unknown") {
        if (evaluation === "unknown") addSignature(`unknown-condition:${formatJSXBranchPredicate(predicate)}`)
        visitExpression(value.right, currentBranchContext, currentVisitedHelpers)
      }
      return
    }

    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      const predicate = parseJSXBranchPredicate(value.left, currentBranchContext)
      const evaluation = evaluateJSXBranchPredicate(predicate, frameValues)
      if (evaluation === false || evaluation === "unknown") {
        if (evaluation === "unknown") addSignature(`unknown-condition:${formatJSXBranchPredicate(predicate)}`)
        visitExpression(value.right, currentBranchContext, currentVisitedHelpers)
      }
      return
    }

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
      visitFunctionLikeBody(value, currentBranchContext, currentVisitedHelpers)
      return
    }

    if (ts.isCallExpression(value) && visitJSXProducingCall(value, currentBranchContext, currentVisitedHelpers)) {
      return
    }

    ts.forEachChild(value, (child) => {
      if (isExpressionWithPossibleJSX(child)) visitExpression(child, currentBranchContext, currentVisitedHelpers)
    })
  }

  function visitConditionalBranch(
    condition: ts.Expression,
    visitWhenTrue: () => void,
    visitWhenFalse: () => void,
    currentBranchContext: JSXBranchAnalysisContext,
  ) {
    const predicate = parseJSXBranchPredicate(condition, currentBranchContext)
    const evaluation = evaluateJSXBranchPredicate(predicate, frameValues)
    if (evaluation === true) {
      visitWhenTrue()
      return
    }
    if (evaluation === false) {
      visitWhenFalse()
      return
    }

    addSignature(`unknown-condition:${formatJSXBranchPredicate(predicate)}`)
    visitWhenTrue()
    visitWhenFalse()
  }

  function visitFunctionLikeBody(
    functionLike: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (!functionLike.body) return
    if (ts.isBlock(functionLike.body)) {
      for (const statement of functionLike.body.statements) visitStatement(statement, currentBranchContext, currentVisitedHelpers)
      return
    }

    visitExpression(functionLike.body, currentBranchContext, currentVisitedHelpers)
  }

  function visitJSXProducingCall(
    call: ts.CallExpression,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ): boolean {
    if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "map") {
      const callback = call.arguments[0] ? unwrapExpression(call.arguments[0]) : undefined
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const sourceReference = factorReferenceForExpression(call.expression.expression, currentBranchContext)
        if (sourceReference) {
          const predicate = nonEmptyCollectionPredicate(sourceReference)
          const evaluation = evaluateJSXBranchPredicate(predicate, frameValues)
          if (evaluation === false) return true
          if (evaluation === "unknown") addSignature(`unknown-condition:${formatJSXBranchPredicate(predicate)}`)
        } else {
          addSignature(`unknown-condition:${summarizeNodeText(call.expression.expression, currentBranchContext.sourceFile)}`)
        }
        const callbackContext = sourceReference
          ? bindCallbackItemParameter(callback, sourceReference, currentBranchContext)
          : cloneJSXBranchAnalysisContext(currentBranchContext)
        visitFunctionLikeBody(callback, callbackContext, currentVisitedHelpers)
        return true
      }
    }

    if (ts.isIdentifier(call.expression)) {
      const helper = getFunctionLikeDeclaration(sourceFile, call.expression.text)
      if (helper?.body && expressionContainsJSX(helper.body) && !currentVisitedHelpers.has(call.expression.text)) {
        const helperVisited = new Set(currentVisitedHelpers)
        helperVisited.add(call.expression.text)
        const helperContext = bindFunctionCallArguments(helper, call.arguments, currentBranchContext)
        visitFunctionLikeBody(helper, helperContext, helperVisited)
        return true
      }
    }

    let handled = false
    for (const argument of call.arguments) {
      if (!expressionContainsJSX(argument)) continue
      visitExpression(argument, currentBranchContext, currentVisitedHelpers)
      handled = true
    }
    return handled
  }

  function visitJSXChild(
    child: ts.JsxChild,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    if (ts.isJsxText(child)) {
      const text = normalizeProjectedText(child.getText(sourceFile))
      if (text) addSignature(`text:${text}`)
      return
    }
    if (ts.isJsxExpression(child)) {
      if (!child.expression) return
      if (expressionContainsJSX(child.expression)) {
        visitExpression(child.expression, currentBranchContext, currentVisitedHelpers)
      } else {
        const projected = projectVisualExpressionText(child.expression, currentBranchContext, frameValues)
        const text = stringValueFromProjectedExpressionText(projected)
        addSignature(text !== undefined ? `text:${text}` : `expr:${projected}`)
      }
      return
    }

    visitExpression(child, currentBranchContext, currentVisitedHelpers)
  }

  function visitJSXOpeningLike(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    const target = componentDependencyTargetForJsxTag(node.tagName, {
      filePath: context.entryPath,
      importBindings,
      localAliases,
      localComponentNames,
    })
    const dependencyCoordinate = target ? componentCoordinateForDependencyTarget(target, context.cwd, context.cache) : undefined
    const tagName = jsxTagNameText(node.tagName, sourceFile)
    const localUnexportedComponent = Boolean(target?.filePath === context.entryPath && !dependencyCoordinate)
    addSignature(
      localUnexportedComponent
        ? `component:${tagName}`
        : `element:${tagName} ${projectJSXAttributes(node.attributes, currentBranchContext, frameValues)}`,
    )

    if (dependencyCoordinate) {
      addDependency(target)
    } else if (localUnexportedComponent && target && !currentVisitedHelpers.has(target.componentName)) {
      const helper = getFunctionLikeDeclaration(sourceFile, target.componentName)
      if (helper?.body && expressionContainsJSX(helper.body)) {
        const helperVisited = new Set(currentVisitedHelpers)
        helperVisited.add(target.componentName)
        const helperContext = bindJSXComponentCallProps(helper, node, currentBranchContext)
        visitFunctionLikeBody(helper, helperContext, helperVisited)
      }
    }

    visitJSXAttributes(node.attributes, currentBranchContext, currentVisitedHelpers)
  }

  function visitJSXAttributes(
    attributes: ts.JsxAttributes,
    currentBranchContext: JSXBranchAnalysisContext,
    currentVisitedHelpers: Set<string>,
  ) {
    const itemSource = jsxAttributeFactorReference(attributes, currentBranchContext)
    for (const property of attributes.properties) {
      if (!ts.isJsxAttribute(property) || !property.initializer) continue

      const initializer = property.initializer
      const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer
      if (!expression || !expressionContainsJSX(expression)) continue

      const value = unwrapExpression(expression)
      if ((ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && value.parameters.length > 0) {
        const callbackContext = itemSource ? bindCallbackItemParameter(value, itemSource, currentBranchContext) : currentBranchContext
        if (!itemSource) addSignature(`unknown-condition:${summarizeNodeText(value, currentBranchContext.sourceFile)}`)
        visitFunctionLikeBody(value, callbackContext, currentVisitedHelpers)
        continue
      }

      visitExpression(expression, currentBranchContext, currentVisitedHelpers)
    }
  }
}

function projectJSXAttributes(
  attributes: ts.JsxAttributes,
  context: JSXBranchAnalysisContext,
  frameValues: Map<string, StaticBranchValue>,
): string {
  const parts: string[] = []

  for (const property of attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      parts.push(`...${projectVisualExpressionText(property.expression, context, frameValues)}`)
      continue
    }

    if (!ts.isJsxAttribute(property)) continue
    const name = ts.isIdentifier(property.name) ? property.name.text : property.name.getText(context.sourceFile)
    if (!property.initializer) {
      parts.push(name)
      continue
    }

    if (ts.isStringLiteral(property.initializer)) {
      parts.push(`${name}=${JSON.stringify(normalizeProjectedText(property.initializer.text))}`)
      continue
    }

    if (!ts.isJsxExpression(property.initializer) || !property.initializer.expression) {
      parts.push(`${name}=unknown`)
      continue
    }

    parts.push(`${name}=${projectVisualExpressionText(property.initializer.expression, context, frameValues)}`)
  }

  return parts.join(" ")
}

function projectVisualExpressionText(
  expression: ts.Expression,
  context: JSXBranchAnalysisContext,
  frameValues: Map<string, StaticBranchValue>,
  resolvingAliases = new Set<string>(),
): string {
  const value = unwrapExpression(expression)

  if (value.kind === ts.SyntaxKind.TrueKeyword) return "true"
  if (value.kind === ts.SyntaxKind.FalseKeyword) return "false"
  if (value.kind === ts.SyntaxKind.NullKeyword) return "null"
  if (ts.isIdentifier(value) && value.text === "undefined") return "undefined"
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return JSON.stringify(normalizeProjectedText(value.text))
  if (ts.isNumericLiteral(value)) return value.text
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return "function"

  if (ts.isIdentifier(value)) {
    const alias = context.expressionAliases.get(value.text)
    if (alias && !resolvingAliases.has(value.text)) {
      resolvingAliases.add(value.text)
      const text = projectVisualExpressionText(alias, context, frameValues, resolvingAliases)
      resolvingAliases.delete(value.text)
      return text
    }
  }

  const reference = factorReferenceForExpression(value, context)
  if (reference) {
    const key = factorReferenceKey(reference)
    const frameValue = staticBranchValueForReference(frameValues, reference)
    if (frameValue) return `value:${formatStaticBranchValue(frameValue)}`
    if (reference.root === "static") {
      const staticValue = context.staticValues.get(key)
      return `static:${staticValue ? formatStaticBranchValue(staticValue) : "unknown"}`
    }
    return `ref:${key}`
  }

  if (ts.isConditionalExpression(value)) {
    const predicate = parseJSXBranchPredicate(value.condition, context)
    const evaluation = evaluateJSXBranchPredicate(predicate, frameValues)
    if (evaluation === true) return projectVisualExpressionText(value.whenTrue, context, frameValues, resolvingAliases)
    if (evaluation === false) return projectVisualExpressionText(value.whenFalse, context, frameValues, resolvingAliases)
    return `unknown(${formatJSXBranchPredicate(predicate)})?${projectVisualExpressionText(value.whenTrue, context, frameValues, resolvingAliases)}:${projectVisualExpressionText(value.whenFalse, context, frameValues, resolvingAliases)}`
  }

  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const predicate = parseJSXBranchPredicate(value.left, context)
    const evaluation = evaluateJSXBranchPredicate(predicate, frameValues)
    if (evaluation === false) return ""
    if (evaluation === true) return projectVisualExpressionText(value.right, context, frameValues, resolvingAliases)
    return `unknown(${formatJSXBranchPredicate(predicate)})&&${projectVisualExpressionText(value.right, context, frameValues, resolvingAliases)}`
  }

  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    const predicate = parseJSXBranchPredicate(value.left, context)
    const evaluation = evaluateJSXBranchPredicate(predicate, frameValues)
    if (evaluation === true) return projectVisualExpressionText(value.left, context, frameValues, resolvingAliases)
    if (evaluation === false) return projectVisualExpressionText(value.right, context, frameValues, resolvingAliases)
    return `unknown(${formatJSXBranchPredicate(predicate)})||${projectVisualExpressionText(value.right, context, frameValues, resolvingAliases)}`
  }

  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return normalizeProjectedText(
      `${projectVisualExpressionText(value.left, context, frameValues, resolvingAliases)}${projectVisualExpressionText(value.right, context, frameValues, resolvingAliases)}`,
    )
  }

  if (ts.isTemplateExpression(value)) {
    const parts = [value.head.text]
    for (const span of value.templateSpans) {
      parts.push(projectVisualTemplateSpanText(span.expression, context, frameValues, resolvingAliases), span.literal.text)
    }
    return JSON.stringify(normalizeProjectedText(parts.join("")))
  }

  return summarizeNodeText(value, context.sourceFile)
}

function projectVisualTemplateSpanText(
  expression: ts.Expression,
  context: JSXBranchAnalysisContext,
  frameValues: Map<string, StaticBranchValue>,
  resolvingAliases: Set<string>,
): string {
  const text = projectVisualExpressionText(expression, context, frameValues, resolvingAliases)
  if (!text.startsWith("\"") || !text.endsWith("\"")) return text

  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === "string" ? parsed : text
  } catch {
    return text
  }
}

function stringValueFromProjectedExpressionText(text: string): string | undefined {
  const value = text.startsWith("static:") ? text.slice("static:".length) : text
  if (!value.startsWith("\"") || !value.endsWith("\"")) return undefined

  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === "string" ? parsed : undefined
  } catch {
    return undefined
  }
}

function normalizeProjectedText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function componentCoordinateForDependencyTarget(
  target: ComponentDependencyTarget,
  cwd: string,
  cache?: RunelightAnalysisCacheData,
): string | undefined {
  const sourceFile = sourceFileForAbsolutePath(target.filePath, cache)
  if (!sourceFile) return undefined
  const exportName = getExportNameForComponentTarget(sourceFile, target.filePath, target.componentName, cache)
  return exportName ? `${normalizeProjectPath(relative(cwd, target.filePath))}#${exportName}` : undefined
}

function getExportNameForComponentTarget(
  sourceFile: ts.SourceFile,
  filePath: string,
  componentName: string,
  cache?: RunelightAnalysisCacheData,
): string | undefined {
  for (const [exportName, target] of exportedComponentTargetsForFile(sourceFile, filePath, cache)) {
    if (target.componentName === componentName) return exportName
  }
  return undefined
}

function isExpressionWithPossibleJSX(node: ts.Node): node is ts.Expression {
  return ts.isExpression(node) && nodeContainsJSX(node)
}

function expressionContainsJSX(node: ts.Node): boolean {
  return nodeContainsJSX(node)
}

function nodeContainsJSX(node: ts.Node): boolean {
  let found = false
  visit(node)
  return found

  function visit(current: ts.Node) {
    if (found) return
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }
}

function summarizeNodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
  const text = node.getText(sourceFile).replace(/\s+/g, " ").trim()
  return text.length > 140 ? `${text.slice(0, 137)}...` : text
}

function parseJSXBranchPredicate(
  expression: ts.Expression,
  context: JSXBranchAnalysisContext,
  resolvingAliases = new Set<string>(),
): JSXBranchPredicate {
  const value = unwrapExpression(expression)

  if (value.kind === ts.SyntaxKind.TrueKeyword) return { kind: "static", value: true }
  if (value.kind === ts.SyntaxKind.FalseKeyword) return { kind: "static", value: false }

  if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
    return notJSXBranchPredicate(parseJSXBranchPredicate(value.operand, context, resolvingAliases))
  }

  if (ts.isBinaryExpression(value)) {
    if (value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return andJSXBranchPredicates(
        parseJSXBranchPredicate(value.left, context, resolvingAliases),
        parseJSXBranchPredicate(value.right, context, resolvingAliases),
      )
    }

    if (value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return orJSXBranchPredicates(
        parseJSXBranchPredicate(value.left, context, resolvingAliases),
        parseJSXBranchPredicate(value.right, context, resolvingAliases),
      )
    }

    const equalityPredicate = parseBinaryComparisonPredicate(value, context, resolvingAliases)
    if (equalityPredicate) return equalityPredicate
  }

  if (
    ts.isCallExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === "Boolean" &&
    value.arguments.length === 1 &&
    value.arguments[0]
  ) {
    return parseJSXBranchPredicate(value.arguments[0], context, resolvingAliases)
  }

  if (ts.isIdentifier(value)) {
    const alias = context.expressionAliases.get(value.text)
    if (alias && !resolvingAliases.has(value.text)) {
      resolvingAliases.add(value.text)
      const predicate = parseJSXBranchPredicate(alias, context, resolvingAliases)
      resolvingAliases.delete(value.text)
      return predicate
    }
  }

  const reference = factorReferenceForExpression(value, context)
  if (reference) return { kind: "truthy", ref: reference }

  const staticValue = readStaticBranchValue(value)
  const staticTruthy = staticValue ? staticBranchValueTruthy(staticValue) : undefined
  if (staticTruthy !== undefined) return { kind: "static", value: staticTruthy }

  return {
    kind: "opaque",
    reason: "condition is not a direct props/context/scope expression",
    text: value.getText(context.sourceFile),
  }
}

function parseBinaryComparisonPredicate(
  expression: ts.BinaryExpression,
  context: JSXBranchAnalysisContext,
  resolvingAliases: Set<string>,
): JSXBranchPredicate | undefined {
  const leftReference = factorReferenceForExpression(expression.left, context)
  const rightReference = factorReferenceForExpression(expression.right, context)
  const leftValue = readStaticBranchValue(expression.left)
  const rightValue = readStaticBranchValue(expression.right)

  const equalityOperators = new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
  ])
  if (equalityOperators.has(expression.operatorToken.kind)) {
    if (leftReference && rightReference) {
      const predicate: JSXBranchPredicate = { kind: "equals-ref", left: leftReference, right: rightReference }
      return expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
        ? notJSXBranchPredicate(predicate)
        : predicate
    }

    const reference = leftReference ?? rightReference
    const staticValue = leftReference ? rightValue : rightReference ? leftValue : undefined
    if (!reference || !staticValue) return undefined

    const predicate: JSXBranchPredicate = { kind: "equals", ref: reference, value: staticValue }
    return expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
      ? notJSXBranchPredicate(predicate)
      : predicate
  }

  const relationOperator = relationOperatorText(expression.operatorToken.kind)
  if (relationOperator) {
    if (leftReference && rightValue) return { kind: "relation", operator: relationOperator, ref: leftReference, value: rightValue }
    if (rightReference && leftValue) {
      const invertedOperator = invertRelationOperator(relationOperator)
      return { kind: "relation", operator: invertedOperator, ref: rightReference, value: leftValue }
    }
  }

  return undefined
}

function relationOperatorText(kind: ts.SyntaxKind): "<" | "<=" | ">" | ">=" | undefined {
  if (kind === ts.SyntaxKind.LessThanToken) return "<"
  if (kind === ts.SyntaxKind.LessThanEqualsToken) return "<="
  if (kind === ts.SyntaxKind.GreaterThanToken) return ">"
  if (kind === ts.SyntaxKind.GreaterThanEqualsToken) return ">="
  return undefined
}

function invertRelationOperator(operator: "<" | "<=" | ">" | ">="): "<" | "<=" | ">" | ">=" {
  if (operator === "<") return ">"
  if (operator === "<=") return ">="
  if (operator === ">") return "<"
  return "<="
}

function factorReferenceForExpression(
  expression: ts.Expression,
  context: JSXBranchAnalysisContext,
  resolvingAliases = new Set<string>(),
): RunelightFactorReference | undefined {
  const value = unwrapExpression(expression)

  if (ts.isIdentifier(value)) {
    const direct = context.factorBindings.get(value.text)
    if (direct) return direct

    const alias = context.expressionAliases.get(value.text)
    if (!alias || resolvingAliases.has(value.text)) return undefined
    resolvingAliases.add(value.text)
    const reference = factorReferenceForExpression(alias, context, resolvingAliases)
    resolvingAliases.delete(value.text)
    return reference
  }

  if (ts.isPropertyAccessExpression(value)) {
    const base = factorReferenceForExpression(value.expression, context, resolvingAliases)
    return base ? appendFactorReferencePath(base, value.name.text) : undefined
  }

  if (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(value.argumentExpression)) {
    const base = factorReferenceForExpression(value.expression, context, resolvingAliases)
    return base ? appendFactorReferencePath(base, value.argumentExpression.text) : undefined
  }

  if (ts.isElementAccessExpression(value) && ts.isNumericLiteral(value.argumentExpression)) {
    const base = factorReferenceForExpression(value.expression, context, resolvingAliases)
    return base ? appendFactorReferencePath(base, "number") : undefined
  }

  return undefined
}

function appendFactorReferencePath(reference: RunelightFactorReference, propertyName: string): RunelightFactorReference {
  if (reference.root === "context") {
    return { root: "context", providerName: reference.providerName, path: [...reference.path, propertyName] }
  }

  return { root: reference.root, path: [...reference.path, propertyName] }
}

function andJSXBranchPredicates(left: JSXBranchPredicate, right: JSXBranchPredicate): JSXBranchPredicate {
  if (left.kind === "always") return right
  if (right.kind === "always") return left
  if (left.kind === "static" && left.value) return right
  if (right.kind === "static" && right.value) return left
  if (left.kind === "static" && !left.value) return left
  if (right.kind === "static" && !right.value) return right
  return {
    kind: "and",
    predicates: [
      ...(left.kind === "and" ? left.predicates : [left]),
      ...(right.kind === "and" ? right.predicates : [right]),
    ],
  }
}

function orJSXBranchPredicates(left: JSXBranchPredicate, right: JSXBranchPredicate): JSXBranchPredicate {
  if (left.kind === "static" && left.value) return left
  if (right.kind === "static" && right.value) return right
  if (left.kind === "static" && !left.value) return right
  if (right.kind === "static" && !right.value) return left
  return {
    kind: "or",
    predicates: [
      ...(left.kind === "or" ? left.predicates : [left]),
      ...(right.kind === "or" ? right.predicates : [right]),
    ],
  }
}

function notJSXBranchPredicate(predicate: JSXBranchPredicate): JSXBranchPredicate {
  if (predicate.kind === "static") return { kind: "static", value: !predicate.value }
  if (predicate.kind === "not") return predicate.predicate
  return { kind: "not", predicate }
}

function firstOpaqueJSXBranchPredicate(predicate: JSXBranchPredicate): Extract<JSXBranchPredicate, { kind: "opaque" }> | undefined {
  if (predicate.kind === "opaque") return predicate
  if (predicate.kind === "not") return firstOpaqueJSXBranchPredicate(predicate.predicate)
  if (predicate.kind === "and" || predicate.kind === "or") {
    for (const child of predicate.predicates) {
      const opaque = firstOpaqueJSXBranchPredicate(child)
      if (opaque) return opaque
    }
  }
  return undefined
}

function evaluateJSXBranchPredicate(
  predicate: JSXBranchPredicate,
  values: Map<string, StaticBranchValue>,
): boolean | "unknown" {
  if (predicate.kind === "always") return true
  if (predicate.kind === "static") return predicate.value
  if (predicate.kind === "opaque") return "unknown"
  if (predicate.kind === "truthy") {
    return evaluateStaticBranchValueTruthy(staticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" })
  }
  if (predicate.kind === "equals") {
    return evaluateSameStaticBranchValue(staticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" }, predicate.value)
  }
  if (predicate.kind === "equals-ref") {
    return evaluateSameStaticBranchValue(
      staticBranchValueForReference(values, predicate.left) ?? { kind: "undefined" },
      staticBranchValueForReference(values, predicate.right) ?? { kind: "undefined" },
    )
  }
  if (predicate.kind === "relation") {
    return evaluateStaticBranchRelation(
      staticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" },
      predicate.operator,
      predicate.value,
    )
  }
  if (predicate.kind === "not") {
    return evaluateNegatedJSXBranchPredicate(predicate.predicate, values)
  }
  if (predicate.kind === "and") {
    let unknown = false
    for (const child of predicate.predicates) {
      const value = evaluateJSXBranchPredicate(child, values)
      if (value === false) return false
      if (value === "unknown") unknown = true
    }
    return unknown ? "unknown" : true
  }
  if (predicate.kind === "or") {
    let unknown = false
    for (const child of predicate.predicates) {
      const value = evaluateJSXBranchPredicate(child, values)
      if (value === true) return true
      if (value === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }
  return "unknown"
}

function evaluateNegatedJSXBranchPredicate(
  predicate: JSXBranchPredicate,
  values: Map<string, StaticBranchValue>,
): boolean | "unknown" {
  if (predicate.kind === "truthy") {
    const value = staticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" }
    if (value.kind === "oneOf") {
      let unknown = false
      for (const option of value.values) {
        const result = evaluateStaticBranchValueTruthy(option)
        if (result === false) return true
        if (result === "unknown") unknown = true
      }
      return unknown ? "unknown" : false
    }
    const truthy = evaluateStaticBranchValueTruthy(value)
    return truthy === "unknown" ? "unknown" : !truthy
  }
  if (predicate.kind === "equals") {
    const value = staticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" }
    if (value.kind === "oneOf") {
      let unknown = false
      for (const option of value.values) {
        const result = evaluateSameStaticBranchValue(option, predicate.value)
        if (result === false) return true
        if (result === "unknown") unknown = true
      }
      return unknown ? "unknown" : false
    }
    const result = evaluateSameStaticBranchValue(value, predicate.value)
    return result === "unknown" ? "unknown" : !result
  }
  if (predicate.kind === "equals-ref") {
    const left = staticBranchValueForReference(values, predicate.left) ?? { kind: "undefined" }
    const right = staticBranchValueForReference(values, predicate.right) ?? { kind: "undefined" }
    if (left.kind === "oneOf") {
      let unknown = false
      for (const option of left.values) {
        const result = evaluateSameStaticBranchValue(option, right)
        if (result === false) return true
        if (result === "unknown") unknown = true
      }
      return unknown ? "unknown" : false
    }
    if (right.kind === "oneOf") {
      let unknown = false
      for (const option of right.values) {
        const result = evaluateSameStaticBranchValue(left, option)
        if (result === false) return true
        if (result === "unknown") unknown = true
      }
      return unknown ? "unknown" : false
    }
    const result = evaluateSameStaticBranchValue(left, right)
    return result === "unknown" ? "unknown" : !result
  }
  if (predicate.kind === "relation") {
    const value = staticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" }
    if (value.kind === "oneOf") {
      let unknown = false
      for (const option of value.values) {
        const result = evaluateStaticBranchRelation(option, predicate.operator, predicate.value)
        if (result === false) return true
        if (result === "unknown") unknown = true
      }
      return unknown ? "unknown" : false
    }
    const result = evaluateStaticBranchRelation(value, predicate.operator, predicate.value)
    return result === "unknown" ? "unknown" : !result
  }
  if (predicate.kind === "and") return evaluateJSXBranchPredicate({ kind: "or", predicates: predicate.predicates.map(notJSXBranchPredicate) }, values)
  if (predicate.kind === "or") return evaluateJSXBranchPredicate({ kind: "and", predicates: predicate.predicates.map(notJSXBranchPredicate) }, values)

  const value = evaluateJSXBranchPredicate(predicate, values)
  return value === "unknown" ? "unknown" : !value
}

function staticBranchValueForReference(
  values: Map<string, StaticBranchValue>,
  reference: RunelightFactorReference,
): StaticBranchValue | undefined {
  const key = factorReferenceKey(reference)
  const exact = values.get(key)
  if (exact) return exact

  const parts = key.split(".")
  while (parts.length > 1) {
    parts.pop()
    const ancestor = values.get(parts.join("."))
    if (ancestor && staticBranchValueIncludesUnknown(ancestor)) return { kind: "unknown" }
  }

  return undefined
}

function staticBranchValueIncludesUnknown(value: StaticBranchValue): boolean {
  return value.kind === "unknown" || (value.kind === "oneOf" && value.values.some(staticBranchValueIncludesUnknown))
}

function evaluateStaticBranchValueTruthy(value: StaticBranchValue): boolean | "unknown" {
  if (value.kind === "unknown") return "unknown"
  if (value.kind === "oneOf") {
    let unknown = false
    for (const option of value.values) {
      const result = evaluateStaticBranchValueTruthy(option)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }

  return staticBranchValueTruthy(value)
}

function evaluateSameStaticBranchValue(left: StaticBranchValue, right: StaticBranchValue): boolean | "unknown" {
  if (left.kind === "unknown" || right.kind === "unknown") return "unknown"
  if (left.kind === "oneOf") {
    let unknown = false
    for (const option of left.values) {
      const result = evaluateSameStaticBranchValue(option, right)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }
  if (right.kind === "oneOf") {
    let unknown = false
    for (const option of right.values) {
      const result = evaluateSameStaticBranchValue(left, option)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }

  return sameStaticBranchValue(left, right)
}

function staticBranchValueTruthy(value: StaticBranchValue): boolean {
  if (value.kind === "unknown") return false
  if (value.kind === "oneOf") return value.values.some(staticBranchValueTruthy)
  if (value.kind === "undefined" || value.kind === "null") return false
  if (value.kind === "boolean") return value.value
  if (value.kind === "number") return value.value !== 0 && !Number.isNaN(value.value)
  if (value.kind === "string") return value.value.length > 0
  if (value.kind === "array" || value.kind === "object" || value.kind === "truthy") return true
  return false
}

function sameStaticBranchValue(left: StaticBranchValue, right: StaticBranchValue): boolean {
  if (left.kind === "oneOf") return left.values.some((value) => sameStaticBranchValue(value, right))
  if (right.kind === "oneOf") return right.values.some((value) => sameStaticBranchValue(left, value))
  if (left.kind === "undefined" && right.kind === "undefined") return true
  if (left.kind === "null" && right.kind === "null") return true
  if (left.kind === "boolean" && right.kind === "boolean") return left.value === right.value
  if (left.kind === "number" && right.kind === "number") return left.value === right.value
  if (left.kind === "string" && right.kind === "string") return left.value === right.value
  if (left.kind === "array" && right.kind === "array") return left.length === right.length
  return false
}

function evaluateStaticBranchRelation(
  left: StaticBranchValue,
  operator: "<" | "<=" | ">" | ">=",
  right: StaticBranchValue,
): boolean | "unknown" {
  if (left.kind === "unknown" || right.kind === "unknown") return "unknown"
  if (left.kind === "oneOf") {
    let unknown = false
    for (const value of left.values) {
      const result = evaluateStaticBranchRelation(value, operator, right)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }
  if (right.kind === "oneOf") {
    let unknown = false
    for (const value of right.values) {
      const result = evaluateStaticBranchRelation(left, operator, value)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }
  const leftNumber = staticBranchValueNumber(left)
  const rightNumber = staticBranchValueNumber(right)
  if (leftNumber === undefined || rightNumber === undefined) return "unknown"
  if (operator === "<") return leftNumber < rightNumber
  if (operator === "<=") return leftNumber <= rightNumber
  if (operator === ">") return leftNumber > rightNumber
  return leftNumber >= rightNumber
}

function staticBranchValueNumber(value: StaticBranchValue): number | undefined {
  if (value.kind === "number") return value.value
  if (value.kind === "array") return value.length
  return undefined
}

function factorReferenceKey(reference: RunelightFactorReference): string {
  if (reference.root === "context") return ["context", reference.providerName, ...reference.path].join(".")
  return [reference.root, ...reference.path].join(".")
}

function formatJSXBranchPredicate(predicate: JSXBranchPredicate): string {
  if (predicate.kind === "always") return "always"
  if (predicate.kind === "static") return String(predicate.value)
  if (predicate.kind === "truthy") return factorReferenceKey(predicate.ref)
  if (predicate.kind === "equals") return `${factorReferenceKey(predicate.ref)} === ${formatStaticBranchValue(predicate.value)}`
  if (predicate.kind === "equals-ref") return `${factorReferenceKey(predicate.left)} === ${factorReferenceKey(predicate.right)}`
  if (predicate.kind === "relation") {
    return `${factorReferenceKey(predicate.ref)} ${predicate.operator} ${formatStaticBranchValue(predicate.value)}`
  }
  if (predicate.kind === "not") return `!(${formatJSXBranchPredicate(predicate.predicate)})`
  if (predicate.kind === "and") return predicate.predicates.map(formatJSXBranchPredicate).join(" && ")
  if (predicate.kind === "or") return predicate.predicates.map(formatJSXBranchPredicate).join(" || ")
  return predicate.text
}

function formatStaticBranchValue(value: StaticBranchValue): string {
  if (value.kind === "boolean") return String(value.value)
  if (value.kind === "number") return String(value.value)
  if (value.kind === "string") return JSON.stringify(value.value)
  if (value.kind === "array") return `array(length=${value.length})`
  if (value.kind === "oneOf") return `oneOf(${value.values.map(formatStaticBranchValue).join(", ")})`
  return value.kind
}

function jsxTagNameText(tagName: ts.JsxTagNameExpression, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(tagName)) return tagName.text
  return tagName.getText(sourceFile)
}

function getNonRunelightHookCalls(
  sourceFile: ts.SourceFile,
  componentName: string,
  scopeHookNames: Set<string>,
  context: NonRunelightHookAnalysisContext,
): HookViolation[] {
  const violations = new Map<string, HookViolation>()

  visitComponent(sourceFile, context.entryPath, componentName)
  return [...violations.values()]

  function visitComponent(currentSourceFile: ts.SourceFile, currentPath: string, currentComponentName: string) {
    const componentKey = `${currentPath}#${currentComponentName}`
    if (context.visitedComponents.has(componentKey)) return
    context.visitedComponents.add(componentKey)

    const componentBody = getFunctionLikeBody(currentSourceFile, currentComponentName)
    if (!componentBody) return

    const currentScopeHookNames =
      currentPath === context.entryPath
        ? scopeHookNames
        : new Set([
            ...getScopeHookNames(currentSourceFile),
            ...getImportedScopeHookNames(currentSourceFile, currentPath, context.cwd, context.cache),
          ])
    const helperFunctions = getTopLevelFunctionLikeBodiesForPath(currentSourceFile, currentPath, context.cache)
    const visitedHelpers = new Set<string>([currentComponentName])
    const localComponentNames = helperFunctions
    const importBindings = componentDependencyBindingsForFile(currentSourceFile, currentPath, context)
    const file = normalizeProjectPath(relative(context.cwd, currentPath))

    visit(componentBody, localComponentAliasBindingsForBody(componentBody))

    function visit(node: ts.Node, localAliases: LocalComponentAliasBindings) {
      if (ts.isCallExpression(node)) {
        const hookName = getHookCallName(node, currentSourceFile)
        if (hookName) {
          if (!isAllowedRunelightHookCall(node, hookName, currentScopeHookNames)) {
            const key = `${file}#${currentComponentName}:${hookName}`
            violations.set(key, { hookName, componentName: currentComponentName, file })
          }
        } else if (ts.isIdentifier(node.expression)) {
          visitHelper(node.expression.text)
        }
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        visitJSXDependency(node.tagName, localAliases)
      }

      ts.forEachChild(node, (child) => visit(child, localAliases))
    }

    function visitHelper(functionName: string) {
      if (visitedHelpers.has(functionName)) return
      const helperBody = helperFunctions.get(functionName)
      if (!helperBody) return

      visitedHelpers.add(functionName)
      visit(helperBody, localComponentAliasBindingsForBody(helperBody))
    }

    function visitJSXDependency(tagName: ts.JsxTagNameExpression, localAliases: LocalComponentAliasBindings) {
      const target = componentDependencyTargetForJsxTag(tagName, {
        filePath: currentPath,
        importBindings,
        localAliases,
        localComponentNames,
      })
      if (!target) return

      const targetSourceFile = sourceFileForPath(target.filePath, context)
      if (!targetSourceFile) return

      visitComponent(targetSourceFile, target.filePath, target.componentName)
    }
  }
}

function getGProviderConsumers(
  sourceFile: ts.SourceFile,
  componentName: string,
  context: NonRunelightHookAnalysisContext,
): Set<string> {
  const providers = new Set<string>()

  visitComponent(sourceFile, context.entryPath, componentName)
  return providers

  function visitComponent(currentSourceFile: ts.SourceFile, currentPath: string, currentComponentName: string) {
    const componentKey = `${currentPath}#${currentComponentName}`
    if (context.visitedComponents.has(componentKey)) return
    context.visitedComponents.add(componentKey)

    const componentBody = getFunctionLikeBody(currentSourceFile, currentComponentName)
    if (!componentBody) return

    const scopeHookProviderNames = getScopeHookProviderNamesForFile(currentSourceFile, currentPath, context.cache)
    const helperFunctions = getTopLevelFunctionLikeBodiesForPath(currentSourceFile, currentPath, context.cache)
    const visitedHelpers = new Set<string>([currentComponentName])
    const localComponentNames = helperFunctions
    const importBindings = componentDependencyBindingsForFile(currentSourceFile, currentPath, context)

    visit(componentBody, localComponentAliasBindingsForBody(componentBody))

    function visit(node: ts.Node, localAliases: LocalComponentAliasBindings) {
      if (ts.isCallExpression(node)) {
        const contextProvider = gContextProviderNameFromCall(node)
        if (contextProvider) {
          providers.add(contextProvider)
        } else if (ts.isIdentifier(node.expression) && scopeHookProviderNames.has(node.expression.text)) {
          for (const providerName of scopeHookProviderNames.get(node.expression.text) ?? []) providers.add(providerName)
        } else if (ts.isIdentifier(node.expression) && !isHookName(node.expression.text)) {
          visitHelper(node.expression.text)
        }
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        visitJSXDependency(node.tagName, localAliases)
      }

      ts.forEachChild(node, (child) => visit(child, localAliases))
    }

    function visitHelper(functionName: string) {
      if (visitedHelpers.has(functionName)) return
      const helperBody = helperFunctions.get(functionName)
      if (!helperBody) return

      visitedHelpers.add(functionName)
      visit(helperBody, localComponentAliasBindingsForBody(helperBody))
    }

    function visitJSXDependency(tagName: ts.JsxTagNameExpression, localAliases: LocalComponentAliasBindings) {
      const target = componentDependencyTargetForJsxTag(tagName, {
        filePath: currentPath,
        importBindings,
        localAliases,
        localComponentNames,
      })
      if (!target) return

      const targetSourceFile = sourceFileForPath(target.filePath, context)
      if (!targetSourceFile) return

      visitComponent(targetSourceFile, target.filePath, target.componentName)
    }
  }
}

function gContextProviderNameFromCall(node: ts.CallExpression): string | undefined {
  if (!ts.isIdentifier(node.expression)) return undefined
  if (node.expression.text !== "useGContext" && node.expression.text !== "useGContextUpdate") return undefined

  const provider = node.arguments[0] ? unwrapExpression(node.arguments[0]) : undefined
  return provider && ts.isIdentifier(provider) ? provider.text : undefined
}

function localComponentAliasBindingsForBody(body: ts.ConciseBody): LocalComponentAliasBindings {
  const aliases = new Map<string, string>()
  if (!ts.isBlock(body)) return aliases

  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue

      const initializer = unwrapExpression(declaration.initializer)
      if (ts.isIdentifier(initializer)) {
        aliases.set(declaration.name.text, initializer.text)
      }
    }
  }

  return aliases
}

function getFunctionLikeBody(sourceFile: ts.SourceFile, functionName: string): ts.ConciseBody | undefined {
  return getFunctionLikeDeclaration(sourceFile, functionName)?.body
}

function getFunctionLikeDeclaration(
  sourceFile: ts.SourceFile,
  functionName: string,
): ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) {
      return statement
    }

    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== functionName || !declaration.initializer) continue

      const initializer = unwrapExpression(declaration.initializer)
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        return initializer
      }
    }
  }

  return undefined
}

function getTopLevelFunctionLikeBodies(sourceFile: ts.SourceFile): Map<string, ts.ConciseBody> {
  const functions = new Map<string, ts.ConciseBody>()

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      functions.set(statement.name.text, statement.body)
      continue
    }

    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue

      const initializer = unwrapExpression(declaration.initializer)
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        functions.set(declaration.name.text, initializer.body)
      }
    }
  }

  return functions
}

function getTopLevelFunctionLikeBodiesForPath(
  sourceFile: ts.SourceFile,
  filePath: string,
  cache?: RunelightAnalysisCacheData,
): Map<string, ts.ConciseBody> {
  const cached = cache?.topLevelFunctionLikeBodiesByPath.get(filePath)
  if (cached) return cached

  const functions = getTopLevelFunctionLikeBodies(sourceFile)
  cache?.topLevelFunctionLikeBodiesByPath.set(filePath, functions)
  return functions
}

function componentDependencyBindingsForFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  context: NonRunelightHookAnalysisContext,
): ComponentDependencyBindings {
  const cached = context.cache?.componentDependencyBindingsByPath.get(filePath)
  if (cached) return cached

  const bindings: ComponentDependencyBindings = {
    names: new Map(),
    namespaces: new Map(),
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetPath = resolveImportedRunelightPath(filePath, context.cwd, statement.moduleSpecifier.text, context.cache)
    if (!targetPath) continue

    const targetSourceFile = sourceFileForPath(targetPath, context)
    if (!targetSourceFile) continue

    const importClause = statement.importClause
    if (importClause.name) {
      const componentName = getComponentExportName(targetSourceFile, "default")
      if (componentName) {
        bindings.names.set(importClause.name.text, { filePath: targetPath, componentName })
      }
    }

    if (!importClause.namedBindings) continue
    if (ts.isNamedImports(importClause.namedBindings)) {
      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text
        const componentName = getComponentExportName(targetSourceFile, importedName)
        if (componentName) {
          bindings.names.set(element.name.text, { filePath: targetPath, componentName })
        }
      }
    } else if (ts.isNamespaceImport(importClause.namedBindings)) {
      const namespaceExports = exportedComponentTargetsForFile(targetSourceFile, targetPath, context.cache)
      if (namespaceExports.size > 0) {
        bindings.namespaces.set(importClause.namedBindings.name.text, namespaceExports)
      }
    }
  }

  context.cache?.componentDependencyBindingsByPath.set(filePath, bindings)
  return bindings
}

function sourceFileForPath(filePath: string, context: NonRunelightHookAnalysisContext): ts.SourceFile | undefined {
  const cached = context.sourceFilesByPath.get(filePath)
  if (cached) return cached
  const sourceFile = sourceFileForAbsolutePath(filePath, context.cache)
  if (!sourceFile) return undefined

  context.sourceFilesByPath.set(filePath, sourceFile)
  return sourceFile
}

function sourceFileForAbsolutePath(filePath: string, cache?: RunelightAnalysisCacheData): ts.SourceFile | undefined {
  const cached = cache?.sourceFilesByPath.get(filePath)
  if (cached) return cached
  if (!isFile(filePath)) return undefined

  const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  cache?.sourceFilesByPath.set(filePath, sourceFile)
  return sourceFile
}

function exportedComponentTargetsForFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  cache?: RunelightAnalysisCacheData,
): Map<string, ComponentDependencyTarget> {
  const cached = cache?.exportedComponentTargetsByPath.get(filePath)
  if (cached) return cached

  const targets = new Map<string, ComponentDependencyTarget>()
  const defaultName = getComponentExportName(sourceFile, "default")
  if (defaultName) {
    targets.set("default", { filePath, componentName: defaultName })
  }

  for (const statement of sourceFile.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        targets.set(statement.name.text, { filePath, componentName: statement.name.text })
      }
      continue
    }

    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && getFunctionLikeBody(sourceFile, declaration.name.text)) {
          targets.set(declaration.name.text, { filePath, componentName: declaration.name.text })
        }
      }
      continue
    }

    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue
    }

    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text ?? element.name.text
      if (getFunctionLikeBody(sourceFile, localName)) {
        targets.set(element.name.text, { filePath, componentName: localName })
      }
    }
  }

  cache?.exportedComponentTargetsByPath.set(filePath, targets)
  return targets
}

function componentDependencyTargetForJsxTag(
  tagName: ts.JsxTagNameExpression,
  input: {
    filePath: string
    importBindings: ComponentDependencyBindings
    localAliases?: LocalComponentAliasBindings
    localComponentNames?: ReadonlyMap<string, unknown>
  },
): ComponentDependencyTarget | undefined {
  if (ts.isIdentifier(tagName)) {
    return componentDependencyTargetForIdentifier(tagName.text, input)
  }

  if (ts.isPropertyAccessExpression(tagName) && ts.isIdentifier(tagName.expression)) {
    return input.importBindings.namespaces.get(tagName.expression.text)?.get(tagName.name.text)
  }

  return undefined
}

function componentDependencyTargetForIdentifier(
  name: string,
  input: {
    filePath: string
    importBindings: ComponentDependencyBindings
    localAliases?: LocalComponentAliasBindings
    localComponentNames?: ReadonlyMap<string, unknown>
  },
): ComponentDependencyTarget | undefined {
  if (!isComponentName(name)) return undefined

  let currentName = name
  const visited = new Set<string>()

  while (!visited.has(currentName)) {
    visited.add(currentName)

    const aliasTarget = input.localAliases?.get(currentName)
    if (aliasTarget) {
      currentName = aliasTarget
      continue
    }

    if (input.localComponentNames?.has(currentName)) {
      return { filePath: input.filePath, componentName: currentName }
    }

    const importTarget = input.importBindings.names.get(currentName)
    if (importTarget) return importTarget

    return undefined
  }

  return undefined
}

function getHookCallName(node: ts.CallExpression, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(node.expression) && isHookName(node.expression.text)) {
    return node.expression.text
  }

  if (ts.isPropertyAccessExpression(node.expression) && isHookName(node.expression.name.text)) {
    return node.expression.getText(sourceFile)
  }

  return undefined
}

function isAllowedRunelightHookCall(
  node: ts.CallExpression,
  hookName: string,
  scopeHookNames: Set<string>,
): boolean {
  if (ts.isIdentifier(node.expression)) {
    return hookName === "useGContext" || hookName === "useGContextUpdate" || scopeHookNames.has(hookName)
  }

  return false
}

function getGScopeHookCalls(
  sourceFile: ts.SourceFile,
  componentName: string,
  scopeHookNames: Set<string>,
): string[] {
  const component = getFunctionDeclaration(sourceFile, componentName)
  if (!component?.body) return []

  const helperFunctions = getTopLevelFunctionDeclarations(sourceFile)
  const visitedHelpers = new Set<string>([componentName])
  const hookNames = new Set<string>()
  visit(component.body)
  return [...hookNames]

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (scopeHookNames.has(node.expression.text)) {
        hookNames.add(node.expression.text)
      } else if (!isHookName(node.expression.text)) {
        visitHelper(node.expression.text)
      }
    }

    ts.forEachChild(node, visit)
  }

  function visitHelper(functionName: string) {
    if (visitedHelpers.has(functionName)) return
    const helper = helperFunctions.get(functionName)
    if (!helper?.body) return

    visitedHelpers.add(functionName)
    visit(helper.body)
  }
}

function getFunctionDeclaration(sourceFile: ts.SourceFile, functionName: string): ts.FunctionDeclaration | undefined {
  return sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
  )
}

function getTopLevelFunctionDeclarations(sourceFile: ts.SourceFile): Map<string, ts.FunctionDeclaration> {
  const functions = new Map<string, ts.FunctionDeclaration>()
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement)
    }
  }
  return functions
}

function isHookName(name: string): boolean {
  return name === "use" || /^use[A-Z0-9_]/.test(name)
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name)
}

function jsxTagIdentifier(tagName: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(tagName)) return tagName.text
  return undefined
}

function getFramesAssignment(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  diagnostics: RunelightDiagnostic[],
): FramesAssignment | undefined {
  if (!ts.isExpressionStatement(statement)) return undefined

  const expression = statement.expression
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return undefined
  }

  if (!ts.isPropertyAccessExpression(expression.left) || expression.left.name.text !== "frames") {
    return undefined
  }

  if (!ts.isIdentifier(expression.left.expression)) return undefined

  const framesExpression = unwrapExpression(expression.right)
  if (!ts.isObjectLiteralExpression(framesExpression)) {
    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "malformed-frames",
      message: "Runelight frames must be a statically enumerable object literal.",
      file: sourceFile.fileName,
    })
    return { targetName: expression.left.expression.text, frames: [], staticFrames: [], statementStart: statement.getStart(sourceFile) }
  }

  return {
    targetName: expression.left.expression.text,
    statementStart: statement.getStart(sourceFile),
    ...readFramesObject(framesExpression, sourceFile, diagnostics),
  }
}

function readFramesObject(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  diagnostics: RunelightDiagnostic[],
): Pick<FramesAssignment, "frames" | "staticFrames"> {
  const frames: RunelightFrameSummary[] = []
  const staticFrames: RunelightFrameStaticFacts[] = []
  const staticContext: JSXBranchAnalysisContext = {
    expressionAliases: new Map(),
    factorBindings: new Map(),
    sourceFile,
    staticValues: new Map(),
  }
  bindTopLevelStaticConstDeclarations(sourceFile, staticContext)

  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "malformed-frames",
        message: "Runelight frames do not support spread composition in the first implementation.",
        file: sourceFile.fileName,
      })
      continue
    }

    if (!ts.isPropertyAssignment(property)) continue

    const frameName = getStaticPropertyName(property.name)
    if (!frameName) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "non-static-frame-key",
        message: "Runelight frame keys must be statically enumerable object literal keys.",
        file: sourceFile.fileName,
      })
      continue
    }

    const providerVariants = readProviderVariantMarkers(property.initializer)
    const frameValue = unwrapExpression(property.initializer)
    const providers = ts.isObjectLiteralExpression(frameValue) ? readProviderSelections(frameValue) : undefined
    const description = ts.isObjectLiteralExpression(frameValue) ? readFrameDescription(frameValue) : undefined
    if (description === undefined) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code:
          ts.isObjectLiteralExpression(frameValue) && hasStaticProperty(frameValue, "description")
            ? "non-static-frame-description"
            : "missing-frame-description",
        message:
          ts.isObjectLiteralExpression(frameValue) && hasStaticProperty(frameValue, "description")
            ? `Runelight frame "${frameName}" description must be a static string.`
            : `Runelight frame "${frameName}" must declare a static description string.`,
        file: sourceFile.fileName,
        frameName,
      })
    }
    const kind = ts.isObjectLiteralExpression(frameValue) && hasStaticProperty(frameValue, "scope") ? "scope" : "pure"
    frames.push({
      description: description ?? "",
      kind,
      name: frameName,
      ...(providerVariants && Object.keys(providerVariants).length > 0 ? { providerVariants } : {}),
      ...(providers && Object.keys(providers).length > 0 ? { providers } : {}),
    })
    staticFrames.push(readFrameStaticFacts(frameName, frameValue, providerVariants, staticContext))
  }

  return { frames, staticFrames }
}

function readFrameDescription(frameValue: ts.ObjectLiteralExpression): string | undefined {
  const description = objectLiteralPropertyExpression(frameValue, "description")
  if (!description) return undefined
  if (ts.isStringLiteral(description) || ts.isNoSubstitutionTemplateLiteral(description)) return description.text
  return undefined
}

function readProviderVariantMarkers(expression: ts.Expression): Record<string, RunelightProviderVariantSelection> | undefined {
  if (ts.isSatisfiesExpression(expression)) return readProviderVariantMarkersFromType(expression.type)
  if (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) return readProviderVariantMarkers(expression.expression)
  return undefined
}

function readFrameStaticFacts(
  frameName: string,
  frameValue: ts.Expression,
  providerVariants: Record<string, RunelightProviderVariantSelection> | undefined,
  context?: JSXBranchAnalysisContext,
): RunelightFrameStaticFacts {
  const values = new Map<string, StaticBranchValue>()

  if (ts.isObjectLiteralExpression(frameValue)) {
    const props = objectLiteralPropertyExpression(frameValue, "props")
    if (props) flattenStaticObjectExpression(props, "props", values, context)

    const scope = objectLiteralPropertyExpression(frameValue, "scope")
    if (scope) flattenStaticObjectExpression(scope, "scope", values, context)

    const providers = objectLiteralPropertyExpression(frameValue, "providers")
    if (providers) flattenProviderStaticValues(providers, values, context)
  }

  for (const [providerName, selection] of Object.entries(providerVariants ?? {})) {
    const variants = providerVariantSelectionValues(selection)
    values.set(
      `context.${providerName}.variant`,
      variants.length === 1
        ? { kind: "string", value: variants[0] as string }
        : { kind: "oneOf", values: variants.map((variant) => ({ kind: "string", value: variant })) },
    )
  }

  return {
    name: frameName,
    ...(providerVariants && Object.keys(providerVariants).length > 0 ? { providerVariants } : {}),
    values,
  }
}

function objectLiteralPropertyExpression(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): ts.Expression | undefined {
  const property = objectLiteral.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) && getStaticPropertyName(candidate.name) === propertyName,
  )
  return property ? unwrapExpression(property.initializer) : undefined
}

function flattenProviderStaticValues(
  expression: ts.Expression,
  values: Map<string, StaticBranchValue>,
  context?: JSXBranchAnalysisContext,
) {
  const providersValue = unwrapExpression(expression)
  if (!ts.isArrayLiteralExpression(providersValue)) return

  for (const element of providersValue.elements) {
    const entry = unwrapExpression(element)
    if (!ts.isArrayLiteralExpression(entry)) continue

    const providerExpression = entry.elements[0] ? unwrapExpression(entry.elements[0]) : undefined
    const valueExpression = entry.elements[1] ? unwrapExpression(entry.elements[1]) : undefined
    if (!providerExpression || !ts.isIdentifier(providerExpression) || !valueExpression) continue

    flattenStaticObjectExpression(valueExpression, `context.${providerExpression.text}`, values, context)
  }
}

function flattenStaticObjectExpression(
  expression: ts.Expression,
  prefix: string,
  values: Map<string, StaticBranchValue>,
  context?: JSXBranchAnalysisContext,
  writeMode: "merge" | "override" = "override",
) {
  const value = unwrapExpression(expression)
  const staticValue = readStaticBranchValue(value)
  if (staticValue) {
    writeStaticBranchValue(values, prefix, staticValue, writeMode)
    if (staticValue.kind === "array") writeStaticBranchValue(values, `${prefix}.length`, { kind: "number", value: staticValue.length }, writeMode)
    if (staticValue.kind === "string") writeStaticBranchValue(values, `${prefix}.length`, { kind: "number", value: staticValue.value.length }, writeMode)
  }

  if (ts.isArrayLiteralExpression(value)) {
    const spreadLength = staticArrayLiteralLength(value, context)
    if (!staticValue && spreadLength !== undefined) {
      writeStaticBranchValue(values, prefix, { kind: "array", length: spreadLength }, writeMode)
      writeStaticBranchValue(values, `${prefix}.length`, { kind: "number", value: spreadLength }, writeMode)
    }

    for (const element of value.elements) {
      if (ts.isSpreadElement(element)) {
        if (!context || !copyStaticArraySpreadValues(element.expression, `${prefix}.number`, values, context)) {
          setStaticBranchValue(values, `${prefix}.number`, { kind: "unknown" })
        }
        continue
      }
      flattenStaticObjectExpression(element, `${prefix}.number`, values, context, "merge")
    }
    return
  }

  if (!ts.isObjectLiteralExpression(value)) {
    if (!staticValue) writeStaticBranchValue(values, prefix, { kind: "unknown" }, writeMode)
    return
  }

  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!context || !copyStaticSpreadValues(property.expression, prefix, values, context, writeMode)) {
        writeStaticBranchValue(values, prefix, { kind: "unknown" }, writeMode)
      }
      continue
    }

    if (!ts.isPropertyAssignment(property)) continue

    const propertyName = getStaticPropertyName(property.name)
    if (!propertyName) continue

    flattenStaticObjectExpression(property.initializer, `${prefix}.${propertyName}`, values, context, writeMode)
  }
}

function isStaticSpreadLiteral(expression: ts.Expression, context: JSXBranchAnalysisContext): boolean {
  const value = unwrapExpression(expression)
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.every((element) => {
      if (ts.isSpreadElement(element)) return Boolean(staticSpreadPrefixForExpression(element.expression, context))
      return Boolean(readStaticBranchValue(element) || isStaticSpreadLiteral(element, context))
    })
  }

  if (!ts.isObjectLiteralExpression(value)) return false

  return value.properties.every((property) => {
    if (ts.isSpreadAssignment(property)) return Boolean(staticSpreadPrefixForExpression(property.expression, context))
    if (!ts.isPropertyAssignment(property)) return true
    return Boolean(readStaticBranchValue(property.initializer) || isStaticSpreadLiteral(property.initializer, context))
  })
}

function copyStaticSpreadValues(
  expression: ts.Expression,
  targetPrefix: string,
  values: Map<string, StaticBranchValue>,
  context: JSXBranchAnalysisContext,
  writeMode: "merge" | "override",
): boolean {
  const sourcePrefix = staticSpreadPrefixForExpression(expression, context)
  if (!sourcePrefix) return false

  const sourceValue = context.staticValues.get(sourcePrefix)
  if (sourceValue) writeStaticBranchValue(values, targetPrefix, sourceValue, writeMode)

  const childPrefix = `${sourcePrefix}.`
  let copied = Boolean(sourceValue)
  for (const [key, value] of context.staticValues) {
    if (!key.startsWith(childPrefix)) continue
    const suffix = key.slice(childPrefix.length)
    writeStaticBranchValue(values, `${targetPrefix}.${suffix}`, value, writeMode)
    copied = true
  }

  return copied
}

function copyStaticArraySpreadValues(
  expression: ts.Expression,
  targetElementPrefix: string,
  values: Map<string, StaticBranchValue>,
  context: JSXBranchAnalysisContext,
): boolean {
  const sourcePrefix = staticSpreadPrefixForExpression(expression, context)
  if (!sourcePrefix) return false

  const sourceElementPrefix = `${sourcePrefix}.number`
  const sourceValue = context.staticValues.get(sourceElementPrefix)
  if (sourceValue) setStaticBranchValue(values, targetElementPrefix, sourceValue)

  const childPrefix = `${sourceElementPrefix}.`
  let copied = Boolean(sourceValue)
  for (const [key, value] of context.staticValues) {
    if (!key.startsWith(childPrefix)) continue
    const suffix = key.slice(childPrefix.length)
    setStaticBranchValue(values, `${targetElementPrefix}.${suffix}`, value)
    copied = true
  }

  return copied
}

function staticArrayLiteralLength(value: ts.ArrayLiteralExpression, context: JSXBranchAnalysisContext | undefined): number | undefined {
  let length = 0
  for (const element of value.elements) {
    if (!ts.isSpreadElement(element)) {
      length += 1
      continue
    }

    if (!context) return undefined
    const sourcePrefix = staticSpreadPrefixForExpression(element.expression, context)
    if (!sourcePrefix) return undefined
    const sourceLength = context.staticValues.get(`${sourcePrefix}.length`)
    if (sourceLength?.kind !== "number") return undefined
    length += sourceLength.value
  }

  return length
}

function staticSpreadPrefixForExpression(expression: ts.Expression, context: JSXBranchAnalysisContext): string | undefined {
  const reference = factorReferenceForExpression(expression, context)
  return reference?.root === "static" ? factorReferenceKey(reference) : undefined
}

function setStaticBranchValue(values: Map<string, StaticBranchValue>, key: string, value: StaticBranchValue) {
  const existing = values.get(key)
  if (!existing) {
    values.set(key, value)
    return
  }

  if (sameStaticBranchValue(existing, value)) return
  values.set(key, { kind: "oneOf", values: [...staticBranchValueOptions(existing), value] })
}

function writeStaticBranchValue(
  values: Map<string, StaticBranchValue>,
  key: string,
  value: StaticBranchValue,
  mode: "merge" | "override",
) {
  if (mode === "override") {
    values.set(key, value)
    return
  }

  setStaticBranchValue(values, key, value)
}

function staticBranchValueOptions(value: StaticBranchValue): StaticBranchValue[] {
  return value.kind === "oneOf" ? value.values : [value]
}

function readStaticBranchValue(expression: ts.Expression): StaticBranchValue | undefined {
  const value = unwrapExpression(expression)

  if (value.kind === ts.SyntaxKind.TrueKeyword) return { kind: "boolean", value: true }
  if (value.kind === ts.SyntaxKind.FalseKeyword) return { kind: "boolean", value: false }
  if (value.kind === ts.SyntaxKind.NullKeyword) return { kind: "null" }
  if (ts.isIdentifier(value) && value.text === "undefined") return { kind: "undefined" }
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return { kind: "string", value: value.text }
  if (ts.isNumericLiteral(value)) return { kind: "number", value: Number(value.text) }
  if (ts.isArrayLiteralExpression(value)) {
    if (value.elements.some((element) => ts.isSpreadElement(element))) return undefined
    return { kind: "array", length: value.elements.length }
  }
  if (ts.isObjectLiteralExpression(value)) return { kind: "object" }
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return { kind: "truthy" }
  if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = readStaticBranchValue(value.operand)
    const truthy = inner ? staticBranchValueTruthy(inner) : undefined
    return truthy === undefined ? undefined : { kind: "boolean", value: !truthy }
  }

  return undefined
}

function readProviderVariantMarkersFromType(typeNode: ts.TypeNode): Record<string, RunelightProviderVariantSelection> {
  const variants = new Map<string, Set<string>>()

  visit(typeNode)
  return Object.fromEntries(
    [...variants.entries()].map(([providerName, providerVariants]) => {
      const values = [...providerVariants]
      return [providerName, values.length === 1 ? values[0] : values] as const
    }),
  )

  function visit(node: ts.TypeNode) {
    if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
      for (const child of node.types) visit(child)
      return
    }

    if (ts.isParenthesizedTypeNode(node)) {
      visit(node.type)
      return
    }

    if (!ts.isTypeReferenceNode(node)) return
    if (!ts.isIdentifier(node.typeName) || node.typeName.text !== "GProviderFrame") return

    const providerType = node.typeArguments?.[0]
    const variantType = node.typeArguments?.[1]
    if (!providerType || !variantType || !ts.isTypeQueryNode(providerType)) return
    if (!ts.isIdentifier(providerType.exprName)) return
    const providerVariants = readProviderVariantTypeValues(variantType)
    if (providerVariants.length === 0) return

    const providerName = providerType.exprName.text
    const current = variants.get(providerName) ?? new Set<string>()
    for (const variant of providerVariants) current.add(variant)
    variants.set(providerName, current)
  }
}

function readProviderVariantTypeValues(typeNode: ts.TypeNode): string[] {
  if (ts.isParenthesizedTypeNode(typeNode)) return readProviderVariantTypeValues(typeNode.type)
  if (ts.isUnionTypeNode(typeNode)) return typeNode.types.flatMap(readProviderVariantTypeValues)
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) return [typeNode.literal.text]
  return []
}

function readProviderSelections(frameValue: ts.ObjectLiteralExpression): string[] | undefined {
  const providersProperty = frameValue.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && getStaticPropertyName(property.name) === "providers",
  )
  if (!providersProperty) return undefined

  const providersValue = unwrapExpression(providersProperty.initializer)
  if (!ts.isArrayLiteralExpression(providersValue)) return undefined

  const providers: string[] = []
  for (const element of providersValue.elements) {
    const entry = unwrapExpression(element)
    if (!ts.isArrayLiteralExpression(entry)) continue

    const providerExpression = entry.elements[0] ? unwrapExpression(entry.elements[0]) : undefined
    if (providerExpression && ts.isIdentifier(providerExpression)) {
      providers.push(providerExpression.text)
    }
  }

  return providers
}

function getStaticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }

  return undefined
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return unwrapExpression(expression.expression)
  }

  return expression
}

function isCreateGScopeCall(expression: ts.Expression): expression is ts.CallExpression {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "createGScopeHook"
}

function isCreateGProviderCall(expression: ts.Expression): expression is ts.CallExpression {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "createGProvider"
}

function hasStaticProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): boolean {
  return objectLiteral.properties.some(
    (property) => ts.isPropertyAssignment(property) && getStaticPropertyName(property.name) === propertyName,
  )
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
}

function normalizeProjectPath(filePath: string): string {
  return filePath.split(sep).join("/")
}
