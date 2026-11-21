# Contributor Review Checklist

## For All PRs

- [ ] PR title follows `type(scope): description` format
- [ ] Branch name matches `fix/issue-NNN` or `feat/issue-NNN`
- [ ] Description links all resolved issues with `closes #NNN`
- [ ] No secrets, API keys, or `.env` files committed
- [ ] `pnpm lint` passes with no errors

## For Cross-Package Changes

- [ ] `packages/shared` changes do not break existing consumers
- [ ] All new shared types are exported from the package index
- [ ] Affected packages still build: `pnpm turbo run build`

## For Database Changes

- [ ] New Alembic migration is included when models/schema change
- [ ] `uv run alembic upgrade head` and `uv run alembic check` pass in `apps/api`
- [ ] Seed script updated if new required data added

## For API Changes

- [ ] New endpoints documented in `docs/development/api-reference.md` or covered by OpenAPI `/docs`
- [ ] Auth guards applied where required
