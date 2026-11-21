# Package Boundary Rules

This document defines package/app ownership and dependency boundaries in the Sidewalk monorepo.

## Monorepo shape

```text
sidewalk/
├── apps/
│   ├── api/       # FastAPI backend (Python)
│   ├── web/       # Next.js web app (TypeScript)
│   └── mobile/    # Expo / React Native app (TypeScript)
└── packages/
    ├── shared/    # Shared TS types/schemas/constants for JS/TS apps
    └── stellar/   # Stellar integration helpers
```

## Ownership and boundaries

### `packages/shared`
- **Owns:** TypeScript types, schemas, and constants used by JS/TS consumers.
- **May depend on:** nothing in this monorepo.
- **Must not:** import from `apps/*` or contain app-specific business logic.

### `packages/stellar`
- **Owns:** Stellar/Soroban SDK wrappers and integration helpers.
- **May depend on:** `packages/shared`.
- **Must not:** import from `apps/*` or contain UI/route business logic.

### `apps/api` (FastAPI)
- **Owns:** HTTP API routes, business logic, SQLAlchemy models, Alembic migrations, auth, and persistence.
- **May depend on:** Python dependencies; it does **not** import TS workspace packages at runtime.
- **Contracts:** API/web/mobile contracts are defined by FastAPI/OpenAPI schemas and shared API conventions. If TS types are needed in JS/TS apps, maintain them in `packages/shared` or generated client types as an explicit contract layer.
- **Must not:** import from `apps/web` or `apps/mobile`.

### `apps/web`
- **Owns:** Next.js UI, client/server components, web-only state.
- **May depend on:** `packages/shared` (and `packages/stellar` only if explicitly needed).
- **Must not:** import from `apps/api` or `apps/mobile`.

### `apps/mobile`
- **Owns:** Expo screens/components/hooks/services.
- **May depend on:** `packages/shared` (and `packages/stellar` only if explicitly needed).
- **Must not:** import from `apps/api` or `apps/web`.

## Dependency direction

```text
apps/web     -> packages/shared
apps/mobile  -> packages/shared
packages/stellar -> packages/shared

apps/api (Python) -> HTTP/OpenAPI contract -> web/mobile clients
```

No app may import from another app. JS/TS packages must not import upward into apps.

## Adding new code

| What you are adding | Where it goes |
|---|---|
| Shared TS type/schema used by web/mobile | `packages/shared` |
| Stellar SDK wrapper/integration helper | `packages/stellar` |
| API endpoint/business logic/persistence | `apps/api/src/modules/<domain>/` |
| Web UI/page/component | `apps/web` |
| Mobile screen/component | `apps/mobile` |
| Cross-cutting API infrastructure | `apps/api/src/core/` or appropriate API shared infra |
