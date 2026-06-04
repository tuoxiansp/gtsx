---
name: intelligence-test
description: Ask the agent to do agent-driven end-to-end validation for this gtsx repo. Use when the user mentions intelligence test, `.it.md`, agent-driven E2E, or wants confidence beyond unit/type/build checks.
---

# Intelligence Test

Run tests like a smart human would: understand the change, choose the relevant projects/routes/commands, and verify real behavior.

If the user gives specific `.it.md` notes or scenarios, follow them; otherwise look under `intelligence-tests/` and choose selectively based on impact area. Do not try to exhaust every local project by default.

Prefer real evidence over narration: dev server routes, HTTP responses, browser-visible results, screenshots/traces when useful, and deterministic commands such as tests/typecheck/build.

Clean up temporary files and stop servers. Report what was tested, what passed, and any important gap left untested.
