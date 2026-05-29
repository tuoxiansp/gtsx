import { buildGTSXProjectIndex } from "@gtsx/core/project-index"
import { transformGTSXReactModule } from "@gtsx/core/react-transform"
import { resolveGTSXConfig } from "@gtsx/core/config-model"
import type { GTSXConfig, ResolvedGTSXConfig } from "@gtsx/core"

export { transformGTSXComponentBoundaries, transformGTSXReactModule } from "@gtsx/core/react-transform"

type ViteLikeConfig = {
  root: string
}

type TransformResult = {
  code: string
  map: null
}

type GTSXViteReactOptions = {
  config?: GTSXConfig
  projectRoot?: string
  root?: string
  tsconfigPath?: string
}

export function gtsxViteReact(options: GTSXViteReactOptions = {}) {
  let root = options.root ?? process.cwd()
  const resolvedConfig = options.config ? resolveGTSXConfig(options.config) : undefined
  const virtualProjectIndexId = "virtual:gtsx/project-index"
  const virtualConfigId = "virtual:gtsx/config"
  const resolvedVirtualProjectIndexId = `\0${virtualProjectIndexId}`
  const resolvedVirtualConfigId = `\0${virtualConfigId}`

  return {
    name: "@gtsx/adapter-vite-react",
    enforce: "pre" as const,
    config() {
      return {
        optimizeDeps: {
          include: ["react-tracked", "scheduler", "use-context-selector"],
          exclude: ["@gtsx/adapter-vite-react", "typescript", virtualConfigId, virtualProjectIndexId],
        },
      }
    },
    configResolved(config: ViteLikeConfig) {
      root = options.root ?? config.root
    },
    resolveId(id: string) {
      if (id === virtualProjectIndexId) return resolvedVirtualProjectIndexId
      if (id === virtualConfigId) return resolvedVirtualConfigId
      return null
    },
    load(id: string): TransformResult | null {
      if (id === resolvedVirtualConfigId) {
        return {
          code: `export default ${JSON.stringify(resolvedConfig ?? defaultResolvedConfig())}\n`,
          map: null,
        }
      }
      if (id !== resolvedVirtualProjectIndexId) return null
      const projectIndex = buildGTSXProjectIndex({
        cwd: root,
        projectRoot: options.projectRoot ?? resolvedConfig?.project.root ?? "src",
        tsconfigPath: options.tsconfigPath ?? resolvedConfig?.project.tsconfig,
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

function defaultResolvedConfig(): ResolvedGTSXConfig {
  return resolveGTSXConfig({
    preview: {},
  })
}
