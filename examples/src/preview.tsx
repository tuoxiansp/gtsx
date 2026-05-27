import {
  GTSXVitePreviewClient,
  isGTSXPreviewComponent,
  parseGTSXPreviewEntry,
  readGTSXPreviewRouteParams,
  type GTSXPreviewModule,
} from "@gtsx/adapter-vite-react/preview"

const modules = import.meta.glob<GTSXPreviewModule>("./cases/**/*.g.tsx")

export function GTSXPreviewApp() {
  const params = readGTSXPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <GTSXVitePreviewClient
      {...params}
      loadComponent={loadExamplePreviewComponent}
      missingEntryDetail="Pass ?entry=src/cases/.../*.g.tsx to render a GTSX example."
    />
  )
}

async function loadExamplePreviewComponent(entry: string) {
  const { file, exportName } = parseGTSXPreviewEntry(entry)
  const loader = modules[toModuleKey(file)]
  if (!loader) return undefined

  const moduleValue = await loader()
  const component = moduleValue[exportName]
  return isGTSXPreviewComponent(component) ? component : undefined
}

function toModuleKey(entryFile: string): keyof typeof modules {
  return `./${entryFile.replace(/^src\//, "")}` as keyof typeof modules
}
