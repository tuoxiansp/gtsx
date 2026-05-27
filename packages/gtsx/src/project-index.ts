import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import ts from "typescript"

import { analyzeEntry, type GTSXAnalysisResult, type GTSXDiagnostic } from "./analyzer.js"
import { discoverGTSXProgramFiles, findNearestTSConfig } from "./project-scope.js"

export type GTSXProjectIndexComponent = {
  coordinate: string
  filePath: string
  exportName: string
  componentName: string
  mode: GTSXAnalysisResult["mode"]
  cases: GTSXAnalysisResult["cases"]
  providers: GTSXAnalysisResult["providers"]
  dependencies?: string[]
  diagnostics: GTSXDiagnostic[]
}

export type GTSXProjectIndexFile = {
  path: string
  components: GTSXProjectIndexComponent[]
  diagnostics: GTSXDiagnostic[]
}

export type GTSXProjectIndex = {
  version: 1
  files: GTSXProjectIndexFile[]
  diagnostics: GTSXDiagnostic[]
}

export type BuildGTSXProjectIndexOptions = {
  cwd: string
  projectRoot?: string
  tsconfigPath?: string
}

export type GTSXProjectIndexCacheOptions = {
  ttlMs?: number
}

type ExportedComponent = {
  exportName: string
  componentName: string
  localName: string
}

type ProjectIndexFileContext = {
  filePath: string
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

const IGNORED_DISCOVERY_DIRS = new Set(["node_modules", "dist", ".vite", ".next", ".git"])
const DEFAULT_PROJECT_INDEX_CACHE_TTL_MS = 1000

export function buildGTSXProjectIndex(options: BuildGTSXProjectIndexOptions): GTSXProjectIndex {
  const projectRoot = options.projectRoot ?? "."
  const selectedTSConfigPath = options.tsconfigPath ?? findNearestTSConfig(options.cwd)
  const moduleResolution = createProjectModuleResolution(options.cwd, selectedTSConfigPath)
  const fileContexts = discoverGTSXFiles(options.cwd, projectRoot, selectedTSConfigPath).map((filePath) =>
    buildProjectIndexFileContext(options.cwd, filePath),
  )
  const fileContextsByFilePath = new Map(fileContexts.map((context) => [context.filePath, context] as const))
  const exportedComponentsByFilePath = new Map(
    fileContexts.map((context) => [context.filePath, context.exportedComponents] as const),
  )
  const files = fileContexts.map((context) =>
    buildProjectIndexFile(options.cwd, context, exportedComponentsByFilePath, fileContextsByFilePath, moduleResolution),
  )

  return {
    version: 1,
    files,
    diagnostics: files.flatMap((file) => file.diagnostics),
  }
}

export function createCachedGTSXProjectIndexBuilder(cacheOptions: GTSXProjectIndexCacheOptions = {}) {
  const ttlMs = cacheOptions.ttlMs ?? DEFAULT_PROJECT_INDEX_CACHE_TTL_MS
  let cachedKey: string | undefined
  let cachedAt = 0
  let cachedIndex: GTSXProjectIndex | undefined

  return (options: BuildGTSXProjectIndexOptions): GTSXProjectIndex => {
    const key = projectIndexCacheKey(options)
    const now = Date.now()
    if (cachedIndex && cachedKey === key && now - cachedAt <= ttlMs) {
      return cachedIndex
    }

    cachedKey = key
    cachedAt = now
    cachedIndex = buildGTSXProjectIndex(options)
    return cachedIndex
  }
}

function buildProjectIndexFileContext(cwd: string, filePath: string): ProjectIndexFileContext {
  const sourceFile = readGTSXSourceFile(resolve(cwd, filePath))
  return {
    filePath,
    sourceFile,
    exportedComponents: readExportedComponents(sourceFile),
  }
}

function projectIndexCacheKey(options: BuildGTSXProjectIndexOptions): string {
  return JSON.stringify({
    cwd: resolve(options.cwd),
    projectRoot: options.projectRoot ?? ".",
    tsconfigPath: options.tsconfigPath ? resolve(options.cwd, options.tsconfigPath) : undefined,
  })
}

function buildProjectIndexFile(
  cwd: string,
  context: ProjectIndexFileContext,
  exportedComponentsByFilePath: Map<string, ExportedComponent[]>,
  fileContextsByFilePath: Map<string, ProjectIndexFileContext>,
  moduleResolution: ProjectModuleResolution,
): GTSXProjectIndexFile {
  const components = context.exportedComponents.map((component) =>
    buildProjectIndexComponent(
      cwd,
      context.filePath,
      component,
      dependencyCoordinatesForComponent(context, component, exportedComponentsByFilePath, fileContextsByFilePath, moduleResolution),
    ),
  )
  const fileDiagnostics: GTSXDiagnostic[] =
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
    components,
    diagnostics: [...fileDiagnostics, ...components.flatMap((component) => component.diagnostics)],
  }
}

function buildProjectIndexComponent(
  cwd: string,
  filePath: string,
  component: ExportedComponent,
  dependencies: string[],
): GTSXProjectIndexComponent {
  const coordinate = `${filePath}#${component.exportName}`
  const analysis = analyzeEntry({ cwd, entry: coordinate })

  return {
    coordinate,
    filePath,
    exportName: component.exportName,
    componentName: component.componentName,
    mode: analysis.mode,
    cases: analysis.cases,
    providers: analysis.providers,
    ...(dependencies.length > 0 ? { dependencies } : {}),
    diagnostics: analysis.diagnostics,
  }
}

function discoverGTSXFiles(cwd: string, projectRoot: string, tsconfigPath?: string): string[] {
  const selectedTSConfigPath = tsconfigPath ?? findNearestTSConfig(cwd)
  if (selectedTSConfigPath) {
    return discoverGTSXProgramFiles({ cwd, root: projectRoot, tsconfigPath: selectedTSConfigPath })
  }

  const root = resolve(cwd, projectRoot)
  const files: string[] = []

  walk(root)
  return files.map((entryPath) => relative(cwd, entryPath).split(sep).join("/")).sort((left, right) => left.localeCompare(right))

  function walk(directory: string) {
    for (const dirent of readdirSync(directory, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        if (!IGNORED_DISCOVERY_DIRS.has(dirent.name)) {
          walk(join(directory, dirent.name))
        }
        continue
      }

      if (dirent.isFile() && dirent.name.endsWith(".g.tsx")) {
        files.push(join(directory, dirent.name))
      }
    }
  }
}

function readGTSXSourceFile(filePath: string): ts.SourceFile {
  const sourceText = readFileSync(filePath, "utf8")
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
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

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      components.push({ exportName: "default", componentName: statement.expression.text, localName: statement.expression.text })
    }
  }

  return components
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
      addDependency(componentCoordinateForJsxTag(node.tagName, importBindings, localBindings))
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

function localComponentBindings(filePath: string, exportedComponents: ExportedComponent[]): Map<string, string> {
  return new Map(exportedComponents.map((component) => [component.localName, `${filePath}#${component.exportName}`] as const))
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

    const targetFilePath = resolveImportedGTSXFilePath(
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

function resolveImportedGTSXFilePath(
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
  for (const candidate of importedGTSXFilePathCandidates(basePath)) {
    if (exportedComponentsByFilePath.has(candidate)) return candidate
  }
  return undefined
}

function importedGTSXFilePathCandidates(basePath: string): string[] {
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
): string | undefined {
  if (ts.isIdentifier(tagName)) {
    return importBindings.names.get(tagName.text) ?? localBindings.get(tagName.text)
  }

  if (ts.isPropertyAccessExpression(tagName) && ts.isIdentifier(tagName.expression)) {
    return importBindings.namespaces.get(tagName.expression.text)?.get(tagName.name.text)
  }

  return undefined
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
}
