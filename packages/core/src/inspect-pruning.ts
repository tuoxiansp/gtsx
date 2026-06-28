import { readFileSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import ts from "typescript"

import type { RunelightProjectIndex, RunelightProjectIndexComponent } from "./project-index.js"

export type RunelightInspectPrunedDependency = {
  coordinate: string
  evidence: string
  reason: "child-return-null"
}

export type RunelightInspectFrameDependencyResult = {
  dependencies: string[]
  prunedDependencies: RunelightInspectPrunedDependency[]
  structuralDependencies: string[]
}

type StaticInspectValue =
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "truthy" }
  | { kind: "undefined" }
  | { kind: "unknown" }

type ParentCallsite = {
  props: Map<string, StaticInspectValue>
}

type ChildNullGuard = {
  propName: string
}

type SourceFileCacheEntry = {
  sourceFile: ts.SourceFile
}

type InspectDependencyPruningContext = {
  componentsByCoordinate: ReadonlyMap<string, RunelightProjectIndexComponent>
  cwd: string
  sourceFiles: Map<string, SourceFileCacheEntry>
}

export function pruneInspectFrameDependencies(input: {
  component: RunelightProjectIndexComponent
  cwd: string
  frameName: string
  index: RunelightProjectIndex
  structuralDependencies: readonly string[]
}): RunelightInspectFrameDependencyResult {
  const context: InspectDependencyPruningContext = {
    componentsByCoordinate: new Map(input.index.files.flatMap((file) => file.components.map((component) => [component.coordinate, component] as const))),
    cwd: input.cwd,
    sourceFiles: new Map(),
  }
  const prunedDependencies: RunelightInspectPrunedDependency[] = []
  const dependencies = input.structuralDependencies.filter((coordinate) => {
    const proof = proveReactDependencyRendersNull({
      childCoordinate: coordinate,
      component: input.component,
      context,
      frameName: input.frameName,
    })
    if (!proof) return true

    prunedDependencies.push({
      coordinate,
      evidence: proof,
      reason: "child-return-null",
    })
    return false
  })

  return {
    dependencies: uniqueSorted(dependencies),
    prunedDependencies,
    structuralDependencies: uniqueSorted(input.structuralDependencies),
  }
}

function proveReactDependencyRendersNull(input: {
  childCoordinate: string
  component: RunelightProjectIndexComponent
  context: InspectDependencyPruningContext
  frameName: string
}): string | undefined {
  if (!input.component.filePath.endsWith(".g.tsx")) return undefined
  const child = input.context.componentsByCoordinate.get(input.childCoordinate)
  if (!child?.filePath.endsWith(".g.tsx")) return undefined

  const parentSource = readInspectSourceFile(input.context, input.component.filePath)
  const childSource = readInspectSourceFile(input.context, child.filePath)
  if (!parentSource || !childSource) return undefined

  const parentFrameValues = readInspectFrameValues(parentSource, input.component.componentName, input.frameName)
  if (!parentFrameValues) return undefined

  const childGuards = readChildNullGuards(childSource, child.componentName)
  if (childGuards.length === 0) return undefined

  const callsites = readChildCallsites({
    child,
    childCoordinate: input.childCoordinate,
    context: input.context,
    frameValues: parentFrameValues,
    parent: input.component,
    parentSource,
  })
  if (callsites.length === 0) return undefined

  const proofs: string[] = []
  for (const callsite of callsites) {
    const proof = proveCallsiteRendersNull(callsite, childGuards)
    if (!proof) return undefined
    proofs.push(proof)
  }

  return uniqueSorted(proofs).join("; ")
}

function readInspectSourceFile(context: InspectDependencyPruningContext, filePath: string): ts.SourceFile | undefined {
  const cached = context.sourceFiles.get(filePath)
  if (cached) return cached.sourceFile

  try {
    const sourceText = readFileSync(resolve(context.cwd, filePath), "utf8")
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    context.sourceFiles.set(filePath, { sourceFile })
    return sourceFile
  } catch {
    return undefined
  }
}

function readInspectFrameValues(
  sourceFile: ts.SourceFile,
  componentName: string,
  frameName: string,
): Map<string, StaticInspectValue> | undefined {
  const framesObject = findFramesObject(sourceFile, componentName)
  if (!framesObject) return undefined

  const frameExpression = objectLiteralPropertyExpression(framesObject, frameName)
  if (!frameExpression || !ts.isObjectLiteralExpression(frameExpression)) return undefined

  const values = new Map<string, StaticInspectValue>()
  const props = objectLiteralPropertyExpression(frameExpression, "props")
  if (props) flattenInspectStaticObject(props, "props", values)
  const scope = objectLiteralPropertyExpression(frameExpression, "scope")
  if (scope) flattenInspectStaticObject(scope, "scope", values)
  return values
}

function findFramesObject(sourceFile: ts.SourceFile, componentName: string): ts.ObjectLiteralExpression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) continue
    const expression = unwrapExpression(statement.expression)
    if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue
    if (!ts.isPropertyAccessExpression(expression.left) || expression.left.name.text !== "frames") continue
    if (!ts.isIdentifier(expression.left.expression) || expression.left.expression.text !== componentName) continue

    const framesExpression = unwrapExpression(expression.right)
    if (ts.isObjectLiteralExpression(framesExpression)) return framesExpression
  }

  return undefined
}

function readChildNullGuards(sourceFile: ts.SourceFile, componentName: string): ChildNullGuard[] {
  const declaration = findFunctionComponentDeclaration(sourceFile, componentName)
  const body = declaration?.body
  if (!body || !ts.isBlock(body)) return []

  const propBindings = readComponentPropBindings(declaration)
  if (!propBindings) return []

  const guards: ChildNullGuard[] = []
  for (const statement of body.statements) {
    if (isNonRenderDeclarationStatement(statement)) continue
    const guard = readReturnNullGuard(statement, propBindings)
    if (guard) guards.push(guard)
    break
  }
  return guards
}

function readChildCallsites(input: {
  child: RunelightProjectIndexComponent
  childCoordinate: string
  context: InspectDependencyPruningContext
  frameValues: ReadonlyMap<string, StaticInspectValue>
  parent: RunelightProjectIndexComponent
  parentSource: ts.SourceFile
}): ParentCallsite[] {
  const importedTags = importedJsxTagsForCoordinate(input.parentSource, input.parent.filePath, input.child, input.context.cwd)
  if (importedTags.size === 0) return []

  const parentDeclaration = findFunctionComponentDeclaration(input.parentSource, input.parent.componentName)
  if (!parentDeclaration?.body) return []

  const callsites: ParentCallsite[] = []
  visit(parentDeclaration.body)
  return callsites

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = jsxTagNameText(node.tagName)
      if (tagName && importedTags.has(tagName)) {
        callsites.push({
          props: readJsxProps(node.attributes, input.frameValues),
        })
      }
    }

    ts.forEachChild(node, visit)
  }
}

function importedJsxTagsForCoordinate(
  sourceFile: ts.SourceFile,
  parentFilePath: string,
  child: RunelightProjectIndexComponent,
  cwd: string,
): Set<string> {
  const tags = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!importSpecifierCanResolveToFile(statement.moduleSpecifier.text, parentFilePath, child.filePath, cwd)) continue

    const importClause = statement.importClause
    if (importClause?.name && child.exportName === "default") tags.add(importClause.name.text)

    const namedBindings = importClause?.namedBindings
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text
        if (importedName === child.exportName) tags.add(element.name.text)
      }
    }
  }
  return tags
}

function importSpecifierCanResolveToFile(
  specifier: string,
  parentFilePath: string,
  childFilePath: string,
  cwd: string,
): boolean {
  const childWithoutExtension = stripRunelightExtension(childFilePath)
  const candidates = new Set<string>()

  if (specifier.startsWith(".")) {
    const resolved = normalizeProjectPath(relative(cwd, resolve(cwd, dirname(parentFilePath), specifier)))
    candidates.add(resolved)
  } else if (specifier.startsWith("@/")) {
    candidates.add(normalizeProjectPath(`src/${specifier.slice(2)}`))
  } else {
    candidates.add(normalizeProjectPath(specifier))
  }

  for (const candidate of candidates) {
    if (candidate === childFilePath || candidate === childWithoutExtension) return true
    if (`${candidate}.tsx` === childFilePath) return true
  }
  return false
}

function stripRunelightExtension(filePath: string): string {
  return filePath.replace(/\.tsx$/, "").replace(/\.g$/, ".g")
}

function readJsxProps(
  attributes: ts.JsxAttributes,
  frameValues: ReadonlyMap<string, StaticInspectValue>,
): Map<string, StaticInspectValue> {
  const props = new Map<string, StaticInspectValue>()
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue
    const propName = jsxAttributeNameText(property.name)
    if (!propName) continue
    if (!property.initializer) {
      props.set(propName, { kind: "boolean", value: true })
      continue
    }

    if (ts.isStringLiteral(property.initializer)) {
      props.set(propName, { kind: "string", value: property.initializer.text })
      continue
    }

    if (!ts.isJsxExpression(property.initializer) || !property.initializer.expression) {
      props.set(propName, { kind: "unknown" })
      continue
    }

    props.set(propName, inspectStaticValueForExpression(property.initializer.expression, frameValues))
  }
  return props
}

function proveCallsiteRendersNull(callsite: ParentCallsite, guards: readonly ChildNullGuard[]): string | undefined {
  for (const guard of guards) {
    const value = callsite.props.get(guard.propName) ?? { kind: "undefined" as const }
    if (staticInspectValueIsFalsy(value)) {
      return `props.${guard.propName} is statically ${formatStaticInspectValue(value)}`
    }
  }
  return undefined
}

function readReturnNullGuard(statement: ts.Statement, propBindings: ReadonlyMap<string, string>): ChildNullGuard | undefined {
  if (!ts.isIfStatement(statement)) return undefined
  if (!statementReturnsNull(statement.thenStatement)) return undefined

  const propName = propNameForFalsyGuard(statement.expression, propBindings)
  return propName ? { propName } : undefined
}

function propNameForFalsyGuard(expression: ts.Expression, propBindings: ReadonlyMap<string, string>): string | undefined {
  const value = unwrapExpression(expression)
  if (!ts.isPrefixUnaryExpression(value) || value.operator !== ts.SyntaxKind.ExclamationToken) return undefined

  const operand = unwrapExpression(value.operand)
  if (ts.isIdentifier(operand)) return propBindings.get(operand.text)
  if (ts.isPropertyAccessExpression(operand) && ts.isIdentifier(operand.expression)) {
    if (propBindings.get(operand.expression.text) === "") return operand.name.text
    return propBindings.get(`${operand.expression.text}.${operand.name.text}`)
  }
  return undefined
}

function statementReturnsNull(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement)) return Boolean(statement.expression && unwrapExpression(statement.expression).kind === ts.SyntaxKind.NullKeyword)
  if (!ts.isBlock(statement)) return false
  return statement.statements.length === 1 && statementReturnsNull(statement.statements[0] as ts.Statement)
}

function readComponentPropBindings(declaration: ts.FunctionLikeDeclaration): Map<string, string> | undefined {
  const parameter = declaration.parameters[0]
  if (!parameter) return new Map()

  const bindings = new Map<string, string>()
  if (ts.isIdentifier(parameter.name)) {
    bindings.set(parameter.name.text, "")
    return bindings
  }

  if (!ts.isObjectBindingPattern(parameter.name)) return undefined
  for (const element of parameter.name.elements) {
    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
      const propName = element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text
      if (element.initializer) continue
      bindings.set(element.name.text, propName)
    }
  }
  return bindings
}

function isNonRenderDeclarationStatement(statement: ts.Statement): boolean {
  return ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)
}

function findFunctionComponentDeclaration(sourceFile: ts.SourceFile, componentName: string): ts.FunctionLikeDeclaration | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === componentName) return statement
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== componentName || !declaration.initializer) continue
      const initializer = unwrapExpression(declaration.initializer)
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer
    }
  }
  return undefined
}

function inspectStaticValueForExpression(
  expression: ts.Expression,
  frameValues: ReadonlyMap<string, StaticInspectValue>,
): StaticInspectValue {
  const staticValue = readStaticInspectValue(expression)
  if (staticValue) return staticValue

  const reference = inspectFrameReferenceKey(expression)
  if (reference) return frameValues.get(reference) ?? { kind: "unknown" }

  return { kind: "unknown" }
}

function inspectFrameReferenceKey(expression: ts.Expression): string | undefined {
  const value = unwrapExpression(expression)
  if (ts.isPropertyAccessExpression(value)) {
    const parent = inspectFrameReferenceKey(value.expression)
    if (parent) return `${parent}.${value.name.text}`
    if (ts.isIdentifier(value.expression) && (value.expression.text === "props" || value.expression.text === "scope")) {
      return `${value.expression.text}.${value.name.text}`
    }
  }
  return undefined
}

function flattenInspectStaticObject(
  expression: ts.Expression,
  prefix: string,
  values: Map<string, StaticInspectValue>,
) {
  const value = unwrapExpression(expression)
  const staticValue = readStaticInspectValue(value)
  if (staticValue) values.set(prefix, staticValue)

  if (!ts.isObjectLiteralExpression(value)) {
    if (!staticValue) values.set(prefix, { kind: "unknown" })
    return
  }

  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property)) continue
    const name = getStaticPropertyName(property.name)
    if (!name) continue

    if (ts.isMethodDeclaration(property)) {
      values.set(`${prefix}.${name}`, { kind: "truthy" })
      continue
    }

    flattenInspectStaticObject(property.initializer, `${prefix}.${name}`, values)
  }
}

function readStaticInspectValue(expression: ts.Expression): StaticInspectValue | undefined {
  const value = unwrapExpression(expression)
  if (value.kind === ts.SyntaxKind.TrueKeyword) return { kind: "boolean", value: true }
  if (value.kind === ts.SyntaxKind.FalseKeyword) return { kind: "boolean", value: false }
  if (value.kind === ts.SyntaxKind.NullKeyword) return { kind: "null" }
  if (ts.isIdentifier(value) && value.text === "undefined") return { kind: "undefined" }
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return { kind: "string", value: value.text }
  if (ts.isNumericLiteral(value)) return { kind: "number", value: Number(value.text) }
  if (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value) || ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
    return { kind: "truthy" }
  }
  return undefined
}

function staticInspectValueIsFalsy(value: StaticInspectValue): boolean {
  if (value.kind === "boolean") return value.value === false
  if (value.kind === "null" || value.kind === "undefined") return true
  if (value.kind === "number") return value.value === 0
  if (value.kind === "string") return value.value.length === 0
  return false
}

function formatStaticInspectValue(value: StaticInspectValue): string {
  if (value.kind === "boolean") return String(value.value)
  if (value.kind === "number") return String(value.value)
  if (value.kind === "string") return JSON.stringify(value.value)
  return value.kind
}

function objectLiteralPropertyExpression(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): ts.Expression | undefined {
  const property = objectLiteral.properties.find((candidate): candidate is ts.PropertyAssignment =>
    ts.isPropertyAssignment(candidate) && getStaticPropertyName(candidate.name) === propertyName
  )
  return property ? unwrapExpression(property.initializer) : undefined
}

function getStaticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function jsxTagNameText(tagName: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(tagName)) return tagName.text
  return undefined
}

function jsxAttributeNameText(name: ts.JsxAttributeName): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  return undefined
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return unwrapExpression(expression.expression)
  }
  return expression
}

function normalizeProjectPath(filePath: string): string {
  return filePath.split(sep).join("/")
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
