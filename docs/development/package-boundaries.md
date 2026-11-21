# Package Boundary Rules

## Packages

| Package | Owns | Must not import from |
|---------|------|----------------------|
| `packages/shared` | Types, schemas, constants used across apps | Any app package |
| `packages/stellar` | Stellar/Soroban SDK wrappers and integration helpers | `apps/*` |
| `apps/api` | FastAPI backend, SQLAlchemy models, Alembic migrations, API routes | `apps/web`, `apps/mobile` |
| `apps/web` | Next.js web app | `apps/api`, `apps/mobile` |
| `apps/mobile` | Expo / React Native mobile app | `apps/api`, `apps/web` |

## Rules

1. **`packages/shared` is the cross-app contract package.** If two apps need the same type/schema, it belongs in `packages/shared`.
2. **Apps never import from other apps.** Cross-app contracts go through `packages/shared` (or HTTP/API contracts).
3. **`packages/stellar` wraps Stellar integration only.** Product/business logic belongs in the consuming app, not in the stellar package.
4. **No circular dependencies.** Keep dependency direction one-way: apps -> packages, `packages/stellar` -> `packages/shared`.

## Dependency direction

```text
apps/api     -> packages/shared, packages/stellar
apps/web     -> packages/shared
apps/mobile  -> packages/shared
packages/stellar -> packages/shared
```
