# Composable Frame Inputs

This is the target contract for rendering `.g` components inside other `.g` components.

Runelight frames are still named visual states. The important distinction is where each input comes from when a component is rendered in composition.

## Input Sources

Runelight treats the three frame fields as different kinds of inputs:

| Input | Contract role |
| --- | --- |
| `props` | Explicit parent-to-child inputs. |
| `providers` | Ancestor environment values available to descendants. |
| `scope` | The local output of this component's Runelight seam. |

Those roles determine precedence.

When `B` is rendered as a child of `A`, `B.props` are the props produced by `A`'s render. Those props may have come from `A.props`, `A.scope`, `A.providers`, or static literals. Their upstream source does not make them less real. For `B`, they are external props.

Provider values follow the same composition boundary. If `A` renders or supplies a provider environment around `B`, `B` reads that external environment. `B`'s own frame-level providers are fallback mock values for isolated `B` preview or explicit `B` frame selection; they do not replace an ancestor provider environment.

`scope` is different. It is not passed across the composition boundary. `A.scope` can influence `B.props` or provider values through `A`'s render, but it never becomes `B.scope`. A frame scope belongs to the component coordinate whose seam it replaces.

## Precedence

For an isolated component preview, the selected frame supplies the component's authored mock inputs:

```text
Root.props     = selected frame props
Root.providers = selected frame providers
Root.scope     = selected frame scope
```

For a child rendered inside a parent frame:

```text
B.props     = props produced by the parent render
B.providers = nearest ancestor provider values, if present
B.scope     = B's selected frame scope, or B's first frame scope
```

The child component's authored frame props never replace props that the parent actually passed. The child component's authored provider values never replace an external provider environment. The child frame still names the child-local state; its `scope` is the mock seam value, while its `props` and `providers` are fallback data for isolated preview or missing external inputs.

## Explicit Child Frame Selection

Preview paths may still select a child frame deliberately with `frameOverride`, and `runelight capture --path` can capture that exact path:

```text
src/Parent.g.tsx#default:review
  overrides src/Child.g.tsx#default:expanded
```

That selection means "use `Child.expanded` for child-local mock inputs." It does not mean "ignore the props passed by the parent." Parent-produced props still win because props are explicit composition inputs.

Where the framework runtime supports nested overrides, this lets a preview caller inspect a parent frame while experimenting with child-local scope or provider mocks, without rewriting the parent's render.

## Synthetic Input Overrides

Preview URLs may also use `inputOverride=<coordinate>:<frame>` to overlay the input payload from another frame:

```text
/runelight?entry=src/Parent.g.tsx#default&frame=review&inputOverride=src%2FChild.g.tsx%23default:expanded
```

This is synthetic exploration, not a reachability proof. It lets an agent ask "what would this parent render look like if this child boundary received the input payload from `Child.expanded`?"

`frameOverride` and `inputOverride` are intentionally separate:

| Query param | Meaning |
| --- | --- |
| `frameOverride` | Selects the named frame for a coordinate. |
| `inputOverride` | Keeps the current frame selection, but shallowly overlays the named frame's `props`, `scope`, and `providers` as runtime input. |

For React nested previews, an input override has the highest preview precedence for the matched coordinate:

```text
B.props     = parent-rendered props shallowly overlaid with inputOverride frame props
B.scope     = inputOverride frame scope, when present; otherwise B's selected frame scope
B.providers = inputOverride frame providers, when present; otherwise ancestor or selected frame providers
```

For Vue preview, `inputOverride` applies to the root preview entry. Nested `.g.vue` children still render through ordinary Vue composition and do not expose React-style runtime child boundaries yet.

## Edge Cases

### Props Derived From Parent Scope

This is valid and expected:

```text
A.frame.scope -> A render -> <B userId={selectedUserId} />
```

`selectedUserId` came from `A.scope`, but `B.userId` is still an external prop for `B`.

### Provider Values Derived From Parent State

This is also valid:

```text
A.frame.scope -> A render -> <ThemeProvider value={theme}> -> B
```

`B` reads the provider environment. `B.frames.*.providers` are isolated-preview mocks unless `B` is explicitly selected.

### Child Scope Without Explicit Override

If `B` uses a Runelight scope hook and no child frame override is selected for `B`, `B` should not inherit `A.scope` and should not run its real seam. It should use `B`'s first frame as the child-local state frame, while keeping parent-rendered props and external providers authoritative.

This keeps the render frame-first: frames say which state is being shown; data comes from parent inputs when those inputs exist, otherwise from the frame mocks.

### Multiple Instances Of The Same Child

Two `<B />` instances inside one parent frame can receive different props. A coordinate-level child frame name alone cannot describe both instances. Studio should treat those as runtime instances first, and only show a named child frame match when the rendered instance is known to correspond to that frame.

### Collections And Render Props

Children produced through maps, slots, or render props are still composition children. Parent-produced props and provider environments remain authoritative when the child instance is rendered.

### Provider Variants

Provider variant markers are Studio axes. They can help select matching frames, but they do not change provider precedence. External provider values still win over child frame provider mocks.

## Framework Status

### React

React `.g.tsx` preview implements the full precedence model for nested Runelight components:

- root previews still use the selected frame as isolated mock input;
- unselected nested children default to their first frame for child-local scope and fallback provider mocks;
- explicit child frame overrides apply only child-local scope/provider mocks;
- parent-rendered props and real ancestor provider values stay authoritative over child frame props/provider mocks;
- Studio can label a selected child card as a parent-rendered runtime instance when runtime values are available for that boundary.

### Vue

Vue `.g.vue` preview implements the core precedence concern for unselected nested children. The root preview entry is frame-transformed, but nested `.g.vue` imports render as ordinary Vue SFCs with `<g:frames>` elided. That means parent-rendered props and native Vue injection values flow into the child through normal Vue composition, instead of the child silently consuming its first isolated frame.

The current Vue boundary is narrower than React: nested `.g.vue` children do not yet expose equivalent runtime child boundaries, runtime values, or explicit child frame overrides inside a parent preview. Use isolated child preview for child frame inspection, and keep child production script preview-safe when the child is expected to render inside parent frames.

## Implementation Notes

- React runtime boundaries are coordinate-local so parent scope does not leak into child scope.
- Studio's runtime instance marker is card-level state, not a values inspector. It distinguishes a parent-rendered child instance from the child's isolated frame grid without rendering prop/provider payloads.
- Vue's no-query transform intentionally preserves ordinary SFC execution for nested children. It only removes `<g:frames>` so child frame mocks cannot override the parent render by accident.
