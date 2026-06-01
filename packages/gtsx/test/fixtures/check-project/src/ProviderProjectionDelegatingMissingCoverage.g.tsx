import {
  useGContext,
  type GCases,
} from "@gtsx/core"

import ProviderVariantProjection from "./ProviderVariantProjection.g"
import { LoginProvider } from "./MissingProviderVariant.g"

export default function ProviderProjectionDelegatingMissingCoverage() {
  const login = useGContext(LoginProvider)
  return <ProviderVariantProjection userName={login.kind === "login" ? login.name : "Guest"} />
}

ProviderProjectionDelegatingMissingCoverage.cases = {
  loading: {
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  },
} satisfies GCases<Record<string, never>, never, [typeof LoginProvider]>
