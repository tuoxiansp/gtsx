import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import ts from "typescript"

import { analyzeEntry, type GTSXAnalysisResult, type GTSXDiagnostic } from "./analyzer.js"
import { loadGTSXConfig } from "./config.js"
import { discoverGTSXProgramFiles, findNearestTSConfig } from "./project-scope.js"

export type StudioManifestRouteConfig = {
  preview: string
  studio: string
  manifest: string
}

export type StudioManifestPreviewConfig = {
  urlTemplate: string
  allUrlTemplate?: string
}

export type StudioManifestComponent = {
  coordinate: string
  filePath: string
  exportName: string
  componentName: string
  mode: GTSXAnalysisResult["mode"]
  cases: GTSXAnalysisResult["cases"]
  providers: GTSXAnalysisResult["providers"]
  diagnostics: GTSXDiagnostic[]
}

export type StudioManifestFile = {
  path: string
  groupId: string
  components: StudioManifestComponent[]
  diagnostics: GTSXDiagnostic[]
}

export type StudioManifest = {
  version: 1
  routes: StudioManifestRouteConfig
  preview: StudioManifestPreviewConfig
  files: StudioManifestFile[]
  diagnostics: GTSXDiagnostic[]
}

export type BuildStudioManifestOptions = {
  cwd: string
  projectRoot?: string
  tsconfigPath?: string
  routes?: Partial<StudioManifestRouteConfig>
  preview?: Partial<StudioManifestPreviewConfig>
}

export type StudioManifestProviderCandidate = {
  kind: "server-route" | "virtual-module"
  manifest?: StudioManifest
}

export type StudioManifestProviderSelection = {
  kind?: StudioManifestProviderCandidate["kind"]
  manifest?: StudioManifest
  diagnostics: GTSXDiagnostic[]
}

type ExportedComponent = {
  exportName: string
  componentName: string
}

const IGNORED_DISCOVERY_DIRS = new Set(["node_modules", "dist", ".vite", ".next", ".git"])

const DEFAULT_ROUTES: StudioManifestRouteConfig = {
  preview: "/gtsx",
  studio: "/gtsx/studio",
  manifest: "/gtsx/studio/manifest",
}

const DEFAULT_PREVIEW: StudioManifestPreviewConfig = {
  urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
  allUrlTemplate: "/gtsx?entry={entry}{gcase}",
}

export function buildStudioManifest(options: BuildStudioManifestOptions): StudioManifest {
  const projectRoot = options.projectRoot ?? "."
  const files = discoverGTSXFiles(options.cwd, projectRoot, options.tsconfigPath).map((filePath) =>
    buildManifestFile(options.cwd, filePath),
  )
  const configuredPreview = readConfiguredPreview(options.cwd)
  const diagnostics = [...files.flatMap((file) => file.diagnostics), ...configuredPreview.diagnostics]

  return {
    version: 1,
    routes: { ...DEFAULT_ROUTES, ...options.routes },
    preview: { ...DEFAULT_PREVIEW, ...configuredPreview.preview, ...options.preview },
    files,
    diagnostics,
  }
}

export function selectStudioManifestProvider(
  candidates: StudioManifestProviderCandidate[],
): StudioManifestProviderSelection {
  const serverRoute = candidates.find((candidate) => candidate.kind === "server-route" && candidate.manifest)
  if (serverRoute?.manifest) {
    return { kind: "server-route", manifest: serverRoute.manifest, diagnostics: [] }
  }

  const virtualModule = candidates.find((candidate) => candidate.kind === "virtual-module" && candidate.manifest)
  if (virtualModule?.manifest) {
    return { kind: "virtual-module", manifest: virtualModule.manifest, diagnostics: [] }
  }

  return {
    diagnostics: [
      {
        stage: "adapter-configuration",
        code: "missing-studio-manifest-provider",
        message:
          "No Studio manifest provider is available. Create a /gtsx/studio/manifest server route or enable the adapter virtual:gtsx/studio-manifest fallback.",
      },
    ],
  }
}

function buildManifestFile(cwd: string, filePath: string): StudioManifestFile {
  const exportedComponents = readExportedComponents(resolve(cwd, filePath))
  const components = exportedComponents.map((component) => buildManifestComponent(cwd, filePath, component))
  const diagnostics = components.flatMap((component) => component.diagnostics)

  return {
    path: filePath,
    groupId: `file:${filePath}`,
    components,
    diagnostics,
  }
}

function buildManifestComponent(cwd: string, filePath: string, component: ExportedComponent): StudioManifestComponent {
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

function readConfiguredPreview(cwd: string): { preview: Partial<StudioManifestPreviewConfig>; diagnostics: GTSXDiagnostic[] } {
  if (!hasGTSXConfig(cwd)) return { preview: {}, diagnostics: [] }

  const config = loadGTSXConfig(cwd)
  if (!config.config) return { preview: {}, diagnostics: config.diagnostics }

  return {
    preview: {
      ...(config.config.preview.url ? { urlTemplate: config.config.preview.url } : {}),
      ...(config.config.preview.allUrl ? { allUrlTemplate: config.config.preview.allUrl } : {}),
    },
    diagnostics: [],
  }
}

function hasGTSXConfig(cwd: string): boolean {
  return ["gtsx.config.ts", "gtsx.config.js", "gtsx.config.cjs"].some((fileName) => existsSync(join(cwd, fileName)))
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
