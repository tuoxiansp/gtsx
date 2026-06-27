import { defineGInjectionKey } from "@runelight/vue/runtime"

export type InboxEnvironment = {
  tone: "local" | "staging"
}

export const inboxEnvironmentKey = defineGInjectionKey<InboxEnvironment>({
  variants: ["local", "staging"] as const,
})
