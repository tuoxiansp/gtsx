# Next.js App Router Init Structure

Upstream issue: https://github.com/vercel/next.js/issues/59845

The report centered on a newly created App Router project appearing to boot to
404 because the expected root page structure was misunderstood or missing.

This playground keeps a minimal App Router shape:

- `app/layout.tsx`
- `app/page.tsx`
- `app/api/ping/route.ts`
- `components/AppShell.g.tsx`

GTSX validates the component-level states that make the initial app shell and
route-handler health visible to preview/capture without replacing Next.js.
