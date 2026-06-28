<template>
  <article class="inbox-badge" :data-tone="environment.tone">
    <p class="eyebrow">{{ label }}</p>
    <h2>{{ unread }} {{ unread === 1 ? "message" : "messages" }}</h2>
    <p v-if="environment.tone === 'staging'">Rendered from the parent staging frame.</p>
    <p v-else>Rendered from the child isolated local frame.</p>
  </article>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { inboxEnvironmentKey } from "./inboxEnvironment"

const props = defineProps<{ label: string; unread: number }>()
const environment = inject(inboxEnvironmentKey, { tone: "local" })
const label = props.label
const unread = props.unread
</script>

<g:frames lang="ts">
import { inboxEnvironmentKey } from "./inboxEnvironment"
import type { GVueFrames, GVueProviderFrame } from "@runelight/vue/runtime"

type Props = { label: string; unread: number }

export default {
  localEmpty: {
    description: "localEmpty frame",
    props: { label: "Isolated inbox", unread: 0 },
    providers: [[inboxEnvironmentKey, { tone: "local" }]],
  } satisfies GVueProviderFrame<typeof inboxEnvironmentKey, "local", Props>,
  stagingSingle: {
    description: "stagingSingle frame",
    props: { label: "Isolated staging inbox", unread: 1 },
    providers: [[inboxEnvironmentKey, { tone: "staging" }]],
  } satisfies GVueProviderFrame<typeof inboxEnvironmentKey, "staging", Props>,
} satisfies GVueFrames<Props, never, [typeof inboxEnvironmentKey]>
</g:frames>
