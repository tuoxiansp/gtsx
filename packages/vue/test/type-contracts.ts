import {
  defineGInjectionKey,
  type AnyGVueInjectionKey,
  type GVueFrames,
  type GVueInjectionKeyOptions,
  type GVueProviderEntries,
  type GVueProviderEntriesFor,
  type GVueProviderEntry,
  type GVueProviderFrame,
} from "../src/index.js"
import { createRunelightVueAnalysisCache, type RunelightVueAnalysisCache } from "../src/contract.js"

type AuthState = {
  role: "admin" | "viewer"
}

type Props = {
  userId: string
}

const authKey = defineGInjectionKey<AuthState>({ variants: ["admin", "viewer"] as const })

type RuntimeSupportTypesArePublic = [
  AnyGVueInjectionKey,
  GVueProviderEntry,
  GVueProviderEntries,
  GVueProviderEntriesFor<readonly []>,
  GVueInjectionKeyOptions,
]

type _AssertRuntimeSupportTypesArePublic = RuntimeSupportTypesArePublic

const publicAnalysisCache: RunelightVueAnalysisCache = createRunelightVueAnalysisCache()
void publicAnalysisCache
// @ts-expect-error Vue analysis cache construction does not expose AST preloading.
createRunelightVueAnalysisCache(new Map())
// @ts-expect-error Vue analysis cache internals are not public API.
publicAnalysisCache.sourceFilesByPath

const frames = {
  admin: {
    description: "Admin auth context",
    props: { userId: "user_1" },
    providers: [[authKey, { role: "admin" }]],
  } satisfies GVueProviderFrame<typeof authKey, "admin", Props>,
  viewer: {
    description: "Viewer auth context",
    props: { userId: "user_2" },
    providers: [[authKey, { role: "viewer" }]],
  } satisfies GVueProviderFrame<typeof authKey, "viewer", Props>,
} satisfies GVueFrames<Props, never, [typeof authKey]>

void frames
