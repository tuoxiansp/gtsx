import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import ts from "typescript"

export type GTSXDiagnosticStage =
  | "contract-extraction"
  | "typescript"
  | "adapter-configuration"
  | "project-compilation"
  | "preview-environment-loading"
  | "case-rendering"
  | "browser-capture"

export type GTSXDiagnostic = {
  stage: GTSXDiagnosticStage
  code: string
  message: string
  file?: string
  caseName?: string
}

export type GTSXCaseSummary = {
  kind: "pure" | "scope"
  name: string
  providers?: string[]
}

export type GTSXProviderSummary = {
  name: string
  cases: string[]
}

export type GTSXAnalysisResult = {
  entry: string
  mode: "pure" | "scope" | "unknown"
  defaultExport: boolean
  cases: GTSXCaseSummary[]
  providers: Record<string, GTSXProviderSummary>
  diagnostics: GTSXDiagnostic[]
}

export type GTSXAnalysisCache = {
  componentDependencyBindingsByPath: Map<string, ComponentDependencyBindings>
  exportedComponentTargetsByPath: Map<string, Map<string, ComponentDependencyTarget>>
  importedGTSXPathByKey: Map<string, string | null>
  importedScopeHookNamesByPath: Map<string, Set<string>>
  sourceFilesByPath: Map<string, ts.SourceFile>
  topLevelFunctionLikeBodiesByPath: Map<string, Map<string, ts.ConciseBody>>
}

export function createGTSXAnalysisCache(sourceFilesByPath = new Map<string, ts.SourceFile>()): GTSXAnalysisCache {
  return {
    componentDependencyBindingsByPath: new Map(),
    exportedComponentTargetsByPath: new Map(),
    importedGTSXPathByKey: new Map(),
    importedScopeHookNamesByPath: new Map(),
    sourceFilesByPath,
    topLevelFunctionLikeBodiesByPath: new Map(),
  }
}

export type AnalyzeEntryOptions = {
  cache?: GTSXAnalysisCache
  cwd: string
  entry: string
}

type CasesAssignment = {
  targetName: string
  cases: GTSXCaseSummary[]
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

type NonGTSXHookAnalysisContext = {
  cache?: GTSXAnalysisCache
  cwd: string
  entryPath: string
  sourceFilesByPath: Map<string, ts.SourceFile>
  visitedComponents: Set<string>
}

export function analyzeEntry(options: AnalyzeEntryOptions): GTSXAnalysisResult {
  const entryCoordinate = parseEntryCoordinate(options.entry)
  const entryPath = resolve(options.cwd, entryCoordinate.file)
  const diagnostics: GTSXDiagnostic[] = []

  if (!existsSync(entryPath)) {
    return {
      entry: options.entry,
      mode: "unknown",
      defaultExport: false,
      cases: [],
      providers: {},
      diagnostics: [
        {
          stage: "contract-extraction",
          code: "entry-not-found",
          message: `GTSX entry does not exist: ${options.entry}`,
          file: options.entry,
        },
      ],
    }
  }

  const sourceFile = sourceFileForAbsolutePath(entryPath, options.cache)
  if (!sourceFile) {
    return {
      entry: options.entry,
      mode: "unknown",
      defaultExport: false,
      cases: [],
      providers: {},
      diagnostics: [
        {
          stage: "contract-extraction",
          code: "entry-not-found",
          message: `GTSX entry does not exist: ${options.entry}`,
          file: options.entry,
        },
      ],
    }
  }
  const componentExportName = getComponentExportName(sourceFile, entryCoordinate.exportName)
  const scopeHookNames = new Set([
    ...getScopeHookNames(sourceFile),
    ...getImportedScopeHookNames(sourceFile, entryPath, options.cwd, options.cache),
  ])
  const providerCases: Record<string, GTSXProviderSummary> = Object.fromEntries(
    [...getGProviderNames(sourceFile)].map((name) => [name, { name, cases: [] }]),
  )
  const componentAssignments: CasesAssignment[] = []
  const scopeAssignments: CasesAssignment[] = []

  for (const statement of sourceFile.statements) {
    const assignment = getCasesAssignment(statement, sourceFile, diagnostics)
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
    const usedScopeHooks = getGScopeHookCalls(sourceFile, componentExportName, scopeHookNames)
    if (usedScopeHooks.length > 1) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "multiple-scope-hooks",
        message: "A stateful GTSX component may have exactly one primary GScope hook.",
        file: options.entry,
      })
    }

    for (const violation of getNonGTSXHookCalls(sourceFile, componentExportName, scopeHookNames, {
      cwd: options.cwd,
      entryPath,
      cache: options.cache,
      sourceFilesByPath: options.cache?.sourceFilesByPath ?? new Map([[entryPath, sourceFile]]),
      visitedComponents: new Set(),
    })) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "non-gtsx-hook",
        message:
          violation.file === normalizeProjectPath(relative(options.cwd, entryPath))
            ? `GTSX components may only call GTSX hooks; found "${violation.hookName}" in "${violation.componentName}". Wrap production hooks with createGScopeHook(...).`
            : `GTSX components may only call GTSX hooks; found "${violation.hookName}" in dependency "${violation.file}#${violation.componentName}". Wrap production hooks with createGScopeHook(...).`,
        file: violation.file,
      })
    }

  }

  if (scopeAssignments.length > 1) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "multiple-scope-hooks",
      message: "A non-pure GTSX entry may have exactly one primary scope hook with cases.",
      file: options.entry,
    })
  }

  if (scopeAssignments.length > 0) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "scope-hook-cases-unsupported",
      message: "GScope hooks do not own cases; move cases to the exported component.",
      file: options.entry,
    })
  }

  const componentCases = componentAssignments.flatMap((assignment) => assignment.cases)
  const mode =
    componentCases.length === 0
      ? "unknown"
      : componentCases.some((testCase) => testCase.kind === "scope")
        ? "scope"
        : "pure"
  const selectedCases =
    mode === "scope"
      ? componentCases.map((testCase) => ({ ...testCase, kind: "scope" as const }))
      : componentCases.map((testCase) => ({ ...testCase, kind: "pure" as const }))

  const importedNames = getImportedNames(sourceFile)
  for (const testCase of selectedCases) {
    for (const providerName of testCase.providers ?? []) {
      if (!providerCases[providerName] && importedNames.has(providerName)) {
        providerCases[providerName] = { name: providerName, cases: [] }
      }
    }
  }

  if (selectedCases.length === 0) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "missing-cases",
      message: "A GTSX entry must expose statically enumerable pure or scope cases.",
      file: options.entry,
    })
  }

  for (const testCase of selectedCases) {
    validateProviderSelections(testCase, providerCases, diagnostics, options.entry)
  }

  return {
    entry: options.entry,
    mode,
    defaultExport: Boolean(componentExportName),
    cases: selectedCases,
    providers: providerCases,
    diagnostics,
  }
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

function getGProviderNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      if (isCreateGProviderCall(unwrapExpression(declaration.initializer))) {
        names.add(declaration.name.text)
      }
    }
  }

  return names
}

function getImportedScopeHookNames(
  sourceFile: ts.SourceFile,
  entryPath: string,
  cwd: string,
  cache?: GTSXAnalysisCache,
): Set<string> {
  const cached = cache?.importedScopeHookNamesByPath.get(entryPath)
  if (cached) return cached

  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const clause = statement.importClause
    if (!clause || !ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetPath = resolveImportedGTSXPath(entryPath, cwd, statement.moduleSpecifier.text, cache)
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

function resolveImportedGTSXPath(
  entryPath: string,
  cwd: string,
  specifier: string,
  cache?: GTSXAnalysisCache,
): string | undefined {
  const cacheKey = `${entryPath}\0${specifier}`
  const cached = cache?.importedGTSXPathByKey.get(cacheKey)
  if (cached !== undefined) return cached ?? undefined

  const basePath = resolveImportBasePath(entryPath, cwd, specifier)
  if (!basePath) {
    cache?.importedGTSXPathByKey.set(cacheKey, null)
    return undefined
  }

  const visited = new Set<string>()
  const resolved = resolveImportedGTSXPathFromBase(basePath, cwd, visited, cache)
  cache?.importedGTSXPathByKey.set(cacheKey, resolved ?? null)
  return resolved
}

function resolveImportedGTSXPathFromBase(
  basePath: string,
  cwd: string,
  visited: Set<string>,
  cache?: GTSXAnalysisCache,
): string | undefined {
  for (const candidate of importedGTSXPathCandidates(basePath)) {
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
      const resolvedPath = nextBasePath ? resolveImportedGTSXPathFromBase(nextBasePath, cwd, visited, cache) : undefined
      if (resolvedPath) return resolvedPath
    }
  }

  return undefined
}

function resolveImportBasePath(entryPath: string, cwd: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) return resolve(cwd, specifier.slice(2))
  if (specifier.startsWith(".")) return resolve(dirname(entryPath), specifier)
  return undefined
}

function importedGTSXPathCandidates(basePath: string): string[] {
  const extensionCandidate = /\.(?:tsx|ts|jsx|js)$/.test(basePath) ? basePath.replace(/\.(?:tsx|ts|jsx|js)$/, ".g.tsx") : undefined
  const candidates = [
    basePath.endsWith(".g.tsx") ? basePath : undefined,
    basePath.endsWith(".g") ? `${basePath}.tsx` : undefined,
    `${basePath}.g.tsx`,
    extensionCandidate,
    join(basePath, "index.g.tsx"),
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
  testCase: GTSXCaseSummary,
  providerCases: Record<string, GTSXProviderSummary>,
  diagnostics: GTSXDiagnostic[],
  file: string,
) {
  if (!testCase.providers) return

  for (const providerName of testCase.providers) {
    if (!providerCases[providerName]) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "missing-provider",
        message: `Case "${testCase.name}" selects unknown provider "${providerName}".`,
        file,
        caseName: testCase.name,
      })
    }
  }
}

function getNonGTSXHookCalls(
  sourceFile: ts.SourceFile,
  componentName: string,
  scopeHookNames: Set<string>,
  context: NonGTSXHookAnalysisContext,
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
          if (!isAllowedGTSXHookCall(node, hookName, currentScopeHookNames)) {
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
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) {
      return statement.body
    }

    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== functionName || !declaration.initializer) continue

      const initializer = unwrapExpression(declaration.initializer)
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        return initializer.body
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
  cache?: GTSXAnalysisCache,
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
  context: NonGTSXHookAnalysisContext,
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

    const targetPath = resolveImportedGTSXPath(filePath, context.cwd, statement.moduleSpecifier.text, context.cache)
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

function sourceFileForPath(filePath: string, context: NonGTSXHookAnalysisContext): ts.SourceFile | undefined {
  const cached = context.sourceFilesByPath.get(filePath)
  if (cached) return cached
  const sourceFile = sourceFileForAbsolutePath(filePath, context.cache)
  if (!sourceFile) return undefined

  context.sourceFilesByPath.set(filePath, sourceFile)
  return sourceFile
}

function sourceFileForAbsolutePath(filePath: string, cache?: GTSXAnalysisCache): ts.SourceFile | undefined {
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
  cache?: GTSXAnalysisCache,
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

function isAllowedGTSXHookCall(
  node: ts.CallExpression,
  hookName: string,
  scopeHookNames: Set<string>,
): boolean {
  if (ts.isIdentifier(node.expression)) {
    return hookName === "useGContext" || hookName === "useGContextUpdate" || scopeHookNames.has(hookName)
  }

  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === "useUpdate"
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

function getCasesAssignment(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  diagnostics: GTSXDiagnostic[],
): CasesAssignment | undefined {
  if (!ts.isExpressionStatement(statement)) return undefined

  const expression = statement.expression
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return undefined
  }

  if (!ts.isPropertyAccessExpression(expression.left) || expression.left.name.text !== "cases") {
    return undefined
  }

  if (!ts.isIdentifier(expression.left.expression)) return undefined

  const casesExpression = unwrapExpression(expression.right)
  if (!ts.isObjectLiteralExpression(casesExpression)) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "malformed-cases",
      message: "GTSX cases must be a statically enumerable object literal.",
      file: sourceFile.fileName,
    })
    return { targetName: expression.left.expression.text, cases: [] }
  }

  return {
    targetName: expression.left.expression.text,
    cases: readCasesObject(casesExpression, sourceFile, diagnostics),
  }
}

function readCasesObject(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  diagnostics: GTSXDiagnostic[],
): GTSXCaseSummary[] {
  const cases: GTSXCaseSummary[] = []

  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "malformed-cases",
        message: "GTSX cases do not support spread composition in the first implementation.",
        file: sourceFile.fileName,
      })
      continue
    }

    if (!ts.isPropertyAssignment(property)) continue

    const caseName = getStaticPropertyName(property.name)
    if (!caseName) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "non-static-case-key",
        message: "GTSX case keys must be statically enumerable object literal keys.",
        file: sourceFile.fileName,
      })
      continue
    }

    const caseValue = unwrapExpression(property.initializer)
    const providers = ts.isObjectLiteralExpression(caseValue) ? readProviderSelections(caseValue) : undefined
    const kind = ts.isObjectLiteralExpression(caseValue) && hasStaticProperty(caseValue, "scope") ? "scope" : "pure"
    cases.push({
      kind,
      name: caseName,
      ...(providers && Object.keys(providers).length > 0 ? { providers } : {}),
    })
  }

  return cases
}

function readProviderSelections(caseValue: ts.ObjectLiteralExpression): string[] | undefined {
  const providersProperty = caseValue.properties.find(
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

function isCreateGScopeCall(expression: ts.Expression): boolean {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "createGScopeHook"
}

function isCreateGProviderCall(expression: ts.Expression): boolean {
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
