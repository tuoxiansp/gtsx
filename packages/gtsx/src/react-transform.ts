import { relative } from "node:path"
import ts from "typescript"

type Replacement = {
  start: number
  end: number
  text: string
}

type Insertion = {
  index: number
  text: string
}

type FunctionBoundary = {
  componentName: string
  implementationName: string
  statement: ts.Statement
  exportKind: "default" | "named" | "local"
  exportName: string
}

export const GTSX_REACT_COMPONENT_FILE_EXTENSION = ".g.tsx"

export type GTSXReactTransformInput = {
  code: string
  filePath: string
  root: string
}

export type GTSXReactTransformResult = {
  code: string
  filePath: string
}

export function transformGTSXReactModule(input: GTSXReactTransformInput): GTSXReactTransformResult | null {
  const filePath = normalizeGTSXReactModuleId(input.filePath)
  if (!isGTSXReactComponentFile(filePath)) return null

  const code = transformGTSXComponentBoundaries({
    ...input,
    filePath,
  })

  if (code === input.code) return null
  return { code, filePath }
}

export function isGTSXReactComponentFile(filePath: string): boolean {
  return normalizeGTSXReactModuleId(filePath).endsWith(GTSX_REACT_COMPONENT_FILE_EXTENSION)
}

export function normalizeGTSXReactModuleId(id: string): string {
  return id.split("?", 1)[0] ?? id
}

export function transformGTSXComponentBoundaries(input: GTSXReactTransformInput): string {
  const sourceFile = ts.createSourceFile(input.filePath, input.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const replacements: Replacement[] = []
  const insertions: Insertion[] = []
  const coordinateFile = toCoordinateFile(input.root, input.filePath)
  const defaultExportAssignments = readDefaultExportAssignments(sourceFile)
  const localExportNames = readLocalExportNames(sourceFile)
  const boundaries = new Map<string, FunctionBoundary>()

  for (const statement of sourceFile.statements) {
    const boundary = functionDeclarationBoundary({
      code: input.code,
      coordinateFile,
      defaultExportAssignments,
      localExportNames,
      sourceFile,
      statement,
    })
    if (!boundary) continue

    boundaries.set(boundary.componentName, boundary)
    replacements.push(boundary.replacement)
    insertions.push(...boundary.insertions)
  }

  for (const statement of sourceFile.statements) {
    const boundary = variableStatementBoundary({
      code: input.code,
      coordinateFile,
      defaultExportAssignments,
      localExportNames,
      sourceFile,
      statement,
    })
    if (!boundary) continue

    boundaries.set(boundary.componentName, boundary)
    replacements.push(boundary.replacement)
    insertions.push(...boundary.insertions)
  }

  if (replacements.length === 0) return input.code

  for (const boundary of boundaries.values()) {
    if (boundary.exportKind === "default") {
      continue
    }

    if (boundary.exportKind === "named" || boundary.exportKind === "local") {
      const exportPrefix = boundary.exportKind === "named" ? "export " : ""
      insertions.push({
        index: boundary.statement.end,
        text: `\n${exportPrefix}const ${boundary.componentName} = __gtsxDefineGComponent(${JSON.stringify(`${coordinateFile}#${boundary.exportName}`)}, ${boundary.implementationName})\n`,
      })
    }
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || !ts.isIdentifier(statement.expression)) continue

    const boundary = boundaries.get(statement.expression.text)
    if (!boundary || boundary.exportKind === "default") continue

    const defaultComponentName = `${boundary.componentName}GTSXDefault`
    replacements.push({
      start: statement.getStart(sourceFile),
      end: statement.end,
      text: `const ${defaultComponentName} = __gtsxDefineGComponent(${JSON.stringify(`${coordinateFile}#default`)}, ${boundary.implementationName})\n${defaultComponentName}.cases = ${boundary.componentName}.cases\nexport default ${defaultComponentName}`,
    })
  }

  const importInsertionIndex = directivePrologueEnd(sourceFile)
  insertions.push({
    index: importInsertionIndex,
    text: `${importInsertionIndex === 0 ? "" : "\n"}import { defineGComponent as __gtsxDefineGComponent } from "@gtsx/core"\n`,
  })

  return applyEdits(input.code, {
    replacements,
    insertions,
  })
}

function functionDeclarationBoundary(input: {
  code: string
  coordinateFile: string
  defaultExportAssignments: Set<string>
  localExportNames: Map<string, string>
  sourceFile: ts.SourceFile
  statement: ts.Statement
}): (FunctionBoundary & { replacement: Replacement; insertions: Insertion[] }) | undefined {
  if (!ts.isFunctionDeclaration(input.statement) || !input.statement.name) return undefined

  const componentName = input.statement.name.text
  if (!hasComponentCases(input.code, componentName)) return undefined

  const exportKind = boundaryExportKind(input.statement, componentName, input.defaultExportAssignments, input.localExportNames)
  if (!exportKind) return undefined

  const exportName =
    exportKind === "default" ? "default" : exportKind === "named" ? componentName : (input.localExportNames.get(componentName) ?? componentName)
  const implementationName = `${componentName}GTSXImpl`

  return {
    componentName,
    exportKind,
    exportName,
    implementationName,
    insertions:
      exportKind === "default"
        ? [
            {
              index: input.statement.end,
              text: `\nconst ${componentName} = __gtsxDefineGComponent(${JSON.stringify(`${input.coordinateFile}#default`)}, ${implementationName})\nexport default ${componentName}\n`,
            },
          ]
        : [],
    replacement: {
      start: input.statement.getStart(input.sourceFile),
      end: input.statement.name.end,
      text: `function ${implementationName}`,
    },
    statement: input.statement,
  }
}

function variableStatementBoundary(input: {
  code: string
  coordinateFile: string
  defaultExportAssignments: Set<string>
  localExportNames: Map<string, string>
  sourceFile: ts.SourceFile
  statement: ts.Statement
}): (FunctionBoundary & { replacement: Replacement; insertions: Insertion[] }) | undefined {
  if (!ts.isVariableStatement(input.statement)) return undefined
  if (input.statement.declarationList.declarations.length !== 1) return undefined

  const declaration = input.statement.declarationList.declarations[0]
  if (!declaration || !ts.isIdentifier(declaration.name) || !isFunctionLikeVariableInitializer(declaration.initializer)) return undefined

  const componentName = declaration.name.text
  if (!hasComponentCases(input.code, componentName)) return undefined

  const exportKind = boundaryExportKind(input.statement, componentName, input.defaultExportAssignments, input.localExportNames)
  if (!exportKind) return undefined

  const exportName =
    exportKind === "default" ? "default" : exportKind === "named" ? componentName : (input.localExportNames.get(componentName) ?? componentName)
  const implementationName = `${componentName}GTSXImpl`
  const declarationListStart = input.statement.declarationList.getStart(input.sourceFile)
  const replacement =
    exportKind === "named"
      ? {
          start: input.statement.getStart(input.sourceFile),
          end: declaration.name.end,
          text: `${input.code.slice(declarationListStart, declaration.name.getStart(input.sourceFile))}${implementationName}`,
        }
      : {
          start: declaration.name.getStart(input.sourceFile),
          end: declaration.name.end,
          text: implementationName,
        }

  return {
    componentName,
    exportKind,
    exportName,
    implementationName,
    insertions:
      exportKind === "default"
        ? [
            {
              index: input.statement.end,
              text: `\nconst ${componentName} = __gtsxDefineGComponent(${JSON.stringify(`${input.coordinateFile}#default`)}, ${implementationName})\nexport default ${componentName}\n`,
            },
          ]
        : [],
    replacement,
    statement: input.statement,
  }
}

function boundaryExportKind(
  statement: ts.Statement,
  componentName: string,
  defaultExportAssignments: Set<string>,
  localExportNames: Map<string, string>,
): FunctionBoundary["exportKind"] | null {
  return hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ? "default"
    : hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      ? "named"
      : defaultExportAssignments.has(componentName)
        ? "local"
        : localExportNames.has(componentName)
          ? "local"
          : null
}

function isFunctionLikeVariableInitializer(node: ts.Expression | undefined): boolean {
  return Boolean(node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)))
}


function readDefaultExportAssignments(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      names.add(statement.expression.text)
    }
  }

  return names
}

function readLocalExportNames(sourceFile: ts.SourceFile): Map<string, string> {
  const names = new Map<string, string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier || !statement.exportClause) continue
    if (!ts.isNamedExports(statement.exportClause)) continue

    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text ?? element.name.text
      names.set(localName, element.name.text)
    }
  }

  return names
}

function directivePrologueEnd(sourceFile: ts.SourceFile): number {
  let insertionIndex = 0

  for (const statement of sourceFile.statements) {
    if (!isStringLiteralExpressionStatement(statement)) break
    insertionIndex = statement.end
  }

  return insertionIndex
}

function isStringLiteralExpressionStatement(statement: ts.Statement): statement is ts.ExpressionStatement {
  return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)
}

function toCoordinateFile(root: string, filePath: string): string {
  return relative(root, filePath).split("\\").join("/")
}

function hasComponentCases(code: string, componentName: string): boolean {
  return new RegExp(`\\b${escapeRegExp(componentName)}\\.cases\\s*=`).test(code)
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
}

function applyEdits(code: string, edits: { replacements: Replacement[]; insertions: Insertion[] }): string {
  let output = code
  const orderedEdits = [
    ...edits.replacements.map((replacement) => ({ type: "replace" as const, ...replacement })),
    ...edits.insertions.map((insertion) => ({
      type: "insert" as const,
      start: insertion.index,
      end: insertion.index,
      text: insertion.text,
    })),
  ].sort((left, right) => right.start - left.start)

  for (const edit of orderedEdits) {
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`
  }

  return output
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
