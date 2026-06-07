import { defineGInjectionKey, type GVueFrames, type GVueProvideFrame } from "../src/vue.js"

type AuthState = {
  role: "admin" | "viewer"
}

type Props = {
  userId: string
}

const authKey = defineGInjectionKey<AuthState>({ variants: ["admin", "viewer"] as const })

const frames = {
  admin: {
    props: { userId: "user_1" },
    provide: [[authKey, { role: "admin" }]],
  } satisfies GVueProvideFrame<typeof authKey, "admin", Props>,
  viewer: {
    props: { userId: "user_2" },
    provide: [[authKey, { role: "viewer" }]],
  } satisfies GVueProvideFrame<typeof authKey, "viewer", Props>,
} satisfies GVueFrames<Props, never, [typeof authKey]>

void frames
