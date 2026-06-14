import { createHash } from "node:crypto"
import { dirname, join, relative, resolve, sep } from "node:path"
import ts from "typescript"

import type {
  RunelightContractCacheContext,
  RunelightContractFile,
  RunelightContractIndexFileContext,
  RunelightContractIndexFileResult,
  RunelightDiagnostic,
  RunelightContractComponent,
} from "@runelight/core/contract"
import {
  analyzeEntry,
  createRunelightReactAnalysisCacheData,
  projectReactVisualFrames,
  readRunelightReactAnalysisCacheData,
  type RunelightAnalysisCache,
  type RunelightAnalysisCacheData,
  type RunelightReactVisualFrameProjection,
} from "./contract-analyzer.js"

type ExportedComponent = {
  exportName: string
  componentName: string
  localName: string
}

type ReactProjectIndexFileContext = {
  filePath: string
  sourceHash: string
  sourceFile: ts.SourceFile
  exportedComponents: ExportedComponent[]
}

type ReactProjectModuleResolution = {
  compilerOptions: ts.CompilerOptions
  cwd: string
  host: ts.ModuleResolutionHost
}

type ReactComponentImportBindings = {
  names: Map<string, string>
  namespaces: Map<string, Map<string, string>>
}

type ReactVisualSignatureBinding = {
  signatureNode: ts.Node
}

type ReactVisualSignatureContext = {
  localBindings: Map<string, ReactVisualSignatureBinding>
  printer: ts.Printer
  sourceFile: ts.SourceFile
  topLevelBindings: Map<string, ReactVisualSignatureBinding>
}

type ReactVisualSignatureResult = {
  frameDependencies?: Record<string, string[]>
  frameVisualSignatures?: Record<string, string>
  visualSignature: string
}

type ReactFrameAssignmentExpression = {
  expression: ts.Expression
  name: string
}

type ReactProjectIndexCache = {
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>
  fileContextsByFilePath: Map<string, ReactProjectIndexFileContext>
  moduleResolution: ReactProjectModuleResolution
}

declare const runelightReactContractCacheType: unique symbol

export type RunelightReactContractCache = RunelightAnalysisCache & {
  readonly [runelightReactContractCacheType]: "RunelightReactContractCache"
}

type RunelightReactContractCacheData = RunelightAnalysisCacheData &
  RunelightReactContractCache & {
  projectIndex: ReactProjectIndexCache
}

export function createRunelightReactContractCache(context: RunelightContractCacheContext): RunelightReactContractCache {
  const fileContexts = [...context.files.values()]
    .filter((file) => file.filePath.endsWith(".g.tsx"))
    .map((file) => buildReactProjectIndexFileContext(file))
  const sourceFilesByPath = new Map(
    fileContexts.map((fileContext) => [resolve(context.cwd, fileContext.filePath), fileContext.sourceFile] as const),
  )
  const analysisCache = createRunelightReactAnalysisCacheData(sourceFilesByPath) as RunelightReactContractCacheData
  analysisCache.projectIndex = {
    exportedComponentsByFilePath: new Map(fileContexts.map((fileContext) => [fileContext.filePath, fileContext.exportedComponents] as const)),
    fileContextsByFilePath: new Map(fileContexts.map((fileContext) => [fileContext.filePath, fileContext] as const)),
    moduleResolution: createReactProjectModuleResolution(context.cwd, context.tsconfigPath),
  }
  return analysisCache
}

export function indexReactFile(context: RunelightContractIndexFileContext<RunelightReactContractCache>): RunelightContractIndexFileResult {
  const cache =
    readRunelightReactContractCacheData(context.cache) ??
    (readRunelightReactContractCacheData(
      createRunelightReactContractCache({
        cwd: context.cwd,
        files: context.files,
        tsconfigPath: context.tsconfigPath,
      }),
    ) as RunelightReactContractCacheData)
  const fileContext = cache.projectIndex.fileContextsByFilePath.get(context.file.filePath) ?? buildReactProjectIndexFileContext(context.file)
  const components = fileContext.exportedComponents.map((component) =>
    buildReactProjectIndexComponent(
      context.cwd,
      fileContext.filePath,
      fileContext.sourceHash,
      component,
      dependencyCoordinatesForReactComponent(
        fileContext,
        component,
        cache.projectIndex.exportedComponentsByFilePath,
        cache.projectIndex.fileContextsByFilePath,
        cache.projectIndex.moduleResolution,
      ),
      fileContext.sourceFile,
      cache,
    ),
  )
  const fileDiagnostics: RunelightDiagnostic[] =
    fileContext.exportedComponents.length === 0
      ? [
          {
            stage: "contract-extraction",
            severity: "error",
            code: "missing-component-export",
            message: "A .g.tsx file must export at least one React component.",
            file: fileContext.filePath,
          },
        ]
      : []

  return {
    components,
    diagnostics: [...fileDiagnostics, ...components.flatMap((component) => component.diagnostics)],
  }
}

function readRunelightReactContractCacheData(
  cache: RunelightReactContractCache | undefined,
): RunelightReactContractCacheData | undefined {
  return cache as RunelightReactContractCacheData | undefined
}

function buildReactProjectIndexFileContext(file: RunelightContractFile): ReactProjectIndexFileContext {
  const sourceFile = ts.createSourceFile(file.filePath, file.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return {
    filePath: file.filePath,
    sourceHash: file.sourceHash,
    sourceFile,
    exportedComponents: readExportedReactComponents(sourceFile),
  }
}

function buildReactProjectIndexComponent(
  cwd: string,
  filePath: string,
  sourceHash: string,
  component: ExportedComponent,
  dependencies: string[],
  sourceFile: ts.SourceFile,
  analysisCache: RunelightReactContractCache,
): RunelightContractComponent {
  const coordinate = `${filePath}#${component.exportName}`
  const analysis = analyzeEntry({ cache: analysisCache, cwd, entry: coordinate })
  const visualFrameProjections = projectReactVisualFrames({ cache: analysisCache, cwd, entry: coordinate })
  const visualSignature = visualSignatureForReactComponent(filePath, sourceFile, component.localName, visualFrameProjections)

  return {
    coordinate,
    filePath,
    sourceHash,
    exportName: component.exportName,
    componentName: component.componentName,
    mode: analysis.mode,
    frames: analysis.frames,
    providers: analysis.providers,
    ...(dependencies.length > 0 ? { dependencies } : {}),
    ...(visualSignature?.frameDependencies ? { frameDependencies: visualSignature.frameDependencies } : {}),
    ...(visualSignature?.frameVisualSignatures ? { frameVisualSignatures: visualSignature.frameVisualSignatures } : {}),
    ...(visualSignature ? { visualSignature: visualSignature.visualSignature } : {}),
    diagnostics: analysis.diagnostics,
  }
}

function visualSignatureForReactComponent(
  filePath: string,
  sourceFile: ts.SourceFile,
  localName: string,
  visualFrameProjections: readonly RunelightReactVisualFrameProjection[] = [],
): ReactVisualSignatureResult | undefined {
  const declaration = findReactComponentDeclaration(sourceFile, localName)
  if (!declaration) return undefined

  const printer = ts.createPrinter({ removeComments: true })
  const context: ReactVisualSignatureContext = {
    localBindings: localVisualSignatureBindingsForDeclaration(declaration),
    printer,
    sourceFile,
    topLevelBindings: topLevelVisualSignatureBindings(sourceFile),
  }
  const renderExpressions = reactComponentRenderExpressions(declaration)
  const frameExpressions = frameAssignmentExpressionsForComponent(sourceFile, localName)
  if (visualFrameProjections.length > 0) {
    const frameVisualSignatures = Object.fromEntries(visualFrameProjections.map((projection) => [
      projection.name,
      hashReactVisualSignature({
        filePath,
        component: localName,
        frame: { name: projection.name },
        projection: projection.signatureParts,
      }),
    ] as const))
    const frameDependencies = Object.fromEntries(
      visualFrameProjections.map((projection) => [projection.name, projection.dependencies] as const),
    )

    return {
      frameDependencies,
      frameVisualSignatures,
      visualSignature: hashReactVisualSignature({
        filePath,
        component: localName,
        projections: visualFrameProjections.map((projection) => ({
          name: projection.name,
          dependencies: projection.dependencies,
          signatureParts: projection.signatureParts,
        })),
      }),
    }
  }

  const frameSignatures = frameExpressions.map((frame) => ({
    name: frame.name,
  }))
  const declarationFallback = renderExpressions.length === 0 && frameSignatures.length === 0
    ? [normalizedPrintedNode(declaration, context)]
    : []
  const dependencySignatures = bindingSignaturesForExpressions(renderExpressions, context)
  const renderSignatureParts = renderExpressions.map((expression) => normalizedPrintedNode(expression, context))
  const frameVisualSignatures = Object.fromEntries(frameExpressions.map((frame) => {
    const frameBindingSignatures = bindingSignaturesForExpressions(renderExpressions, context)
    return [
      frame.name,
      hashReactVisualSignature({
        filePath,
        component: localName,
        render: renderSignatureParts,
        bindings: frameBindingSignatures,
        frame: {
          name: frame.name,
        },
        fallback: declarationFallback,
      }),
    ] as const
  }))
  const payload = {
    filePath,
    component: localName,
    render: renderSignatureParts,
    bindings: dependencySignatures,
    frames: frameSignatures,
    fallback: declarationFallback,
  }

  return {
    ...(Object.keys(frameVisualSignatures).length > 0 ? { frameVisualSignatures } : {}),
    visualSignature: hashReactVisualSignature(payload),
  }
}

function reactComponentRenderExpressions(declaration: ts.Node): ts.Expression[] {
  const expressions: ts.Expression[] = []
  const body = functionLikeBody(declaration)
  if (!body) return expressions

  if (ts.isExpression(body)) return [body]

  const visit = (node: ts.Node) => {
    if (node !== body && isFunctionLikeNode(node)) return
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return expressions
}

function bindingSignaturesForExpressions(expressions: readonly ts.Expression[], context: ReactVisualSignatureContext): Array<{ name: string; value: string }> {
  const signatures: Array<{ name: string; value: string }> = []
  const visited = new Set<string>()
  const pending = new Set<string>()

  for (const expression of expressions) {
    for (const identifier of identifiersReferencedBy(expression)) pending.add(identifier)
  }

  while (pending.size > 0) {
    const name = [...pending].sort()[0]
    pending.delete(name)
    if (!name || visited.has(name)) continue
    visited.add(name)

    const binding = context.localBindings.get(name) ?? context.topLevelBindings.get(name)
    if (!binding) continue

    signatures.push({ name, value: normalizedPrintedNode(binding.signatureNode, context) })
    for (const identifier of identifiersReferencedBy(binding.signatureNode)) {
      if (!visited.has(identifier)) pending.add(identifier)
    }
  }

  return signatures.sort((left, right) => left.name.localeCompare(right.name))
}

function identifiersReferencedBy(node: ts.Node): Set<string> {
  const identifiers = new Set<string>()
  const visit = (current: ts.Node) => {
    if (isDeclarationName(current)) return
    if (ts.isPropertyAccessExpression(current)) {
      visit(current.expression)
      return
    }
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxClosingElement(current)) {
      addJsxTagIdentifiers(current.tagName, identifiers)
      if ("attributes" in current) ts.forEachChild(current.attributes, visit)
      return
    }
    if (ts.isIdentifier(current)) identifiers.add(current.text)
    ts.forEachChild(current, visit)
  }

  visit(node)
  return identifiers
}

function addJsxTagIdentifiers(tagName: ts.JsxTagNameExpression, identifiers: Set<string>): void {
  if (ts.isIdentifier(tagName)) {
    if (/^[A-Z]/.test(tagName.text)) identifiers.add(tagName.text)
    return
  }

  if (ts.isPropertyAccessExpression(tagName) && ts.isIdentifier(tagName.expression)) identifiers.add(tagName.expression.text)
}

function isDeclarationName(node: ts.Node): boolean {
  const parent = node.parent
  return (
    ts.isIdentifier(node) &&
    Boolean(parent) &&
    ((ts.isVariableDeclaration(parent) && parent.name === node) ||
      ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent)) && parent.name === node) ||
      (ts.isParameter(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node))
  )
}

function localVisualSignatureBindingsForDeclaration(declaration: ts.Node): Map<string, ReactVisualSignatureBinding> {
  const bindings = new Map<string, ReactVisualSignatureBinding>()
  const body = functionLikeBlockBody(declaration)
  if (!body) return bindings

  collectVisualSignatureBindingsFromStatements(body.statements, bindings)
  return bindings
}

function topLevelVisualSignatureBindings(sourceFile: ts.SourceFile): Map<string, ReactVisualSignatureBinding> {
  const bindings = new Map<string, ReactVisualSignatureBinding>()
  collectVisualSignatureBindingsFromStatements(sourceFile.statements, bindings)
  return bindings
}

function collectVisualSignatureBindingsFromStatements(
  statements: ts.NodeArray<ts.Statement>,
  bindings: Map<string, ReactVisualSignatureBinding>,
): void {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          bindings.set(declaration.name.text, { signatureNode: declaration.initializer })
        }
      }
      continue
    }

    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      bindings.set(statement.name.text, { signatureNode: statement })
    }
  }
}

function frameAssignmentExpressionsForComponent(
  sourceFile: ts.SourceFile,
  localName: string,
): ReactFrameAssignmentExpression[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement)) return []
    const expression = statement.expression
    if (!ts.isBinaryExpression(expression)) return []
    if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return []
    if (!ts.isPropertyAccessExpression(expression.left) || expression.left.name.text !== "frames") return []
    if (!ts.isIdentifier(expression.left.expression) || expression.left.expression.text !== localName) return []
    const framesExpression = unwrapExpression(expression.right)
    if (!ts.isObjectLiteralExpression(framesExpression)) return []
    return framesExpression.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) return []
      const name = staticPropertyNameText(property.name)
      return name ? [{ name, expression: property.initializer }] : []
    })
  })
}

function staticPropertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function normalizedPrintedNode(node: ts.Node, context: ReactVisualSignatureContext): string {
  return context.printer.printNode(ts.EmitHint.Unspecified, node, context.sourceFile).replace(/\s+/g, " ").trim()
}

function hashReactVisualSignature(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function functionLikeBody(node: ts.Node): ts.ConciseBody | ts.Block | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
    node.body
  ) {
    return node.body
  }

  if (ts.isVariableDeclaration(node) && node.initializer) {
    const initializer = unwrapExpression(node.initializer)
    if ((ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) && initializer.body) return initializer.body
  }

  return undefined
}

function isFunctionLikeNode(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
}

function createReactProjectModuleResolution(cwd: string, tsconfigPath: string | undefined): ReactProjectModuleResolution {
  if (!tsconfigPath) return { compilerOptions: {}, cwd, host: ts.sys }

  const configPath = resolve(cwd, tsconfigPath)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) return { compilerOptions: {}, cwd, host: ts.sys }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath))
  return { compilerOptions: parsed.options, cwd, host: ts.sys }
}

function readExportedReactComponents(sourceFile: ts.SourceFile): ExportedComponent[] {
  const components: ExportedComponent[] = []
  const frameTargets = readFrameTargetNames(sourceFile)

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      components.push({ exportName: "default", componentName: statement.name.text, localName: statement.name.text })
      continue
    }

    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      components.push({ exportName: statement.name.text, componentName: statement.name.text, localName: statement.name.text })
      continue
    }

    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        if (!frameTargets.has(declaration.name.text)) continue
        if (!isFunctionLikeInitializer(declaration.initializer)) continue

        components.push({
          exportName: declaration.name.text,
          componentName: declaration.name.text,
          localName: declaration.name.text,
        })
      }
      continue
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      components.push({ exportName: "default", componentName: statement.expression.text, localName: statement.expression.text })
      continue
    }

    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text
        if (!frameTargets.has(localName)) continue
        if (components.some((component) => component.localName === localName)) continue
        const declaration = findReactComponentDeclaration(sourceFile, localName)
        if (!declaration) continue

        components.push({
          exportName: element.name.text,
          componentName: localName,
          localName,
        })
      }
    }
  }

  return components
}

function readFrameTargetNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) continue
    const expression = statement.expression
    if (!ts.isBinaryExpression(expression)) continue
    if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue
    if (!ts.isPropertyAccessExpression(expression.left) || expression.left.name.text !== "frames") continue
    if (ts.isIdentifier(expression.left.expression)) {
      names.add(expression.left.expression.text)
    }
  }

  return names
}

function dependencyCoordinatesForReactComponent(
  context: ReactProjectIndexFileContext,
  component: ExportedComponent,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  fileContextsByFilePath: Map<string, ReactProjectIndexFileContext>,
  moduleResolution: ReactProjectModuleResolution,
): string[] {
  const declaration = findReactComponentDeclaration(context.sourceFile, component.localName)
  if (!declaration) return []

  const localBindings = localReactComponentBindings(context.filePath, context.exportedComponents)
  const importBindings = reactComponentImportBindingsForFile(
    context.filePath,
    context.sourceFile,
    exportedComponentsByFilePath,
    fileContextsByFilePath,
    moduleResolution,
  )
  const localAliases = localComponentAliasBindingsForDeclaration(declaration)
  const ownCoordinate = `${context.filePath}#${component.exportName}`
  const dependencies: string[] = []
  const seen = new Set<string>()

  const addDependency = (coordinate: string | undefined) => {
    if (!coordinate || coordinate === ownCoordinate || seen.has(coordinate)) return
    seen.add(coordinate)
    dependencies.push(coordinate)
  }

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      addDependency(componentCoordinateForJsxTag(node.tagName, importBindings, localBindings, localAliases))
    }

    ts.forEachChild(node, visit)
  }

  visit(declaration)
  return dependencies
}

function findReactComponentDeclaration(sourceFile: ts.SourceFile, localName: string): ts.Node | undefined {
  for (const statement of sourceFile.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === localName) {
      return statement
    }

    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === localName) {
        return declaration.initializer ?? declaration
      }
    }
  }

  return undefined
}

function isFunctionLikeInitializer(initializer: ts.Expression | undefined): boolean {
  if (!initializer) return false
  const expression = unwrapExpression(initializer)
  return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return unwrapExpression(expression.expression)
  }

  return expression
}

function localReactComponentBindings(filePath: string, exportedComponents: ExportedComponent[]): Map<string, string> {
  return new Map(exportedComponents.map((component) => [component.localName, `${filePath}#${component.exportName}`] as const))
}

function localComponentAliasBindingsForDeclaration(declaration: ts.Node): Map<string, string> {
  const aliases = new Map<string, string>()
  const body = functionLikeBlockBody(declaration)
  if (!body) return aliases

  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const variableDeclaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(variableDeclaration.name) || !variableDeclaration.initializer) continue

      const initializer = unwrapExpression(variableDeclaration.initializer)
      if (ts.isIdentifier(initializer)) {
        aliases.set(variableDeclaration.name.text, initializer.text)
      }
    }
  }

  return aliases
}

function functionLikeBlockBody(node: ts.Node): ts.Block | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
    node.body &&
    ts.isBlock(node.body)
  ) {
    return node.body
  }

  return undefined
}

function reactComponentImportBindingsForFile(
  filePath: string,
  sourceFile: ts.SourceFile,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  fileContextsByFilePath: Map<string, ReactProjectIndexFileContext>,
  moduleResolution: ReactProjectModuleResolution,
): ReactComponentImportBindings {
  const bindings: ReactComponentImportBindings = {
    names: new Map(),
    namespaces: new Map(),
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetFilePath = resolveImportedRunelightReactFilePath(
      filePath,
      statement.moduleSpecifier.text,
      exportedComponentsByFilePath,
      moduleResolution,
    )
    if (!targetFilePath) continue

    const targetContext = fileContextsByFilePath.get(targetFilePath)
    const exportsByName = componentImportCoordinatesByExportName(
      targetFilePath,
      targetContext?.sourceFile,
      exportedComponentsByFilePath.get(targetFilePath) ?? [],
    )
    const importClause = statement.importClause

    if (importClause.name) {
      const defaultCoordinate = exportsByName.get("default")
      if (defaultCoordinate) bindings.names.set(importClause.name.text, defaultCoordinate)
    }

    if (!importClause.namedBindings) continue
    if (ts.isNamedImports(importClause.namedBindings)) {
      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text
        const coordinate = exportsByName.get(importedName)
        if (coordinate) bindings.names.set(element.name.text, coordinate)
      }
    } else if (ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.namespaces.set(importClause.namedBindings.name.text, exportsByName)
    }
  }

  return bindings
}

function componentImportCoordinatesByExportName(
  filePath: string,
  sourceFile: ts.SourceFile | undefined,
  exportedComponents: ExportedComponent[],
): Map<string, string> {
  const coordinatesByExportName = new Map(
    exportedComponents.map((component) => [component.exportName, `${filePath}#${component.exportName}`] as const),
  )
  if (!sourceFile) return coordinatesByExportName

  const coordinatesByLocalName = new Map(
    exportedComponents.map((component) => [component.localName, `${filePath}#${component.exportName}`] as const),
  )

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue
    if (statement.moduleSpecifier) continue

    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text ?? element.name.text
      const coordinate = coordinatesByLocalName.get(localName)
      if (coordinate) coordinatesByExportName.set(element.name.text, coordinate)
    }
  }

  return coordinatesByExportName
}

function resolveImportedRunelightReactFilePath(
  filePath: string,
  moduleSpecifier: string,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  moduleResolution: ReactProjectModuleResolution,
): string | undefined {
  const containingFilePath = resolve(moduleResolution.cwd, filePath)
  const resolvedModule = ts.resolveModuleName(
    moduleSpecifier,
    containingFilePath,
    moduleResolution.compilerOptions,
    moduleResolution.host,
  ).resolvedModule

  if (resolvedModule) {
    const resolvedProjectPath = normalizeProjectPath(relative(moduleResolution.cwd, resolvedModule.resolvedFileName))
    if (exportedComponentsByFilePath.has(resolvedProjectPath)) return resolvedProjectPath
  }

  if (!moduleSpecifier.startsWith(".")) return undefined

  const basePath = normalizeProjectPath(join(dirname(filePath), moduleSpecifier))
  for (const candidate of importedRunelightReactFilePathCandidates(basePath)) {
    if (exportedComponentsByFilePath.has(candidate)) return candidate
  }
  return undefined
}

function importedRunelightReactFilePathCandidates(basePath: string): string[] {
  const candidates = [
    basePath,
    basePath.replace(/\.jsx?$/, ".tsx"),
    `${basePath}.tsx`,
    `${basePath}.g.tsx`,
    `${basePath}/index.g.tsx`,
  ]

  return [...new Set(candidates.filter((candidate) => candidate.endsWith(".g.tsx")))]
}

function componentCoordinateForJsxTag(
  tagName: ts.JsxTagNameExpression,
  importBindings: ReactComponentImportBindings,
  localBindings: Map<string, string>,
  localAliases: Map<string, string>,
): string | undefined {
  if (ts.isIdentifier(tagName)) {
    return componentCoordinateForIdentifier(tagName.text, importBindings, localBindings, localAliases)
  }

  if (ts.isPropertyAccessExpression(tagName) && ts.isIdentifier(tagName.expression)) {
    return importBindings.namespaces.get(tagName.expression.text)?.get(tagName.name.text)
  }

  return undefined
}

function componentCoordinateForIdentifier(
  name: string,
  importBindings: ReactComponentImportBindings,
  localBindings: Map<string, string>,
  localAliases: Map<string, string>,
): string | undefined {
  let currentName = name
  const visited = new Set<string>()

  while (!visited.has(currentName)) {
    visited.add(currentName)

    const aliasTarget = localAliases.get(currentName)
    if (aliasTarget) {
      currentName = aliasTarget
      continue
    }

    return importBindings.names.get(currentName) ?? localBindings.get(currentName)
  }

  return undefined
}

function normalizeProjectPath(filePath: string): string {
  return filePath.split(sep).join("/")
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
}
