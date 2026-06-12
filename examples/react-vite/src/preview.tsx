import {
  createRunelightVitePreviewComponentLoader,
  RunelightVitePreviewClient,
  readRunelightReactPreviewRouteParams,
  type RunelightReactPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import previewConfig from "virtual:runelight/preview-config"

const modules = import.meta.glob<RunelightReactPreviewModule>(["/src/frames/**/*.g.tsx", "/app/runelight/design/**/*.g.tsx"], {
  query: "?runelight-preview",
})
const loadExamplePreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: previewConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightReactPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <RunelightVitePreviewClient
      {...params}
      loadComponent={loadExamplePreviewComponent}
      missingEntryDetail="Pass ?entry=src/frames/.../*.g.tsx to render a Runelight example."
    />
  )
}
