import React from "react"
import { describe, expect, it } from "vitest"

import { serializeGRuntimeValue } from "../src/index.js"

class Profile {
  constructor(readonly name: string) {}
}

describe("GTSX runtime value serialization", () => {
  it("safely serializes dev runtime values without executing functions", () => {
    let calls = 0
    const onClick = function handleClick() {
      calls += 1
    }
    const circular: Record<string, unknown> = { label: "root" }
    circular.self = circular
    const value = {
      circular,
      fn: onClick,
      symbol: Symbol("token"),
      date: new Date("2026-05-23T13:34:00.000Z"),
      error: new TypeError("bad props"),
      map: new Map<unknown, unknown>([["count", 2]]),
      set: new Set<unknown>(["ready"]),
      element: React.createElement("button", { onClick }, "Save"),
      instance: new Profile("Ada"),
      deep: { a: { b: { c: "hidden" } } },
      many: ["one", "two", "three"],
    }

    expect(serializeGRuntimeValue(value, { maxDepth: 3, maxEntries: 2 })).toEqual({
      type: "object",
      constructorName: "Object",
      entries: [
        {
          key: "circular",
          value: {
            type: "object",
            constructorName: "Object",
            entries: [
              { key: "label", value: { type: "string", value: "root" } },
              { key: "self", value: { type: "circular", path: "$.circular" } },
            ],
          },
        },
        { key: "fn", value: { type: "function", name: "handleClick", displayName: "[Function handleClick]" } },
      ],
      truncated: { reason: "max-entries", remaining: 9 },
    })
    expect(serializeGRuntimeValue(value.symbol)).toEqual({
      type: "symbol",
      description: "token",
      displayName: "Symbol(token)",
    })
    expect(serializeGRuntimeValue(value.date)).toEqual({
      type: "date",
      value: "2026-05-23T13:34:00.000Z",
    })
    expect(serializeGRuntimeValue(value.error)).toMatchObject({
      type: "error",
      name: "TypeError",
      message: "bad props",
    })
    expect(serializeGRuntimeValue(value.map)).toEqual({
      type: "map",
      entries: [[{ type: "string", value: "count" }, { type: "number", value: 2 }]],
    })
    expect(serializeGRuntimeValue(value.set)).toEqual({
      type: "set",
      values: [{ type: "string", value: "ready" }],
    })
    expect(serializeGRuntimeValue(value.element)).toEqual({
      type: "react-element",
      elementType: "button",
      props: {
        type: "object",
        constructorName: "Object",
        entries: [
          { key: "onClick", value: { type: "function", name: "handleClick", displayName: "[Function handleClick]" } },
          { key: "children", value: { type: "string", value: "Save" } },
        ],
      },
    })
    expect(serializeGRuntimeValue(value.instance)).toEqual({
      type: "object",
      constructorName: "Profile",
      entries: [{ key: "name", value: { type: "string", value: "Ada" } }],
    })
    expect(serializeGRuntimeValue(value.deep, { maxDepth: 2 })).toEqual({
      type: "object",
      constructorName: "Object",
      entries: [
        {
          key: "a",
          value: {
            type: "object",
            constructorName: "Object",
            entries: [{ key: "b", value: { type: "truncated", reason: "max-depth" } }],
          },
        },
      ],
    })
    expect(serializeGRuntimeValue(value.many, { maxEntries: 2 })).toEqual({
      type: "array",
      values: [
        { type: "string", value: "one" },
        { type: "string", value: "two" },
      ],
      truncated: { reason: "max-entries", remaining: 1 },
    })
    expect(calls).toBe(0)
  })
})
