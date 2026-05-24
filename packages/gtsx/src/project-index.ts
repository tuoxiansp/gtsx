import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
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

type ExportedComponent = {
  exportName: string
  componentName: string
}

const IGNORED_DISCOVERY_DIRS = new Set(["node_modules", "dist", ".vite", ".next", ".git"])

export function buildGTSXProjectIndex(options: BuildGTSXProjectIndexOptions): GTSXProjectIndex {
  const projectRoot = options.projectRoot ?? "."
  const files = discoverGTSXFiles(options.cwd, projectRoot, options.tsconfigPath).map((filePath) =>
    buildProjectIndexFile(options.cwd, filePath),
  )

  return {
    version: 1,
    files,
    diagnostics: files.flatMap((file) => file.diagnostics),
  }
}

function buildProjectIndexFile(cwd: string, filePath: string): GTSXProjectIndexFile {
  const exportedComponents = readExportedComponents(resolve(cwd, filePath))
  const components = exportedComponents.map((component) => buildProjectIndexComponent(cwd, filePath, component))

  return {
    path: filePath,
    components,
    diagnostics: components.flatMap((component) => component.diagnostics),
  }
}

function buildProjectIndexComponent(cwd: string, filePath: string, component: ExportedComponent): GTSXProjectIndexComponent {
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

function readExportedComponents(filePath: string): ExportedComponent[] {
  const sourceText = readFileSync(filePath, "utf8")
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const providerCaseTargets = getProviderCaseTargets(sourceFile)
  const components: ExportedComponent[] = []

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      components.push({ exportName: "default", componentName: statement.name.text })
      continue
    }

    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      components.push({ exportName: statement.name.text, componentName: statement.name.text })
      continue
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      components.push({ exportName: "default", componentName: statement.expression.text })
    }
  }

  return components.filter((component) => !providerCaseTargets.has(component.componentName))
}

function getProviderCaseTargets(sourceFile: ts.SourceFile): Set<string> {
  const providerNames = new Set<string>()

  for (const statement of sourceFile.statements) {
    const targetName = getCasesAssignmentTargetName(statement)
    if (targetName && looksLikeProviderCases(targetName, statement)) {
      providerNames.add(targetName)
    }
  }

  return providerNames
}

function getCasesAssignmentTargetName(statement: ts.Statement): string | undefined {
  if (!ts.isExpressionStatement(statement)) return undefined

  const expression = statement.expression
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return undefined
  }

  if (!ts.isPropertyAccessExpression(expression.left) || expression.left.name.text !== "cases") {
    return undefined
  }

  if (!ts.isIdentifier(expression.left.expression)) return undefined
  return expression.left.expression.text
}

function looksLikeProviderCases(targetName: string, statement: ts.Statement): boolean {
  return targetName.endsWith("Provider") || statement.getText().includes("GProviderCases")
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
}
