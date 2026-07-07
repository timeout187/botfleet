# Repo layout

This is an npm workspace. `apps/control-plane` is the Next.js
dashboard/API (the only real app so far - see `docs/roadmap.md` and
`docs/distributed-audit.md`). Root-level docs (`docs/*.md`) describe the
whole system; anything under `apps/control-plane/` is scoped to that app
only.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `apps/control-plane/node_modules/next/dist/docs/` (or the hoisted `node_modules/next/dist/docs/` at the repo root) before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
