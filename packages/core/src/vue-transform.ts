import ts from "typescript"

import { extractVueFrames, isRunelightVueComponentFile } from "./vue-analyzer.js"

export const RUNELIGHT_VUE_PREVIEW_QUERY = "runelight-vue-preview"

export type RunelightVueTransformInput = {
  code: string
  filePath: string
  previewRuntimeImport?: string
}

export type RunelightVueTransformResult = {
  code: string
  filePath: string
}

type VueSfcBlock = {
  attrs: string
  content: string
}

type VueSfcParts = {
  template?: VueSfcBlock
  scriptSetup?: VueSfcBlock
  script?: VueSfcBlock
  styles: VueSfcBlock[]
}

export function transformRunelightVuePreviewModule(input: RunelightVueTransformInput): RunelightVueTransformResult | null {
  const filePath = normalizeRunelightVueModuleId(input.filePath)
  if (!isRunelightVueComponentFile(filePath)) return null

  return {
    code: transformRunelightVuePreviewSfc(input.code, filePath, {
      previewRuntimeImport: input.previewRuntimeImport,
    }),
    filePath,
  }
}

export function transformRunelightVuePreviewSfc(
  code: string,
  filePath: string,
  options: { previewRuntimeImport?: string } = {},
): string {
  const parts = parseVueSfcParts(code)
  const frames = extractVueFrames(code, filePath)
  const frameObjectCode = frames.frameObjectCode || "{}"
  const identifiers = collectPreviewIdentifiers(frameObjectCode)
  const preservedScriptSetup = preserveScriptSetupScope(parts.scriptSetup?.content ?? "", identifiers)
  const scriptSetupLang = readSfcBlockLang(parts.scriptSetup) ?? "ts"
  const template = parts.template?.content ?? ""
  const previewRuntimeImport = options.previewRuntimeImport ?? "@runelight/preview-vue"

  return [
    `<script lang="ts">`,
    `const __runelightVueFrames = (${frameObjectCode})`,
    `export default { frames: __runelightVueFrames }`,
    `</script>`,
    `<script setup lang="${escapeAttribute(scriptSetupLang)}">`,
    `import { computed } from "vue"`,
    `import { useRunelightVueFrame } from ${JSON.stringify(previewRuntimeImport)}`,
    preservedScriptSetup,
    `const __runelightVueFrame = useRunelightVueFrame()`,
    `const __runelightVueProps = computed(() => __runelightVueFrame.value.props ?? {})`,
    `const __runelightVueScope = computed(() => __runelightVueFrame.value.scope ?? {})`,
    identifiers.has("props") ? "" : `const props = __runelightVueProps`,
    [...identifiers]
      .filter((name) => name !== "props")
      .sort((left, right) => left.localeCompare(right))
      .map(
        (name) =>
          `const ${name} = computed(() => Object.prototype.hasOwnProperty.call(__runelightVueScope.value, ${JSON.stringify(name)}) ? __runelightVueScope.value[${JSON.stringify(name)}] : __runelightVueProps.value[${JSON.stringify(name)}])`,
      )
      .join("\n"),
    `</script>`,
    `<template>`,
    template,
    `</template>`,
    ...parts.styles.map((style) => `<style${style.attrs}>${style.content}</style>`),
  ]
    .filter((part) => part !== "")
    .join("\n")
}

export function normalizeRunelightVueModuleId(id: string): string {
  return id.split("?", 1)[0] ?? id
}

export function hasRunelightVuePreviewQuery(id: string, queryName = RUNELIGHT_VUE_PREVIEW_QUERY): boolean {
  const query = id.includes("?") ? (id.split("?", 2)[1] ?? "") : ""
  return query.split("&").some((part) => part === queryName || part.startsWith(`${queryName}=`))
}

function parseVueSfcParts(code: string): VueSfcParts {
  return {
    template: extractSfcBlock(code, "template"),
    scriptSetup: extractSfcBlock(code, "script", (attrs) => /\bsetup\b/i.test(attrs)),
    script: extractSfcBlock(code, "script", (attrs) => !/\bsetup\b/i.test(attrs)),
    styles: extractSfcBlocks(code, "style"),
  }
}

function extractSfcBlock(code: string, tagName: string, acceptAttrs: (attrs: string) => boolean = () => true): VueSfcBlock | undefined {
  return extractSfcBlocks(code, tagName, acceptAttrs)[0]
}

function extractSfcBlocks(code: string, tagName: string, acceptAttrs: (attrs: string) => boolean = () => true): VueSfcBlock[] {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi")
  const blocks: VueSfcBlock[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(code))) {
    const attrs = match[1] ?? ""
    if (acceptAttrs(attrs)) blocks.push({ attrs, content: match[2] ?? "" })
  }

  return blocks
}

function readSfcBlockLang(block: VueSfcBlock | undefined): string | undefined {
  if (!block) return undefined
  const quoted = /\blang\s*=\s*["']([^"']+)["']/i.exec(block.attrs)
  if (quoted) return quoted[1]
  const unquoted = /\blang\s*=\s*([^\s"'>]+)/i.exec(block.attrs)
  return unquoted?.[1]
}

function collectPreviewIdentifiers(frameObjectCode: string): Set<string> {
  const sourceFile = ts.createSourceFile("frames.ts", `const frames = (${frameObjectCode})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const identifiers = new Set<string>()

  visit(sourceFile)
  return identifiers

  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node)) {
      const propertyName = staticPropertyName(node.name)
      const parentName = node.parent && ts.isObjectLiteralExpression(node.parent) ? parentPropertyName(node.parent) : undefined
      if ((parentName === "props" || parentName === "scope") && propertyName && isSafeIdentifier(propertyName)) {
        identifiers.add(propertyName)
      }
    }

    ts.forEachChild(node, visit)
  }
}

function parentPropertyName(objectLiteral: ts.ObjectLiteralExpression): string | undefined {
  const parent = objectLiteral.parent
  if (!parent || !ts.isPropertyAssignment(parent)) return undefined
  return staticPropertyName(parent.name)
}

function preserveScriptSetupScope(script: string, generatedIdentifiers: Set<string>): string {
  if (!script.trim()) return ""
  const sourceFile = ts.createSourceFile("component.setup.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const preserved: string[] = []

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      preserved.push(statement.getText(sourceFile))
      continue
    }

    if (ts.isFunctionDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      preserved.push(statement.getText(sourceFile))
      continue
    }

    if (ts.isVariableStatement(statement) && shouldPreserveVariableStatement(statement, generatedIdentifiers)) {
      preserved.push(statement.getText(sourceFile))
    }
  }

  return preserved.join("\n")
}

function shouldPreserveVariableStatement(statement: ts.VariableStatement, generatedIdentifiers: Set<string>): boolean {
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name)) return false
    if (generatedIdentifiers.has(declaration.name.text) || declaration.name.text === "props") return false
    if (!declaration.initializer) return false

    const initializer = unwrapExpression(declaration.initializer)
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) continue
    if (isStaticLiteralExpression(initializer)) continue
    return false
  }

  return true
}

function isStaticLiteralExpression(expression: ts.Expression): boolean {
  const value = unwrapExpression(expression)
  if (
    value.kind === ts.SyntaxKind.TrueKeyword ||
    value.kind === ts.SyntaxKind.FalseKeyword ||
    value.kind === ts.SyntaxKind.NullKeyword ||
    ts.isStringLiteral(value) ||
    ts.isNoSubstitutionTemplateLiteral(value) ||
    ts.isNumericLiteral(value)
  ) {
    return true
  }

  if (ts.isArrayLiteralExpression(value)) return value.elements.every((element) => !ts.isSpreadElement(element) && isStaticLiteralExpression(element))
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.every((property) => ts.isPropertyAssignment(property) && isStaticLiteralExpression(property.initializer))
  }

  return false
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return unwrapExpression(expression.expression)
  }

  return expression
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function isSafeIdentifier(name: string): boolean {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return false
  return !new Set([
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ]).has(name)
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
}
