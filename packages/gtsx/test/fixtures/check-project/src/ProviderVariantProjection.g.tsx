import {
  type GCases,
  type GProviderCase,
} from "@gtsx/core"

import { LoginProvider } from "./MissingProviderVariant.g"

type Props = {
  userName: string
}

export default function ProviderVariantProjection(props: Props) {
  return <span>{props.userName}</span>
}

ProviderVariantProjection.cases = {
  loginName: {
    props: { userName: "Ada" },
  } satisfies GProviderCase<typeof LoginProvider, "login">,
  anonymousName: {
    props: { userName: "Guest" },
  } satisfies GProviderCase<typeof LoginProvider, "anonymous">,
} satisfies GCases<Props>
