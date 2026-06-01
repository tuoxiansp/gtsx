import {
  useGContext,
  type GCases,
  type GProviderCase,
} from "@gtsx/core"

import { LoginProvider } from "./MissingProviderVariant.g"

export default function MultiVariantProviderCase() {
  const login = useGContext(LoginProvider)
  return <span>{login.kind === "login" ? login.name : "Guest"}</span>
}

MultiVariantProviderCase.cases = {
  loading: {
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  } satisfies GProviderCase<typeof LoginProvider, "login" | "anonymous">,
} satisfies GCases<Record<string, never>, never, [typeof LoginProvider]>
