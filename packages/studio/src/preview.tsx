import {
  createRunelightVitePreviewComponentLoader,
  RunelightVitePreviewClient,
  readRunelightPreviewRouteParams,
  type RunelightPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import runelightConfig from "virtual:runelight/config"

const modules = import.meta.glob<RunelightPreviewModule>(["./components/**/*.g.tsx", "/app/runelight/design/**/*.g.tsx"])
const loadStudioPreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: runelightConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <RunelightVitePreviewClient
      {...params}
      loadComponent={loadStudioPreviewComponent}
      missingEntryDetail="Pass ?entry=src/components/.../*.g.tsx to render a Studio package frame."
    />
  )
}
