import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
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

export type AnalyzeEntryOptions = {
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

  const sourceText = readFileSync(entryPath, "utf8")
  const sourceFile = ts.createSourceFile(entryPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const componentExportName = getComponentExportName(sourceFile, entryCoordinate.exportName)
  const scopeHookNames = getScopeHookNames(sourceFile)
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

    for (const hookName of getNonGTSXHookCalls(sourceFile, componentExportName, scopeHookNames)) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "non-gtsx-hook",
        message: `GTSX components may only call GTSX hooks; found "${hookName}". Wrap production hooks with createGScopeHook(...).`,
        file: options.entry,
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
  }

  return undefined
}

function getScopeHookNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      if (isCreateGScopeCall(declaration.initializer)) {
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
      const hookName = node.expression.text
      if (isHookName(hookName) && hookName !== "useGContext" && !scopeHookNames.has(hookName)) {
        hookNames.add(hookName)
      } else if (!isHookName(hookName)) {
        visitHelper(hookName)
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
  return /^use[A-Z0-9_]/.test(name)
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
