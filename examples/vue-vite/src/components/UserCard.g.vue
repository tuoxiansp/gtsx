<template>
  <article class="user-card" :data-state="status">
    <p class="eyebrow">{{ props.userId }}</p>
    <h1 v-if="status === 'loading'">Loading profile</h1>
    <section v-else-if="status === 'error'">
      <h1>Profile failed</h1>
      <p>{{ message }}</p>
    </section>
    <section v-else>
      <h1>{{ formatName(user.name) }}</h1>
      <p>{{ user.role }}</p>
    </section>
  </article>
</template>

<script setup lang="ts">
const props = defineProps<{ userId: string }>()
const status = "production-only"
const user = { name: "Production User", role: "Live data" }

function formatName(value: string) {
  return value.toUpperCase()
}
</script>

<g:frames>
export default {
  loading: {
    description: "loading frame",
    props: { userId: "user_loading" },
    scope: { status: "loading" },
  },
  error: {
    description: "error frame",
    props: { userId: "user_error" },
    scope: {
      status: "error",
      message: "The profile service timed out.",
    },
  },
  ready: {
    description: "ready frame",
    props: { userId: "user_42" },
    scope: {
      status: "ready",
      user: {
        name: "Ada Lovelace",
        role: "Preview systems engineer",
      },
    },
  },
}
</g:frames>
