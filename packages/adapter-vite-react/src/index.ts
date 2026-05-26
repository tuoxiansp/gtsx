import { buildGTSXProjectIndex } from "gtsx/project-index"
import { transformGTSXReactModule } from "gtsx/react-transform"

export { transformGTSXComponentBoundaries, transformGTSXReactModule } from "gtsx/react-transform"

type ViteLikeConfig = {
  root: string
}

type TransformResult = {
  code: string
  map: null
}

type GTSXViteReactOptions = {
  projectRoot?: string
  root?: string
  tsconfigPath?: string
}

export function gtsxViteReact(options: GTSXViteReactOptions = {}) {
  let root = options.root ?? process.cwd()
  const virtualProjectIndexId = "virtual:gtsx/project-index"
  const resolvedVirtualProjectIndexId = `\0${virtualProjectIndexId}`

  return {
    name: "@gtsx/adapter-vite-react",
    enforce: "pre" as const,
    config() {
      return {
        optimizeDeps: {
          exclude: ["@gtsx/adapter-vite-react", "typescript", virtualProjectIndexId],
        },
      }
    },
    configResolved(config: ViteLikeConfig) {
      root = options.root ?? config.root
    },
    resolveId(id: string) {
      if (id === virtualProjectIndexId) return resolvedVirtualProjectIndexId
      return null
    },
    load(id: string): TransformResult | null {
      if (id !== resolvedVirtualProjectIndexId) return null
      const projectIndex = buildGTSXProjectIndex({
        cwd: root,
        projectRoot: options.projectRoot ?? "src",
        tsconfigPath: options.tsconfigPath,
      })
      return {
        code: `export default ${JSON.stringify(projectIndex)}\n`,
        map: null,
      }
    },
    transform(code: string, id: string): TransformResult | null {
      const transformed = transformGTSXReactModule({
        code,
        filePath: id,
        root,
      })

      return transformed ? { code: transformed.code, map: null } : null
    },
  }
}
