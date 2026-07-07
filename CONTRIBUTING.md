# Contributing to BotFleet

BotFleet is early-stage and the data model/API surface are still settling.
Please open an issue before starting a large PR so we can agree on direction.

## Development setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, BOTFLEET_ENCRYPTION_KEY, Discord OAuth, AUTH_SECRET
npx prisma migrate dev
npm run dev
```

## Before opening a PR

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Project conventions

- No feature is documented as "done" unless it's real - see the README's
  "Not built yet" list. If you build a stubbed module, either remove it from
  that list or leave a `TODO(...)` marker explaining what's missing.
- Bot tokens and webhook URLs are only ever handled via `lib/crypto.ts`'s
  `encryptSecret`/`decryptSecret`. Never log a decrypted secret, and never
  add a field/response that returns one.
- Admin API routes must go through `requireAdmin()` (`lib/require-admin.ts`)
  and always return JSON, never a redirect.
- Customer API routes must go through `loadOwnedBot()` (`lib/require-customer.ts`)
  so cross-customer access is impossible by construction.

## License

By contributing, you agree your contributions are licensed under the
project's [MIT license](./LICENSE).
