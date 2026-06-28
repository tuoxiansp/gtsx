import { existsSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { baseParse, NodeTypes, type DirectiveNode, type ElementNode, type RootNode, type TemplateChildNode } from "@vue/compiler-dom"
import ts from "typescript"

import type {
  RunelightEntryAnalysisResult,
  RunelightDiagnostic,
  RunelightFrameSummary,
  RunelightProviderSummary,
  RunelightProviderVariantSelection,
} from "@runelight/core/contract"

declare const runelightVueAnalysisCacheType: unique symbol

export type RunelightVueAnalysisCache = {
  readonly [runelightVueAnalysisCacheType]: "RunelightVueAnalysisCache"
}

export type RunelightVueAnalysisCacheData = RunelightVueAnalysisCache & {
  importedStaticSourcePathByKey: Map<string, string | null>
  sourceFilesByPath: Map<string, ts.SourceFile>
}

export function createRunelightVueAnalysisCache(): RunelightVueAnalysisCache {
  return createRunelightVueAnalysisCacheData()
}

export function createRunelightVueAnalysisCacheData(sourceFilesByPath = new Map<string, ts.SourceFile>()): RunelightVueAnalysisCacheData {
  return {
    importedStaticSourcePathByKey: new Map(),
    sourceFilesByPath,
  } as RunelightVueAnalysisCacheData
}

export function readRunelightVueAnalysisCacheData(cache: RunelightVueAnalysisCache | undefined): RunelightVueAnalysisCacheData | undefined {
  return cache as RunelightVueAnalysisCacheData | undefined
}

export const RUNELIGHT_VUE_COMPONENT_FILE_EXTENSION = ".g.vue"

type EntryCoordinate = {
  file: string
  exportName?: string
  explicitExportName: boolean
}

type VueFramesExtraction = {
  frameImportCode: string
  frameObjectCode: string
  frameSourceFile?: ts.SourceFile
  frames: RunelightFrameSummary[]
  staticFrames: RunelightVueFrameStaticFacts[]
  diagnostics: RunelightDiagnostic[]
}

type RunelightVueFrameStaticFacts = {
  name: string
  providerVariants?: Record<string, RunelightProviderVariantSelection>
  values: Map<string, VueStaticBranchValue>
}

export type RunelightVueVisualFrameProjection = {
  dependencies: string[]
  name: string
  signatureParts: unknown[]
}

type VueStaticBranchValue =
  | { kind: "array"; length: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "number"; value: number }
  | { kind: "object" }
  | { kind: "oneOf"; values: VueStaticBranchValue[] }
  | { kind: "string"; value: string }
  | { kind: "truthy" }
  | { kind: "unknown" }
  | { kind: "undefined" }

type VueTemplateBranchPredicate =
  | { kind: "always" }
  | { kind: "and"; predicates: VueTemplateBranchPredicate[] }
  | { kind: "equals"; ref: VueTemplateReference; value: VueStaticBranchValue }
  | { kind: "equals-ref"; left: VueTemplateReference; right: VueTemplateReference }
  | { kind: "not"; predicate: VueTemplateBranchPredicate }
  | { kind: "opaque"; reason: string; text: string }
  | { kind: "or"; predicates: VueTemplateBranchPredicate[] }
  | { kind: "relation"; operator: "<" | "<=" | ">" | ">="; ref: VueTemplateReference; value: VueStaticBranchValue }
  | { kind: "static"; value: boolean }
  | { kind: "truthy"; ref: VueTemplateReference }

type VueTemplateReference = {
  candidates: string[]
  label: string
}

type VueReachableTemplateBranch = {
  condition: VueTemplateBranchPredicate
  expression?: string
  tagName: string
}

type VueTemplateAnalysisContext = {
  aliases: Map<string, string>
  injectedBindings: Map<string, string>
}

export function isRunelightVueComponentFile(filePath: string): boolean {
  return filePath.split("?", 1)[0]?.endsWith(RUNELIGHT_VUE_COMPONENT_FILE_EXTENSION) ?? false
}

export function analyzeRunelightVueEntry(options: { cache?: RunelightVueAnalysisCache; cwd: string; entry: string }): RunelightEntryAnalysisResult {
  const entryCoordinate = parseEntryCoordinate(options.entry)
  const entryPath = resolve(options.cwd, entryCoordinate.file)
  const cache = readRunelightVueAnalysisCacheData(options.cache)

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
          severity: "error",
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
  const providerFrames: Record<string, RunelightProviderSummary> = Object.fromEntries(
    extraction.frameSourceFile ? getGVueProviderSummariesForFile(extraction.frameSourceFile, entryPath, options.cwd, cache) : [],
  )
  const importedNames = extraction.frameSourceFile ? getImportedNames(extraction.frameSourceFile) : new Set<string>()
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
      severity: "error",
      code: "missing-frames",
      message: "A .g.vue entry must declare a <g:frames> block with a statically enumerable default export.",
      file: options.entry,
    })
  }

  for (const frame of frames) {
    for (const providerName of frame.providers ?? []) {
      if (!providerFrames[providerName] && importedNames.has(providerName)) {
        providerFrames[providerName] = { name: providerName, frames: [] }
      }
    }
  }

  for (const frame of frames) {
    validateVueProviderSelections(frame, providerFrames, diagnostics, options.entry)
    validateVueProviderVariantSelections(frame, providerFrames, diagnostics, options.entry)
  }

  validateVueProviderVariantCoverage(readVueInjectedProviderNames(source), providerFrames, frames, diagnostics, options.entry)
  validateVueTemplateReachability(source, extraction.staticFrames, diagnostics, options.entry)

  return {
    entry: options.entry,
    mode,
    defaultExport: true,
    frames: mode === "scope" ? frames.map((frame) => ({ ...frame, kind: "scope" as const })) : frames,
    providers: providerFrames,
    diagnostics,
  }
}

export function extractVueFrames(source: string, file: string): VueFramesExtraction {
  const block = extractVueFramesBlock(source)
  if (!block) {
    return {
      frameImportCode: "",
      frameObjectCode: "{}",
      frames: [],
      staticFrames: [],
      diagnostics: [
        {
          stage: "contract-extraction",
          severity: "error",
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
      frameImportCode: "",
      frameObjectCode: "{}",
      frames: [],
      staticFrames: [],
      diagnostics: [
        {
          stage: "contract-extraction",
          severity: "error",
          code: "malformed-frames",
          message: "<g:frames> must contain `export default { ... }`.",
          file,
        },
      ],
    }
  }

  const diagnostics: RunelightDiagnostic[] = []
  const frameSummary = readVueFramesObject(parsed.objectLiteral, parsed.sourceFile, diagnostics, file)
  return {
    frameImportCode: parsed.frameImportCode,
    frameObjectCode: parsed.frameObjectCode,
    frameSourceFile: parsed.sourceFile,
    frames: frameSummary.frames,
    staticFrames: frameSummary.staticFrames,
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

export function projectVueVisualFrames(options: { cache?: RunelightVueAnalysisCache; cwd: string; entry: string }): RunelightVueVisualFrameProjection[] {
  const entryCoordinate = parseEntryCoordinate(options.entry)
  const entryPath = resolve(options.cwd, entryCoordinate.file)
  const cache = readRunelightVueAnalysisCacheData(options.cache)

  if (!existsSync(entryPath)) return []

  const source = readFileSync(entryPath, "utf8")
  const extraction = extractVueFrames(source, options.entry)
  if (extraction.staticFrames.length === 0) return []

  const template = extractVueTemplateBlock(source)
  if (!template) return extraction.staticFrames.map((frame) => ({ dependencies: [], name: frame.name, signatureParts: [] }))

  const ast = baseParse(template.content)
  const context: VueTemplateAnalysisContext = {
    aliases: new Map(),
    injectedBindings: readVueInjectedProviderBindings(source),
  }
  const componentImports = vueImportedComponentCoordinates(source, entryPath, options.cwd, cache)

  return extraction.staticFrames.map((frame) => {
    const dependencies = new Set<string>()
    const signatureParts = projectVueTemplateChildNodes(ast.children, { kind: "always" }, context, frame.values, componentImports, dependencies)
    return {
      dependencies: [...dependencies].sort((left, right) => left.localeCompare(right)),
      name: frame.name,
      signatureParts,
    }
  })
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
): { frameImportCode: string; frameObjectCode: string; objectLiteral: ts.ObjectLiteralExpression; sourceFile: ts.SourceFile } | undefined {
  const sourceFile = ts.createSourceFile(`${file}.frames.ts`, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const frameImportCode = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => code.slice(statement.getStart(sourceFile), statement.end))
    .join("\n")

  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement)) continue

    const expression = unwrapExpression(statement.expression)
    if (!ts.isObjectLiteralExpression(expression)) return undefined
    return {
      frameImportCode,
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
): { frames: RunelightFrameSummary[]; staticFrames: RunelightVueFrameStaticFacts[] } {
  const frames: RunelightFrameSummary[] = []
  const staticFrames: RunelightVueFrameStaticFacts[] = []

  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
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
        severity: "error",
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
        severity: "error",
        code: "malformed-frames",
        message: `Vue frame "${frameName}" must be an object literal.`,
        file,
        frameName,
      })
      continue
    }

    const providers = readProviderSelections(frameValue)
    const providerVariants = readProviderVariantMarkers(property.initializer)
    const description = readFrameDescription(frameValue)
    const kind = hasStaticProperty(frameValue, "scope") ? "scope" : "pure"
    frames.push({
      ...(description !== undefined ? { description } : {}),
      kind,
      name: frameName,
      ...(providerVariants && Object.keys(providerVariants).length > 0 ? { providerVariants } : {}),
      ...(providers && providers.length > 0 ? { providers } : {}),
    })
    staticFrames.push(readVueFrameStaticFacts(frameName, frameValue, providerVariants))
  }

  return { frames, staticFrames }
}

function readFrameDescription(frameValue: ts.ObjectLiteralExpression): string | undefined {
  const description = objectLiteralPropertyExpression(frameValue, "description")
  if (!description) return undefined
  if (ts.isStringLiteral(description) || ts.isNoSubstitutionTemplateLiteral(description)) return description.text
  return undefined
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

function readVueFrameStaticFacts(
  frameName: string,
  frameValue: ts.Expression,
  providerVariants: Record<string, RunelightProviderVariantSelection> | undefined,
): RunelightVueFrameStaticFacts {
  const values = new Map<string, VueStaticBranchValue>()

  if (ts.isObjectLiteralExpression(frameValue)) {
    const props = objectLiteralPropertyExpression(frameValue, "props")
    if (props) flattenVueStaticObjectExpression(props, "props", values)

    const scope = objectLiteralPropertyExpression(frameValue, "scope")
    if (scope) flattenVueStaticObjectExpression(scope, "scope", values)

    const providers = objectLiteralPropertyExpression(frameValue, "providers")
    if (providers) flattenVueProviderStaticValues(providers, values)
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

function flattenVueProviderStaticValues(expression: ts.Expression, values: Map<string, VueStaticBranchValue>) {
  const providersValue = unwrapExpression(expression)
  if (!ts.isArrayLiteralExpression(providersValue)) return

  for (const element of providersValue.elements) {
    const entry = unwrapExpression(element)
    if (!ts.isArrayLiteralExpression(entry)) continue

    const providerExpression = entry.elements[0] ? unwrapExpression(entry.elements[0]) : undefined
    const valueExpression = entry.elements[1] ? unwrapExpression(entry.elements[1]) : undefined
    if (!providerExpression || !ts.isIdentifier(providerExpression) || !valueExpression) continue

    flattenVueStaticObjectExpression(valueExpression, `context.${providerExpression.text}`, values)
  }
}

function flattenVueStaticObjectExpression(expression: ts.Expression, prefix: string, values: Map<string, VueStaticBranchValue>) {
  const value = unwrapExpression(expression)
  const staticValue = readVueStaticBranchValue(value)
  if (staticValue) {
    values.set(prefix, staticValue)
    if (staticValue.kind === "array") values.set(`${prefix}.length`, { kind: "number", value: staticValue.length })
    if (staticValue.kind === "string") values.set(`${prefix}.length`, { kind: "number", value: staticValue.value.length })
  }

  if (ts.isArrayLiteralExpression(value)) {
    for (const element of value.elements) {
      if (ts.isSpreadElement(element)) {
        values.set(`${prefix}.number`, { kind: "unknown" })
        continue
      }
      flattenVueStaticObjectExpression(element, `${prefix}.number`, values)
    }
    return
  }

  if (!ts.isObjectLiteralExpression(value)) {
    if (!staticValue) values.set(prefix, { kind: "unknown" })
    return
  }

  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      values.set(prefix, { kind: "unknown" })
      continue
    }

    if (!ts.isPropertyAssignment(property)) continue

    const propertyName = getStaticPropertyName(property.name)
    if (!propertyName) continue

    flattenVueStaticObjectExpression(property.initializer, `${prefix}.${propertyName}`, values)
  }
}

function readVueStaticBranchValue(expression: ts.Expression): VueStaticBranchValue | undefined {
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
    const inner = readVueStaticBranchValue(value.operand)
    const truthy = inner ? vueStaticBranchValueTruthy(inner) : undefined
    return truthy === undefined ? undefined : { kind: "boolean", value: !truthy }
  }

  return undefined
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
    if (!ts.isIdentifier(node.typeName)) return
    if (node.typeName.text !== "GVueProviderFrame") return

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

function getGVueProviderSummaries(sourceFile: ts.SourceFile): Map<string, RunelightProviderSummary> {
  const providers = new Map<string, RunelightProviderSummary>()

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        const initializer = unwrapExpression(declaration.initializer)
        if (!isDefineGInjectionKeyCall(initializer)) continue

        const variants = readDefineGInjectionKeyVariants(initializer)
        providers.set(declaration.name.text, {
          name: declaration.name.text,
          frames: [],
          ...(variants && variants.length > 0 ? { variants } : {}),
        })
      }
      continue
    }

    if (ts.isExportAssignment(statement)) {
      const expression = unwrapExpression(statement.expression)
      if (!isDefineGInjectionKeyCall(expression)) continue

      const variants = readDefineGInjectionKeyVariants(expression)
      providers.set("default", {
        name: "default",
        frames: [],
        ...(variants && variants.length > 0 ? { variants } : {}),
      })
    }
  }

  return providers
}

function getGVueProviderSummariesForFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  cwd: string,
  cache?: RunelightVueAnalysisCacheData,
  visited = new Set<string>(),
): Map<string, RunelightProviderSummary> {
  if (visited.has(filePath)) return new Map()
  visited.add(filePath)

  const providers = new Map(getGVueProviderSummaries(sourceFile))

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetPath = resolveImportedVueSourcePath(filePath, cwd, statement.moduleSpecifier.text, cache)
    if (!targetPath) continue

    const targetSource = sourceFileForAbsolutePath(targetPath, cache)
    if (!targetSource) continue

    const targetProviders = getGVueProviderSummariesForFile(targetSource, targetPath, cwd, cache, visited)
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

function readDefineGInjectionKeyVariants(expression: ts.CallExpression): string[] | undefined {
  const options = expression.arguments[0] ? unwrapExpression(expression.arguments[0]) : undefined
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

function isDefineGInjectionKeyCall(expression: ts.Expression): expression is ts.CallExpression {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "defineGInjectionKey"
}

function resolveImportedVueSourcePath(
  entryPath: string,
  cwd: string,
  specifier: string,
  cache?: RunelightVueAnalysisCacheData,
): string | undefined {
  const cacheKey = `${entryPath}\0vue-context\0${specifier}`
  const cached = cache?.importedStaticSourcePathByKey.get(cacheKey)
  if (cached !== undefined) return cached ?? undefined

  const basePath = resolveImportBasePath(entryPath, cwd, specifier)
  const resolvedPath = basePath ? importedVueSourcePathCandidates(basePath).find((candidate) => isFile(candidate)) : undefined
  cache?.importedStaticSourcePathByKey.set(cacheKey, resolvedPath ?? null)
  return resolvedPath
}

function resolveImportBasePath(entryPath: string, cwd: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) return resolve(cwd, "src", specifier.slice(2))
  if (specifier.startsWith(".")) return resolve(dirname(entryPath), specifier)
  return undefined
}

function importedVueSourcePathCandidates(basePath: string): string[] {
  const hasKnownExtension = /\.(?:tsx|ts|jsx|js)$/.test(basePath)
  const candidates = [
    hasKnownExtension ? basePath : undefined,
    basePath.endsWith(".g") ? `${basePath}.ts` : undefined,
    basePath.endsWith(".g") ? `${basePath}.tsx` : undefined,
    !hasKnownExtension ? `${basePath}.g.ts` : undefined,
    !hasKnownExtension ? `${basePath}.g.tsx` : undefined,
    !hasKnownExtension ? `${basePath}.ts` : undefined,
    !hasKnownExtension ? `${basePath}.tsx` : undefined,
    !hasKnownExtension ? `${basePath}.js` : undefined,
    !hasKnownExtension ? `${basePath}.jsx` : undefined,
    join(basePath, "index.g.ts"),
    join(basePath, "index.g.tsx"),
    join(basePath, "index.ts"),
    join(basePath, "index.tsx"),
    join(basePath, "index.js"),
    join(basePath, "index.jsx"),
  ]

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

function sourceFileForAbsolutePath(filePath: string, cache?: RunelightVueAnalysisCacheData): ts.SourceFile | undefined {
  const cached = cache?.sourceFilesByPath.get(filePath)
  if (cached) return cached
  if (!isFile(filePath)) return undefined

  const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  cache?.sourceFilesByPath.set(filePath, sourceFile)
  return sourceFile
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
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

function readVueInjectedProviderNames(source: string): Set<string> {
  const providers = new Set<string>()

  for (const script of extractVueScriptBlocks(source)) {
    const sourceFile = ts.createSourceFile("component.vue-script.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    visit(sourceFile)
  }

  return providers

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "inject") {
      const providerExpression = node.arguments[0] ? unwrapExpression(node.arguments[0]) : undefined
      if (providerExpression && ts.isIdentifier(providerExpression)) {
        providers.add(providerExpression.text)
      }
    }

    ts.forEachChild(node, visit)
  }
}

function extractVueScriptBlocks(source: string): string[] {
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  const scripts: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source))) {
    scripts.push(match[1] ?? "")
  }

  return scripts
}

function validateVueProviderSelections(
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
        message: `Vue frame "${frame.name}" provides unknown injection key "${providerName}".`,
        file,
        frameName: frame.name,
      })
    }
  }
}

function validateVueProviderVariantSelections(
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
        message: `Vue frame "${frame.name}" marks unknown injection key "${providerName}" variants "${variants.join(", ")}".`,
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
        message: `Vue frame "${frame.name}" marks injection key "${providerName}" variants "${variants.join(", ")}", but "${providerName}" does not declare variants.`,
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
        message: `Vue frame "${frame.name}" marks unknown "${providerName}" variants "${unknownVariants.join(", ")}". Expected one of: ${provider.variants.join(", ")}.`,
        file,
        frameName: frame.name,
      })
    }
  }
}

function validateVueProviderVariantCoverage(
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
      message: `Runelight Vue entry injects "${providerName}" but its frames do not cover variants: ${missingVariants.join(", ")}.`,
      file,
    })
  }
}

function validateVueTemplateReachability(
  source: string,
  staticFrames: RunelightVueFrameStaticFacts[],
  diagnostics: RunelightDiagnostic[],
  file: string,
) {
  if (staticFrames.length === 0) return

  const template = extractVueTemplateBlock(source)
  if (!template) return

  const ast = baseParse(template.content)
  const context: VueTemplateAnalysisContext = {
    aliases: new Map(),
    injectedBindings: readVueInjectedProviderBindings(source),
  }
  const branches = reachableVueTemplateBranches(ast, context)
  const reported = new Set<string>()

  for (const branch of branches) {
    const opaque = firstOpaqueVueTemplatePredicate(branch.condition)
    if (opaque) {
      const key = `opaque:${branch.tagName}:${opaque.text}`
      if (reported.has(key)) continue
      reported.add(key)
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "opaque-vue-template-control-flow",
        message: `Vue template branch <${branch.tagName}> is controlled by an opaque expression "${opaque.text}". Use props, frame scope, or injected context values directly so frames can cover the template structure.`,
        file,
      })
      continue
    }

    const evaluations = staticFrames.map((frame) => evaluateVueTemplatePredicate(branch.condition, frame.values))
    const coveredFrameNames = staticFrames.filter((_frame, index) => evaluations[index] === true).map((frame) => frame.name)
    if (coveredFrameNames.length > 0) continue

    const unknownFrameNames = staticFrames.filter((_frame, index) => evaluations[index] === "unknown").map((frame) => frame.name)
    if (unknownFrameNames.length > 0) {
      const key = `unknown:${branch.tagName}:${formatVueTemplatePredicate(branch.condition)}`
      if (reported.has(key)) continue
      reported.add(key)
      diagnostics.push({
        stage: "contract-extraction",
        severity: "error",
        code: "unknown-vue-branch-coverage",
        message: `Vue template branch <${branch.tagName}> is controlled by "${formatVueTemplatePredicate(branch.condition)}", but frame values are not static enough to prove coverage. Unknown frames: ${unknownFrameNames.join(", ")}.`,
        file,
      })
      continue
    }

    const key = `uncovered:${branch.tagName}:${formatVueTemplatePredicate(branch.condition)}`
    if (reported.has(key)) continue
    reported.add(key)
    diagnostics.push({
      stage: "contract-extraction",
      severity: "error",
      code: "uncovered-vue-template-branch",
      message: `No frame renders Vue template branch <${branch.tagName}> behind "${formatVueTemplatePredicate(branch.condition)}". Add a frame whose props, frame scope, or injected context values make that branch reachable.`,
      file,
    })
  }
}

function reachableVueTemplateBranches(root: RootNode, context: VueTemplateAnalysisContext): VueReachableTemplateBranch[] {
  return reachableVueTemplateChildBranches(root.children, { kind: "always" }, context)
}

function reachableVueTemplateChildBranches(
  children: TemplateChildNode[],
  condition: VueTemplateBranchPredicate,
  context: VueTemplateAnalysisContext,
): VueReachableTemplateBranch[] {
  const branches: VueReachableTemplateBranch[] = []
  const consumed = new Set<number>()

  for (let index = 0; index < children.length; index += 1) {
    if (consumed.has(index)) continue

    const child = children[index]
    if (child.type !== NodeTypes.ELEMENT) continue

    const ifDirective = vueDirective(child, "if")
    if (ifDirective) {
      const chain = collectVueIfChain(children, index)
      for (const chainIndex of chain.indices) consumed.add(chainIndex)
      branches.push(...reachableVueIfChainBranches(chain.elements, condition, context))
      continue
    }

    if (vueDirective(child, "else-if") || vueDirective(child, "else")) continue
    branches.push(...reachableVueElementBranches(child, condition, context))
  }

  return branches
}

function collectVueIfChain(children: TemplateChildNode[], startIndex: number): { elements: ElementNode[]; indices: number[] } {
  const elements: ElementNode[] = []
  const indices: number[] = []

  for (let index = startIndex; index < children.length; index += 1) {
    const child = children[index]
    if (isWhitespaceVueTextNode(child)) continue
    if (child.type !== NodeTypes.ELEMENT) break

    if (index === startIndex) {
      if (!vueDirective(child, "if")) break
    } else if (!vueDirective(child, "else-if") && !vueDirective(child, "else")) {
      break
    }

    elements.push(child)
    indices.push(index)
    if (vueDirective(child, "else")) break
  }

  return { elements, indices }
}

function reachableVueIfChainBranches(
  elements: ElementNode[],
  condition: VueTemplateBranchPredicate,
  context: VueTemplateAnalysisContext,
): VueReachableTemplateBranch[] {
  const branches: VueReachableTemplateBranch[] = []
  let previousBranches = { kind: "static", value: false } as VueTemplateBranchPredicate

  for (const element of elements) {
    const ifDirective = vueDirective(element, "if") ?? vueDirective(element, "else-if")
    const elseDirective = vueDirective(element, "else")
    const ownPredicate = elseDirective ? { kind: "always" } as VueTemplateBranchPredicate : vuePredicateFromDirective(ifDirective, context)
    const branchCondition = andVueTemplatePredicates(condition, andVueTemplatePredicates(notVueTemplatePredicate(previousBranches), ownPredicate))

    branches.push({ condition: branchCondition, expression: ifDirective?.exp?.loc.source, tagName: element.tag })
    branches.push(...reachableVueElementBranches(element, branchCondition, context, { skipIfDirective: true }))
    previousBranches = orVueTemplatePredicates(previousBranches, ownPredicate)
  }

  return branches
}

function reachableVueElementBranches(
  element: ElementNode,
  condition: VueTemplateBranchPredicate,
  context: VueTemplateAnalysisContext,
  options: { skipIfDirective?: boolean } = {},
): VueReachableTemplateBranch[] {
  const branches: VueReachableTemplateBranch[] = []
  let elementCondition = condition

  if (!options.skipIfDirective) {
    const ifDirective = vueDirective(element, "if")
    if (ifDirective) {
      elementCondition = andVueTemplatePredicates(elementCondition, vuePredicateFromDirective(ifDirective, context))
      branches.push({ condition: elementCondition, expression: ifDirective.exp?.loc.source, tagName: element.tag })
    }
  }

  const showDirective = vueDirective(element, "show")
  if (showDirective) {
    const showCondition = andVueTemplatePredicates(elementCondition, vuePredicateFromDirective(showDirective, context))
    branches.push({ condition: showCondition, expression: showDirective.exp?.loc.source, tagName: element.tag })
  }

  const forDirective = vueDirective(element, "for")
  let childContext = context
  let childCondition = elementCondition
  const forExpression = forDirective?.exp?.loc.source.trim()
  const parsedForExpression = forExpression ? parseVueForExpression(forExpression) : undefined
  if (forDirective && parsedForExpression?.source) {
    const sourcePath = vueExpressionPath(parsedForExpression.source)
    if (sourcePath) {
      const sourceRef = vueTemplateReferenceForPath(sourcePath, context)
      const nonEmptyCondition = andVueTemplatePredicates(elementCondition, nonEmptyVueCollectionPredicate(sourceRef))
      branches.push({ condition: nonEmptyCondition, expression: forDirective.exp?.loc.source, tagName: element.tag })
      childCondition = nonEmptyCondition

      if (parsedForExpression.value) {
        const aliases = new Map(context.aliases)
        aliases.set(parsedForExpression.value, `${sourceRef.candidates[0]}.number`)
        childContext = { ...context, aliases }
      }
    } else {
      const opaque = opaqueVueTemplatePredicate(forDirective.exp?.loc.source ?? "v-for", "v-for")
      branches.push({ condition: andVueTemplatePredicates(elementCondition, opaque), expression: forDirective.exp?.loc.source, tagName: element.tag })
    }
  }

  const dynamicIsExpression = vueDynamicIsExpression(element)
  if (dynamicIsExpression) {
    const dynamicIsPredicate = parseVueTemplatePredicateExpression(dynamicIsExpression, childContext)
    branches.push({ condition: andVueTemplatePredicates(childCondition, dynamicIsPredicate), expression: dynamicIsExpression, tagName: element.tag })
  }

  branches.push(...reachableVueTemplateChildBranches(element.children, childCondition, childContext))
  return branches
}

function projectVueTemplateChildNodes(
  children: TemplateChildNode[],
  condition: VueTemplateBranchPredicate,
  context: VueTemplateAnalysisContext,
  values: Map<string, VueStaticBranchValue>,
  componentImports: ReadonlyMap<string, string>,
  dependencies: Set<string>,
): unknown[] {
  const parts: unknown[] = []
  const consumed = new Set<number>()

  for (let index = 0; index < children.length; index += 1) {
    if (consumed.has(index)) continue

    const child = children[index]
    if (child.type === NodeTypes.TEXT) {
      const text = child.content.replace(/\s+/g, " ").trim()
      if (text) parts.push({ text })
      continue
    }

    if (child.type === NodeTypes.INTERPOLATION) {
      parts.push({ interpolation: child.loc.source.trim() })
      continue
    }

    if (child.type !== NodeTypes.ELEMENT) continue

    const ifDirective = vueDirective(child, "if")
    if (ifDirective) {
      const chain = collectVueIfChain(children, index)
      for (const chainIndex of chain.indices) consumed.add(chainIndex)
      parts.push(...projectVueIfChainTemplateNodes(chain.elements, condition, context, values, componentImports, dependencies))
      continue
    }

    if (vueDirective(child, "else-if") || vueDirective(child, "else")) continue
    parts.push(...projectVueElementTemplateNode(child, condition, context, values, componentImports, dependencies))
  }

  return parts
}

function projectVueIfChainTemplateNodes(
  elements: ElementNode[],
  condition: VueTemplateBranchPredicate,
  context: VueTemplateAnalysisContext,
  values: Map<string, VueStaticBranchValue>,
  componentImports: ReadonlyMap<string, string>,
  dependencies: Set<string>,
): unknown[] {
  const parts: unknown[] = []
  let previousBranches = { kind: "static", value: false } as VueTemplateBranchPredicate

  for (const element of elements) {
    const ifDirective = vueDirective(element, "if") ?? vueDirective(element, "else-if")
    const elseDirective = vueDirective(element, "else")
    const ownPredicate = elseDirective ? { kind: "always" } as VueTemplateBranchPredicate : vuePredicateFromDirective(ifDirective, context)
    const branchCondition = andVueTemplatePredicates(condition, andVueTemplatePredicates(notVueTemplatePredicate(previousBranches), ownPredicate))

    parts.push(...projectVueElementTemplateNode(element, branchCondition, context, values, componentImports, dependencies, { skipIfDirective: true }))
    previousBranches = orVueTemplatePredicates(previousBranches, ownPredicate)
  }

  return parts
}

function projectVueElementTemplateNode(
  element: ElementNode,
  condition: VueTemplateBranchPredicate,
  context: VueTemplateAnalysisContext,
  values: Map<string, VueStaticBranchValue>,
  componentImports: ReadonlyMap<string, string>,
  dependencies: Set<string>,
  options: { skipIfDirective?: boolean } = {},
): unknown[] {
  let elementCondition = condition

  if (!options.skipIfDirective) {
    const ifDirective = vueDirective(element, "if")
    if (ifDirective) elementCondition = andVueTemplatePredicates(elementCondition, vuePredicateFromDirective(ifDirective, context))
  }

  const elementEvaluation = evaluateVueTemplatePredicate(elementCondition, values)
  if (elementEvaluation === false) return []

  const forDirective = vueDirective(element, "for")
  const forExpression = forDirective?.exp?.loc.source.trim()
  const parsedForExpression = forExpression ? parseVueForExpression(forExpression) : undefined
  let childContext = context
  let childCondition = elementCondition
  const markers: Record<string, string> = {}

  if (forDirective && parsedForExpression?.source) {
    const sourcePath = vueExpressionPath(parsedForExpression.source)
    if (sourcePath) {
      const sourceRef = vueTemplateReferenceForPath(sourcePath, context)
      const nonEmptyCondition = andVueTemplatePredicates(elementCondition, nonEmptyVueCollectionPredicate(sourceRef))
      const forEvaluation = evaluateVueTemplatePredicate(nonEmptyCondition, values)
      if (forEvaluation === false) return []
      if (forEvaluation === "unknown") markers.forCondition = formatVueTemplatePredicate(nonEmptyCondition)
      childCondition = nonEmptyCondition

      if (parsedForExpression.value) {
        const aliases = new Map(context.aliases)
        aliases.set(parsedForExpression.value, `${sourceRef.candidates[0]}.number`)
        childContext = { ...context, aliases }
      }
    } else {
      markers.forCondition = forDirective.exp?.loc.source ?? "v-for"
    }
  } else if (forDirective) {
    markers.forCondition = forDirective.exp?.loc.source ?? "v-for"
  }

  const showDirective = vueDirective(element, "show")
  if (showDirective) {
    const showCondition = andVueTemplatePredicates(childCondition, vuePredicateFromDirective(showDirective, childContext))
    const showEvaluation = evaluateVueTemplatePredicate(showCondition, values)
    if (showEvaluation === false) return []
    if (showEvaluation === "unknown") markers.showCondition = formatVueTemplatePredicate(showCondition)
  }

  if (elementEvaluation === "unknown") markers.condition = formatVueTemplatePredicate(elementCondition)

  const componentCoordinate = componentImports.get(element.tag)
  if (componentCoordinate) dependencies.add(componentCoordinate)

  const children = projectVueTemplateChildNodes(element.children, childCondition, childContext, values, componentImports, dependencies)
  return [
    {
      tag: element.tag,
      ...(componentCoordinate ? { component: componentCoordinate } : {}),
      attrs: vueVisualAttributeParts(element),
      ...(Object.keys(markers).length > 0 ? { markers } : {}),
      children,
    },
  ]
}

function vueVisualAttributeParts(element: ElementNode): unknown[] {
  const parts: unknown[] = []

  for (const property of element.props) {
    if (property.type === NodeTypes.ATTRIBUTE) {
      parts.push({
        kind: "attribute",
        name: property.name,
        value: property.value?.content ?? true,
      })
      continue
    }

    if (["if", "else-if", "else", "for", "show"].includes(property.name)) continue

    parts.push({
      arg: property.arg?.loc.source,
      expression: property.exp?.loc.source,
      kind: "directive",
      name: property.name,
    })
  }

  return parts.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function vueImportedComponentCoordinates(
  source: string,
  entryPath: string,
  cwd: string,
  cache?: RunelightVueAnalysisCacheData,
): Map<string, string> {
  const imports = new Map<string, string>()

  for (const script of extractVueScriptBlocks(source)) {
    const sourceFile = ts.createSourceFile("component.vue-script.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue

      const targetPath = resolveImportedVueComponentPath(entryPath, cwd, statement.moduleSpecifier.text, cache)
      if (!targetPath) continue

      const coordinate = `${relative(cwd, targetPath).split(sep).join("/")}#default`
      const importClause = statement.importClause
      if (importClause.name) {
        imports.set(importClause.name.text, coordinate)
        imports.set(kebabCaseVueComponentName(importClause.name.text), coordinate)
      }

      const namedBindings = importClause.namedBindings
      if (!namedBindings || !ts.isNamedImports(namedBindings)) continue
      for (const element of namedBindings.elements) {
        imports.set(element.name.text, coordinate)
        imports.set(kebabCaseVueComponentName(element.name.text), coordinate)
      }
    }
  }

  return imports
}

function resolveImportedVueComponentPath(
  entryPath: string,
  cwd: string,
  specifier: string,
  cache?: RunelightVueAnalysisCacheData,
): string | undefined {
  const cacheKey = `${entryPath}\0vue-component\0${specifier}`
  const cached = cache?.importedStaticSourcePathByKey.get(cacheKey)
  if (cached !== undefined) return cached ?? undefined

  const basePath = resolveImportBasePath(entryPath, cwd, specifier)
  const resolvedPath = basePath ? importedVueComponentPathCandidates(basePath).find((candidate) => isFile(candidate)) : undefined
  cache?.importedStaticSourcePathByKey.set(cacheKey, resolvedPath ?? null)
  return resolvedPath
}

function importedVueComponentPathCandidates(basePath: string): string[] {
  const hasKnownExtension = /\.vue$/.test(basePath)
  const candidates = [
    hasKnownExtension ? basePath : undefined,
    !hasKnownExtension ? `${basePath}.g.vue` : undefined,
    join(basePath, "index.g.vue"),
  ]

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

function kebabCaseVueComponentName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
}

function parseVueForExpression(expression: string): { source: string; value?: string } | undefined {
  const match = /^(.*?)\s+(?:in|of)\s+(.+)$/.exec(expression.trim())
  if (!match) return undefined

  const left = (match[1] ?? "").trim().replace(/^\(/, "").replace(/\)$/, "")
  const source = (match[2] ?? "").trim()
  const value = left.split(",", 1)[0]?.trim()
  return source ? { source, ...(value ? { value } : {}) } : undefined
}

function vueDirective(element: ElementNode, name: string): DirectiveNode | undefined {
  return element.props.find((property): property is DirectiveNode => property.type === NodeTypes.DIRECTIVE && property.name === name)
}

function vuePredicateFromDirective(
  directive: DirectiveNode | undefined,
  context: VueTemplateAnalysisContext,
): VueTemplateBranchPredicate {
  const expression = directive?.exp?.loc.source.trim()
  if (!expression) return { kind: "static", value: true }
  return parseVueTemplatePredicateExpression(expression, context)
}

function parseVueTemplatePredicateExpression(
  expression: string,
  context: VueTemplateAnalysisContext,
): VueTemplateBranchPredicate {
  const parsed = parseVueTemplateExpression(expression)
  if (!parsed) return opaqueVueTemplatePredicate(expression, "parse")
  return parseVueTemplatePredicate(parsed, context)
}

function parseVueTemplateExpression(expression: string): ts.Expression | undefined {
  const sourceFile = ts.createSourceFile("vue-template-expression.ts", `const __runelightVueExpression = (${expression})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statement = sourceFile.statements[0]
  if (!statement || !ts.isVariableStatement(statement)) return undefined
  const declaration = statement.declarationList.declarations[0]
  if (!declaration?.initializer) return undefined
  return declaration.initializer
}

function parseVueTemplatePredicate(expression: ts.Expression, context: VueTemplateAnalysisContext): VueTemplateBranchPredicate {
  const value = unwrapExpression(expression)

  if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
    return notVueTemplatePredicate(parseVueTemplatePredicate(value.operand, context))
  }

  if (ts.isBinaryExpression(value)) {
    if (value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return andVueTemplatePredicates(parseVueTemplatePredicate(value.left, context), parseVueTemplatePredicate(value.right, context))
    }
    if (value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return orVueTemplatePredicates(parseVueTemplatePredicate(value.left, context), parseVueTemplatePredicate(value.right, context))
    }

    const binaryPredicate = parseVueBinaryTemplatePredicate(value, context)
    if (binaryPredicate) return binaryPredicate
  }

  const staticValue = readVueStaticBranchValue(value)
  if (staticValue) {
    const truthy = evaluateVueStaticBranchValueTruthy(staticValue)
    return truthy === "unknown" ? opaqueVueTemplatePredicate(value.getText(), "static") : { kind: "static", value: truthy }
  }

  const reference = vueTemplateReferenceForExpression(value, context)
  if (reference) return { kind: "truthy", ref: reference }

  return opaqueVueTemplatePredicate(value.getText(), "expression")
}

function parseVueBinaryTemplatePredicate(
  expression: ts.BinaryExpression,
  context: VueTemplateAnalysisContext,
): VueTemplateBranchPredicate | undefined {
  const leftReference = vueTemplateReferenceForExpression(expression.left, context)
  const rightReference = vueTemplateReferenceForExpression(expression.right, context)
  const leftValue = readVueStaticBranchValue(expression.left)
  const rightValue = readVueStaticBranchValue(expression.right)

  if (leftReference && rightReference) {
    const predicate: VueTemplateBranchPredicate = { kind: "equals-ref", left: leftReference, right: rightReference }
    if (expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken) {
      return predicate
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken) {
      return notVueTemplatePredicate(predicate)
    }
    return undefined
  }

  if (leftReference && rightValue) {
    return vueComparisonPredicate(leftReference, expression.operatorToken.kind, rightValue)
  }
  if (rightReference && leftValue) {
    return vueComparisonPredicate(rightReference, flipVueComparisonOperator(expression.operatorToken.kind), leftValue)
  }

  return undefined
}

function vueComparisonPredicate(
  reference: VueTemplateReference,
  operator: ts.SyntaxKind,
  value: VueStaticBranchValue,
): VueTemplateBranchPredicate | undefined {
  if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.EqualsEqualsToken) {
    return { kind: "equals", ref: reference, value }
  }
  if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken) {
    return notVueTemplatePredicate({ kind: "equals", ref: reference, value })
  }
  if (operator === ts.SyntaxKind.LessThanToken) return { kind: "relation", ref: reference, operator: "<", value }
  if (operator === ts.SyntaxKind.LessThanEqualsToken) return { kind: "relation", ref: reference, operator: "<=", value }
  if (operator === ts.SyntaxKind.GreaterThanToken) return { kind: "relation", ref: reference, operator: ">", value }
  if (operator === ts.SyntaxKind.GreaterThanEqualsToken) return { kind: "relation", ref: reference, operator: ">=", value }
  return undefined
}

function flipVueComparisonOperator(operator: ts.SyntaxKind): ts.SyntaxKind {
  if (operator === ts.SyntaxKind.LessThanToken) return ts.SyntaxKind.GreaterThanToken
  if (operator === ts.SyntaxKind.LessThanEqualsToken) return ts.SyntaxKind.GreaterThanEqualsToken
  if (operator === ts.SyntaxKind.GreaterThanToken) return ts.SyntaxKind.LessThanToken
  if (operator === ts.SyntaxKind.GreaterThanEqualsToken) return ts.SyntaxKind.LessThanEqualsToken
  return operator
}

function vueTemplateReferenceForExpression(
  expression: ts.Expression,
  context: VueTemplateAnalysisContext,
): VueTemplateReference | undefined {
  const path = vueExpressionPath(expression)
  return path ? vueTemplateReferenceForPath(path, context) : undefined
}

function vueExpressionPath(expression: ts.Expression | string): string[] | undefined {
  const parsed = typeof expression === "string" ? parseVueTemplateExpression(expression) : expression
  const value = parsed ? unwrapExpression(parsed) : undefined
  if (!value) return undefined
  if (ts.isIdentifier(value)) return [value.text]
  if (ts.isPropertyAccessExpression(value)) {
    const parent = vueExpressionPath(value.expression)
    return parent ? [...parent, value.name.text] : undefined
  }
  if (ts.isElementAccessExpression(value)) {
    const parent = vueExpressionPath(value.expression)
    const argument = value.argumentExpression ? unwrapExpression(value.argumentExpression) : undefined
    if (!parent || !argument) return undefined
    if (ts.isStringLiteral(argument) || ts.isNumericLiteral(argument)) return [...parent, argument.text]
  }
  return undefined
}

function vueTemplateReferenceForPath(path: string[], context: VueTemplateAnalysisContext): VueTemplateReference {
  const [root, ...rest] = path
  if (!root) return { candidates: [], label: "" }

  const alias = context.aliases.get(root)
  if (alias) return { candidates: [[alias, ...rest].join(".")], label: path.join(".") }

  const providerName = context.injectedBindings.get(root)
  if (providerName) return { candidates: [[`context.${providerName}`, ...rest].join(".")], label: path.join(".") }

  if (root === "props") return { candidates: [`props.${rest.join(".")}`.replace(/\.$/, "")], label: path.join(".") }
  if (root === "scope") return { candidates: [`scope.${rest.join(".")}`.replace(/\.$/, "")], label: path.join(".") }

  return { candidates: [`scope.${path.join(".")}`, `props.${path.join(".")}`], label: path.join(".") }
}

function nonEmptyVueCollectionPredicate(reference: VueTemplateReference): VueTemplateBranchPredicate {
  return { kind: "relation", ref: { candidates: reference.candidates.map((candidate) => `${candidate}.length`), label: `${reference.label}.length` }, operator: ">", value: { kind: "number", value: 0 } }
}

function vueDynamicIsExpression(element: ElementNode): string | undefined {
  if (element.tag !== "component") return undefined
  const bind = element.props.find((property): property is DirectiveNode => {
    return (
      property.type === NodeTypes.DIRECTIVE &&
      property.name === "bind" &&
      property.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
      property.arg.content === "is"
    )
  })
  return bind?.exp?.loc.source.trim()
}

function isWhitespaceVueTextNode(node: TemplateChildNode): boolean {
  return node.type === NodeTypes.TEXT && node.content.trim() === ""
}

function extractVueTemplateBlock(source: string): { content: string } | undefined {
  const match = /<template\b[^>]*>([\s\S]*?)<\/template>/i.exec(source)
  return match ? { content: match[1] ?? "" } : undefined
}

function readVueInjectedProviderBindings(source: string): Map<string, string> {
  const bindings = new Map<string, string>()

  for (const script of extractVueScriptBlocks(source)) {
    const sourceFile = ts.createSourceFile("component.vue-script.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        const initializer = unwrapExpression(declaration.initializer)
        if (!ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression) || initializer.expression.text !== "inject") continue
        const providerExpression = initializer.arguments[0] ? unwrapExpression(initializer.arguments[0]) : undefined
        if (providerExpression && ts.isIdentifier(providerExpression)) {
          bindings.set(declaration.name.text, providerExpression.text)
        }
      }
    }
  }

  return bindings
}

function firstOpaqueVueTemplatePredicate(
  predicate: VueTemplateBranchPredicate,
): Extract<VueTemplateBranchPredicate, { kind: "opaque" }> | undefined {
  if (predicate.kind === "opaque") return predicate
  if (predicate.kind === "not") return firstOpaqueVueTemplatePredicate(predicate.predicate)
  if (predicate.kind === "and" || predicate.kind === "or") {
    for (const child of predicate.predicates) {
      const opaque = firstOpaqueVueTemplatePredicate(child)
      if (opaque) return opaque
    }
  }
  return undefined
}

function evaluateVueTemplatePredicate(
  predicate: VueTemplateBranchPredicate,
  values: Map<string, VueStaticBranchValue>,
): boolean | "unknown" {
  if (predicate.kind === "always") return true
  if (predicate.kind === "static") return predicate.value
  if (predicate.kind === "opaque") return "unknown"
  if (predicate.kind === "truthy") return evaluateVueStaticBranchValueTruthy(vueStaticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" })
  if (predicate.kind === "equals") {
    return evaluateSameVueStaticBranchValue(vueStaticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" }, predicate.value)
  }
  if (predicate.kind === "equals-ref") {
    return evaluateSameVueStaticBranchValue(
      vueStaticBranchValueForReference(values, predicate.left) ?? { kind: "undefined" },
      vueStaticBranchValueForReference(values, predicate.right) ?? { kind: "undefined" },
    )
  }
  if (predicate.kind === "relation") {
    return evaluateVueStaticBranchRelation(
      vueStaticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" },
      predicate.operator,
      predicate.value,
    )
  }
  if (predicate.kind === "not") return evaluateNegatedVueTemplatePredicate(predicate.predicate, values)
  if (predicate.kind === "and") {
    let unknown = false
    for (const child of predicate.predicates) {
      const value = evaluateVueTemplatePredicate(child, values)
      if (value === false) return false
      if (value === "unknown") unknown = true
    }
    return unknown ? "unknown" : true
  }
  if (predicate.kind === "or") {
    let unknown = false
    for (const child of predicate.predicates) {
      const value = evaluateVueTemplatePredicate(child, values)
      if (value === true) return true
      if (value === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }
  return "unknown"
}

function evaluateNegatedVueTemplatePredicate(
  predicate: VueTemplateBranchPredicate,
  values: Map<string, VueStaticBranchValue>,
): boolean | "unknown" {
  if (predicate.kind === "truthy") {
    const truthy = evaluateVueStaticBranchValueTruthy(vueStaticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" })
    return truthy === "unknown" ? "unknown" : !truthy
  }
  if (predicate.kind === "equals") {
    const result = evaluateSameVueStaticBranchValue(vueStaticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" }, predicate.value)
    return result === "unknown" ? "unknown" : !result
  }
  if (predicate.kind === "equals-ref") {
    const result = evaluateSameVueStaticBranchValue(
      vueStaticBranchValueForReference(values, predicate.left) ?? { kind: "undefined" },
      vueStaticBranchValueForReference(values, predicate.right) ?? { kind: "undefined" },
    )
    return result === "unknown" ? "unknown" : !result
  }
  if (predicate.kind === "relation") {
    const result = evaluateVueStaticBranchRelation(
      vueStaticBranchValueForReference(values, predicate.ref) ?? { kind: "undefined" },
      predicate.operator,
      predicate.value,
    )
    return result === "unknown" ? "unknown" : !result
  }
  if (predicate.kind === "and") return evaluateVueTemplatePredicate({ kind: "or", predicates: predicate.predicates.map(notVueTemplatePredicate) }, values)
  if (predicate.kind === "or") return evaluateVueTemplatePredicate({ kind: "and", predicates: predicate.predicates.map(notVueTemplatePredicate) }, values)

  const value = evaluateVueTemplatePredicate(predicate, values)
  return value === "unknown" ? "unknown" : !value
}

function vueStaticBranchValueForReference(
  values: Map<string, VueStaticBranchValue>,
  reference: VueTemplateReference,
): VueStaticBranchValue | undefined {
  for (const candidate of reference.candidates) {
    const value = vueStaticBranchValueForKey(values, candidate)
    if (value) return value
  }
  return undefined
}

function vueStaticBranchValueForKey(values: Map<string, VueStaticBranchValue>, key: string): VueStaticBranchValue | undefined {
  const exact = values.get(key)
  if (exact) return exact

  const parts = key.split(".")
  while (parts.length > 1) {
    parts.pop()
    const ancestor = values.get(parts.join("."))
    if (ancestor && vueStaticBranchValueIncludesUnknown(ancestor)) return { kind: "unknown" }
  }

  return undefined
}

function vueStaticBranchValueIncludesUnknown(value: VueStaticBranchValue): boolean {
  return value.kind === "unknown" || (value.kind === "oneOf" && value.values.some(vueStaticBranchValueIncludesUnknown))
}

function evaluateVueStaticBranchValueTruthy(value: VueStaticBranchValue): boolean | "unknown" {
  if (value.kind === "unknown") return "unknown"
  if (value.kind === "oneOf") {
    let unknown = false
    for (const option of value.values) {
      const result = evaluateVueStaticBranchValueTruthy(option)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }

  return vueStaticBranchValueTruthy(value)
}

function evaluateSameVueStaticBranchValue(left: VueStaticBranchValue, right: VueStaticBranchValue): boolean | "unknown" {
  if (left.kind === "unknown" || right.kind === "unknown") return "unknown"
  if (left.kind === "oneOf") {
    let unknown = false
    for (const option of left.values) {
      const result = evaluateSameVueStaticBranchValue(option, right)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }
  if (right.kind === "oneOf") {
    let unknown = false
    for (const option of right.values) {
      const result = evaluateSameVueStaticBranchValue(left, option)
      if (result === true) return true
      if (result === "unknown") unknown = true
    }
    return unknown ? "unknown" : false
  }

  return sameVueStaticBranchValue(left, right)
}

function evaluateVueStaticBranchRelation(
  left: VueStaticBranchValue,
  operator: "<" | "<=" | ">" | ">=",
  right: VueStaticBranchValue,
): boolean | "unknown" {
  if (left.kind === "unknown" || right.kind === "unknown") return "unknown"
  const leftNumber = vueStaticBranchValueNumber(left)
  const rightNumber = vueStaticBranchValueNumber(right)
  if (leftNumber === undefined || rightNumber === undefined) return "unknown"
  if (operator === "<") return leftNumber < rightNumber
  if (operator === "<=") return leftNumber <= rightNumber
  if (operator === ">") return leftNumber > rightNumber
  return leftNumber >= rightNumber
}

function vueStaticBranchValueTruthy(value: VueStaticBranchValue): boolean {
  if (value.kind === "unknown") return false
  if (value.kind === "oneOf") return value.values.some(vueStaticBranchValueTruthy)
  if (value.kind === "undefined" || value.kind === "null") return false
  if (value.kind === "boolean") return value.value
  if (value.kind === "number") return value.value !== 0 && !Number.isNaN(value.value)
  if (value.kind === "string") return value.value.length > 0
  if (value.kind === "array" || value.kind === "object" || value.kind === "truthy") return true
  return false
}

function sameVueStaticBranchValue(left: VueStaticBranchValue, right: VueStaticBranchValue): boolean {
  if (left.kind === "undefined" && right.kind === "undefined") return true
  if (left.kind === "null" && right.kind === "null") return true
  if (left.kind === "boolean" && right.kind === "boolean") return left.value === right.value
  if (left.kind === "number" && right.kind === "number") return left.value === right.value
  if (left.kind === "string" && right.kind === "string") return left.value === right.value
  if (left.kind === "array" && right.kind === "array") return left.length === right.length
  return false
}

function vueStaticBranchValueNumber(value: VueStaticBranchValue): number | undefined {
  if (value.kind === "number") return value.value
  if (value.kind === "array") return value.length
  return undefined
}

function andVueTemplatePredicates(
  left: VueTemplateBranchPredicate,
  right: VueTemplateBranchPredicate,
): VueTemplateBranchPredicate {
  if (left.kind === "always") return right
  if (right.kind === "always") return left
  if (left.kind === "static" && left.value === false) return left
  if (right.kind === "static" && right.value === false) return right

  const predicates = [
    ...(left.kind === "and" ? left.predicates : [left]),
    ...(right.kind === "and" ? right.predicates : [right]),
  ].filter((predicate) => predicate.kind !== "always")

  return predicates.length === 1 ? predicates[0] as VueTemplateBranchPredicate : { kind: "and", predicates }
}

function orVueTemplatePredicates(
  left: VueTemplateBranchPredicate,
  right: VueTemplateBranchPredicate,
): VueTemplateBranchPredicate {
  if (left.kind === "always" || right.kind === "always") return { kind: "always" }
  if (left.kind === "static" && left.value === false) return right
  if (right.kind === "static" && right.value === false) return left

  const predicates = [
    ...(left.kind === "or" ? left.predicates : [left]),
    ...(right.kind === "or" ? right.predicates : [right]),
  ]

  return predicates.length === 1 ? predicates[0] as VueTemplateBranchPredicate : { kind: "or", predicates }
}

function notVueTemplatePredicate(predicate: VueTemplateBranchPredicate): VueTemplateBranchPredicate {
  if (predicate.kind === "static") return { kind: "static", value: !predicate.value }
  if (predicate.kind === "not") return predicate.predicate
  return { kind: "not", predicate }
}

function opaqueVueTemplatePredicate(text: string, reason: string): VueTemplateBranchPredicate {
  return { kind: "opaque", reason, text }
}

function formatVueTemplatePredicate(predicate: VueTemplateBranchPredicate): string {
  if (predicate.kind === "always") return "always"
  if (predicate.kind === "static") return String(predicate.value)
  if (predicate.kind === "truthy") return predicate.ref.label
  if (predicate.kind === "equals") return `${predicate.ref.label} === ${formatVueStaticBranchValue(predicate.value)}`
  if (predicate.kind === "equals-ref") return `${predicate.left.label} === ${predicate.right.label}`
  if (predicate.kind === "relation") return `${predicate.ref.label} ${predicate.operator} ${formatVueStaticBranchValue(predicate.value)}`
  if (predicate.kind === "not") return `!(${formatVueTemplatePredicate(predicate.predicate)})`
  if (predicate.kind === "and") return predicate.predicates.map(formatVueTemplatePredicate).join(" && ")
  if (predicate.kind === "or") return predicate.predicates.map(formatVueTemplatePredicate).join(" || ")
  return predicate.text
}

function formatVueStaticBranchValue(value: VueStaticBranchValue): string {
  if (value.kind === "boolean") return String(value.value)
  if (value.kind === "number") return String(value.value)
  if (value.kind === "string") return JSON.stringify(value.value)
  if (value.kind === "array") return `array(length=${value.length})`
  if (value.kind === "oneOf") return `oneOf(${value.values.map(formatVueStaticBranchValue).join(", ")})`
  return value.kind
}

function providerVariantSelectionValues(selection: RunelightProviderVariantSelection): string[] {
  return Array.isArray(selection) ? selection : [selection]
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
  if (
    ts.isSatisfiesExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
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
