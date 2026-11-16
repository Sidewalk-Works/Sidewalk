# Testing Guide

## Running Tests

Run all tests across the monorepo:

```bash
pnpm test
```

Run tests for a single package:

```bash
pnpm --filter @sidewalk/api test
pnpm --filter @sidewalk/web test
pnpm --filter @sidewalk/mobile test
```

## Test Structure

### `apps/api`

- Tests live alongside each module in `src/modules/<module>/tests/`.
- Tests use [Vitest](https://vitest.dev/) and
  [Supertest](https://github.com/ladjs/supertest) against the Express `app`.
- `apps/api/.env.test` provides a committed, non-secret configuration
  (SQLite database file, test JWT secret) so tests run immediately after
  `pnpm install` with no extra setup.
- `pretest` resets the SQLite test database (`prisma db push --force-reset`)
  before each run, so tests start from a clean database.

Coverage includes:

- Registration: successful registration, duplicate email, invalid input.
- Login: successful login, invalid password, non-existent account.

### `apps/web`

- Tests live in `__tests__/` and use
  [Vitest](https://vitest.dev/) with
  [React Testing Library](https://testing-library.com/react).
- Coverage includes rendering and form validation for the Login and Create
  Account pages.

### `apps/mobile`

- Tests live in `src/__tests__/` and run with `jest-expo`.
- A single setup-verification test confirms the testing infrastructure works.
  No authentication or screen logic exists yet, so no feature tests are
  included.

### `packages/shared` and `packages/stellar`

- These packages are validated via build and lint only (no runtime logic to
  unit test yet).

## CI Expectations

Every pull request runs the workflows in `.github/workflows/`:

- **API**: install, lint, test, build.
- **Web**: install, lint, test, build.
- **Mobile**: install, lint, test.
- **Packages**: install, build, lint for `@sidewalk/shared` and
  `@sidewalk/stellar`.

A failing lint, test, or build step fails the corresponding workflow and
blocks merging.
