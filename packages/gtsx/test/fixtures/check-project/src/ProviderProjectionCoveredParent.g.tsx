import {
  useGContext,
  type GCases,
  type GProviderCase,
} from "@gtsx/core"

import ProviderVariantProjection from "./ProviderVariantProjection.g"
import { LoginProvider } from "./MissingProviderVariant.g"

export default function ProviderProjectionCoveredParent() {
  const login = useGContext(LoginProvider)
  return <ProviderVariantProjection userName={login.kind === "login" ? login.name : "Guest"} />
}

ProviderProjectionCoveredParent.cases = {
  login: {
    props: {},
    providers: [[LoginProvider, { kind: "login", name: "Ada" }]],
  } satisfies GProviderCase<typeof LoginProvider, "login">,
  anonymous: {
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  } satisfies GProviderCase<typeof LoginProvider, "anonymous">,
} satisfies GCases<Record<string, never>, never, [typeof LoginProvider]>
