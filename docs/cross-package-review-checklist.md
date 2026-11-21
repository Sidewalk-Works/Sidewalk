# Cross-Package Review Checklist

Use this checklist when a PR touches more than one package/app or changes a shared contract.

## When to apply

Apply when a PR modifies:

- `packages/shared` and any app/package consumer
- `packages/stellar` and any consumer
- two or more apps
- public exports/contracts used across package boundaries

## Dependency direction

- [ ] No `apps/*` package imports from another `apps/*` package.
- [ ] No `packages/*` package imports from `apps/*`.
- [ ] `packages/stellar` only depends on allowed packages (e.g. `packages/shared`), not apps.
- [ ] `apps/api` (FastAPI/Python) does not claim direct TS workspace imports; API contracts are documented via OpenAPI/schemas or explicit shared contract artifacts.
- [ ] No new circular dependencies.

## Shared package changes

- [ ] New exports in `packages/shared` have a clear owner and consumer; avoid dumping unused abstractions.
- [ ] No app-specific business logic added to `packages/shared`.
- [ ] Public API/contract changes are reflected in all affected consumers in the same PR (or explicitly coordinated).
- [ ] If a change affects API-to-client contracts, OpenAPI/schema/type artifacts are updated as needed.

## Type safety and tests

- [ ] `pnpm typecheck` passes for affected JS/TS packages.
- [ ] `pnpm lint` passes where applicable (including `no-restricted-imports` boundary checks).
- [ ] `pnpm test` passes for affected JS/TS packages.
- [ ] For `apps/api` changes, relevant `uv run pytest`/Ruff/mypy checks pass as applicable.

## PR description

- [ ] Explains why multiple packages/apps needed to change.
- [ ] Calls out any intentional boundary deviation explicitly.
- [ ] Highlights breaking contract changes (API/OpenAPI/shared types).

## Quick reference: allowed dependency graph

```text
apps/web     -> packages/shared
apps/mobile  -> packages/shared
packages/stellar -> packages/shared

apps/api (Python) -> HTTP/OpenAPI contract -> web/mobile clients
```
