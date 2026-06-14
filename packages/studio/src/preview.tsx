import {
  createRunelightVitePreviewComponentLoader,
  RunelightVitePreviewClient,
  readRunelightReactPreviewRouteParams,
  type RunelightReactPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import previewConfig from "virtual:runelight/preview-config"

const modules = import.meta.glob<RunelightReactPreviewModule>(["/src/components/**/*.g.tsx", "/src/app/runelight/design/**/*.g.tsx"], {
  query: "?runelight-preview",
})
const loadStudioPreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: previewConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightReactPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <RunelightVitePreviewClient
      {...params}
      loadComponent={loadStudioPreviewComponent}
      missingEntryDetail="Pass ?entry=src/components/.../*.g.tsx to render a Studio package frame."
    />
  )
}
