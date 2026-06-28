<template>
  <section class="inbox-shell" :data-mode="mode">
    <p class="eyebrow">{{ environment.tone }}</p>
    <h1>{{ title }}</h1>
    <p>{{ summary }}</p>
    <InboxBadge :label="badgeLabel" :unread="unread" />
  </section>
</template>

<script setup lang="ts">
import { inject } from "vue"
import InboxBadge from "./InboxBadge.g.vue"
import { inboxEnvironmentKey } from "./inboxEnvironment"

const environment = inject(inboxEnvironmentKey, { tone: "local" })
const mode = "production"
const title = "Production inbox"
const summary = "Live inbox data"
const badgeLabel = "Live queue"
const unread = 0
</script>

<g:frames lang="ts">
import { inboxEnvironmentKey } from "./inboxEnvironment"
import type { GVueFrames, GVueProviderFrame } from "@runelight/vue/runtime"

type Props = Record<string, never>
type Scope = {
  badgeLabel: string
  mode: "review" | "quiet"
  summary: string
  title: string
  unread: number
}

export default {
  stagingReview: {
    description: "stagingReview frame",
    props: {},
    scope: {
      badgeLabel: "Parent review queue",
      mode: "review",
      summary: "The child receives unread=5 from this parent frame and staging from the parent provider.",
      title: "Review inbox",
      unread: 5,
    },
    providers: [[inboxEnvironmentKey, { tone: "staging" }]],
  } satisfies GVueProviderFrame<typeof inboxEnvironmentKey, "staging", Props, Scope>,
  localQuiet: {
    description: "localQuiet frame",
    props: {},
    scope: {
      badgeLabel: "Parent local queue",
      mode: "quiet",
      summary: "This parent frame passes a quiet local state into the same child component.",
      title: "Local inbox",
      unread: 0,
    },
    providers: [[inboxEnvironmentKey, { tone: "local" }]],
  } satisfies GVueProviderFrame<typeof inboxEnvironmentKey, "local", Props, Scope>,
} satisfies GVueFrames<Props, Scope, [typeof inboxEnvironmentKey]>
</g:frames>
