# Runelight Vue Authoring Reference

Use these patterns for `.g.vue` files.

## Pure Props

Use `props` when all visual states are public component inputs.

```vue
<template>
  <span :data-tone="tone">{{ label }}</span>
</template>

<script setup lang="ts">
defineProps<{ tone: "ok" | "warn"; label: string }>()
</script>

<g:frames>
export default {
  ok: {
    props: { tone: "ok", label: "Ready" },
  },
  warn: {
    props: { tone: "warn", label: "Needs review" },
  },
}
</g:frames>
```

The preview transform exposes prop keys directly to the template and also exposes the `props` object.

## Template Scope

Use `scope` for state that would normally come from queries, stores, composables, or local script state.

```vue
<template>
  <article>
    <p>{{ props.resourceId }}</p>
    <p v-if="status === 'loading'">Loading</p>
    <button v-else-if="status === 'error'">{{ message }}</button>
    <section v-else>
      <h1>{{ title }}</h1>
      <p>{{ items.length }} items</p>
    </section>
  </article>
</template>

<script setup lang="ts">
const props = defineProps<{ resourceId: string }>()
const status = useRemoteStatus(props.resourceId)
</script>

<g:frames>
export default {
  loading: {
    props: { resourceId: "res_1" },
    scope: { status: "loading" },
  },
  error: {
    props: { resourceId: "res_1" },
    scope: { status: "error", message: "Retry" },
  },
  ready: {
    props: { resourceId: "res_1" },
    scope: { status: "ready", title: "Dashboard", items: [1, 2, 3] },
  },
}
</g:frames>
```

Preview does not need to run `useRemoteStatus` to render these states because `status`, `message`, `title`, and `items` are supplied by `scope`.

## Helpers And Formatting

Helpers can remain in `<script setup>` when they are pure local functions or safe imports preserved by the preview transform.

```vue
<template>
  <h1>{{ formatName(user.name) }}</h1>
</template>

<script setup lang="ts">
function formatName(value: string) {
  return value.toUpperCase()
}
</script>

<g:frames>
export default {
  ready: {
    scope: { user: { name: "Ada Lovelace" } },
  },
}
</g:frames>
```

Avoid opaque helpers for structural template decisions:

```vue
<!-- Prefer this -->
<section v-if="status === 'ready'">...</section>

<!-- Avoid this for branch coverage -->
<section v-if="isReady(status)">...</section>
```

## Props Object Vs Direct Props

Both forms are valid in template:

```vue
<template>
  <p>{{ props.userId }}</p>
  <p>{{ userId }}</p>
</template>
```

Use `props.userId` when it helps distinguish public input from local scope. Use direct `userId` for idiomatic compact Vue templates.

## Native Provide / Inject

Use frame `provide` only when the component already consumes native Vue injection. Prefer `props` or `scope` for ordinary component state.

```vue
<template>
  <section>
    <p v-if="auth.role === 'admin'">Admin tools</p>
    <p v-else>Viewer tools</p>
  </section>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { authKey } from "./auth"

const auth = inject(authKey)!
</script>

<g:frames lang="ts">
import { authKey } from "./auth"
import type { GVueFrames, GVueProvideFrame } from "@runelight/core/vue"

export default {
  admin: {
    props: {},
    provide: [[authKey, { role: "admin" }]],
  } satisfies GVueProvideFrame<typeof authKey, "admin">,
  viewer: {
    props: {},
    provide: [[authKey, { role: "viewer" }]],
  } satisfies GVueProvideFrame<typeof authKey, "viewer">,
} satisfies GVueFrames<Record<string, never>, never, [typeof authKey]>
</g:frames>
```

The `provide` value is the runtime preview value. The `GVueProvideFrame` marker is type-level metadata that tells Studio and `runelight check` which finite injection variant the frame covers.

## Frame Names

Name frames by visual state:

- `ready`
- `loading`
- `empty`
- `error`
- `disabled`
- `overflowing`
- `anonymous`

Avoid `case1`, `fixture2`, `foo`, or data-shaped names.

## Child Components

Plain Vue child components can run normally if their script is safe in dev preview. If a business child has remote data, auth, router, or store assumptions that break preview, use one of these paths:

- make the child a `.g.vue` protocol component too;
- keep the parent frame focused on parent-owned state and test the child separately;
- stub or wrap unsafe app-level dependencies in the preview host.

## Current Limitations

- Finite Vue injection variant axes currently require TypeScript frame markers.
- `.g.vue` exposes one protocol component entry: the default SFC component.
- Frame objects must be statically enumerable; top-level spread composition is not supported yet.

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| `<g:frame>` nested blocks | Use one `<g:frames>` block with `export default { ... }` |
| `bindings` frame field | Use `scope` |
| Relying on production-only setup state for preview branches | Put the template-visible value in frame `scope` |
| Opaque helper controls `v-if` / `v-for` | Make the directive depend directly on `props`, `scope`, or injected frame values |
| Forgetting styles | Keep SFC `<style>` blocks; preview preserves them |
