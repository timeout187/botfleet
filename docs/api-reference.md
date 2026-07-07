# API Reference

All routes return JSON. Admin routes require an authenticated session with
role `admin` or `owner` (`401` if signed out, `403` if signed in but not
admin). Customer routes require any authenticated session, then scope to
resources owned by that user (`404` for anything not owned by you).

## Admin API

| Method | Path                                           | Body                                                                                     | Notes                                                                                  |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/admin/fleet/overview`                    | -                                                                                        | Fleet-wide metrics                                                                     |
| GET    | `/api/admin/bots`                              | -                                                                                        | List all bots                                                                          |
| POST   | `/api/admin/bots`                              | `{ customerId, name, clientId, token, plan?, guildLimit?, shardCount?, workerGroupId? }` | Creates a bot; enforces plan limits                                                    |
| GET    | `/api/admin/bots/:id`                          | -                                                                                        | Bot detail + health + shards                                                           |
| PATCH  | `/api/admin/bots/:id`                          | Partial bot fields                                                                       | Re-checks plan limits if guildLimit/shardCount change                                  |
| POST   | `/api/admin/bots/:id/start`                    | -                                                                                        | Via `RunnerAdapter` (stubbed, see docs/architecture.md)                                |
| POST   | `/api/admin/bots/:id/stop`                     | -                                                                                        | Same                                                                                   |
| POST   | `/api/admin/bots/:id/restart`                  | -                                                                                        | Same; increments restart count                                                         |
| POST   | `/api/admin/bots/:id/rotate-token`             | `{ token }`                                                                              | Re-encrypts in place                                                                   |
| GET    | `/api/admin/customers`                         | -                                                                                        | List customers                                                                         |
| POST   | `/api/admin/customers`                         | `{ name, plan? }`                                                                        |                                                                                        |
| GET    | `/api/admin/workers`                           | -                                                                                        | List workers                                                                           |
| POST   | `/api/admin/workers`                           | `{ name, mode?, host?, maxBots? }`                                                       |                                                                                        |
| POST   | `/api/admin/workers/:id/restart`               | -                                                                                        | Status transition only today                                                           |
| POST   | `/api/admin/workers/:id/drain`                 | -                                                                                        | Moves every bot off this worker to other capacity, for real                            |
| GET    | `/api/admin/logs?targetType=&targetId=&limit=` | -                                                                                        | Audit log                                                                              |
| GET    | `/api/admin/alerts?status=&limit=`             | -                                                                                        | Alert history                                                                          |
| GET    | `/api/admin/webhooks`                          | -                                                                                        | List Discord alert destinations                                                        |
| POST   | `/api/admin/webhooks`                          | `{ name, url, events? }`                                                                 | URL is encrypted at rest                                                               |
| DELETE | `/api/admin/webhooks/:id`                      | -                                                                                        |                                                                                        |
| POST   | `/api/admin/alerts/test`                       | `{ webhookId }`                                                                          | Sends a real Discord embed, mass mentions disabled                                     |
| GET    | `/api/admin/security`                          | -                                                                                        | Real, computed security report                                                         |
| GET    | `/api/admin/users`                             | -                                                                                        | List users and roles                                                                   |
| PATCH  | `/api/admin/users/:id`                         | `{ role }`                                                                               | Owner-only; refuses to demote the last remaining owner                                 |
| GET    | `/api/admin/workers/rebalance`                 | -                                                                                        | Rebalancing recommendations (read-only, nothing moves)                                 |
| GET    | `/api/admin/plugins`                           | -                                                                                        | List registered plugins and what they contribute                                       |
| POST   | `/api/admin/alerts/evaluate`                   | -                                                                                        | Runs every alert rule; creates Alert rows for triggers                                 |
| POST   | `/api/admin/bots/:id/explain-crash`            | -                                                                                        | Enqueues a crash-analysis job (422 if no recorded error)                               |
| GET    | `/api/admin/ai/jobs/:jobId`                    | -                                                                                        | Poll a queued AI job's state/result                                                    |
| GET    | `/api/admin/deployments`                       | -                                                                                        | List deployment history                                                                |
| POST   | `/api/admin/deployments`                       | `{ version, commitSha, notes? }`                                                         | Runs plugin hooks, then queues staggered restarts (response includes `restartsQueued`) |
| GET    | `/api/admin/system-state`                      | -                                                                                        | Current maintenance mode state                                                         |
| PATCH  | `/api/admin/system-state`                      | `{ maintenanceMode }`                                                                    | Toggles maintenance mode; audit-logged                                                 |
| GET    | `/api/admin/agents`                            | -                                                                                        | List enrolled agents (see docs/agent-enrollment.md)                                    |
| POST   | `/api/admin/agents/enrollment-tokens`          | `{ environment?, requiredLabels?, ttlMinutes? }`                                         | Returns the plaintext token once; only its hash is ever stored                         |

## Customer API

| Method | Path                             | Notes                                                                 |
| ------ | -------------------------------- | --------------------------------------------------------------------- |
| GET    | `/api/customer/bots`             | Bots owned by the signed-in user's customer record(s)                 |
| GET    | `/api/customer/bots/:id`         | 404 if not owned                                                      |
| POST   | `/api/customer/bots/:id/restart` | 503 if maintenance mode is on; 403 if the bot's plan doesn't allow it |
| GET    | `/api/customer/bots/:id/logs`    | Redacted: action + timestamp only, no actor/metadata                  |

## Auth

| Method | Path                      | Notes                                |
| ------ | ------------------------- | ------------------------------------ |
| *      | `/api/auth/[...nextauth]` | NextAuth v5 handlers (Discord OAuth) |

See `lib/serialize.ts` for the exact response shape of a bot (admin vs.
customer view) - `tokenEncrypted` is never present in either.
