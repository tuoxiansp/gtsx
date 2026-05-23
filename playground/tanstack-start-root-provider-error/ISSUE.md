# TanStack Start Root Provider Error

Upstream issue: https://github.com/TanStack/router/issues/7133

The reported failure happens when providers above the route outlet fetch data
during startup and fail before TanStack Start can show a route error boundary.
The server responds with raw JSON such as:

```json
{"status":500,"unhandled":true,"message":"HTTPError"}
```

This playground keeps that shape by placing the primary GTSX entry at
`src/routes/__root.g.tsx`. The cases model `apiDown`, `recovering`, and `ready`
states so GTSX can check, serve, capture, and strip the same boundary-adjacent
component through the Script adapter.
