import { createHash } from "node:crypto"
import { readdirSync, readFileSync, type Dirent } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import ts from "typescript"

import { analyzeEntry, createRunelightAnalysisCache, type RunelightAnalysisResult, type RunelightDiagnostic } from "./analyzer.js"
import { discoverRunelightProgramFiles, findNearestTSConfig } from "./project-scope.js"

export type RunelightProjectIndexComponent = {
  coordinate: string
  filePath: string
  sourceHash: string
  exportName: string
  componentName: string
  mode: RunelightAnalysisResult["mode"]
  frames: RunelightAnalysisResult["frames"]
  providers: RunelightAnalysisResult["providers"]
  dependencies?: string[]
  diagnostics: RunelightDiagnostic[]
}

export type RunelightProjectIndexFile = {
  path: string
  sourceHash: string
  components: RunelightProjectIndexComponent[]
  diagnostics: RunelightDiagnostic[]
}

export type RunelightProjectIndex = {
  version: 1
  files: RunelightProjectIndexFile[]
  diagnostics: RunelightDiagnostic[]
}

export type BuildRunelightProjectIndexOptions = {
  additionalRoots?: string[]
  cwd: string
  sourceRoot?: string
  tsconfigPath?: string
}

export type RunelightProjectIndexCacheOptions = {
  ttlMs?: number
}

type ExportedComponent = {
  exportName: string
  componentName: string
  localName: string
}

type ProjectIndexFileContext = {
  filePath: string
  sourceHash: string
  sourceFile: ts.SourceFile
  exportedComponents: ExportedComponent[]
}

type ComponentImportBindings = {
  names: Map<string, string>
  namespaces: Map<string, Map<string, string>>
}

type ProjectModuleResolution = {
  compilerOptions: ts.CompilerOptions
  cwd: string
  host: ts.ModuleResolutionHost
}

const IGNORED_DISCOVERY_DIRS = new Set(["node_modules", "dist", ".vite", ".next", ".git", ".runelight"])
const DEFAULT_PROJECT_INDEX_CACHE_TTL_MS = 1000
const globalProjectIndexCacheSymbol = Symbol.for("runelight.project-index.cache")

type ProjectIndexCacheEntry = {
  cachedAt: number
  index: RunelightProjectIndex
}

type GlobalProjectIndexCache = typeof globalThis & {
  [globalProjectIndexCacheSymbol]?: Map<string, ProjectIndexCacheEntry>
}

export function buildRunelightProjectIndex(options: BuildRunelightProjectIndexOptions): RunelightProjectIndex {
  const sourceRoot = options.sourceRoot ?? "."
  const selectedTSConfigPath = options.tsconfigPath ?? findNearestTSConfig(options.cwd)
  const moduleResolution = createProjectModuleResolution(options.cwd, selectedTSConfigPath)
  const fileContexts = discoverRunelightFiles(options.cwd, sourceRoot, selectedTSConfigPath, options.additionalRoots).map((filePath) =>
    buildProjectIndexFileContext(options.cwd, filePath),
  )
  const fileContextsByFilePath = new Map(fileContexts.map((context) => [context.filePath, context] as const))
  const analysisCache = createRunelightAnalysisCache(
    new Map(fileContexts.map((context) => [resolve(options.cwd, context.filePath), context.sourceFile] as const)),
  )
  const exportedComponentsByFilePath = new Map(
    fileContexts.map((context) => [context.filePath, context.exportedComponents] as const),
  )
  const files = fileContexts.map((context) =>
    buildProjectIndexFile(options.cwd, context, exportedComponentsByFilePath, fileContextsByFilePath, moduleResolution, analysisCache),
  )

  return {
    version: 1,
    files,
    diagnostics: files.flatMap((file) => file.diagnostics),
  }
}

export function createCachedRunelightProjectIndexBuilder(cacheOptions: RunelightProjectIndexCacheOptions = {}) {
  const ttlMs = cacheOptions.ttlMs ?? DEFAULT_PROJECT_INDEX_CACHE_TTL_MS
  const cache = globalProjectIndexCache()

  return (options: BuildRunelightProjectIndexOptions): RunelightProjectIndex => {
    const key = projectIndexCacheKey(options)
    const now = Date.now()
    const cached = cache.get(key)
    if (cached && now - cached.cachedAt <= ttlMs) {
      return cached.index
    }

    const index = buildRunelightProjectIndex(options)
    cache.set(key, { cachedAt: now, index })
    return index
  }
}

function globalProjectIndexCache(): Map<string, ProjectIndexCacheEntry> {
  const globalCache = globalThis as GlobalProjectIndexCache
  globalCache[globalProjectIndexCacheSymbol] ??= new Map()
  return globalCache[globalProjectIndexCacheSymbol]
}

function buildProjectIndexFileContext(cwd: string, filePath: string): ProjectIndexFileContext {
  const sourceText = readFileSync(resolve(cwd, filePath), "utf8")
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return {
    filePath,
    sourceHash: hashSourceText(sourceText),
    sourceFile,
    exportedComponents: readExportedComponents(sourceFile),
  }
}

function projectIndexCacheKey(options: BuildRunelightProjectIndexOptions): string {
  return JSON.stringify({
    cwd: resolve(options.cwd),
    additionalRoots: options.additionalRoots?.map((root) => normalizeDiscoveryRoot(root)).sort(),
    sourceRoot: options.sourceRoot ?? ".",
    tsconfigPath: options.tsconfigPath ? resolve(options.cwd, options.tsconfigPath) : undefined,
  })
}

function buildProjectIndexFile(
  cwd: string,
  context: ProjectIndexFileContext,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  fileContextsByFilePath: Map<string, ProjectIndexFileContext>,
  moduleResolution: ProjectModuleResolution,
  analysisCache: ReturnType<typeof createRunelightAnalysisCache>,
): RunelightProjectIndexFile {
  const components = context.exportedComponents.map((component) =>
    buildProjectIndexComponent(
      cwd,
      context.filePath,
      context.sourceHash,
      component,
      dependencyCoordinatesForComponent(context, component, exportedComponentsByFilePath, fileContextsByFilePath, moduleResolution),
      analysisCache,
    ),
  )
  const fileDiagnostics: RunelightDiagnostic[] =
    context.exportedComponents.length === 0
      ? [
          {
            stage: "contract-extraction",
            code: "missing-component-export",
            message: "A .g.tsx file must export at least one React component.",
            file: context.filePath,
          },
        ]
      : []

  return {
    path: context.filePath,
    sourceHash: context.sourceHash,
    components,
    diagnostics: [...fileDiagnostics, ...components.flatMap((component) => component.diagnostics)],
  }
}

function buildProjectIndexComponent(
  cwd: string,
  filePath: string,
  sourceHash: string,
  component: ExportedComponent,
  dependencies: string[],
  analysisCache: ReturnType<typeof createRunelightAnalysisCache>,
): RunelightProjectIndexComponent {
  const coordinate = `${filePath}#${component.exportName}`
  const analysis = analyzeEntry({ cache: analysisCache, cwd, entry: coordinate })

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
    diagnostics: analysis.diagnostics,
  }
}

function discoverRunelightFiles(cwd: string, sourceRoot: string, tsconfigPath?: string, additionalRoots: string[] = []): string[] {
  const selectedTSConfigPath = tsconfigPath ?? findNearestTSConfig(cwd)
  const files = new Set<string>()

  if (selectedTSConfigPath) {
    for (const filePath of discoverRunelightProgramFiles({ cwd, root: sourceRoot, tsconfigPath: selectedTSConfigPath })) {
      files.add(filePath)
    }
  } else {
    collectRunelightFiles(resolve(cwd, sourceRoot), files, cwd)
  }

  for (const root of additionalRoots) {
    collectRunelightFiles(resolve(cwd, root), files, cwd)
  }

  return [...files].sort((left, right) => left.localeCompare(right))
}

function collectRunelightFiles(root: string, files: Set<string>, cwd: string) {
  walk(root)

  function walk(directory: string) {
    let dirents: Dirent[]
    try {
      dirents = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        if (!IGNORED_DISCOVERY_DIRS.has(dirent.name)) {
          walk(join(directory, dirent.name))
        }
        continue
      }

      if (dirent.isFile() && dirent.name.endsWith(".g.tsx")) {
        files.add(relative(cwd, join(directory, dirent.name)).split(sep).join("/"))
      }
    }
  }
}

function normalizeDiscoveryRoot(root: string): string {
  return root.replaceAll("\\", "/").replace(/\/+$/, "") || "."
}

function hashSourceText(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex")
}

function createProjectModuleResolution(cwd: string, tsconfigPath: string | undefined): ProjectModuleResolution {
  if (!tsconfigPath) return { compilerOptions: {}, cwd, host: ts.sys }

  const configPath = resolve(cwd, tsconfigPath)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) return { compilerOptions: {}, cwd, host: ts.sys }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath))
  return { compilerOptions: parsed.options, cwd, host: ts.sys }
}

function readExportedComponents(sourceFile: ts.SourceFile): ExportedComponent[] {
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
        const declaration = findComponentDeclaration(sourceFile, localName)
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

function dependencyCoordinatesForComponent(
  context: ProjectIndexFileContext,
  component: ExportedComponent,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  fileContextsByFilePath: Map<string, ProjectIndexFileContext>,
  moduleResolution: ProjectModuleResolution,
): string[] {
  const declaration = findComponentDeclaration(context.sourceFile, component.localName)
  if (!declaration) return []

  const localBindings = localComponentBindings(context.filePath, context.exportedComponents)
  const importBindings = componentImportBindingsForFile(
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

function findComponentDeclaration(sourceFile: ts.SourceFile, localName: string): ts.Node | undefined {
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

function localComponentBindings(filePath: string, exportedComponents: ExportedComponent[]): Map<string, string> {
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

function componentImportBindingsForFile(
  filePath: string,
  sourceFile: ts.SourceFile,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  fileContextsByFilePath: Map<string, ProjectIndexFileContext>,
  moduleResolution: ProjectModuleResolution,
): ComponentImportBindings {
  const bindings: ComponentImportBindings = {
    names: new Map(),
    namespaces: new Map(),
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue

    const targetFilePath = resolveImportedRunelightFilePath(
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

function resolveImportedRunelightFilePath(
  filePath: string,
  moduleSpecifier: string,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  moduleResolution: ProjectModuleResolution,
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
  for (const candidate of importedRunelightFilePathCandidates(basePath)) {
    if (exportedComponentsByFilePath.has(candidate)) return candidate
  }
  return undefined
}

function importedRunelightFilePathCandidates(basePath: string): string[] {
  const candidates = [
    basePath,
    basePath.replace(/\.jsx?$/, ".tsx"),
    `${basePath}.tsx`,
    `${basePath}.g.tsx`,
    `${basePath}/index.g.tsx`,
  ]

  return [...new Set(candidates.filter((candidate) => candidate.endsWith(".g.tsx")))]
}

function normalizeProjectPath(filePath: string): string {
  return filePath.split(sep).join("/")
}

function componentCoordinateForJsxTag(
  tagName: ts.JsxTagNameExpression,
  importBindings: ComponentImportBindings,
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
  importBindings: ComponentImportBindings,
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

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
}
