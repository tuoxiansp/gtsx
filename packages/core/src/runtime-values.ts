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
  | { type: "framework-element"; framework: string; elementType: string; props: GSerializedRuntimeValue }
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
