import {
  GTSXReactPreviewClient,
  isGTSXPreviewComponent,
  parseGTSXPreviewEntry,
  readGTSXPreviewRouteParams,
  type GTSXPreviewModule,
} from "@gtsx/preview-react"

const modules = import.meta.glob<GTSXPreviewModule>("./components/**/*.g.tsx")

export function GTSXPreviewApp() {
  const params = readGTSXPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <GTSXReactPreviewClient
      {...params}
      loadComponent={loadStudioPreviewComponent}
      missingEntryDetail="Pass ?entry=src/components/.../*.g.tsx to render a Studio package case."
    />
  )
}

async function loadStudioPreviewComponent(entry: string) {
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
