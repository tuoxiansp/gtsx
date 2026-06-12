import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { buildRunelightProjectIndex } from "../../core/src/project-index.js"
import { analyzeRunelightVueEntry as analyzeEntry, runelightVueContract, transformRunelightVuePreviewSfc } from "../src/contract.js"

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

      const index = buildRunelightProjectIndex({ contracts: [runelightVueContract], cwd, sourceRoot: "src" })

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
    expect(transformed).toContain("import { useRunelightVueFrame } from \"@runelight/vue/preview\"")
    expect(transformed).toContain("const formatName = (value: string) => value.toUpperCase()")
    expect(transformed).not.toContain("useRemoteStatus")
    expect(transformed).toContain("const status = computed(() =>")
    expect(transformed).toContain("const user = computed(() =>")
    expect(transformed).toContain("const userId = computed(() =>")
    expect(transformed).toContain("<style scoped>")
    expect(transformed).toContain(".card { color: red; }")
  })

  it("can generate a preview SFC through an adapter-owned runtime import", () => {
    const transformed = transformRunelightVuePreviewSfc(
      [
        "<template>",
        "  <section>{{ status }}</section>",
        "</template>",
        "<script setup lang=\"ts\">",
        "const status = useRemoteStatus()",
        "</script>",
        "<g:frames>",
        "export default { ready: { scope: { status: 'ready' } } }",
        "</g:frames>",
      ].join("\n"),
      "src/UserCard.g.vue",
      { previewRuntimeImport: "@runelight/adapter-vite-vue/preview" },
    )

    expect(transformed).toContain("import { useRunelightVueFrame } from \"@runelight/adapter-vite-vue/preview\"")
    expect(transformed).not.toContain("import { useRunelightVueFrame } from \"@runelight/vue/preview\"")
  })

  it("preserves <g:frames> imports so Vue provider keys exist at preview runtime", () => {
    const transformed = transformRunelightVuePreviewSfc(
      [
        "<template>",
        "  <section>{{ auth.role }}</section>",
        "</template>",
        "<script setup lang=\"ts\">",
        "import { inject } from 'vue'",
        "import { authKey } from './auth'",
        "const auth = inject(authKey)!",
        "</script>",
        "<g:frames lang=\"ts\">",
        "import { authKey } from './auth'",
        "export default {",
        "  admin: { props: {}, providers: [[authKey, { role: 'admin' }]] },",
        "}",
        "</g:frames>",
      ].join("\n"),
      "src/UserCard.g.vue",
    )

    expect(transformed).toContain("import { authKey } from './auth'")
    expect(transformed).toContain("const auth = inject(authKey)!")
    expect(transformed).toContain("providers: [[authKey, { role: 'admin' }]]")
  })

  it("indexes Vue provide/inject frame variants from defineGInjectionKey", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-provider-index-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/auth.ts"),
        [
          'import { defineGInjectionKey } from "@runelight/vue/runtime"',
          "",
          'export const authKey = defineGInjectionKey<{ role: "admin" | "viewer" }>({ variants: ["admin", "viewer"] as const })',
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/UserCard.g.vue"),
        [
          "<template>",
          "  <section>{{ auth.role }} / {{ userId }}</section>",
          "</template>",
          "<script setup lang=\"ts\">",
          'import { inject } from "vue"',
          'import { authKey } from "./auth"',
          "const auth = inject(authKey)!",
          "</script>",
          "<g:frames lang=\"ts\">",
          'import { authKey } from "./auth"',
          'import type { GVueFrames, GVueProviderFrame } from "@runelight/vue/runtime"',
          "type Props = { userId: string }",
          "export default {",
          "  admin: {",
          "    props: { userId: 'admin_1' },",
          "    providers: [[authKey, { role: 'admin' }]],",
          '  } satisfies GVueProviderFrame<typeof authKey, "admin", Props>,',
          "  viewer: {",
          "    props: { userId: 'viewer_1' },",
          "    providers: [[authKey, { role: 'viewer' }]],",
          '  } satisfies GVueProviderFrame<typeof authKey, "viewer", Props>,',
          "} satisfies GVueFrames<Props, never, [typeof authKey]>",
          "</g:frames>",
        ].join("\n"),
      )

      const analysis = analyzeEntry({ cwd, entry: "src/UserCard.g.vue" })

      expect(analysis.diagnostics).toEqual([])
      expect(analysis.providers.authKey).toEqual({
        name: "authKey",
        frames: [],
        variants: ["admin", "viewer"],
      })
      expect(analysis.frames).toEqual([
        {
          kind: "pure",
          name: "admin",
          providers: ["authKey"],
          providerVariants: { authKey: "admin" },
        },
        {
          kind: "pure",
          name: "viewer",
          providers: ["authKey"],
          providerVariants: { authKey: "viewer" },
        },
      ])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("does not read legacy Vue provide fields as Runelight frame providers", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-legacy-provide-field-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/auth.ts"),
        [
          'import { defineGInjectionKey } from "@runelight/vue/runtime"',
          "",
          'export const authKey = defineGInjectionKey<{ role: "admin" }>()',
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/UserCard.g.vue"),
        [
          "<template>",
          "  <section>{{ auth.role }}</section>",
          "</template>",
          "<script setup lang=\"ts\">",
          'import { inject } from "vue"',
          'import { authKey } from "./auth"',
          "const auth = inject(authKey)!",
          "</script>",
          "<g:frames lang=\"ts\">",
          'import { authKey } from "./auth"',
          "export default {",
          "  ready: { props: {}, provide: [[authKey, { role: 'admin' }]] },",
          "}",
          "</g:frames>",
        ].join("\n"),
      )

      const analysis = analyzeEntry({ cwd, entry: "src/UserCard.g.vue" })

      expect(analysis.diagnostics).toEqual([])
      expect(analysis.frames).toEqual([{ kind: "pure", name: "ready" }])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("reports missing Vue provider variant frame coverage for injected keys", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-provider-coverage-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/auth.ts"),
        [
          'import { defineGInjectionKey } from "@runelight/vue/runtime"',
          "",
          'export const authKey = defineGInjectionKey<{ role: "admin" | "viewer" }>({ variants: ["admin", "viewer"] as const })',
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/UserCard.g.vue"),
        [
          "<template>",
          "  <section>{{ auth.role }}</section>",
          "</template>",
          "<script setup lang=\"ts\">",
          'import { inject } from "vue"',
          'import { authKey } from "./auth"',
          "const auth = inject(authKey)!",
          "</script>",
          "<g:frames lang=\"ts\">",
          'import { authKey } from "./auth"',
          'import type { GVueFrames, GVueProviderFrame } from "@runelight/vue/runtime"',
          "export default {",
          "  admin: {",
          "    props: {},",
          "    providers: [[authKey, { role: 'admin' }]],",
          '  } satisfies GVueProviderFrame<typeof authKey, "admin">,',
          "} satisfies GVueFrames<Record<string, never>, never, [typeof authKey]>",
          "</g:frames>",
        ].join("\n"),
      )

      const analysis = analyzeEntry({ cwd, entry: "src/UserCard.g.vue" })

      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          code: "missing-provider-variant-frames",
          message: 'Runelight Vue entry injects "authKey" but its frames do not cover variants: viewer.',
        }),
      ])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("reports uncovered Vue template branches from v-if chains", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-template-branch-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/StatusPanel.g.vue"),
        [
          "<template>",
          "  <section>",
          "    <p v-if=\"status === 'ready'\">Ready</p>",
          "    <p v-else-if=\"status === 'error'\">Error</p>",
          "    <p v-else>Loading</p>",
          "  </section>",
          "</template>",
          "<script setup lang=\"ts\">",
          "const status = useRemoteStatus()",
          "</script>",
          "<g:frames>",
          "export default {",
          "  ready: { scope: { status: 'ready' } },",
          "  loading: { scope: { status: 'loading' } },",
          "}",
          "</g:frames>",
        ].join("\n"),
      )

      const analysis = analyzeEntry({ cwd, entry: "src/StatusPanel.g.vue" })

      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          code: "uncovered-vue-template-branch",
          message: expect.stringContaining('status === "error"'),
        }),
      ])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("reports uncovered non-empty Vue v-for branches", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-template-for-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/UserList.g.vue"),
        [
          "<template>",
          "  <ul>",
          "    <li v-for=\"user in users\" :key=\"user.id\">{{ user.name }}</li>",
          "  </ul>",
          "</template>",
          "<script setup lang=\"ts\">",
          "const users = useUsers()",
          "</script>",
          "<g:frames>",
          "export default {",
          "  empty: { scope: { users: [] } },",
          "}",
          "</g:frames>",
        ].join("\n"),
      )

      const analysis = analyzeEntry({ cwd, entry: "src/UserList.g.vue" })

      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          code: "uncovered-vue-template-branch",
          message: expect.stringContaining("users.length > 0"),
        }),
      ])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("uses Vue injected context values when proving template branch reachability", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-template-provider-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/auth.ts"),
        [
          'import { defineGInjectionKey } from "@runelight/vue/runtime"',
          "",
          'export const authKey = defineGInjectionKey<{ role: "admin" | "viewer" }>({ variants: ["admin", "viewer"] as const })',
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/AuthPanel.g.vue"),
        [
          "<template>",
          "  <section>",
          "    <p v-if=\"auth.role === 'admin'\">Admin tools</p>",
          "    <p v-else>Viewer tools</p>",
          "  </section>",
          "</template>",
          "<script setup lang=\"ts\">",
          'import { inject } from "vue"',
          'import { authKey } from "./auth"',
          "const auth = inject(authKey)!",
          "</script>",
          "<g:frames lang=\"ts\">",
          'import { authKey } from "./auth"',
          'import type { GVueFrames, GVueProviderFrame } from "@runelight/vue/runtime"',
          "export default {",
          "  admin: {",
          "    props: {},",
          "    providers: [[authKey, { role: 'admin' }]],",
          '  } satisfies GVueProviderFrame<typeof authKey, "admin">,',
          "  viewer: {",
          "    props: {},",
          "    providers: [[authKey, { role: 'viewer' }]],",
          '  } satisfies GVueProviderFrame<typeof authKey, "viewer">,',
          "} satisfies GVueFrames<Record<string, never>, never, [typeof authKey]>",
          "</g:frames>",
        ].join("\n"),
      )

      const analysis = analyzeEntry({ cwd, entry: "src/AuthPanel.g.vue" })

      expect(analysis.diagnostics).toEqual([])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("reports opaque Vue template control flow", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-vue-template-opaque-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/OpaquePanel.g.vue"),
        [
          "<template>",
          "  <section v-if=\"isReady(status)\">Ready</section>",
          "</template>",
          "<script setup lang=\"ts\">",
          "const status = useRemoteStatus()",
          "const isReady = (value: string) => value === 'ready'",
          "</script>",
          "<g:frames>",
          "export default {",
          "  ready: { scope: { status: 'ready' } },",
          "}",
          "</g:frames>",
        ].join("\n"),
      )

      const analysis = analyzeEntry({ cwd, entry: "src/OpaquePanel.g.vue" })

      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          code: "opaque-vue-template-control-flow",
          message: expect.stringContaining("isReady(status)"),
        }),
      ])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })
})
