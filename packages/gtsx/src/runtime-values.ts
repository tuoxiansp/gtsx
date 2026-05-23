import React from "react"

export type GSerializedRuntimeValue =
  | { type: "null"; value: null }
  | { type: "undefined" }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "bigint"; value: string }
  | { type: "symbol"; description?: string; displayName: string }
  | { type: "function"; name?: string; displayName: string }
  | { type: "date"; value: string }
  | { type: "error"; name: string; message: string }
  | { type: "react-element"; elementType: string; props: GSerializedRuntimeValue }
  | { type: "array"; values: GSerializedRuntimeValue[]; truncated?: GRuntimeValueTruncation }
  | { type: "map"; entries: [GSerializedRuntimeValue, GSerializedRuntimeValue][]; truncated?: GRuntimeValueTruncation }
  | { type: "set"; values: GSerializedRuntimeValue[]; truncated?: GRuntimeValueTruncation }
  | {
      type: "object"
      constructorName: string
      entries: { key: string; value: GSerializedRuntimeValue }[]
      truncated?: GRuntimeValueTruncation
    }
  | { type: "circular"; path: string }
  | { type: "truncated"; reason: "max-depth" }

export type GRuntimeValueTruncation = {
  reason: "max-entries"
  remaining: number
}

export type GRuntimeValueSerializationOptions = {
  maxDepth?: number
  maxEntries?: number
}

type SerializationContext = {
  maxDepth: number
  maxEntries: number
  seen: WeakMap<object, string>
}

const DEFAULT_MAX_DEPTH = 6
const DEFAULT_MAX_ENTRIES = 50

export function serializeGRuntimeValue(
  value: unknown,
  options: GRuntimeValueSerializationOptions = {},
): GSerializedRuntimeValue {
  return serializeValue(value, {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    seen: new WeakMap(),
  }, "$", 0)
}

function serializeValue(value: unknown, context: SerializationContext, path: string, depth: number): GSerializedRuntimeValue {
  if (value === null) return { type: "null", value: null }

  if (typeof value === "undefined") return { type: "undefined" }
  if (typeof value === "string") return { type: "string", value }
  if (typeof value === "number") return { type: "number", value }
  if (typeof value === "boolean") return { type: "boolean", value }
  if (typeof value === "bigint") return { type: "bigint", value: value.toString() }
  if (typeof value === "symbol") {
    return {
      type: "symbol",
      ...((value.description ?? "") !== "" ? { description: value.description } : {}),
      displayName: String(value),
    }
  }
  if (typeof value === "function") {
    const name = value.name
    return {
      type: "function",
      ...(name ? { name } : {}),
      displayName: name ? `[Function ${name}]` : "[Function anonymous]",
    }
  }

  const objectValue = value as object
  const circularPath = context.seen.get(objectValue)
  if (circularPath) return { type: "circular", path: circularPath }
  if (depth >= context.maxDepth) return { type: "truncated", reason: "max-depth" }

  context.seen.set(objectValue, path)

  if (value instanceof Date) {
    return {
      type: "date",
      value: Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString(),
    }
  }

  if (value instanceof Error) {
    return {
      type: "error",
      name: value.name,
      message: value.message,
    }
  }

  if (React.isValidElement(value)) {
    return {
      type: "react-element",
      elementType: displayReactElementType(value.type),
      props: serializeValue((value as React.ReactElement<{ [key: string]: unknown }>).props, context, `${path}.props`, depth + 1),
    }
  }

  if (Array.isArray(value)) {
    const values = value
      .slice(0, context.maxEntries)
      .map((item, index) => serializeValue(item, context, `${path}[${index}]`, depth + 1))
    return {
      type: "array",
      values,
      ...truncationFor(value.length, values.length),
    }
  }

  if (value instanceof Map) {
    const entries = [...value.entries()]
    const serializedEntries = entries.slice(0, context.maxEntries).map(
      ([entryKey, entryValue], index) =>
        [
          serializeValue(entryKey, context, `${path}.<map:${index}>.key`, depth + 1),
          serializeValue(entryValue, context, `${path}.<map:${index}>.value`, depth + 1),
        ] satisfies [GSerializedRuntimeValue, GSerializedRuntimeValue],
    )
    return {
      type: "map",
      entries: serializedEntries,
      ...truncationFor(entries.length, serializedEntries.length),
    }
  }

  if (value instanceof Set) {
    const values = [...value.values()]
    const serializedValues = values
      .slice(0, context.maxEntries)
      .map((item, index) => serializeValue(item, context, `${path}.<set:${index}>`, depth + 1))
    return {
      type: "set",
      values: serializedValues,
      ...truncationFor(values.length, serializedValues.length),
    }
  }

  const entries = Object.entries(objectValue)
  const serializedEntries = entries.slice(0, context.maxEntries).map(([entryKey, entryValue]) => ({
    key: entryKey,
    value: serializeValue(entryValue, context, `${path}.${entryKey}`, depth + 1),
  }))

  return {
    type: "object",
    constructorName: objectValue.constructor?.name || "Object",
    entries: serializedEntries,
    ...truncationFor(entries.length, serializedEntries.length),
  }
}

function truncationFor(total: number, serialized: number): { truncated?: GRuntimeValueTruncation } {
  const remaining = total - serialized
  return remaining > 0 ? { truncated: { reason: "max-entries", remaining } } : {}
}

function displayReactElementType(type: unknown): string {
  if (typeof type === "string") return type
  if (typeof type === "function") {
    const component = type as { displayName?: string; name?: string }
    return component.displayName || component.name || "anonymous"
  }
  return "ReactElement"
}
