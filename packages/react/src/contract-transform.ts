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

export const RUNELIGHT_REACT_COMPONENT_FILE_EXTENSION = ".g.tsx"

export type RunelightReactTransformInput = {
  code: string
  filePath: string
  previewImportQuery?: string
  root: string
}

export type RunelightReactTransformResult = {
  code: string
  filePath: string
}

export function transformRunelightReactModule(input: RunelightReactTransformInput): RunelightReactTransformResult | null {
  const filePath = normalizeRunelightReactModuleId(input.filePath)
  if (!isRunelightReactComponentFile(filePath)) return null

  const code = input.previewImportQuery
    ? transformRunelightReactComponentBoundaries({
        ...input,
        filePath,
      })
    : elideRunelightReactFrames({
        ...input,
        filePath,
      })

  if (code === input.code) return null
  return { code, filePath }
}

export function isRunelightReactComponentFile(filePath: string): boolean {
  return normalizeRunelightReactModuleId(filePath).endsWith(RUNELIGHT_REACT_COMPONENT_FILE_EXTENSION)
}

export function normalizeRunelightReactModuleId(id: string): string {
  return id.split("?", 1)[0] ?? id
}

export function transformRunelightReactComponentBoundaries(input: RunelightReactTransformInput): string {
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

  const previewReplacements = input.previewImportQuery ? previewServerMarkerReplacements(sourceFile) : []
  const previewInsertions = input.previewImportQuery ? previewImportQueryInsertions(sourceFile, input.previewImportQuery) : []
  const hasComponentBoundaries = replacements.length > 0

  if (!hasComponentBoundaries && previewReplacements.length === 0 && previewInsertions.length === 0) {
    return input.code
  }

  if (hasComponentBoundaries) {
    for (const boundary of boundaries.values()) {
      if (boundary.exportKind === "default") {
        continue
      }

      if (boundary.exportKind === "named" || boundary.exportKind === "local") {
        const exportPrefix = boundary.exportKind === "named" ? "export " : ""
        insertions.push({
          index: boundary.statement.end,
          text: `\n${exportPrefix}const ${boundary.componentName} = __runelightDefineGComponent(${JSON.stringify(`${coordinateFile}#${boundary.exportName}`)}, ${boundary.implementationName})\n`,
        })
      }
    }

    for (const statement of sourceFile.statements) {
      if (!ts.isExportAssignment(statement) || !ts.isIdentifier(statement.expression)) continue

      const boundary = boundaries.get(statement.expression.text)
      if (!boundary || boundary.exportKind === "default") continue

      const defaultComponentName = `${boundary.componentName}RunelightDefault`
      replacements.push({
        start: statement.getStart(sourceFile),
        end: statement.end,
        text: `const ${defaultComponentName} = __runelightDefineGComponent(${JSON.stringify(`${coordinateFile}#default`)}, ${boundary.implementationName})\n${defaultComponentName}.frames = ${boundary.componentName}.frames\nexport default ${defaultComponentName}`,
      })
    }

    const importInsertionIndex = directivePrologueEnd(sourceFile)
    insertions.push({
      index: importInsertionIndex,
      text: `${importInsertionIndex === 0 ? "" : "\n"}import { defineGComponent as __runelightDefineGComponent } from "@runelight/react/runtime"\n`,
    })
  }

  const output = applyEdits(input.code, {
    replacements: [...replacements, ...previewReplacements],
    insertions: [...insertions, ...previewInsertions],
  })

  return output
}

export function elideRunelightReactFrames(input: RunelightReactTransformInput): string {
  const sourceFile = ts.createSourceFile(input.filePath, input.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const replacements: Replacement[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) continue
    if (!isFramesAssignment(statement.expression)) continue

    replacements.push({
      start: statement.getStart(sourceFile),
      end: statement.end,
      text: "",
    })
  }

  if (replacements.length === 0) return input.code
  return applyEdits(input.code, { replacements, insertions: [] })
}

function isFramesAssignment(expression: ts.Expression): boolean {
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false

  const left = expression.left
  return ts.isPropertyAccessExpression(left) && left.name.text === "frames"
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
  if (!hasComponentFrames(input.code, componentName)) return undefined

  const exportKind = boundaryExportKind(input.statement, componentName, input.defaultExportAssignments, input.localExportNames)
  if (!exportKind) return undefined

  const exportName =
    exportKind === "default" ? "default" : exportKind === "named" ? componentName : (input.localExportNames.get(componentName) ?? componentName)
  const implementationName = `${componentName}RunelightImpl`

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
              text: `\nconst ${componentName} = __runelightDefineGComponent(${JSON.stringify(`${input.coordinateFile}#default`)}, ${implementationName})\nexport default ${componentName}\n`,
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
  if (!hasComponentFrames(input.code, componentName)) return undefined

  const exportKind = boundaryExportKind(input.statement, componentName, input.defaultExportAssignments, input.localExportNames)
  if (!exportKind) return undefined

  const exportName =
    exportKind === "default" ? "default" : exportKind === "named" ? componentName : (input.localExportNames.get(componentName) ?? componentName)
  const implementationName = `${componentName}RunelightImpl`
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
              text: `\nconst ${componentName} = __runelightDefineGComponent(${JSON.stringify(`${input.coordinateFile}#default`)}, ${implementationName})\nexport default ${componentName}\n`,
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

function previewImportQueryInsertions(sourceFile: ts.SourceFile, query: string): Insertion[] {
  const insertions: Insertion[] = []

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text
      if (shouldAppendPreviewImportQuery(specifier, query)) {
        insertions.push({
          index: statement.moduleSpecifier.getEnd() - 1,
          text: previewImportQuerySuffix(specifier, query),
        })
      }
      continue
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text
      if (shouldAppendPreviewImportQuery(specifier, query)) {
        insertions.push({
          index: statement.moduleSpecifier.getEnd() - 1,
          text: previewImportQuerySuffix(specifier, query),
        })
      }
    }
  }

  return insertions
}

function shouldAppendPreviewImportQuery(specifier: string, query: string): boolean {
  if (specifier.includes(query)) return false

  const path = specifier.split("?", 1)[0] ?? specifier
  return path.endsWith(".g") || path.endsWith(".g.tsx") || path.endsWith(".g.ts")
}

function previewImportQuerySuffix(specifier: string, query: string): string {
  return `${specifier.includes("?") ? "&" : "?"}${query}`
}

function previewServerMarkerReplacements(sourceFile: ts.SourceFile): Replacement[] {
  const replacements: Replacement[] = []

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "server-only") {
      replacements.push({
        start: statement.getStart(sourceFile),
        end: statement.end,
        text: "",
      })
    }
  }

  visit(sourceFile)
  return replacements

  function visit(node: ts.Node) {
    if (isStringLiteralExpressionStatement(node) && isPreviewServerDirective(node.expression.text)) {
      replacements.push({
        start: node.getStart(sourceFile),
        end: node.end,
        text: "",
      })
    }

    ts.forEachChild(node, visit)
  }
}

function isPreviewServerDirective(value: string): boolean {
  return value === "use server" || value === "use cache" || value.startsWith("use cache:")
}

export function transpileRunelightReactPreviewModule(input: { code: string; filePath: string }): string {
  return ts.transpileModule(input.code, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: input.filePath,
  }).outputText
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

function isStringLiteralExpressionStatement(node: ts.Node): node is ts.ExpressionStatement & { expression: ts.StringLiteral } {
  return ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)
}

function toCoordinateFile(root: string, filePath: string): string {
  return relative(root, filePath).split("\\").join("/")
}

function hasComponentFrames(code: string, componentName: string): boolean {
  return new RegExp(`\\b${escapeRegExp(componentName)}\\.frames\\s*=`).test(code)
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
