import { existsSync, readFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import ts from "typescript"

import type {
  RunelightAnalysisResult,
  RunelightDiagnostic,
  RunelightFrameSummary,
  RunelightProviderVariantSelection,
} from "./analyzer.js"

export const RUNELIGHT_VUE_COMPONENT_FILE_EXTENSION = ".g.vue"

type EntryCoordinate = {
  file: string
  exportName?: string
  explicitExportName: boolean
}

type VueFramesExtraction = {
  frameObjectCode: string
  frames: RunelightFrameSummary[]
  diagnostics: RunelightDiagnostic[]
}

export function isRunelightVueComponentFile(filePath: string): boolean {
  return filePath.split("?", 1)[0]?.endsWith(RUNELIGHT_VUE_COMPONENT_FILE_EXTENSION) ?? false
}

export function analyzeVueEntry(options: { cwd: string; entry: string }): RunelightAnalysisResult {
  const entryCoordinate = parseEntryCoordinate(options.entry)
  const entryPath = resolve(options.cwd, entryCoordinate.file)

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
          code: "entry-not-found",
          message: `Runelight entry does not exist: ${options.entry}`,
          file: options.entry,
        },
      ],
    }
  }

  if (entryCoordinate.explicitExportName && entryCoordinate.exportName !== "default") {
    return {
      entry: options.entry,
      mode: "unknown",
      defaultExport: false,
      frames: [],
      providers: {},
      diagnostics: [
        {
          stage: "contract-extraction",
          code: "missing-component-export",
          message: `.g.vue entries expose a single default Vue component export; "${entryCoordinate.exportName}" is not available.`,
          file: options.entry,
        },
      ],
    }
  }

  const source = readFileSync(entryPath, "utf8")
  const extraction = extractVueFrames(source, options.entry)
  const frames = extraction.frames
  const mode =
    frames.length === 0
      ? "unknown"
      : frames.some((frame) => frame.kind === "scope")
        ? "scope"
        : "pure"
  const diagnostics = [...extraction.diagnostics]

  if (frames.length === 0 && !diagnostics.some((diagnostic) => diagnostic.code === "malformed-frames")) {
    diagnostics.push({
      stage: "contract-extraction",
      code: "missing-frames",
      message: "A .g.vue entry must declare a <g:frames> block with a statically enumerable default export.",
      file: options.entry,
    })
  }

  return {
    entry: options.entry,
    mode,
    defaultExport: true,
    frames: mode === "scope" ? frames.map((frame) => ({ ...frame, kind: "scope" as const })) : frames,
    providers: {},
    diagnostics,
  }
}

export function extractVueFrames(source: string, file: string): VueFramesExtraction {
  const block = extractVueFramesBlock(source)
  if (!block) {
    return {
      frameObjectCode: "{}",
      frames: [],
      diagnostics: [
        {
          stage: "contract-extraction",
          code: "missing-frames",
          message: "A .g.vue entry must include a <g:frames> block.",
          file,
        },
      ],
    }
  }

  const parsed = parseVueFramesExport(block.content, file)
  if (!parsed) {
    return {
      frameObjectCode: "{}",
      frames: [],
      diagnostics: [
        {
          stage: "contract-extraction",
          code: "malformed-frames",
          message: "<g:frames> must contain `export default { ... }`.",
          file,
        },
      ],
    }
  }

  const diagnostics: RunelightDiagnostic[] = []
  return {
    frameObjectCode: parsed.frameObjectCode,
    frames: readVueFramesObject(parsed.objectLiteral, parsed.sourceFile, diagnostics, file),
    diagnostics,
  }
}

export function extractVueFrameNames(source: string, file: string): string[] {
  return extractVueFrames(source, file).frames.map((frame) => frame.name)
}

export function vueComponentNameFromFilePath(filePath: string): string {
  const rawName = basename(filePath).replace(/\.g\.vue$/i, "")
  const words = rawName.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const name = words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join("")
  return name || "RunelightVueComponent"
}

type VueFramesBlock = {
  content: string
}

function extractVueFramesBlock(source: string): VueFramesBlock | undefined {
  const match = /<g:frames\b[^>]*>([\s\S]*?)<\/g:frames>/i.exec(source)
  return match ? { content: match[1] ?? "" } : undefined
}

function parseVueFramesExport(
  code: string,
  file: string,
): { frameObjectCode: string; objectLiteral: ts.ObjectLiteralExpression; sourceFile: ts.SourceFile } | undefined {
  const sourceFile = ts.createSourceFile(`${file}.frames.ts`, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement)) continue

    const expression = unwrapExpression(statement.expression)
    if (!ts.isObjectLiteralExpression(expression)) return undefined
    return {
      frameObjectCode: code.slice(statement.expression.getStart(sourceFile), statement.expression.end),
      objectLiteral: expression,
      sourceFile,
    }
  }

  return undefined
}

function readVueFramesObject(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  diagnostics: RunelightDiagnostic[],
  file: string,
): RunelightFrameSummary[] {
  const frames: RunelightFrameSummary[] = []

  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "malformed-frames",
        message: "Vue <g:frames> does not support top-level spread composition yet.",
        file,
      })
      continue
    }

    if (!ts.isPropertyAssignment(property)) continue

    const frameName = getStaticPropertyName(property.name)
    if (!frameName) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "non-static-frame-key",
        message: "Vue frame keys must be statically enumerable object literal keys.",
        file,
      })
      continue
    }

    const frameValue = unwrapExpression(property.initializer)
    if (!ts.isObjectLiteralExpression(frameValue)) {
      diagnostics.push({
        stage: "contract-extraction",
        code: "malformed-frames",
        message: `Vue frame "${frameName}" must be an object literal.`,
        file,
        frameName,
      })
      continue
    }

    const providers = readProviderSelections(frameValue)
    const providerVariants = readProviderVariantMarkers(property.initializer)
    const kind = hasStaticProperty(frameValue, "scope") ? "scope" : "pure"
    frames.push({
      kind,
      name: frameName,
      ...(providerVariants && Object.keys(providerVariants).length > 0 ? { providerVariants } : {}),
      ...(providers && providers.length > 0 ? { providers } : {}),
    })
  }

  return frames
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

function readProviderVariantMarkers(expression: ts.Expression): Record<string, RunelightProviderVariantSelection> | undefined {
  if (ts.isSatisfiesExpression(expression)) return readProviderVariantMarkersFromType(expression.type)
  if (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) return readProviderVariantMarkers(expression.expression)
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

function hasStaticProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): boolean {
  return objectLiteral.properties.some(
    (property) => ts.isPropertyAssignment(property) && getStaticPropertyName(property.name) === propertyName,
  )
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

function parseEntryCoordinate(entry: string): EntryCoordinate {
  const [file, exportName] = entry.split("#", 2)
  return {
    file: file ?? entry,
    exportName,
    explicitExportName: entry.includes("#"),
  }
}
