import {
  useGContext,
  type GCases,
  type GProviderCase,
} from "@gtsx/core"

import UnmarkedProviderProjectionChild from "./UnmarkedProviderProjectionChild.g"
import { LoginProvider } from "./MissingProviderVariant.g"

export default function ProviderProjectionParent() {
  const login = useGContext(LoginProvider)
  return <UnmarkedProviderProjectionChild userName={login.kind === "login" ? login.name : "Guest"} />
}

ProviderProjectionParent.cases = {
  login: {
    props: {},
    providers: [[LoginProvider, { kind: "login", name: "Ada" }]],
  } satisfies GProviderCase<typeof LoginProvider, "login">,
  anonymous: {
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  } satisfies GProviderCase<typeof LoginProvider, "anonymous">,
} satisfies GCases<Record<string, never>, never, [typeof LoginProvider]>
