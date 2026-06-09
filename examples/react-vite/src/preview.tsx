import {
  createRunelightVitePreviewComponentLoader,
  RunelightVitePreviewClient,
  readRunelightPreviewRouteParams,
  type RunelightPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import runelightConfig from "virtual:runelight/config"

const modules = import.meta.glob<RunelightPreviewModule>(["./frames/**/*.g.tsx", "/app/runelight/design/**/*.g.tsx"], {
  query: "?runelight-preview",
})
const loadExamplePreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: runelightConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <RunelightVitePreviewClient
      {...params}
      loadComponent={loadExamplePreviewComponent}
      missingEntryDetail="Pass ?entry=src/frames/.../*.g.tsx to render a Runelight example."
    />
  )
}
