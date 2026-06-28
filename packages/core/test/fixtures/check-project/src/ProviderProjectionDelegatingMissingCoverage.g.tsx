import { useGContext, type GFrames } from "@runelight/react/runtime"

import ProviderVariantProjection from "./ProviderVariantProjection.g"
import { LoginProvider } from "./MissingProviderVariant.g"

export default function ProviderProjectionDelegatingMissingCoverage() {
  const login = useGContext(LoginProvider)
  return <ProviderVariantProjection userName={login.kind === "login" ? login.name : "Guest"} />
}

ProviderProjectionDelegatingMissingCoverage.frames = {
  loading: {
    description: "loading frame",
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  },
} satisfies GFrames<Record<string, never>, never, [typeof LoginProvider]>
