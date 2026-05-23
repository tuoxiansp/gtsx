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
  providers?: Record<string, string>
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

export function analyzeEntry(options: AnalyzeEntryOptions): GTSXAnalysisResult {
  const entryPath = resolve(options.cwd, options.entry)
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
  const defaultExportName = getDefaultExportName(sourceFile)
  const scopeHookNames = getScopeHookNames(sourceFile)
  const providerCases: Record<string, GTSXProviderSummary> = {}
  const pureAssignments: CasesAssignment[] = []
  const scopeAssignments: CasesAssignment[] = []

  for (const statement of sourceFile.statements) {
    const assignment = getCasesAssignment(statement, sourceFile, diagnostics)
    if (!assignment) continue

    if (scopeHookNames.has(assignment.targetName)) {
      scopeAssignments.push(assignment)
    } else if (looksLikeProviderCases(assignment.targetName, statement)) {
      providerCases[assignment.targetName] = {
        name: assignment.targetName,
        cases: assignment.cases.map((testCase) => testCase.name),
      }
    } else if (!defaultExportName || assignment.targetName === defaultExportName) {
      pureAssignments.push(assignment)
    }
  }

  if (!defaultExportName) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "missing-default-export",
      message: "A .g.tsx entry must have a default React component export.",
      file: options.entry,
    })
  }

  if (scopeAssignments.length > 1) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "multiple-scope-hooks",
      message: "A non-pure GTSX entry may have exactly one primary scope hook with cases.",
      file: options.entry,
    })
  }

  const mode = scopeAssignments.length > 0 ? "scope" : pureAssignments.length > 0 ? "pure" : "unknown"
  const selectedCases =
    mode === "scope"
      ? scopeAssignments.flatMap((assignment) => assignment.cases).map((testCase) => ({ ...testCase, kind: "scope" as const }))
      : pureAssignments.flatMap((assignment) => assignment.cases).map((testCase) => ({ ...testCase, kind: "pure" as const }))

  if (selectedCases.length === 0) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "missing-cases",
      message: "A GTSX entry must expose statically enumerable pure or scope cases.",
      file: options.entry,
    })
  }

  for (const testCase of selectedCases) {
    for (const [providerName, providerCaseName] of Object.entries(testCase.providers ?? {})) {
      const provider = providerCases[providerName]
      if (!provider) {
        diagnostics.push({
          stage: "contract-extraction",
          code: "missing-provider",
          message: `Case "${testCase.name}" selects unknown provider "${providerName}".`,
          file: options.entry,
          caseName: testCase.name,
        })
      } else if (!provider.cases.includes(providerCaseName)) {
        diagnostics.push({
          stage: "contract-extraction",
          code: "missing-provider-case",
          message: `Case "${testCase.name}" selects missing provider case "${providerName}.${providerCaseName}".`,
          file: options.entry,
          caseName: testCase.name,
        })
      }
    }
  }

  return {
    entry: options.entry,
    mode,
    defaultExport: Boolean(defaultExportName),
    cases: selectedCases,
    providers: providerCases,
    diagnostics,
  }
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

function getScopeHookNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      if (isCreateGTSXScopeCall(declaration.initializer)) {
        names.add(declaration.name.text)
      }
    }
  }

  return names
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
    cases.push({
      kind: "scope",
      name: caseName,
      ...(providers && Object.keys(providers).length > 0 ? { providers } : {}),
    })
  }

  return cases
}

function readProviderSelections(caseValue: ts.ObjectLiteralExpression): Record<string, string> | undefined {
  const providersProperty = caseValue.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && getStaticPropertyName(property.name) === "providers",
  )
  if (!providersProperty) return undefined

  const providersValue = unwrapExpression(providersProperty.initializer)
  if (!ts.isObjectLiteralExpression(providersValue)) return undefined

  const providers: Record<string, string> = {}
  for (const property of providersValue.properties) {
    if (!ts.isPropertyAssignment(property)) continue

    const providerName = getStaticPropertyName(property.name)
    const providerCase = unwrapExpression(property.initializer)
    if (providerName && ts.isStringLiteral(providerCase)) {
      providers[providerName] = providerCase.text
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

function isCreateGTSXScopeCall(expression: ts.Expression): boolean {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "createGTSXScope"
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
}

function looksLikeProviderCases(targetName: string, statement: ts.Statement): boolean {
  return targetName.endsWith("Provider") || statement.getText().includes("GTSXProviderCases")
}
