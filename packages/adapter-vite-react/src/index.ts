import { relative } from "node:path"
import ts from "typescript"
import { buildGTSXProjectIndex } from "gtsx/project-index"

type ViteLikeConfig = {
  root: string
}

type TransformResult = {
  code: string
  map: null
}

type GTSXViteReactOptions = {
  projectRoot?: string
  root?: string
  tsconfigPath?: string
}

type Replacement = {
  start: number
  end: number
  text: string
}

type Insertion = {
  index: number
  text: string
}

export function gtsxViteReact(options: GTSXViteReactOptions = {}) {
  let root = options.root ?? process.cwd()
  const virtualProjectIndexId = "virtual:gtsx/project-index"
  const resolvedVirtualProjectIndexId = `\0${virtualProjectIndexId}`

  return {
    name: "@gtsx/adapter-vite-react",
    enforce: "pre" as const,
    config() {
      return {
        optimizeDeps: {
          exclude: ["@gtsx/adapter-vite-react", "typescript", virtualProjectIndexId],
        },
      }
    },
    configResolved(config: ViteLikeConfig) {
      root = options.root ?? config.root
    },
    resolveId(id: string) {
      if (id === virtualProjectIndexId) return resolvedVirtualProjectIndexId
      return null
    },
    load(id: string): TransformResult | null {
      if (id !== resolvedVirtualProjectIndexId) return null
      const projectIndex = buildGTSXProjectIndex({
        cwd: root,
        projectRoot: options.projectRoot ?? "src",
        tsconfigPath: options.tsconfigPath,
      })
      return {
        code: `export default ${JSON.stringify(projectIndex)}\n`,
        map: null,
      }
    },
    transform(code: string, id: string): TransformResult | null {
      const filePath = cleanViteId(id)
      if (!filePath.endsWith(".g.tsx")) return null

      const transformed = transformGTSXComponentBoundaries({
        code,
        filePath,
        root,
      })

      return transformed === code ? null : { code: transformed, map: null }
    },
  }
}

export function transformGTSXComponentBoundaries(input: {
  code: string
  filePath: string
  root: string
}): string {
  const sourceFile = ts.createSourceFile(input.filePath, input.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const replacements: Replacement[] = []
  const insertions: Insertion[] = []
  const coordinateFile = toCoordinateFile(input.root, input.filePath)

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue

    const componentName = statement.name.text
    if (!hasComponentCases(input.code, componentName)) continue

    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      const implementationName = `${componentName}GTSXImpl`
      replacements.push({
        start: statement.getStart(sourceFile),
        end: statement.name.end,
        text: `function ${implementationName}`,
      })
      insertions.push({
        index: statement.end,
        text: `\nconst ${componentName} = __gtsxDefineGComponent(${JSON.stringify(`${coordinateFile}#default`)}, ${implementationName})\nexport default ${componentName}\n`,
      })
      continue
    }

    if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      const implementationName = `${componentName}GTSXImpl`
      replacements.push({
        start: statement.getStart(sourceFile),
        end: statement.name.end,
        text: `function ${implementationName}`,
      })
      insertions.push({
        index: statement.end,
        text: `\nexport const ${componentName} = __gtsxDefineGComponent(${JSON.stringify(`${coordinateFile}#${componentName}`)}, ${implementationName})\n`,
      })
    }
  }

  if (replacements.length === 0) return input.code

  const importPrefix = `import { defineGComponent as __gtsxDefineGComponent } from "gtsx"\n`
  return applyEdits(`${importPrefix}${input.code}`, {
    replacements: replacements.map((replacement) => shiftEdit(replacement, importPrefix.length)),
    insertions: insertions.map((insertion) => ({ ...insertion, index: insertion.index + importPrefix.length })),
  })
}

function cleanViteId(id: string): string {
  return id.split("?", 1)[0] ?? id
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

function applyEdits(
  code: string,
  edits: { replacements: Replacement[]; insertions: Insertion[] },
): string {
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

function shiftEdit(replacement: Replacement, offset: number): Replacement {
  return {
    start: replacement.start + offset,
    end: replacement.end + offset,
    text: replacement.text,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
