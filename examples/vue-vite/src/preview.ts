import { defineComponent, h } from "vue"

import {
  createRunelightViteVuePreviewComponentLoader,
  readRunelightVuePreviewRouteParams,
  RunelightViteVuePreviewClient,
  type RunelightVuePreviewModule,
} from "@runelight/adapter-vite-vue/preview"
import previewConfig from "virtual:runelight/preview-config"

const modules = import.meta.glob<RunelightVuePreviewModule>(
  ["/src/**/*.g.vue", "/src/app/runelight/design/**/*.g.vue"],
  { query: "?runelight-preview" },
)
const loadExamplePreviewComponent = createRunelightViteVuePreviewComponentLoader(modules, {
  sourceRoot: previewConfig.project.sourceRoot,
})

export function createRunelightVuePreviewApp() {
  return defineComponent({
    name: "RunelightVuePreviewApp",
    setup() {
      const params = readRunelightVuePreviewRouteParams(new URLSearchParams(window.location.search))

      return () =>
        h(RunelightViteVuePreviewClient, {
          ...params,
          loadComponent: loadExamplePreviewComponent,
          missingEntryDetail: "Pass ?entry=src/components/.../*.g.vue to render a Runelight Vue example.",
        })
    },
  })
}
