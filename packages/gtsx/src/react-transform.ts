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
  statement: ts.FunctionDeclaration
  exportKind: "default" | "named" | "local"
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
  const boundaries = new Map<string, FunctionBoundary>()

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue

    const componentName = statement.name.text
    if (!hasComponentCases(input.code, componentName)) continue

    const exportKind = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
      ? "default"
      : hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        ? "named"
        : defaultExportAssignments.has(componentName)
          ? "local"
          : null

    if (!exportKind) continue

    const implementationName = `${componentName}GTSXImpl`
    boundaries.set(componentName, { componentName, implementationName, statement, exportKind })
    replacements.push({
      start: statement.getStart(sourceFile),
      end: statement.name.end,
      text: `function ${implementationName}`,
    })

    if (exportKind === "default") {
      insertions.push({
        index: statement.end,
        text: `\nconst ${componentName} = __gtsxDefineGComponent(${JSON.stringify(`${coordinateFile}#default`)}, ${implementationName})\nexport default ${componentName}\n`,
      })
      continue
    }

    const exportPrefix = exportKind === "named" ? "export " : ""
    insertions.push({
      index: statement.end,
      text: `\n${exportPrefix}const ${componentName} = __gtsxDefineGComponent(${JSON.stringify(`${coordinateFile}#${componentName}`)}, ${implementationName})\n`,
    })
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

  if (replacements.length === 0) return input.code

  const importInsertionIndex = directivePrologueEnd(sourceFile)
  insertions.push({
    index: importInsertionIndex,
    text: `${importInsertionIndex === 0 ? "" : "\n"}import { defineGComponent as __gtsxDefineGComponent } from "gtsx"\n`,
  })

  return applyEdits(input.code, {
    replacements,
    insertions,
  })
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
