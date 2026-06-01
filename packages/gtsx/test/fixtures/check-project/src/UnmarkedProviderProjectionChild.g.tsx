import type { GCases } from "@gtsx/core"

type Props = {
  userName: string
}

export default function UnmarkedProviderProjectionChild(props: Props) {
  return <span>{props.userName}</span>
}

UnmarkedProviderProjectionChild.cases = {
  guest: {
    props: { userName: "Guest" },
  },
  named: {
    props: { userName: "Ada" },
  },
} satisfies GCases<Props>
