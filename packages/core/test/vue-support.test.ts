import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { analyzeEntry } from "../src/analyzer.js"
import { buildRunelightProjectIndex } from "../src/project-index.js"
import { transformRunelightVuePreviewSfc } from "../src/vue-transform.js"

describe("Runelight Vue support", () => {
  it("indexes .g.vue files with <g:frames> default exports", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-index-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/UserCard.g.vue"),
        [
          "<template>",
          "  <section v-if=\"status === 'ready'\">{{ user.name }}</section>",
          "</template>",
          "<script setup lang=\"ts\">",
          "const props = defineProps<{ userId: string }>()",
          "const status = 'loading'",
          "</script>",
          "<g:frames>",
          "export default {",
          "  loading: { props: { userId: 'user_1' }, scope: { status: 'loading' } },",
          "  ready: { props: { userId: 'user_2' }, scope: { status: 'ready', user: { name: 'Ada' } } },",
          "}",
          "</g:frames>",
        ].join("\n"),
      )

      const index = buildRunelightProjectIndex({ cwd, sourceRoot: "src" })

      expect(index.files).toHaveLength(1)
      expect(index.files[0]?.components[0]).toMatchObject({
        coordinate: "src/UserCard.g.vue#default",
        exportName: "default",
        componentName: "UserCard",
        mode: "scope",
        frames: [
          { kind: "scope", name: "loading" },
          { kind: "scope", name: "ready" },
        ],
        diagnostics: [],
      })

      const analysis = analyzeEntry({ cwd, entry: "src/UserCard.g.vue" })
      expect(analysis.frames.map((frame) => frame.name)).toEqual(["loading", "ready"])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("generates a preview SFC that injects frame props and scope into the template", () => {
    const transformed = transformRunelightVuePreviewSfc(
      [
        "<template>",
        "  <section>{{ formatName(user.name) }} / {{ userId }} / {{ status }}</section>",
        "</template>",
        "<script setup lang=\"ts\">",
        "const props = defineProps<{ userId: string }>()",
        "const formatName = (value: string) => value.toUpperCase()",
        "const status = useRemoteStatus()",
        "</script>",
        "<g:frames>",
        "export default {",
        "  ready: { props: { userId: 'user_1' }, scope: { status: 'ready', user: { name: 'Ada' } } },",
        "}",
        "</g:frames>",
        "<style scoped>",
        ".card { color: red; }",
        "</style>",
      ].join("\n"),
      "src/UserCard.g.vue",
    )

    expect(transformed).toContain("const __runelightVueFrames = ({")
    expect(transformed).toContain("import { useRunelightVueFrame } from \"@runelight/preview-vue\"")
    expect(transformed).toContain("const formatName = (value: string) => value.toUpperCase()")
    expect(transformed).not.toContain("useRemoteStatus")
    expect(transformed).toContain("const status = computed(() =>")
    expect(transformed).toContain("const user = computed(() =>")
    expect(transformed).toContain("const userId = computed(() =>")
    expect(transformed).toContain("<style scoped>")
    expect(transformed).toContain(".card { color: red; }")
  })
})
